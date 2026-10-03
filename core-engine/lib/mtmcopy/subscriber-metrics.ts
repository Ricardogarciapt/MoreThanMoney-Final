import { attachConnectionBalances } from './connection-balances'

export interface ConnectionMetrics {
  account_balance: number | null
  account_equity: number | null
  baseline_balance: number | null
  pnl_amount: number | null
  pnl_percent: number | null
  positions_count?: number | null
}

type ConnWithBaseline = {
  baseline_balance?: number | null
  account_balance?: number | null
  account_equity?: number | null
}

export function computeConnectionMetrics(conn: ConnWithBaseline): ConnectionMetrics {
  const balance = conn.account_balance ?? null
  const equity = conn.account_equity ?? null
  let baseline = conn.baseline_balance != null ? Number(conn.baseline_balance) : null
  if (baseline == null && balance != null) baseline = balance

  const pnlAmount =
    baseline != null && equity != null ? equity - baseline : null
  const pnlPercent =
    baseline != null && baseline > 0 && pnlAmount != null
      ? (pnlAmount / baseline) * 100
      : null

  return {
    account_balance: balance,
    account_equity: equity,
    baseline_balance: baseline,
    pnl_amount: pnlAmount,
    pnl_percent: pnlPercent,
  }
}

export async function enrichConnectionsWithMetrics<T extends Record<string, unknown>>(
  connections: T[],
): Promise<Array<T & ConnectionMetrics>> {
  const withBalances = await attachConnectionBalances(connections)
  return withBalances.map((c) => ({
    ...c,
    ...computeConnectionMetrics(c),
  }))
}
