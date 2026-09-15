/**
 * A MetaApi do motor — UMA instância do SDK para o feed de preços e para o espelho, e o
 * interruptor global de limite de taxa.
 *
 * · Uma instância só: o registo de ligações do SDK (connectionRegistry) é por instância. Com a
 *   mesma instância, `getStreamingConnection()` numa conta que o feed já está a ouvir devolve outra
 *   «instância» sobre a MESMA ligação — nenhuma subscrição a mais na MetaApi. Fechar a do espelho
 *   não fecha a do feed (o SDK só fecha quando a última instância fecha).
 *
 * · Interruptor: a entrega das trades das provider aos subscritores (CopyFactory, executor do MTM
 *   Auto, MTM Copy) usa o MESMO token e tem prioridade absoluta sobre o espelho. Ao PRIMEIRO erro
 *   de limite da MetaApi visto em qualquer parte do motor, o espelho desliga-se 1 h (fecha as
 *   ligações dele). O feed continua — sem preços o motor não fecha um SL.
 */
type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

export const PAUSA_ESPELHO_LIMITE_MS = Number(process.env.ESPELHO_PAUSA_LIMITE_MIN || 60) * 60_000

let api: Qualquer = null
let sdkCarregado: Qualquer = null

export function carregarSdk(): Qualquer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!sdkCarregado) sdkCarregado = require('metaapi.cloud-sdk/node')
  return sdkCarregado
}

export function metaApiPartilhada(token: string): Qualquer {
  if (!api) {
    const sdk = carregarSdk()
    const MetaApi = sdk.default ?? sdk
    api = new MetaApi(token)
  }
  return api
}

/** É um erro de limite da MetaApi? (TooManyRequestsError, «cpu credits», 429.) */
export function eLimiteMetaApi(e: unknown): boolean {
  const x = e as { name?: string; message?: string; status?: number } | null
  const msg = String(x?.message ?? e ?? '')
  return x?.name === 'TooManyRequestsError' || x?.status === 429 || /cpu credits|too many requests|rate limit/i.test(msg)
}

let pausaAte = 0
const ouvintes = new Set<(ate: number, origem: string) => void>()

/**
 * Chamar em TODOS os catch que falam com a MetaApi. Se for limite, liga o interruptor (1 h a
 * contar do último limite visto) e avisa quem estiver à escuta. Devolve true se era limite.
 */
export function registarErroMetaApi(e: unknown, origem: string, agora = Date.now()): boolean {
  if (!eLimiteMetaApi(e)) return false
  const x = e as { metadata?: { recommendedRetryTime?: string | Date } } | null
  const recomendado = x?.metadata?.recommendedRetryTime ? new Date(x.metadata.recommendedRetryTime).getTime() : 0
  const ate = Math.max(agora + PAUSA_ESPELHO_LIMITE_MS, Number.isFinite(recomendado) ? recomendado : 0)
  const novo = ate > pausaAte
  pausaAte = Math.max(pausaAte, ate)
  if (novo) for (const f of ouvintes) { try { f(pausaAte, origem) } catch { /* um ouvinte não pára os outros */ } }
  return true
}

/** Até quando o espelho está desligado por limite (ms epoch), ou 0. */
export function espelhoPausadoAte(agora = Date.now()): number {
  return pausaAte > agora ? pausaAte : 0
}

export function aoLimiteMetaApi(f: (ate: number, origem: string) => void): () => void {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

/** Só para testes. */
export function _reporInterruptor(): void {
  pausaAte = 0
}
