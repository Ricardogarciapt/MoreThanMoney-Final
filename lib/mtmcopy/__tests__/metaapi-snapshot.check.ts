/** Fotografia do streaming: frescura/recurso ao RPC, preço, publicação e sombra. Correr: npx tsx lib/mtmcopy/__tests__/metaapi-snapshot.check.ts */
import assert from 'node:assert/strict'
import {
  amostraSombraDevida,
  assinaturaSnapshot,
  contasStreaming,
  decidirFonte,
  decidirPublicacao,
  diferencasSombra,
  posicaoParaSnapshot,
  precoDoSnapshot,
  type PosicaoSnapshot,
} from '../metaapi-snapshot-regras'

let n = 0
const ok = (c: boolean, m: string) => { n++; assert.ok(c, m) }
const T = Date.parse('2026-09-15T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

// ── lista de contas ──
ok(contasStreaming('').length === 0, 'vazia = desligado')
ok(contasStreaming(undefined).length === 0, 'undefined = desligado')
ok(JSON.stringify(contasStreaming(' a , b,,c ')) === '["a","b","c"]', 'vírgulas e espaços')

// ── decisão da fonte ──
ok(decidirFonte(null, T).fonte === 'rpc', 'sem fotografia → RPC')
ok(decidirFonte({ sincronizado: false, em: iso(T) }, T).fonte === 'rpc', 'dessincronizada → RPC')
ok(decidirFonte({ sincronizado: true, em: iso(T - 3000) }, T).fonte === 'snapshot', '3 s exactos → fotografia')
ok(decidirFonte({ sincronizado: true, em: iso(T - 3001) }, T).fonte === 'rpc', '3,001 s → RPC')
ok(decidirFonte({ sincronizado: true, em: iso(T - 200) }, T).fonte === 'snapshot', 'fresca → fotografia')
ok(decidirFonte({ sincronizado: true, em: iso(T + 1500) }, T).fonte === 'snapshot', 'relógio 1,5 s à frente tolera')
ok(decidirFonte({ sincronizado: true, em: iso(T + 2500) }, T).fonte === 'rpc', 'relógio 2,5 s à frente → RPC')
ok(decidirFonte({ sincronizado: true, em: 'lixo' }, T).fonte === 'rpc', 'data ilegível → RPC')
ok(decidirFonte({ sincronizado: 'true' as unknown as boolean, em: iso(T) }, T).fonte === 'rpc', 'só true booleano conta')

// ── preço ──
const snap = { em: iso(T), precos: { 'XAUUSD.s': { bid: 2500, ask: 2500.4, em: T - 500 }, EURUSD: { bid: 1.1, ask: 1.1002, em: T - 20_000 } } }
ok(precoDoSnapshot(snap, 'XAUUSD.s') === 2500.2, 'média bid/ask')
ok(precoDoSnapshot(snap, 'XAUUSD') === null, 'símbolo da corretora exacto, sem adivinhar')
ok(precoDoSnapshot(snap, 'EURUSD') === null, 'tick com 20 s → null (cai no RPC)')
ok(precoDoSnapshot({ em: iso(T), precos: { X: { bid: 0, ask: 1, em: T } } }, 'X') === null, 'bid 0 → null')

// ── normalização das posições do SDK ──
const p = posicaoParaSnapshot({ id: 123, symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2490, volume: 0.03, stopLoss: 2480, time: new Date(T), comment: 'Premium' })!
ok(p.id === '123' && p.time === iso(T) && p.takeProfit === undefined && p.comment === 'Premium', 'Date → ISO, id em string')
ok(posicaoParaSnapshot({ symbol: 'X' }) === null, 'sem id → fora')

// ── publicação ──
const pos: PosicaoSnapshot[] = [{ id: '1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 1, volume: 0.03, stopLoss: 2480 }]
const precos = { 'XAUUSD.s': { bid: 1, ask: 2, em: T } }
const a1 = assinaturaSnapshot(pos, precos, true)
ok(a1 === assinaturaSnapshot([{ ...pos[0], currentPrice: 99, profit: 5 }], { 'XAUUSD.s': { bid: 1, ask: 2, em: T + 9 } }, true), 'currentPrice/profit/em do tick não contam como mudança')
ok(a1 !== assinaturaSnapshot([{ ...pos[0], stopLoss: 2485 }], precos, true), 'SL mexido conta')
const est = { assinatura: a1, publicadoEm: T, sincronizado: true }
ok(!decidirPublicacao(est, a1 + 'x', true, T + 999), 'mudou mas <1 s → espera')
ok(decidirPublicacao(est, a1 + 'x', true, T + 1000), 'mudou e 1 s → escreve')
ok(!decidirPublicacao(est, a1, true, T + 1999), 'igual <2 s → não escreve')
ok(decidirPublicacao(est, a1, true, T + 2000), 'igual 2 s → batimento')
ok(decidirPublicacao(est, a1 + 'x', false, T + 10), 'perdeu sincronização → escreve já')
ok(decidirPublicacao({ assinatura: null, publicadoEm: 0, sincronizado: null }, a1, true, T), 'primeira escrita')

// ── sombra ──
ok(amostraSombraDevida(undefined, T), 'nunca amostrou → devida')
ok(!amostraSombraDevida(T - 29_999, T), '<30 s → não')
ok(amostraSombraDevida(T - 30_000, T), '30 s → devida')

const base: PosicaoSnapshot[] = [
  { id: '1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2490, volume: 0.03, stopLoss: 2480, takeProfit: 2520 },
  { id: '2', symbol: 'EURUSD', type: 'POSITION_TYPE_SELL', openPrice: 1.1, volume: 0.1 },
]
const igual = diferencasSombra(base, base.map((x) => ({ ...x, currentPrice: 7 })), [{ symbol: 'XAUUSD', snapshot: 2500.2, rpc: 2500.3 }])
ok(igual.iguais && igual.precoDeltaPips.XAUUSD === 1, 'iguais; Δ 0,1 USD = 1 pip de ouro')
const dif = diferencasSombra(
  base,
  [{ ...base[0], stopLoss: 2490.5, volume: 0.02 }, { id: '3', symbol: 'GBPUSD', type: 'POSITION_TYPE_BUY', openPrice: 1.3 }],
  [{ symbol: 'XAUUSD', snapshot: 2500, rpc: 2501 }, { symbol: 'EURUSD', snapshot: null, rpc: 1.1 }],
)
ok(!dif.iguais, 'difere')
ok(dif.diferencas.includes('3: só no RPC') && dif.diferencas.includes('2: só na fotografia'), 'ids de cada lado')
ok(dif.diferencas.some((x) => x.startsWith('1: sl')) && dif.diferencas.some((x) => x.startsWith('1: volume')), 'sl e volume')
ok(dif.diferencas.includes('XAUUSD: preço Δ10p'), 'preço acima da tolerância')
ok(dif.diferencas.includes('EURUSD: sem preço na fotografia'), 'preço em falta na fotografia')
ok(!diferencasSombra(base, [base[0]]).iguais && diferencasSombra(base, [base[0]]).diferencas[0] === 'contagem 2≠1', 'contagem')
ok(diferencasSombra([{ ...base[1], stopLoss: 0 }], [{ ...base[1], stopLoss: undefined }]).iguais, 'SL 0 = sem SL')

console.log(`✓ metaapi-snapshot: ${n} verificações`)
