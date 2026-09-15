/**
 * WebTrader multi-corretora — contrato dos adaptadores (TradeLocker e MetaApi simulados, sem rede),
 * gate da quota MetaApi e verificação de dono.
 * Correr: npx tsx lib/webtrader/__tests__/corretoras.check.ts
 */
import assert from 'node:assert/strict'
import { TradeLockerSessao, limparCachesTradeLocker, lerOrdens } from '../../tradelocker/client'
import { adaptadorTradeLocker, montarPosicoesEOrdensTL } from '../corretoras/tradelocker'
import { adaptadorMt5, lerRespostaTrade, ordemMt5, posicaoMt5, type DepsMt5 } from '../corretoras/mt5'
import { canonicoDe, chaveTentativa, criarLimitador, decidirAcessoMt5, lerRefConta, plataformaValida } from '../corretoras/regras'
import { emitirSessaoTL, lerSessaoTL } from '../tradelocker-sessao'
import { CAPACIDADES, ErroCorretora, validarPedido, type AdaptadorCorretora } from '../corretoras/tipos'

const METODOS: Array<keyof AdaptadorCorretora> = ['conta', 'posicoes', 'ordens', 'historico', 'enviarOrdem', 'modificar', 'fechar', 'cancelar', 'simbolos', 'preco']

function cumpreContrato(a: AdaptadorCorretora) {
  for (const m of METODOS) assert.equal(typeof a[m], 'function', `falta ${String(m)}`)
  assert.ok(a.capacidades && typeof a.real === 'boolean' && typeof a.podeNegociar === 'boolean')
}

async function lanca(p: Promise<unknown>, status: number) {
  try {
    await p
  } catch (e) {
    assert.ok(e instanceof ErroCorretora, `esperava ErroCorretora, veio ${e}`)
    assert.equal((e as ErroCorretora).status, status)
    return e as ErroCorretora
  }
  assert.fail(`esperava erro ${status}`)
}

// ── TradeLocker com fetch simulado ────────────────────────────────────────────────────────────
type Chamada = { url: string; method: string; body: unknown; headers: Record<string, string> }

function tlFalso() {
  const chamadas: Chamada[] = []
  const cfg = {
    d: {
      accountDetailsConfig: { columns: [{ id: 'balance' }, { id: 'projectedBalance' }, { id: 'availableFunds' }, { id: 'initialMarginReq' }, { id: 'openNetPnL' }] },
      positionsConfig: { columns: ['id', 'tradableInstrumentId', 'routeId', 'side', 'qty', 'avgPrice', 'stopLossId', 'takeProfitId', 'openDate', 'unrealizedPl'].map((id) => ({ id })) },
      ordersConfig: { columns: ['id', 'tradableInstrumentId', 'routeId', 'qty', 'side', 'type', 'status', 'price', 'stopPrice', 'positionId', 'stopLoss', 'takeProfit', 'createdDate'].map((id) => ({ id })) },
      ordersHistoryConfig: { columns: ['id', 'tradableInstrumentId', 'routeId', 'qty', 'side', 'type', 'status', 'filledQty', 'avgPrice', 'price', 'lastModified'].map((id) => ({ id })) },
    },
  }
  const f = async (url: string, init?: RequestInit) => {
    const c: Chamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> }
    chamadas.push(c)
    const r = (status: number, json: unknown) => new Response(JSON.stringify(json), { status })
    if (url.includes('/auth/jwt/token')) return r(200, { accessToken: 'AT', refreshToken: 'RT' })
    if (url.includes('/trade/config')) return r(200, cfg)
    if (url.includes('/state')) return r(200, { d: { accountDetailsData: [1000, 1012.5, 900, 100, 12.5] } })
    if (url.includes('/instruments/206')) return r(200, { d: { name: 'XAUUSD.s', lotStep: 0.01, minLot: 0.01, maxLot: 50 } })
    if (url.includes('/instruments')) return r(200, { d: { instruments: [{ tradableInstrumentId: 206, name: 'XAUUSD.s', routes: [{ id: 1, type: 'TRADE' }, { id: 2, type: 'INFO' }] }] } })
    if (url.includes('/positions') && c.method === 'GET') return r(200, { d: { positions: [['P1', 206, 1, 'buy', 0.5, 2400, 'SL1', 'TP1', 1_700_000_000_000, 15]] } })
    if (url.includes('/ordersHistory')) return r(200, { d: { ordersHistory: [['H1', 206, 1, 0.5, 'buy', 'market', 'Filled', 0.5, 2400, 0, 1_700_000_000_000]] } })
    if (url.includes('/orders') && c.method === 'GET') {
      return r(200, { d: { orders: [
        ['SL1', 206, 1, 0.5, 'sell', 'stop', 'Working', 0, 2390, 'P1', 0, 0, 0],
        ['TP1', 206, 1, 0.5, 'sell', 'limit', 'Working', 2420, 0, 'P1', 0, 0, 0],
        ['O9', 206, 1, 0.2, 'buy', 'limit', 'Working', 2380, 0, 0, 2370, 2410, 1_700_000_000_000],
      ] } })
    }
    if (url.includes('/quotes')) return r(200, { d: { bp: 2401, ap: 2401.3 } })
    if (url.includes('/orders') && c.method === 'POST') return r(200, { d: { orderId: 777 } })
    if (/\/trade\/orders\/O9/.test(url)) return r(200, { s: 'ok' })
    if (/\/trade\/positions\/P1/.test(url)) return r(200, { s: 'ok' })
    return r(404, {})
  }
  return { f, chamadas }
}

async function main() {
  // ── referências e dono ──────────────────────────────────────────────────────────────────────
  const u = '11111111-2222-3333-4444-555555555555'
  assert.deepEqual(lerRefConta('mt5', `mt5:auto:${u}`), { plataforma: 'mt5', origem: 'auto', id: u })
  assert.deepEqual(lerRefConta('tradelocker', 'tradelocker:sessao:123456'), { plataforma: 'tradelocker', origem: 'sessao', id: '123456' })
  assert.deepEqual(lerRefConta('mtmfunded', `mtmfunded:${u}`), { plataforma: 'mtmfunded', id: u })
  // A plataforma do caminho tem de bater com a da referência (não se abre MT5 pela rota TradeLocker).
  assert.equal(lerRefConta('tradelocker', `mt5:site:${u}`), null)
  assert.equal(lerRefConta('mt5', `mt5:outra:${u}`), null)
  assert.equal(lerRefConta('mt5', `mt5:site:1 or 1=1`), null)
  assert.equal(lerRefConta('tradelocker', 'tradelocker:sessao:abc'), null)
  assert.equal(plataformaValida('mt4'), null)

  // ── símbolos ────────────────────────────────────────────────────────────────────────────────
  assert.equal(canonicoDe('XAUUSD.s'), 'XAUUSD')
  assert.equal(canonicoDe('EURUSDm'), 'EURUSD')
  assert.equal(canonicoDe('EURUSD-STD'), 'EURUSD')
  assert.equal(canonicoDe('GOLD'), 'XAUUSD')
  assert.equal(canonicoDe('US100.cash'), 'NAS100')
  assert.equal(canonicoDe('US30'), 'US30')
  assert.equal(canonicoDe('BTCUSDT'), 'BTCUSD')

  // ── validação comum do pedido ───────────────────────────────────────────────────────────────
  assert.deepEqual(validarPedido({ symbol: 'xauusd', direcao: 'buy', volume: 0.1 }), { symbol: 'XAUUSD', direcao: 'buy', tipo: 'mercado', volume: 0.1, preco: null, sl: null, tp: null })
  assert.throws(() => validarPedido({ symbol: 'XAUUSD', direcao: 'buy', volume: 0 }), ErroCorretora)
  assert.throws(() => validarPedido({ symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, tipo: 'limit' }), ErroCorretora)
  assert.throws(() => validarPedido({ symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, tipo: 'limit', preco: 2400, sl: 2410 }), /SL fica abaixo/)
  assert.throws(() => validarPedido({ symbol: "X'; drop", direcao: 'buy', volume: 0.1 }), ErroCorretora)

  // ── gate da quota MetaApi no WebTrader ──────────────────────────────────────────────────────
  const contas = [
    { metaapi_account_id: 'B', created_at: '2026-02-01' },
    { metaapi_account_id: 'A', created_at: '2026-01-01' },
    { metaapi_account_id: 'A', created_at: '2026-03-01' }, // mesma conta noutro produto: conta uma vez
    { metaapi_account_id: 'C', created_at: '2026-04-01' },
  ]
  const gratis = { plano: 'gratis' as const, limite: 1 }
  assert.equal(decidirAcessoMt5(gratis, contas, 'A').ok, true, 'grátis usa a sua 1.ª conta')
  const r2 = decidirAcessoMt5(gratis, contas, 'B')
  assert.equal(r2.ok, false, 'grátis não usa a 2.ª conta')
  assert.match((r2 as { erro: string }).erro, /Premium ou MTM Auto/)
  assert.equal(decidirAcessoMt5({ plano: 'premium', limite: 2 }, contas, 'B').ok, true)
  assert.equal(decidirAcessoMt5({ plano: 'premium', limite: 2 }, contas, 'C').ok, false)
  assert.equal(decidirAcessoMt5({ plano: 'premium', limite: 3 }, contas, 'C').ok, true, 'extra paga abre a 3.ª')
  assert.equal(decidirAcessoMt5({ plano: 'admin', limite: Infinity }, contas, 'C').ok, true)
  assert.equal(decidirAcessoMt5({ plano: 'premium', limite: 2 }, contas, 'Z').ok, false, 'conta que não é do utilizador')

  // ── limitador: uma leitura real por intervalo, partilhada ───────────────────────────────────
  let t = 0
  const lim = criarLimitador(() => t)
  let idas = 0
  const carregar = async () => ++idas
  await Promise.all([lim.ler('k', 5000, carregar), lim.ler('k', 5000, carregar), lim.ler('k', 5000, carregar)])
  assert.equal(idas, 1, 'pedidos em simultâneo partilham uma ida')
  t = 4999
  await lim.ler('k', 5000, carregar)
  assert.equal(idas, 1, 'dentro do intervalo não volta à corretora')
  t = 5000
  await lim.ler('k', 5000, carregar)
  assert.equal(idas, 2)
  lim.invalidarPrefixo('k')
  await lim.ler('k', 5000, carregar)
  assert.equal(idas, 3, 'depois de uma ordem relê')
  // Uma falha não se repete antes do prazo.
  let falhas = 0
  const falhar = async () => { falhas++; throw new Error('em baixo') }
  await assert.rejects(lim.ler('f', 5000, falhar))
  await assert.rejects(lim.ler('f', 5000, falhar))
  assert.equal(falhas, 1)

  assert.match(chaveTentativa('mt5', '12345', 'PUPrime-Live', (s) => require('crypto').createHash('sha256').update(s).digest('hex')), /^wt-mt5-[0-9a-f]{32}$/)

  // ── TradeLocker: contrato + mapeamento ──────────────────────────────────────────────────────
  limparCachesTradeLocker()
  const { f, chamadas } = tlFalso()
  const sessao = new TradeLockerSessao({ email: 'a@b.pt', password: 'x', server: 'OSP', env: 'demo' }, '42', '3', f)
  const tl = adaptadorTradeLocker(sessao, { podeNegociar: true })
  cumpreContrato(tl)
  assert.equal(tl.real, true)
  assert.equal(tl.capacidades.trailing, false)
  assert.deepEqual(CAPACIDADES.mtmfunded.oco, true)

  const conta = await tl.conta()
  assert.equal(conta.saldo, 1000)
  assert.equal(conta.equity, 1012.5)
  assert.equal(conta.margemLivre, 900)
  const pos = await tl.posicoes()
  assert.equal(pos.length, 1)
  assert.equal(pos[0].symbol, 'XAUUSD')
  assert.equal(pos[0].simboloCorretora, 'XAUUSD.s')
  assert.equal(pos[0].sl, 2390, 'SL lido da ordem de protecção')
  assert.equal(pos[0].tp, 2420, 'TP lido da ordem de protecção')
  const ords = await tl.ordens()
  assert.deepEqual(ords.map((o) => o.id), ['O9'], 'ordens de protecção não aparecem como pendentes')
  assert.equal(ords[0].preco, 2380)
  const idasAntes = chamadas.filter((c) => c.url.includes('/positions')).length
  await tl.posicoes()
  assert.equal(chamadas.filter((c) => c.url.includes('/positions')).length, idasAntes, 'leitura limitada (2 s)')

  const hist = await tl.historico(7)
  assert.equal(hist[0].estado, 'executada')

  const env = await tl.enviarOrdem({ symbol: 'XAUUSD', direcao: 'buy', tipo: 'limit', volume: 0.1, preco: 2390, sl: 2380, tp: 2420 })
  assert.equal(env.ok, true)
  const post = chamadas.find((c) => c.method === 'POST' && c.url.endsWith('/trade/accounts/42/orders'))!
  assert.equal((post.body as Record<string, unknown>).type, 'limit')
  assert.equal((post.body as Record<string, unknown>).price, 2390)
  assert.equal(post.headers.accNum, '3')

  await tl.fechar('P1', 0.2)
  const del = chamadas.find((c) => c.method === 'DELETE' && c.url.endsWith('/trade/positions/P1'))!
  assert.deepEqual(del.body, { qty: 0.2 }, 'fecho parcial em lotes')
  await tl.fechar('P1', 5)
  assert.deepEqual(chamadas.filter((c) => c.method === 'DELETE' && c.url.endsWith('/trade/positions/P1')).at(-1)!.body, { qty: 0 }, 'volume ≥ posição fecha tudo')

  await tl.modificar({ alvo: 'ordem', id: 'O9', preco: 2385, sl: 2375 })
  const patch = chamadas.find((c) => c.method === 'PATCH' && c.url.endsWith('/trade/orders/O9'))!
  assert.deepEqual(patch.body, { price: 2385, stopLoss: 2375, stopLossType: 'absolute' })
  await lanca(tl.modificar({ alvo: 'posicao', id: 'P1', sl: null, tp: null }), 400)
  await tl.cancelar('O9')
  assert.ok(chamadas.some((c) => c.method === 'DELETE' && c.url.endsWith('/trade/orders/O9')))

  const simb = await tl.simbolos('xau')
  assert.deepEqual(simb, [{ symbol: 'XAUUSD', simboloCorretora: 'XAUUSD.s', nome: null }])

  // Conta só em leitura: nenhuma escrita chega à corretora.
  const soLer = adaptadorTradeLocker(sessao, { podeNegociar: false })
  const antes = chamadas.length
  await lanca(soLer.enviarOrdem({ symbol: 'XAUUSD', direcao: 'buy', volume: 0.1 }), 403)
  await lanca(soLer.fechar('P1'), 403)
  assert.equal(chamadas.length, antes)

  // lerOrdens tolera colunas em falta no /config (usa as documentadas).
  assert.equal(lerOrdens({ d: { orders: [['1', 5, 6, 0.1, 'sell', 'stop', 'working']] } }, []).length, 1)
  assert.equal(montarPosicoesEOrdensTL([], [], []).ordens.length, 0)

  // ── dono da sessão TradeLocker do WebTrader: presa ao utilizador E à conta, sem password ────
  process.env.MTMFUNDED_CRED_KEY = process.env.MTMFUNDED_CRED_KEY ?? 'chave-de-teste-com-mais-de-32-caracteres!!'
  const s1 = emitirSessaoTL({ userId: 'user-A', email: 'a@b.pt', server: 'OSP', env: 'live', accountId: '42', accNum: '3', tokens: { accessToken: 'AT', refreshToken: 'RT' } })
  assert.ok(!s1.token.includes('a@b.pt') && !s1.token.includes('RT'), 'token cifrado')
  assert.ok(lerSessaoTL(s1.token, 'user-A', '42'), 'dono e conta certos')
  assert.equal(lerSessaoTL(s1.token, 'user-B', '42'), null, 'outro utilizador com o mesmo token → recusado')
  assert.equal(lerSessaoTL(s1.token, 'user-A', '43'), null, 'outra conta com o mesmo token → recusado')
  assert.equal(lerSessaoTL(s1.token.slice(0, -2) + 'xx', 'user-A', '42'), null, 'token adulterado → recusado')
  assert.equal(lerSessaoTL(null, 'user-A', '42'), null)

  // ── MT5: tudo por REST (DepsMt5 é a ÚNICA porta de I/O do adaptador) ─────────────────────────
  const rest: Array<{ caminho: string; init?: { method?: string; body?: Record<string, unknown> } }> = []
  let respostaTrade: Record<string, unknown> = { numericCode: 10009, stringCode: 'TRADE_RETCODE_DONE', orderId: 'X1', positionId: 'P7' }
  const deps: DepsMt5 = {
    rest: async (_id, caminho, init) => {
      rest.push({ caminho, init: init as never })
      if (caminho === '/account-information') return { balance: 5000, equity: 5050, margin: 200, freeMargin: 4850, currency: 'USD' }
      if (caminho === '/positions') return [{ id: '9', symbol: 'EURUSD-STD', type: 'POSITION_TYPE_SELL', openPrice: 1.1, volume: 1, stopLoss: 1.11, takeProfit: 0, profit: -3, time: '2026-09-15T10:00:00Z' }]
      if (caminho === '/orders') return [{ id: '77', symbol: 'XAUUSD.s', type: 'ORDER_TYPE_BUY_LIMIT', openPrice: 2380, currentVolume: 0.1, stopLoss: 2370 }]
      if (caminho === '/symbols') return ['XAUUSD', 'XAUUSD.s', 'EURUSD-STD']
      // VT-like: o símbolo «bare» está DISABLED, a variante nativa está FULL.
      if (caminho === '/symbols/XAUUSD/specification') return { point: 0.01, digits: 2, tradeMode: 'SYMBOL_TRADE_MODE_DISABLED' }
      if (caminho === '/symbols/XAUUSD.s/specification') return { point: 0.01, digits: 2, tradeMode: 'SYMBOL_TRADE_MODE_FULL', minVolume: 0.01, volumeStep: 0.01, maxVolume: 50, stopsLevel: 100 }
      if (caminho.endsWith('/current-price')) return { bid: 2400, ask: 2400.2 }
      if (caminho.startsWith('/history-deals/')) return [
        { id: 'd1', type: 'DEAL_TYPE_BALANCE', profit: 1000 },
        { id: 'd2', symbol: 'EURUSD-STD', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 1, price: 1.1, profit: 10, commission: -2, swap: 0, time: '2026-09-14T10:00:00Z' },
      ]
      if (caminho === '/trade') return respostaTrade
      throw new Error(`caminho inesperado ${caminho}`)
    },
    snapshot: async () => null,
  }
  const mt5 = adaptadorMt5('acc-teste', { podeNegociar: true }, deps)
  cumpreContrato(mt5)
  const c5 = await mt5.conta()
  assert.equal(c5.flutuante, 50)
  const p5 = await mt5.posicoes()
  assert.equal(p5[0].direcao, 'sell')
  assert.equal(p5[0].symbol, 'EURUSD')
  assert.equal(p5[0].tp, null, 'TP 0 = sem TP')
  await mt5.posicoes()
  assert.equal(rest.filter((r) => r.caminho === '/positions').length, 1, 'MT5: no máximo 1 leitura de posições a cada 5 s')
  const o5 = await mt5.ordens()
  assert.equal(o5[0].tipo, 'limit')
  assert.equal(ordemMt5({ id: '1', symbol: 'X', type: 'ORDER_TYPE_BUY_STOP_LIMIT' }), null)
  assert.equal(posicaoMt5({ id: '1', symbol: 'GOLD', type: 'POSITION_TYPE_BUY', openPrice: 1 }).symbol, 'XAUUSD')
  const h5 = await mt5.historico(7)
  assert.equal(h5.length, 1, 'movimentos de saldo não são negócios')
  assert.equal(h5[0].lucro, 8)

  const trades = () => rest.filter((r) => r.caminho === '/trade').map((r) => r.init!.body!)
  // Ordem a mercado: salta a variante DISABLED, afasta o SL até ao stopsLevel, vai por POST /trade.
  const env5 = await mt5.enviarOrdem({ symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, sl: 2399.9 })
  assert.equal(env5.id, 'P7')
  assert.deepEqual(trades()[0], { actionType: 'ORDER_TYPE_BUY', symbol: 'XAUUSD.s', volume: 0.1, stopLoss: 2399.05 }, 'sem comentário: conta de cliente abre como trade manual')
  assert.ok(rest.filter((r) => r.init?.method === 'POST').every((r) => r.caminho === '/trade'), 'escritas só em /trade')
  await mt5.enviarOrdem({ symbol: 'XAUUSD', direcao: 'sell', tipo: 'stop', volume: 0.1, preco: 2350 })
  assert.equal(trades()[1].actionType, 'ORDER_TYPE_SELL_STOP')
  assert.equal(trades()[1].openPrice, 2350)
  await mt5.modificar({ alvo: 'posicao', id: '9', sl: 1.12 })
  assert.deepEqual(trades()[2], { actionType: 'POSITION_MODIFY', positionId: '9', stopLoss: 1.12 })
  await mt5.fechar('9', 0.3)
  assert.deepEqual(trades()[3], { actionType: 'POSITION_PARTIAL', positionId: '9', volume: 0.3 })
  await mt5.fechar('9')
  assert.deepEqual(trades()[4], { actionType: 'POSITION_CLOSE_ID', positionId: '9' })
  await mt5.cancelar('77')
  assert.deepEqual(trades()[5], { actionType: 'ORDER_CANCEL', orderId: '77' })
  await mt5.modificar({ alvo: 'ordem', id: '77', preco: 2385 })
  assert.equal(trades()[6].actionType, 'ORDER_MODIFY')
  assert.equal(trades()[6].openPrice, 2385)

  respostaTrade = { numericCode: 10018, stringCode: 'TRADE_RETCODE_MARKET_CLOSED', message: 'Market is closed' }
  const e5 = await lanca(mt5.enviarOrdem({ symbol: 'XAUUSD', direcao: 'sell', volume: 0.1 }), 422)
  assert.match(e5.message, /Market is closed/)
  assert.throws(() => lerRespostaTrade({ numericCode: 10006 }), ErroCorretora)
  assert.deepEqual(lerRespostaTrade({ numericCode: 10009, orderId: 5 }), { orderId: '5', positionId: null })
  const antesSoLer = rest.length
  await lanca(adaptadorMt5('acc-3', { podeNegociar: false }, deps).enviarOrdem({ symbol: 'XAUUSD', direcao: 'sell', volume: 0.1 }), 403)
  assert.equal(rest.length, antesSoLer, 'só leitura: nada chega à MetaApi')

  // Símbolos: nunca getSymbols por pedido — a cache de 1 hora serve os pedidos seguintes.
  // (a ordem recusada acima esquece a lista de propósito → UMA releitura, depois cache)
  const simbAntes = rest.filter((r) => r.caminho === '/symbols').length
  await mt5.simbolos('xau')
  await mt5.simbolos('eur')
  await mt5.simbolos('')
  assert.equal(rest.filter((r) => r.caminho === '/symbols').length - simbAntes, 1)

  // ── o WebTrader NUNCA toca na cache RPC partilhada da entrega (nem a importa) ────────────────
  const fs = await import('node:fs')
  const path = await import('node:path')
  const raiz = path.resolve(__dirname, '..')
  const ficheiros = ['corretoras/mt5.ts', 'corretoras/comum.ts', 'corretoras/tradelocker.ts', 'corretoras/regras.ts', 'contas.ts', 'entrar.ts', 'tradelocker-sessao.ts']
    .map((f) => path.join(raiz, f))
    .concat([path.resolve(raiz, '../../app/api/webtrader/[plataforma]/[acao]/route.ts'), path.resolve(raiz, '../../app/api/webtrader/contas/route.ts')])
  const proibidos = /\b(placeOrder|placeMarketOrder|placeLimitOrder|placeStopOrder|placeOrdersSequential|modifyPositionSlTp|closePositionById|closePositionsForSymbol|readOpenPositions|listOpenPositions|readPendingOrders|listPendingOrders|cancelPendingOrdersForSymbol|getRpcConnection|invalidateRpcCache|getAccountSnapshot|getAccountBalance|fetchLotSizingContext|getMarketPrice|getSymbolSpecification|getAccountSymbols|lerHistorico|getHistoryDeals|lerPosicoesMotor|precoMotor|ensureMetaApiAccountOnline|checkAccountHealth)\b|metaapi\.cloud-sdk|metaapi-snapshot'/
  for (const f of ficheiros) {
    const src = fs.readFileSync(f, 'utf8')
    const m = src.match(proibidos)
    assert.equal(m, null, `${path.basename(f)} usa ${m?.[0]} (ligação RPC partilhada)`)
  }
  // Abrir a página nunca faz deploy: só ligarContaMt5 (botão «Ligar conta») chama /deploy.
  const srcMt5 = fs.readFileSync(path.join(raiz, 'corretoras/mt5.ts'), 'utf8')
  assert.equal(srcMt5.split("'/deploy'").length - 1, 1, 'um só sítio com /deploy')
  assert.ok(/export async function ligarContaMt5[\s\S]*'\/deploy'/.test(srcMt5))
  assert.ok(!/\/deploy/.test(srcMt5.slice(0, srcMt5.indexOf('export async function ligarContaMt5'))), 'restReal não faz deploy')

  console.log('corretoras.check: OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
