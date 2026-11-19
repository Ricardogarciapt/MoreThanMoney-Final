/**
 * FORNECEDORES GRÁTIS COM API COMPATÍVEL COM OPENAI — Cerebras, OpenRouter (só `:free`), Mistral.
 * (19/11/2026, depois do Mentor ficar indisponível com o Groq e o Gemini esgotados.)
 *
 * Uma fábrica só, para os três se comportarem igual ao Gemini quando a quota acaba:
 *  · Várias CHAVES (`X_API_KEY` + `X_API_KEYS`): cada conta grátis tem a sua quota; esgotada uma,
 *    passa-se à seguinte. As chaves nunca aparecem em erros nem no livro — só o índice.
 *  · Quota DIÁRIA de um modelo (429 «per day») → marca esse modelo NESSA chave e roda para o
 *    seguinte. Saturação (503) → roda sem marcar. Ritmo por minuto → tenta a chave seguinte (outra
 *    conta tem outro balde); sem mais chaves, passa ao fornecedor seguinte.
 *  · Faixa: `interativo` tenta todos os modelos da lista; `fundo` só os da lista de fundo e no
 *    máximo 3, para não esvaziar o que os clientes usam.
 *  · Sem chave → `disponivel()` falso: a cadeia salta-o sem contar como falha.
 *
 * Grátis de verdade: o OpenRouter só usa modelos cujo id acaba em `:free` (os outros cobram).
 */
import { chavesDe, prioridadeDe } from '../prioridade'
import { ErroFornecedor, type Fornecedor, type GeracaoFornecedor, type NomeFornecedor, type PedidoIA } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'
import { ehErroDeModelo, getJsonOuNull } from './descoberta'
import { MAX_MODELOS_POR_PEDIDO, MarcasDeQuota, ehErroDeQuotaDiaria, ehErroDeSaturacao, horasDeEspera } from './rotacao-quota'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

export type ConfigCompativel = {
  nome: NomeFornecedor
  /** Prefixo das variáveis: `CEREBRAS` → CEREBRAS_API_KEY / CEREBRAS_API_KEYS / CEREBRAS_MODEL. */
  prefixo: string
  urlChat: string
  /** Lista de modelos (GET). Se responder, filtra a ordem estática ao que existe e junta o resto. */
  urlModelos?: string
  /** Do melhor para o mais leve. */
  interativo: readonly string[]
  /** Só estes servem a faixa de fundo (pequenos/lite). */
  fundo: readonly string[]
  /** Filtro obrigatório dos modelos descobertos (ex.: só `:free` no OpenRouter). */
  aceitaModelo?: (id: string) => boolean
  cabecalhosExtra?: Record<string, string>
}

/** Remove o raciocínio que alguns modelos abertos devolvem antes da resposta (`<think>…</think>`). */
export function tirarPensamento(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim()
}

const NAO_E_CONVERSA = /whisper|tts|speech|audio|guard|moderation|safeguard|embed|rerank|orpheus|playai|vision-only|image|ocr|codestral-embed/i

/** A ordem final: estática (filtrada ao que existe, se a lista veio) + descobertos que faltam. */
export function ordemDeModelos(
  estatica: readonly string[],
  descobertos: readonly string[] | null,
  aceita: (id: string) => boolean = () => true,
  juntarDescobertos = true,
): string[] {
  const est = estatica.filter(aceita)
  if (!descobertos?.length) return [...est]
  const existe = new Set(descobertos)
  const base = est.filter((m) => existe.has(m))
  const extra = juntarDescobertos ? descobertos.filter((m) => aceita(m) && !NAO_E_CONVERSA.test(m) && !base.includes(m)) : []
  const out = [...base, ...extra]
  return out.length ? out : [...est]
}

export function criarCompativel(c: ConfigCompativel): Fornecedor & { _esquecer(): void; _relogio(agora: () => number): void } {
  let descobertos: string[] | null = null
  let descobertoEm = 0
  let marcas = new MarcasDeQuota()
  const mortos = new Set<string>()

  async function listaViva(chave: string, sinal: AbortSignal): Promise<string[] | null> {
    if (!c.urlModelos) return null
    if (descobertos && Date.now() - descobertoEm < 6 * 3_600_000) return descobertos
    const j = (await getJsonOuNull(c.urlModelos, { Authorization: `Bearer ${chave}`, ...c.cabecalhosExtra }, sinal)) as
      | { data?: { id?: unknown }[] }
      | null
    const ids = Array.isArray(j?.data) ? j!.data.map((x) => String(x.id ?? '')).filter(Boolean) : []
    if (ids.length) {
      descobertos = ids
      descobertoEm = Date.now()
    }
    return descobertos
  }

  async function pedir(chave: string, m: string, p: PedidoIA, sinal: AbortSignal): Promise<GeracaoFornecedor> {
    const j = (await postJson(
      c.nome,
      c.urlChat,
      { Authorization: `Bearer ${chave}`, ...c.cabecalhosExtra },
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
      texto: exigirTexto(c.nome, tirarPensamento(j.choices?.[0]?.message?.content ?? '')),
      modelo: m,
      tokensEntrada: j.usage?.prompt_tokens,
      tokensSaida: j.usage?.completion_tokens,
      custoCents: 0,
    }
  }

  return {
    nome: c.nome,
    suportaImagens: false,
    timeoutMs: TIMEOUT_MS,
    disponivel: () => chavesDe(c.prefixo).length > 0,
    _esquecer() {
      descobertos = null
      mortos.clear()
      marcas.esquecer()
    },
    _relogio(agora) {
      marcas = new MarcasDeQuota(agora)
    },
    async gerar(p, sinal) {
      const chaves = chavesDe(c.prefixo)
      const faixa = prioridadeDe(p)
      const forcado = process.env[`${c.prefixo}_MODEL`]?.trim()
      const viva = await listaViva(chaves[0], sinal)
      const estatica = faixa === 'fundo' ? c.fundo : c.interativo
      const base = ordemDeModelos(forcado ? [forcado, ...estatica] : estatica, viva, c.aceitaModelo, faixa === 'interativo')
      const tecto = faixa === 'fundo' ? MAX_MODELOS_POR_PEDIDO : Number.POSITIVE_INFINITY
      const notas: string[] = []
      let ultimo: ErroFornecedor | null = null

      for (let k = 0; k < chaves.length; k++) {
        let tentados = 0
        for (const m of base) {
          if (tentados >= tecto) break
          if (mortos.has(m) || marcas.esgotado(`${k}|${m}`)) continue
          tentados++
          try {
            const r = await pedir(chaves[k], m, p, sinal)
            const rotulo = [k ? `chave ${k + 1}` : '', notas.length ? `rodado: ${notas.join('; ')}` : ''].filter(Boolean).join(' · ')
            return rotulo ? { ...r, modelo: `${m} (${rotulo})` } : r
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
            if (ehErroDeModelo(e)) {
              mortos.add(m)
              notas.push(`${m} não existe`)
              continue
            }
            // Ritmo por minuto / chave inválida → a chave seguinte pode servir; senão, próximo fornecedor.
            const st = (e as ErroFornecedor).status
            if (st === 429 || st === 401 || st === 403) break
            throw e
          }
        }
      }
      const u = ultimo as ErroFornecedor | null
      throw u
        ? new ErroFornecedor(c.nome, `${u.message}${notas.length ? ` · rodou por ${notas.join(', ')}` : ''}`, true, u.status)
        : new ErroFornecedor(c.nome, '429 quota diária esgotada em todos os modelos e chaves', true, 429)
    },
  }
}

/** Cerebras — grátis com quota diária larga por modelo; muito rápido. Chave em cloud.cerebras.ai. */
export const cerebras = criarCompativel({
  nome: 'cerebras',
  prefixo: 'CEREBRAS',
  urlChat: 'https://api.cerebras.ai/v1/chat/completions',
  urlModelos: 'https://api.cerebras.ai/v1/models',
  interativo: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507', 'llama-3.3-70b', 'zai-glm-4.6', 'qwen-3-32b', 'llama3.1-8b'],
  fundo: ['llama3.1-8b', 'qwen-3-32b', 'gpt-oss-120b'],
})

/** OpenRouter — SÓ modelos `:free` (os outros cobram). Chave em openrouter.ai/keys. */
export const openrouter = criarCompativel({
  nome: 'openrouter',
  prefixo: 'OPENROUTER',
  urlChat: 'https://openrouter.ai/api/v1/chat/completions',
  urlModelos: 'https://openrouter.ai/api/v1/models',
  aceitaModelo: (id) => id.endsWith(':free'),
  interativo: [
    'openai/gpt-oss-120b:free',
    'deepseek/deepseek-chat-v3.1:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-235b-a22b:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.2-24b-instruct:free',
    'openai/gpt-oss-20b:free',
  ],
  fundo: ['openai/gpt-oss-20b:free', 'google/gemma-3-27b-it:free', 'mistralai/mistral-small-3.2-24b-instruct:free'],
  cabecalhosExtra: { 'HTTP-Referer': 'https://www.morethanmoney.pt', 'X-Title': 'MoreThanMoney' },
})

/** Mistral — plano «Experiment» grátis (limite por minuto baixo, mensal largo). Chave em console.mistral.ai. */
export const mistral = criarCompativel({
  nome: 'mistral',
  prefixo: 'MISTRAL',
  urlChat: 'https://api.mistral.ai/v1/chat/completions',
  interativo: ['mistral-medium-latest', 'mistral-small-latest', 'open-mistral-nemo'],
  fundo: ['mistral-small-latest', 'open-mistral-nemo'],
})
