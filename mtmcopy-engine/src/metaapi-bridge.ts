// ──────────────────────────────────────────────────────────────────────────
// MetaApi Bridge — encapsula a ligação ao MT5 do utilizador via metaapi.cloud
// (https://metaapi.cloud). Evita precisar de um terminal MT5/Windows: o
// MetaApi mantém a ligação à conta do utilizador e expõe uma API para
// consultar saldo e enviar ordens.
//
// Fluxo de onboarding (manual, feito pela equipa — nunca pelo utilizador):
//   1. Provisionar a conta no painel MetaApi (login + password + servidor MT5
//      fornecidos pelo utilizador EM CANAL SEGURO, nunca por formulário web)
//   2. Guardar o accountId resultante em mtmcopy_connections.metaapi_account_id
//   3. Marcar mt5_status = 'connected'
// A partir daqui o motor consegue operar a conta autonomamente.
// ──────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
// @ts-ignore — sem types oficiais completos para esta versão do SDK
import MetaApi from 'metaapi.cloud-sdk'

const token = process.env.METAAPI_TOKEN
if (!token) {
  console.warn('[metaapi-bridge] METAAPI_TOKEN não definido — o bridge ficará inactivo até ser configurado')
}

const api = token ? new (MetaApi as any)(token) : null

export interface OrderRequest {
  accountId: string
  symbol: string
  direction: 'buy' | 'sell'
  volume: number
  stopLoss?: number | null
  takeProfit?: number | null
  comment?: string
}

export interface OrderResult {
  success: boolean
  orderId?: string
  error?: string
}

/**
 * Envia uma ordem a mercado para a conta MT5 ligada via MetaApi.
 */
export async function placeMarketOrder(req: OrderRequest): Promise<OrderResult> {
  if (!api) return { success: false, error: 'MetaApi não configurado (METAAPI_TOKEN em falta)' }

  try {
    const account = await api.metatraderAccountApi.getAccount(req.accountId)
    await account.waitConnected()

    const connection = account.getStreamingConnection()
    await connection.connect()
    await connection.waitSynchronized()

    const trade =
      req.direction === 'buy'
        ? await connection.createMarketBuyOrder(req.symbol, req.volume, req.stopLoss ?? undefined, req.takeProfit ?? undefined, { comment: req.comment ?? 'MTMcopier' })
        : await connection.createMarketSellOrder(req.symbol, req.volume, req.stopLoss ?? undefined, req.takeProfit ?? undefined, { comment: req.comment ?? 'MTMcopier' })

    return { success: true, orderId: String(trade?.orderId ?? trade?.positionId ?? '') }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido ao executar ordem no MT5' }
  }
}

/**
 * Verifica se a conta MetaApi está acessível e sincronizada — usado para
 * actualizar o estado "connected"/"error" em mtmcopy_connections.
 */
export async function checkAccountHealth(accountId: string): Promise<{ ok: boolean; error?: string }> {
  if (!api) return { ok: false, error: 'MetaApi não configurado' }
  try {
    const account = await api.metatraderAccountApi.getAccount(accountId)
    await account.waitConnected()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Conta MT5 inacessível' }
  }
}
