/**
 * PrimeGate — a chamada HTTP (servidor-a-servidor).
 *
 *   POST https://hub.primeverse.ca/api/primegate/v1/registration
 *   Authorization: Bearer pg_ib_…
 *   { "email": "<email do cliente>", "uid": "<UID da PU Prime>" }
 *
 * Uma verificação por chamada. Antes de cada chamada reserva-se um lugar na quota partilhada
 * (10/min, 1 000/dia): se não houver lugar, NÃO se chama — devolve-se `erro` com «quota» e o
 * chamador reagenda. A chave só existe no cabeçalho; nunca vai para logs, para a base nem para
 * a resposta (o corpo é limpo de `pg_ib_…` antes de sair daqui).
 */
import { interpretarResposta, semSegredos, type Interpretacao } from './resultado'
import type { Quota } from './quota'

export const PRIMEGATE_URL = 'https://hub.primeverse.ca/api/primegate/v1/registration'
const TIMEOUT_MS = 10_000

export interface RespostaPrimeGate extends Interpretacao {
  httpStatus: number | null
  /** Corpo devolvido (JSON ou { texto }), já sem segredos. */
  corpo: unknown
  /** true = nem chegou a sair (sem chave, quota cheia). */
  naoEnviado?: boolean
}

export interface DepsCliente {
  chave: string | null
  quota: Quota
  fetchImpl?: typeof fetch
  url?: string
  timeoutMs?: number
}

function limparCorpo(corpo: unknown, chave: string): unknown {
  try {
    return JSON.parse(semSegredos(JSON.stringify(corpo ?? null), chave))
  } catch {
    return null
  }
}

export async function chamarPrimeGate(par: { email: string; uid: string }, deps: DepsCliente): Promise<RespostaPrimeGate> {
  const chave = deps.chave
  if (!chave) {
    return { estado: 'erro', motivo: 'PrimeGate sem chave configurada', httpStatus: null, corpo: null, naoEnviado: true, reagendarEmSeg: null }
  }

  const vaga = await deps.quota.reservar()
  if (!vaga.ok) {
    const reagendar =
      vaga.motivo === 'retry_after' && vaga.bloqueadoAte
        ? Math.max(60, Math.ceil((Date.parse(vaga.bloqueadoAte) - Date.now()) / 1000))
        : vaga.motivo === 'dia'
          ? 3 * 3600
          : 90
    return {
      estado: 'erro',
      motivo: `quota da PrimeGate (${vaga.motivo}) — reagendado`,
      httpStatus: null,
      corpo: null,
      naoEnviado: true,
      reagendarEmSeg: reagendar,
    }
  }

  const f = deps.fetchImpl ?? fetch
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? TIMEOUT_MS)
  try {
    const r = await f(deps.url ?? PRIMEGATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${chave}` },
      body: JSON.stringify({ email: par.email, uid: par.uid }),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const texto = await r.text().catch(() => '')
    let corpo: unknown
    try {
      corpo = texto ? JSON.parse(texto) : null
    } catch {
      corpo = { texto: texto.slice(0, 2000) }
    }
    const retryAfter = r.headers?.get?.('retry-after') ?? null
    const i = interpretarResposta(r.status, corpo, retryAfter)
    if (r.status === 429 && i.reagendarEmSeg) {
      await deps.quota.bloquearAte(new Date(Date.now() + i.reagendarEmSeg * 1000)).catch(() => {})
    }
    return { ...i, httpStatus: r.status, corpo: limparCorpo(corpo, chave) }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    // A mensagem do erro pode, em teoria, repetir o pedido — limpa-se na mesma.
    const msg = semSegredos(e instanceof Error ? e.message : String(e), chave).slice(0, 200)
    return {
      estado: 'erro',
      motivo: abortado ? 'PrimeGate não respondeu a tempo' : `falha de rede: ${msg}`,
      httpStatus: null,
      corpo: null,
      reagendarEmSeg: 15 * 60,
    }
  } finally {
    clearTimeout(t)
  }
}
