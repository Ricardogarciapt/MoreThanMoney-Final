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
import type { Fornecedor, PedidoIA } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'
import { ehErroDeModelo, erroComDescoberta, escolherModeloDaLista, getJsonOuNull } from './descoberta'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000
const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions'
const URL_MODELOS = 'https://api.groq.com/openai/v1/models'

/**
 * O modelo descoberto em runtime, por processo. Vive em memória de propósito: o catálogo muda de
 * meses a meses, e um processo da Vercel vive minutos — não vale a pena persistir, e persistir
 * era mais uma coisa a ficar velha.
 */
let descoberto: string | null = null
export function _esquecerDescobertaParaTestes(): void {
  descoberto = null
}

function modeloConfigurado(p: PedidoIA): string {
  if (process.env.GROQ_MODEL?.trim()) return process.env.GROQ_MODEL.trim()
  return p.preferencia === 'rapido' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile'
}

function cabecalhos(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}` }
}

async function pedir(m: string, p: PedidoIA, sinal: AbortSignal) {
  const j = (await postJson(
    'groq',
    URL_CHAT,
    cabecalhos(),
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
    texto: exigirTexto('groq', j.choices?.[0]?.message?.content),
    modelo: m,
    tokensEntrada: j.usage?.prompt_tokens,
    tokensSaida: j.usage?.completion_tokens,
    custoCents: 0,
  }
}

export const groq: Fornecedor = {
  nome: 'groq',
  suportaImagens: false,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.GROQ_API_KEY?.trim()),
  async gerar(p, sinal) {
    const configurado = modeloConfigurado(p)
    const primeiro = descoberto ?? configurado
    try {
      return await pedir(primeiro, p, sinal)
    } catch (e) {
      // Só um NOME morto dispara a descoberta. Chave, crédito ou serviço em baixo passam ao
      // fornecedor seguinte como qualquer outro erro — trocar de modelo não os curava.
      if (!ehErroDeModelo(e)) throw e

      const lista = (await getJsonOuNull(URL_MODELOS, cabecalhos(), sinal)) as { data?: { id?: unknown }[] } | null
      const ids = Array.isArray(lista?.data) ? lista.data.map((x) => String(x.id ?? '')).filter(Boolean) : []
      const alternativa = escolherModeloDaLista(
        ids.filter((id) => id !== primeiro),
        configurado,
        p.preferencia === 'rapido',
      )
      if (!alternativa) throw erroComDescoberta(e, 'a lista de modelos da chave não trouxe nenhum de conversa')

      // UMA repetição. Se o descoberto também falhar, o erro segue para o próximo da cadeia.
      const r = await pedir(alternativa, p, sinal)
      descoberto = alternativa
      return { ...r, modelo: `${alternativa} (descoberto: ${primeiro} já não existe)` }
    }
  },
}
