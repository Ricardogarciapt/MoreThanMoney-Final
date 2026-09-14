/** Pedidos à TradeLocker com fetch simulado (sem rede). Correr: npx tsx lib/tradelocker/__tests__/client.check.ts */
import assert from 'node:assert/strict'
import {
  TradeLockerError,
  TradeLockerSessao,
  autenticar,
  erroAmigavel,
  lerEstado,
  lerPosicoes,
  limparCachesTradeLocker,
  montarCorpoOrdem,
} from '../client'

type Chamada = { url: string; method: string; headers: Record<string, string>; body: unknown }

function fetchFalso(rotas: Array<(c: Chamada) => { status: number; json?: unknown; headers?: Record<string, string> } | null>) {
  const chamadas: Chamada[] = []
  const f = async (url: string, init?: RequestInit) => {
    const c: Chamada = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    chamadas.push(c)
    for (const r of rotas) {
      const res = r(c)
      if (res) return new Response(res.json !== undefined ? JSON.stringify(res.json) : '', { status: res.status, headers: res.headers })
    }
    return new Response('{}', { status: 404 })
  }
  return { f, chamadas }
}

async function main() {
  // ── Corpo da ordem (validity e tipos de SL/TP como a documentação exige) ─────────────────
  assert.deepEqual(
    montarCorpoOrdem({ tradableInstrumentId: 206, routeId: 901, side: 'buy', qty: 0.02, type: 'market', stopLoss: 2395, takeProfit: 2410 }),
    { qty: 0.02, routeId: 901, side: 'buy', tradableInstrumentId: 206, type: 'market', validity: 'IOC', price: 0, stopLoss: 2395, stopLossType: 'absolute', takeProfit: 2410, takeProfitType: 'absolute' },
  )
  const lim = montarCorpoOrdem({ tradableInstrumentId: 1, routeId: 2, side: 'sell', qty: 1, type: 'limit', price: 1.1, stopLoss: null })
  assert.equal(lim.validity, 'GTC')
  assert.equal(lim.price, 1.1)
  assert.equal('stopLoss' in lim, false, 'sem SL → sem stopLoss nem stopLossType')
  const stp = montarCorpoOrdem({ tradableInstrumentId: 1, routeId: 2, side: 'buy', qty: 1, type: 'stop', stopPrice: 1.2 })
  assert.equal(stp.validity, 'GTC')
  assert.equal(stp.stopPrice, 1.2)
  assert.equal(stp.price, 0)

  // ── Estado e posições pelas colunas do /config ───────────────────────────────────────────
  const est = lerEstado({ d: { accountDetailsData: [1000, 1012.5, 900] } }, ['balance', 'projectedBalance', 'availableFunds'])
  assert.equal(est.balance, 1000)
  assert.equal(est.equity, 1012.5)
  const pos = lerPosicoes(
    { d: { positions: [['7277816997846858725', '206', '1152263', 'buy', '10', '90415.16', null, null, '1767952099156', '-458.10', null]] } },
    [],
  )
  assert.equal(pos[0].id, '7277816997846858725', 'id grande fica string (não perde precisão)')
  assert.equal(pos[0].qty, 10)
  assert.equal(pos[0].side, 'buy')

  // ── Erros traduzidos ─────────────────────────────────────────────────────────────────────
  assert.equal(erroAmigavel(401).codigo, 'credenciais')
  assert.equal(erroAmigavel(429).codigo, 'limite')
  assert.match(erroAmigavel(400, 'Not enough money', 'ordem').message, /recusou a ordem: Not enough money/)

  // ── Login: corpo e URL do ambiente ───────────────────────────────────────────────────────
  {
    const { f, chamadas } = fetchFalso([(c) => (c.url.endsWith('/auth/jwt/token') ? { status: 201, json: { accessToken: 'A1', refreshToken: 'R1' } } : null)])
    const t = await autenticar({ email: 'x@y.pt', password: 'segredo', server: 'OSP', env: 'demo' }, f)
    assert.equal(t.accessToken, 'A1')
    assert.equal(chamadas[0].url, 'https://demo.tradelocker.com/backend-api/auth/jwt/token')
    assert.deepEqual(chamadas[0].body, { email: 'x@y.pt', password: 'segredo', server: 'OSP' })
  }
  {
    const { f } = fetchFalso([() => ({ status: 400, json: { s: 'error', errmsg: 'Invalid credentials' } })])
    await assert.rejects(autenticar({ email: 'a', password: 'b', server: 'c', env: 'live' }, f), (e: unknown) => e instanceof TradeLockerError && e.codigo === 'credenciais')
  }

  // ── Sessão: token em cache, headers accNum/Bearer, 401 renova e repete uma vez ───────────
  limparCachesTradeLocker()
  {
    let tokenN = 0
    let estadoPedidos = 0
    const { f, chamadas } = fetchFalso([
      (c) => (c.url.endsWith('/auth/jwt/token') ? { status: 201, json: { accessToken: `T${++tokenN}`, refreshToken: 'R' } } : null),
      (c) => (c.url.endsWith('/auth/jwt/refresh') ? { status: 400, json: { s: 'error', errmsg: 'expired' } } : null),
      (c) => (c.url.endsWith('/trade/config') ? { status: 200, json: { d: { accountDetailsConfig: { columns: [{ id: 'balance' }, { id: 'projectedBalance' }] }, positionsConfig: { columns: [] } } } } : null),
      (c) => {
        if (!c.url.endsWith('/trade/accounts/123/state')) return null
        estadoPedidos++
        if (estadoPedidos === 1) return { status: 401, json: { s: 'error' } } // token revogado
        return { status: 200, json: { d: { accountDetailsData: [500, 480] } } }
      },
    ])
    const s = new TradeLockerSessao({ email: 'e', password: 'p', server: 'S', env: 'live' }, '123', '2', f)
    const e = await s.estado()
    assert.equal(e.balance, 500)
    assert.equal(e.equity, 480)
    const pedidoEstado = chamadas.filter((c) => c.url.endsWith('/state')).pop()!
    assert.equal(pedidoEstado.headers.accNum, '2')
    assert.equal(pedidoEstado.headers.Authorization, 'Bearer T2', 'repetiu com token novo')
    assert.equal(estadoPedidos, 2, '401 repete UMA vez')
  }

  // ── 429 espera e repete; ordem com 5xx NÃO repete ────────────────────────────────────────
  limparCachesTradeLocker()
  {
    let n = 0
    let ordens = 0
    const { f, chamadas } = fetchFalso([
      (c) => (c.url.endsWith('/auth/jwt/token') ? { status: 201, json: { accessToken: 'T', refreshToken: 'R' } } : null),
      (c) => {
        if (!c.url.endsWith('/instruments')) return null
        n++
        return n === 1 ? { status: 429, headers: { 'retry-after': '0.01' } } : { status: 200, json: { d: { instruments: [{ tradableInstrumentId: 206, name: 'XAUUSD', routes: [{ id: 1, type: 'TRADE' }] }] } } }
      },
      (c) => {
        if (!c.url.endsWith('/orders')) return null
        ordens++
        return { status: 503, json: { s: 'error' } }
      },
      (c) => (c.method === 'DELETE' && c.url.endsWith('/trade/positions/99') ? { status: 200, json: { s: 'ok' } } : null),
    ])
    const s = new TradeLockerSessao({ email: 'e2', password: 'p', server: 'S', env: 'live' }, '7', '1', f)
    const inst = await s.instrumentos()
    assert.equal(inst[0].tradableInstrumentId, 206)
    assert.equal(n, 2, '429 repetiu')
    await assert.rejects(s.colocarOrdem({ tradableInstrumentId: 206, routeId: 1, side: 'buy', qty: 0.01, type: 'market' }))
    assert.equal(ordens, 1, 'ordem com 5xx não se repete (evita posições a dobrar)')
    await s.fecharPosicao('99', 0.05)
    const fecho = chamadas.find((c) => c.method === 'DELETE')!
    assert.equal(fecho.url, 'https://live.tradelocker.com/backend-api/trade/positions/99')
    assert.deepEqual(fecho.body, { qty: 0.05 })
  }

  console.log('tradelocker client: OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
