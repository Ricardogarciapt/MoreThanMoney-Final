/**
 * Bybit do AGENTE: por omissão uma SUBCONTA própria, com chave própria (BYBIT_AGENTE_API_KEY/SECRET).
 * Com CRIPTO_BYBIT_MESTRE=1 a chave é a da mestre do Copy Trading (escolha do dono, 28/10) e os
 * travões de tectos.ts (par ocupado, capital atribuído, sem levantamentos) passam a valer.
 *
 * Não se usa a BYBIT_API_KEY do copy de perps: essa é a conta-mestre Aurum, que os clientes copiam.
 * Na mesma conta, uma posição do agente em BTCUSDT fundia-se com a da mestre (modo one-way) e os
 * clientes copiavam as trades experimentais. A subconta isola capital, posições e perdas.
 *
 * A chave da subconta deve ter SÓ «Contracts: Orders/Positions» e, se o dono quiser que os lucros
 * da Bybit também sejam enviados, «Withdraw» com a lista branca de endereços da Bybit ligada (a
 * própria Bybit recusa levantar para outro endereço) e a chave presa ao IP da VPS.
 */
import { createHmac, randomUUID } from 'node:crypto'

const BASE = 'https://api.bybit.com'
const RECV = '10000'

interface Resp<T = unknown> { retCode: number; retMsg: string; result: T }

async function pedido<T>(metodo: 'GET' | 'POST', caminho: string, params: Record<string, unknown>): Promise<Resp<T>> {
  const key = process.env.BYBIT_AGENTE_API_KEY
  const secret = process.env.BYBIT_AGENTE_API_SECRET
  if (!key || !secret) return { retCode: -1, retMsg: 'sem BYBIT_AGENTE_API_KEY/SECRET', result: null as T }
  const ts = String(Date.now())
  let url = BASE + caminho
  let corpo = ''
  let assinar: string
  if (metodo === 'GET') {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()
    if (qs) url += `?${qs}`
    assinar = ts + key + RECV + qs
  } else {
    corpo = JSON.stringify(params)
    assinar = ts + key + RECV + corpo
  }
  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': key,
    'X-BAPI-TIMESTAMP': ts,
    'X-BAPI-RECV-WINDOW': RECV,
    'X-BAPI-SIGN': createHmac('sha256', secret).update(assinar).digest('hex'),
  }
  if (metodo === 'POST') headers['Content-Type'] = 'application/json'
  const r = await fetch(url, { method: metodo, headers, body: metodo === 'POST' ? corpo : undefined })
  return (await r.json().catch(() => ({ retCode: r.status, retMsg: `HTTP ${r.status}`, result: null }))) as Resp<T>
}

export const bybitAgenteConfigurada = () => !!(process.env.BYBIT_AGENTE_API_KEY && process.env.BYBIT_AGENTE_API_SECRET)

export async function saldoBybit(): Promise<{ equity: number; livre: number } | null> {
  const r = await pedido<{ list?: { totalEquity?: string; totalAvailableBalance?: string }[] }>('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' })
  const l = r.result?.list?.[0]
  if (r.retCode !== 0 || !l) return null
  return { equity: Number(l.totalEquity) || 0, livre: Number(l.totalAvailableBalance) || 0 }
}

async function instrumento(symbol: string): Promise<{ passo: number; minimo: number; tick: number } | null> {
  const r = await fetch(`${BASE}/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`)
  const j = (await r.json().catch(() => null)) as { result?: { list?: { lotSizeFilter?: { qtyStep?: string; minOrderQty?: string }; priceFilter?: { tickSize?: string } }[] } } | null
  const i = j?.result?.list?.[0]
  if (!i) return null
  return { passo: Number(i.lotSizeFilter?.qtyStep), minimo: Number(i.lotSizeFilter?.minOrderQty), tick: Number(i.priceFilter?.tickSize) }
}

const arred = (x: number, passo: number) => {
  const casas = Math.max(0, -Math.floor(Math.log10(passo)))
  return (Math.floor(x / passo) * passo).toFixed(casas)
}

/**
 * Abre a mercado com SL e TP colados à posição (ficam no exchange: se a VPS cair, protegem na
 * mesma). `idOrdem` = id da posição na base, para a Bybit recusar um duplicado.
 */
export async function abrirPerp(p: { symbol: string; lado: 'long' | 'short'; nocionalUsd: number; preco: number; alavancagem: number; sl: number; tp: number; idOrdem: string }) {
  const inst = await instrumento(p.symbol)
  if (!inst) return { ok: false, erro: 'instrumento desconhecido' }
  const qty = arred(p.nocionalUsd / p.preco, inst.passo)
  if (Number(qty) < inst.minimo) return { ok: false, erro: `quantidade ${qty} abaixo do mínimo ${inst.minimo}` }
  const lev = await pedido('POST', '/v5/position/set-leverage', { category: 'linear', symbol: p.symbol, buyLeverage: String(p.alavancagem), sellLeverage: String(p.alavancagem) })
  if (lev.retCode !== 0 && lev.retCode !== 110043) return { ok: false, erro: `alavancagem: ${lev.retMsg}` }
  const r = await pedido<{ orderId?: string }>('POST', '/v5/order/create', {
    category: 'linear', symbol: p.symbol, side: p.lado === 'long' ? 'Buy' : 'Sell', orderType: 'Market', qty,
    stopLoss: arred(p.sl, inst.tick), takeProfit: arred(p.tp, inst.tick), tpslMode: 'Full', positionIdx: 0, orderLinkId: p.idOrdem.replace(/-/g, '').slice(0, 36),
  })
  if (r.retCode !== 0) return { ok: false, erro: r.retMsg }
  return { ok: true, orderId: r.result?.orderId, qty }
}

export async function posicaoPerp(symbol: string): Promise<{ tamanho: number; precoMedio: number } | null> {
  const r = await pedido<{ list?: { size?: string; avgPrice?: string }[] }>('GET', '/v5/position/list', { category: 'linear', symbol })
  if (r.retCode !== 0) return null
  const l = r.result?.list?.[0]
  return { tamanho: Number(l?.size) || 0, precoMedio: Number(l?.avgPrice) || 0 }
}

/**
 * Fecha a mercado, reduce-only. `qtyMax` (modo mestre) limita ao que o agente abriu: se o Aurum
 * tiver entrado no mesmo par depois, a parte dele fica.
 */
export async function fecharPerp(symbol: string, lado: 'long' | 'short', qtyMax?: number) {
  const pos = await posicaoPerp(symbol)
  if (!pos || pos.tamanho <= 0) return { ok: true, jaFechada: true }
  const qty = qtyMax != null && qtyMax > 0 ? Math.min(qtyMax, pos.tamanho) : pos.tamanho
  const r = await pedido('POST', '/v5/order/create', { category: 'linear', symbol, side: lado === 'long' ? 'Sell' : 'Buy', orderType: 'Market', qty: String(qty), reduceOnly: true, positionIdx: 0 })
  return r.retCode === 0 ? { ok: true } : { ok: false, erro: r.retMsg }
}

export async function ultimoFecho(symbol: string): Promise<{ pnl: number; saida: number } | null> {
  const r = await pedido<{ list?: { closedPnl?: string; avgExitPrice?: string }[] }>('GET', '/v5/position/closed-pnl', { category: 'linear', symbol, limit: 1 })
  const l = r.result?.list?.[0]
  return r.retCode === 0 && l ? { pnl: Number(l.closedPnl) || 0, saida: Number(l.avgExitPrice) || 0 } : null
}

/**
 * Lucro da Bybit para fora: UNIFIED → FUND e levantamento USDT na rede Solana para `destino`.
 * Só corre com CRIPTO_VARRER_BYBIT=1. A lista branca da própria Bybit é a segunda fechadura.
 */
export async function levantarUsdtSolana(destino: string, usd: number) {
  const amount = usd.toFixed(2)
  const t = await pedido('POST', '/v5/asset/transfer/inter-transfer', { transferId: randomUUID(), coin: 'USDT', amount, fromAccountType: 'UNIFIED', toAccountType: 'FUND' })
  if (t.retCode !== 0) return { ok: false, erro: `transferência: ${t.retMsg}` }
  const w = await pedido<{ id?: string }>('POST', '/v5/asset/withdraw/create', { coin: 'USDT', chain: 'SOL', address: destino, amount, timestamp: Date.now(), forceChain: 1, accountType: 'FUND' })
  return w.retCode === 0 ? { ok: true, id: w.result?.id } : { ok: false, erro: `levantamento: ${w.retMsg}` }
}
