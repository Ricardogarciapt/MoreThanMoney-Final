import { getAccountSnapshot, isMetaApiConfigured } from './metaapi'

export interface ConnectionBalanceFields {
  account_balance: number | null
  account_equity: number | null
}

type ConnWithMeta = {
  metaapi_account_id?: string | null
  mt5_status?: string | null
}

/**
 * Tempo máximo (ms) à espera do snapshot ao vivo de UMA conta. Contas com o broker
 * offline lançam TimeoutError ao fim de ~55s (×retries) na MetaApi — sem este teto,
 * uma conta morta bloqueia toda a listagem e a função serverless morre por timeout
 * (sintoma: a tabela de utilizadores nunca atualiza). Override: MTMCOPY_BALANCE_TIMEOUT_MS.
 */
// 12s (não 6s): contas pouco acedidas fazem "cold connect" à MetaAPI (o getRpcConnection
// pode precisar de 2-3 tentativas c/ backoff), o que ultrapassava os 6s e devolvia saldo
// null → a % de crescimento não aparecia (ex.: contas do Ruben). As contas correm em
// paralelo (Promise.all), por isso o teto não se multiplica; fica < maxDuration (30s).
const PER_ACCOUNT_TIMEOUT_MS = Number(process.env.MTMCOPY_BALANCE_TIMEOUT_MS ?? 12000)

function withTimeout<R>(promise: Promise<R>, ms: number, fallback: R): Promise<R> {
  return new Promise<R>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
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
      // Não esperar indefinidamente por uma conta cujo broker possa estar offline.
      const snap = await withTimeout(
        getAccountSnapshot(c.metaapi_account_id).catch(() => null),
        PER_ACCOUNT_TIMEOUT_MS,
        null,
      )
      return {
        ...c,
        account_balance: snap?.balance ?? null,
        account_equity: snap?.equity ?? null,
      }
    }),
  )
}
