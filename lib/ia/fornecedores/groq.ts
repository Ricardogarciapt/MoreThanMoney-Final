/**
 * GROQ — 1.º da cadeia. Plano gratuito, API compatível com OpenAI, e é o mais rápido de todos
 * (é por isso que vai à frente: a página do Terminal e o chat do Mentor esperam por ele).
 * Chave em console.groq.com → `GROQ_API_KEY` (já existe em produção).
 *
 * A 04/10/2026 o nome configurado («llama-3.3-70b-versatile») morreu no fornecedor e o site
 * inteiro ficou sem o 1.º da cadeia por causa de uma string. Por isso este fornecedor, quando o
 * nome falha, pergunta ao Groq que modelos a chave tem e escolhe um — ver `descoberta.ts`, onde
 * a regra está escrita e provada.
 */
import { chavesDe, prioridadeDe } from '../prioridade'
import { ErroFornecedor, type Fornecedor, type GeracaoFornecedor, type PedidoIA } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'
import { tirarPensamento } from './compativel'
import { ehErroDeModelo, erroComDescoberta, escolherModeloDaLista, getJsonOuNull } from './descoberta'
import { MAX_MODELOS_POR_PEDIDO, MarcasDeQuota, ehErroDeQuotaDiaria, ehErroDeSaturacao, horasDeEspera } from './rotacao-quota'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000
const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions'
const URL_MODELOS = 'https://api.groq.com/openai/v1/models'

/**
 * O modelo descoberto em runtime, por processo. Vive em memória de propósito: o catálogo muda de
 * meses a meses, e um processo da Vercel vive minutos — não vale a pena persistir, e persistir
 * era mais uma coisa a ficar velha.
 */
let descoberto: string | null = null
/**
 * 19/11/2026: o grátis do Groq tem tecto de TOKENS POR DIA POR MODELO (200k no gpt-oss-120b). Às
 * 12h44 o 120b estava esgotado pelos crons e o Mentor caiu — com os outros modelos da mesma chave
 * intactos. Agora roda como o Gemini: quota diária → marca o modelo (por chave) e passa ao
 * seguinte. O interativo tem os grandes reservados; o fundo só toca nos pequenos.
 */
const ROTACAO_INTERATIVO: readonly string[] = [
  'openai/gpt-oss-120b',
  'moonshotai/kimi-k2-instruct-0905',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
]
const ROTACAO_FUNDO: readonly string[] = ['openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b']
let marcas = new MarcasDeQuota()
const mortos = new Set<string>()
export function _esquecerDescobertaParaTestes(): void {
  descoberto = null
  marcas.esquecer()
  mortos.clear()
}
export function _definirRelogioParaTestes(agora: () => number): void {
  marcas = new MarcasDeQuota(agora)
}

function modeloConfigurado(p: PedidoIA): string {
  if (process.env.GROQ_MODEL?.trim()) return process.env.GROQ_MODEL.trim()
  return p.preferencia === 'rapido' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile'
}

function cabecalhos(chave: string): Record<string, string> {
  return { Authorization: `Bearer ${chave}` }
}

async function pedir(chave: string, m: string, p: PedidoIA, sinal: AbortSignal) {
  const j = (await postJson(
    'groq',
    URL_CHAT,
    cabecalhos(chave),
    {
      model: m,
      messages: mensagensEstiloOpenAI(p),
      max_tokens: p.maxTokens ?? 1024,
      ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
      ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    },
    sinal,
  )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  return {
    texto: exigirTexto('groq', tirarPensamento(j.choices?.[0]?.message?.content ?? '')),
    modelo: m,
    tokensEntrada: j.usage?.prompt_tokens,
    tokensSaida: j.usage?.completion_tokens,
    custoCents: 0,
  }
}

/** Uma chave: o modelo principal (com a cura do nome morto) e depois a rotação por quota. */
async function gerarComChave(chave: string, k: number, p: PedidoIA, sinal: AbortSignal): Promise<GeracaoFornecedor> {
  const fundo = prioridadeDe(p) === 'fundo'
  const configurado = modeloConfigurado(p)
  const principal = fundo ? ROTACAO_FUNDO[0] : descoberto ?? configurado
  const fila = [principal, ...(fundo ? ROTACAO_FUNDO : ROTACAO_INTERATIVO)].filter(
    (m, i, a) => a.indexOf(m) === i && !mortos.has(m) && !marcas.esgotado(`${k}|${m}`),
  )
  if (!fila.length) throw new ErroFornecedor('groq', '429 quota diária esgotada em todos os modelos da rotação', true, 429)
  const tecto = fundo ? MAX_MODELOS_POR_PEDIDO : Number.POSITIVE_INFINITY
  const notas: string[] = []
  let ultimo: ErroFornecedor | null = null

  for (let n = 0; n < fila.length && n < tecto; n++) {
    const m = fila[n]
    try {
      const r = await pedir(chave, m, p, sinal)
      return notas.length ? { ...r, modelo: `${m} (rodado: ${notas.join('; ')})` } : r
    } catch (e) {
      if (!(e instanceof ErroFornecedor)) throw e
      ultimo = e
      if (ehErroDeQuotaDiaria(e)) {
        marcas.marcar(`${k}|${m}`, horasDeEspera(e.message))
        notas.push(`${m} quota diária`)
        continue
      }
      if (ehErroDeSaturacao(e)) {
        notas.push(`${m} saturado`)
        continue
      }
      if (!ehErroDeModelo(e)) throw e
      if (n > 0) {
        // Um nome da rotação que já não existe: sai da lista deste processo e segue.
        mortos.add(m)
        notas.push(`${m} não existe`)
        continue
      }
      // O principal morreu: pergunta-se ao Groq que modelos a chave tem (comportamento de 04/10).
      const lista = (await getJsonOuNull(URL_MODELOS, cabecalhos(chave), sinal)) as { data?: { id?: unknown }[] } | null
      const ids = Array.isArray(lista?.data) ? lista.data.map((x) => String(x.id ?? '')).filter(Boolean) : []
      const alternativa = escolherModeloDaLista(
        ids.filter((id) => id !== m),
        configurado,
        p.preferencia === 'rapido',
      )
      if (!alternativa) throw erroComDescoberta(e, 'a lista de modelos da chave não trouxe nenhum de conversa')
      // UMA repetição. Se o descoberto também falhar, o erro segue para o próximo da cadeia.
      const r = await pedir(chave, alternativa, p, sinal)
      descoberto = alternativa
      return { ...r, modelo: `${alternativa} (descoberto: ${m} já não existe)` }
    }
  }
  throw erroComDescoberta(ultimo!, `rodou por ${notas.join(', ')}`)
}

export const groq: Fornecedor = {
  nome: 'groq',
  suportaImagens: false,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => chavesDe('GROQ').length > 0,
  async gerar(p, sinal) {
    const chaves = chavesDe('GROQ')
    for (let k = 0; k < chaves.length; k++) {
      try {
        const r = await gerarComChave(chaves[k], k, p, sinal)
        return k ? { ...r, modelo: `${r.modelo} · chave ${k + 1}` } : r
      } catch (e) {
        // Outra chave = outra conta = outra quota. Só para erros de conta/ritmo; o resto segue.
        const deConta = e instanceof ErroFornecedor && [401, 403, 429].includes(e.status ?? 0)
        if (deConta && k < chaves.length - 1) continue
        throw e
      }
    }
    throw new ErroFornecedor('groq', 'sem chave', true)
  },
}
