/**
 * TRADELOCKER NO WEBTRADER = A CONTA DO LIGADOR — regras puras (sem base nem rede), testáveis.
 *
 * A conta TradeLocker é a conta EXTERNA da pessoa, na corretora dela; a MTM só a negoceia.
 * Há UMA linha por conta em mtmcopy_connections, quer se ligue no WebTrader quer no ligador
 * («As minhas contas»): antes de gravar procura-se a mesma conta; se já existe, abre-se essa.
 */

export interface LinhaTradeLocker {
  id?: unknown
  mt5_platform?: unknown
  mt5_status?: unknown
  tl_account_id?: unknown
  tl_env?: unknown
  tl_server?: unknown
}

export interface AlvoTradeLocker { accountId: string; env: string; server: string }

/** A mesma conta TradeLocker já ligada (accountId + ambiente + servidor, sem distinguir maiúsculas). */
export function ligacaoTradeLockerRepetida<T extends LinhaTradeLocker>(linhas: T[] | null | undefined, alvo: AlvoTradeLocker): T | null {
  const servidor = alvo.server.trim().toLowerCase()
  return (
    (linhas ?? []).find(
      (c) =>
        String(c.mt5_platform ?? '') === 'tradelocker' &&
        c.mt5_status !== 'disconnected' &&
        String(c.tl_account_id ?? '') === String(alvo.accountId) &&
        c.tl_env === alvo.env &&
        String(c.tl_server ?? '').trim().toLowerCase() === servidor,
    ) ?? null
  )
}

export type ResultadoWT =
  | { ok: true; ref: string; ligada: 'existente' | 'nova' }
  | { ok: false; status: number; erro: string }

/**
 * Já ligada → ref dessa linha (sem gravar nada). Senão → `ligar` (o passo 2 do ligador).
 * 409 (corrida com outro separador ou com o ligador) → relê e abre a linha que ganhou.
 */
export async function ligarOuReutilizarTradeLocker(
  deps: {
    lerLigadas: () => Promise<LinhaTradeLocker[]>
    ligar: () => Promise<{ status: number; corpo: Record<string, unknown> }>
  },
  alvo: AlvoTradeLocker,
): Promise<ResultadoWT> {
  const ja = ligacaoTradeLockerRepetida(await deps.lerLigadas(), alvo)
  if (ja?.id) return { ok: true, ref: `tradelocker:site:${ja.id}`, ligada: 'existente' }

  const r = await deps.ligar()
  const id = (r.corpo.connection as { id?: unknown } | undefined)?.id
  if (r.status === 200 && id) return { ok: true, ref: `tradelocker:site:${id}`, ligada: 'nova' }
  if (r.status === 409) {
    const outra = ligacaoTradeLockerRepetida(await deps.lerLigadas(), alvo)
    if (outra?.id) return { ok: true, ref: `tradelocker:site:${outra.id}`, ligada: 'existente' }
  }
  return { ok: false, status: r.status >= 400 ? r.status : 502, erro: String(r.corpo.error ?? 'Não foi possível ligar a conta TradeLocker.') }
}
