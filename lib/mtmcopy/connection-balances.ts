import { getAccountSnapshot, isMetaApiConfigured } from './metaapi'

export interface ConnectionBalanceFields {
  account_balance: number | null
  account_equity: number | null
}

type ConnWithMeta = {
  metaapi_account_id?: string | null
  mt5_status?: string | null
}

export async function attachConnectionBalances<T extends ConnWithMeta>(
  connections: T[],
): Promise<(T & ConnectionBalanceFields)[]> {
  if (!isMetaApiConfigured() || !connections.length) {
    return connections.map((c) => ({
      ...c,
      account_balance: null,
      account_equity: null,
    }))
  }

  return Promise.all(
    connections.map(async (c) => {
      if (!c.metaapi_account_id?.trim() || c.mt5_status !== 'connected') {
        return { ...c, account_balance: null, account_equity: null }
      }
      const snap = await getAccountSnapshot(c.metaapi_account_id)
      return {
        ...c,
        account_balance: snap?.balance ?? null,
        account_equity: snap?.equity ?? null,
      }
    }),
  )
}
