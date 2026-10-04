/**
 * O que os cinco fornecedores têm em comum: o pedido HTTP com tecto, a leitura do corpo de erro
 * e, sobretudo, a DECISÃO «este erro passa ao seguinte ou rebenta?». Está aqui, num sítio só,
 * para os fornecedores não a tomarem cada um à sua maneira.
 */
import { ErroFornecedor, type MensagemIA, type PedidoIA } from '../tipos'

/** Instrução que vai no sistema quando se pede JSON (os modos nativos exigem-na ou agradecem-na). */
export const INSTRUCAO_JSON =
  '\n\nResponde APENAS com um objeto JSON válido, sem markdown, sem texto antes nem depois.'

export function sistemaComJson(p: PedidoIA): string | undefined {
  if (!p.json) return p.sistema
  return (p.sistema ?? '') + INSTRUCAO_JSON
}

/** Erros que, pelo texto, são de CONTA e não de pedido — mesmo quando vêm num 400. */
const TEXTO_DE_CONTA =
  /credit balance|insufficient[_ ]quota|exceeded your current quota|billing|quota exceeded|rate[_ ]limit|overloaded|capacity|resource[_ ]exhausted|model.*(not found|does not exist|decommissioned|deprecated)|unknown model|no such model/i

/**
 * Passa ao seguinte?
 *  · 401/402/403 (chave/crédito/permissão), 404 (modelo que já não existe), 408/409/425/429
 *    (ritmo/concorrência), 5xx (o fornecedor caiu) → SIM.
 *  · 400 → só se o texto denunciar conta/crédito/modelo; senão é pedido mal formado → NÃO.
 *  · 422 → pedido mal formado → NÃO.
 */
export function passavelPorStatus(status: number, corpo: string): boolean {
  if (status === 400 || status === 422) return TEXTO_DE_CONTA.test(corpo)
  if ([401, 402, 403, 404, 408, 409, 425, 429].includes(status)) return true
  if (status >= 500) return true
  return TEXTO_DE_CONTA.test(corpo)
}

type DetalheGoogle = {
  '@type'?: string
  violations?: { quotaId?: string }[]
  retryDelay?: string
}

/**
 * Tira a mensagem útil de um corpo de erro JSON, sem rebentar se não for JSON.
 *
 * O corte aos 300 caracteres é para o livro e para o ecrã não levarem romances. Mas o 429 real do
 * Google (04/10) tem 411 caracteres e o «Please retry in 3h45m» vem no FIM — cortado, perdia-se a
 * única pista de que era quota DIÁRIA, e a rotação de modelo não disparava (visto na prova real).
 * O essencial vive em `error.details`: o `quotaId` («…PerDay…» ou «…PerMinute…») e o `retryDelay`
 * («13559s»). Anexam-se compactos DEPOIS do corte, para a decisão «diário ou minuto?» nunca ser
 * tomada sobre texto truncado.
 */
export function resumirErro(corpo: string): string {
  try {
    const j = JSON.parse(corpo) as {
      error?: { message?: string; details?: DetalheGoogle[] } | string
      message?: string
    }
    const m = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message
    const detalhes = typeof j.error === 'object' && Array.isArray(j.error?.details) ? j.error.details : []
    const cauda = caudaDeQuota(detalhes)
    if (m) return String(m).slice(0, 300) + cauda
    if (cauda) return cauda.slice(3)
  } catch {
    /* não era JSON */
  }
  return corpo.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** «· quota: GenerateRequestsPerDay… · retry in 3h46m» a partir dos `details` do Google; vazio se não houver. */
function caudaDeQuota(detalhes: DetalheGoogle[]): string {
  const partes: string[] = []
  for (const d of detalhes) {
    for (const v of d.violations ?? []) if (v.quotaId) partes.push(`quota: ${v.quotaId}`)
    const seg = d.retryDelay ? Number.parseFloat(d.retryDelay) : NaN
    if (Number.isFinite(seg) && seg > 0) {
      // Em horas+minutos quando é longo e em segundos quando é curto — é essa a diferença que
      // separa um tecto diário (roda de modelo) de um pico por minuto (não roda).
      partes.push(seg >= 3600 ? `retry in ${Math.floor(seg / 3600)}h${Math.round((seg % 3600) / 60)}m` : `retry in ${Math.ceil(seg)}s`)
    }
  }
  return partes.length ? ' · ' + partes.join(' · ') : ''
}

/**
 * POST JSON com o AbortSignal da cadeia. Timeout e rede são SEMPRE passáveis: o fornecedor não
 * respondeu, o seguinte pode responder.
 */
export async function postJson(
  fornecedor: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  sinal: AbortSignal,
): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: sinal,
    })
  } catch (e) {
    const timeout = sinal.aborted
    throw new ErroFornecedor(fornecedor, timeout ? 'timeout' : `rede: ${e instanceof Error ? e.message : String(e)}`, true)
  }
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    throw new ErroFornecedor(fornecedor, `${res.status} ${resumirErro(corpo)}`, passavelPorStatus(res.status, corpo), res.status)
  }
  return res.json()
}

/** Resposta sem texto é falha do fornecedor (passável): não se devolve vazio como se fosse IA. */
export function exigirTexto(fornecedor: string, texto: string | undefined | null): string {
  const t = (texto ?? '').trim()
  if (!t) throw new ErroFornecedor(fornecedor, 'resposta vazia', true)
  return t
}

/** Mensagens no formato OpenAI (Groq, OpenAI, Ollama) — com imagens no último `user` se houver. */
export function mensagensEstiloOpenAI(p: PedidoIA): unknown[] {
  const sistema = sistemaComJson(p)
  const out: unknown[] = sistema ? [{ role: 'system', content: sistema }] : []
  p.mensagens.forEach((m: MensagemIA, i) => {
    const ultimaDoUser = m.role === 'user' && i === ultimoIndiceUser(p.mensagens)
    if (ultimaDoUser && p.imagens?.length) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...p.imagens.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` } })),
        ],
      })
    } else out.push({ role: m.role, content: m.content })
  })
  return out
}

export function ultimoIndiceUser(ms: MensagemIA[]): number {
  for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === 'user') return i
  return -1
}
