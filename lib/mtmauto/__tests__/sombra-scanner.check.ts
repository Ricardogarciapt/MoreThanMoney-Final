/**
 * Sombra do MTM Scanner — gate, sinal, perfil, replay, exposição e linhas diárias.
 *
 *   npx tsx lib/mtmauto/__tests__/sombra-scanner.check.ts
 */
import assert from 'node:assert/strict'
import { DEFAULT_SIGNAL_RULES, type SignalRules } from '../../mtmcopy/signal-rules'
import { classifyAsset, confirmationsPassed } from '../../mtmcopy/webhook-gates'
import { pipSizeForSymbol } from '../../mtmcopy/trade-outcome'
import { perdasSeguidas, piorSequencia, replicar, type Perfil, type Sinal, type Vela } from '../../estudos/replay-velas'
import {
  configDoProvider, exposicaoMaxima, linhasPorDia, meioSpreadScanner, perfilParaSinal, porResolver, resumir,
  sinalDaLinha, teriaExecutado, type LinhaSinal, type TradeSombra,
} from '../sombra/scanner'

let n = 0
const ok = (nome: string, f: () => void) => { f(); n++; console.log(`  ✓ ${nome}`) }
const perto = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// As regras reais de site_settings a 16/09 (a whitelist que conta).
const REGRAS: SignalRules = {
  ...DEFAULT_SIGNAL_RULES,
  exec_symbol_whitelist: ['AUDCHF', 'NZDCHF', 'USDCHF', 'EURCHF', 'GBPCHF', 'EURUSD', 'GBPUSD', 'EURGBP', 'EURCAD', 'GBPCAD', 'CADCHF', 'EURAUD', 'GBPJPY', 'CADJPY', 'NZDUSD', 'US30', 'UK100', 'SPX500', 'USOIL'],
  exec_sell_min_confirmations: 2,
}
const SW = { forex: true, sensei: true, sensei_entries: true }

const linha = (ticker: string, action: string, conf: [boolean, boolean, boolean], extra: Record<string, unknown> = {}): LinhaSinal => ({
  id: `${ticker}-${action}`,
  received_at: '2026-09-16T20:15:00Z',
  ticker,
  action,
  raw_payload: {
    ticker, action, timeframe: '15', strategy: 'MTMScanner', order_type: 'MARKET',
    entry: 0.58511, sl: 0.58459, tp1: 0.58614, tp2: 0.58718, tp3: 0.58821,
    confirmations: { 'Acima POC': conf[0], 'DEMA 15>50': conf[1], 'DEMA 50>238': conf[2] },
    ...extra,
  },
})

console.log('gate')
ok('webhook-gates: classes e confirmações como no webhook', () => {
  assert.equal(classifyAsset('EURUSD'), 'forex')
  assert.equal(classifyAsset('US30'), 'index')
  assert.equal(classifyAsset('NATURALGAS'), 'other')
  assert.equal(classifyAsset('XAUUSD'), 'gold_btc')
  assert.equal(confirmationsPassed({ confirmations: { a: true, b: false, c: true } }), 2)
})
ok('AUDCHF compra com 3 confirmações passa', () => {
  assert.deepEqual(teriaExecutado(linha('AUDCHF', 'buy', [true, true, true]), REGRAS, SW), { ok: true, classe: 'forex' })
})
ok('0 confirmações: nem é publicado', () => {
  const v = teriaExecutado(linha('GBPCAD', 'sell', [false, false, false]), REGRAS, SW)
  assert.equal(v.ok, false)
  assert.match((v as { motivo: string }).motivo, /ruído/)
})
ok('AUDCAD está fora da whitelist', () => {
  const v = teriaExecutado(linha('AUDCAD', 'buy', [true, true, false]), REGRAS, SW)
  assert.match((v as { motivo: string }).motivo, /whitelist/)
})
ok('US30 está na whitelist mas índices não executam por este caminho', () => {
  const v = teriaExecutado(linha('US30', 'buy', [true, true, true]), REGRAS, SW)
  assert.match((v as { motivo: string }).motivo, /classe index/)
})
ok('ouro do Scanner está excluído', () => {
  const v = teriaExecutado(linha('XAUUSD', 'buy', [true, true, true], { entry: 4600, sl: 4590, tp1: 4610 }), REGRAS, SW)
  assert.equal(v.ok, false)
})
ok('interruptor forex desligado corta', () => {
  const v = teriaExecutado(linha('AUDCHF', 'buy', [true, true, true]), REGRAS, { ...SW, forex: false })
  assert.match((v as { motivo: string }).motivo, /interruptor/)
})
ok('CHFJPY (lista negra de alerta) não passa mesmo com confirmações', () => {
  assert.equal(teriaExecutado(linha('CHFJPY', 'buy', [true, true, true]), REGRAS, SW).ok, false)
})

console.log('sinal e perfil')
// A linha real do Scanner a 16/09.
const PROV = { slug: 'mtm-scanner', ativo: false, sinais_config: { modo: 'sombra' }, saidas_pct: null, trailing_arranca_pips: '10', trailing_distancia_pips: null, trailing_passo_pips: null, be_gatilho: 1 }
const cfg = configDoProvider(PROV)
ok('`modo` não muda a gestão', () => {
  assert.deepEqual(configDoProvider({ ...PROV, sinais_config: {} }), cfg)
  assert.deepEqual(cfg.saidasPct, [50, 25])
  assert.equal(cfg.trailingInicioPips, 10)
  assert.equal(cfg.beGatilhoPips, null, 'a coluna be_gatilho fica de fora')
})
const s = sinalDaLinha(linha('AUDCHF', 'buy', [true, true, true])) as Sinal
ok('stop de 5,2 pips alargado a 20', () => {
  assert.ok(!('erro' in s))
  assert.ok(perto((s.entrada - s.sl) / pipSizeForSymbol('AUDCHF'), 20, 1e-6))
  assert.deepEqual(s.tps, [0.58614, 0.58718, 0.58821])
  const semMin = sinalDaLinha(linha('AUDCHF', 'buy', [true, true, true]), { slMinimo: false }) as Sinal
  assert.equal(semMin.sl, 0.58459)
})
ok('sinal sem stop não se mede', () => {
  assert.ok('erro' in sinalDaLinha(linha('AUDCHF', 'buy', [true, true, true], { sl: null })))
})
const meio = meioSpreadScanner('AUDCHF')
ok('spread: 2,5 pips nos cruzados, 1,2 nos majors', () => {
  assert.ok(perto(meio * 2, 0.00025))
  assert.ok(perto(meioSpreadScanner('EURUSD') * 2, 0.00012))
})
const perfil = perfilParaSinal(cfg, s, meio)
ok('perfil: parciais 50/25, BE no TP1 +2 pips, trailing aos 10 pips a meio risco', () => {
  const Rp = s.entrada + meio - s.sl
  assert.deepEqual(perfil.partes, [0.5, 0.25])
  assert.equal(perfil.beNoTp1, true)
  assert.equal(perfil.beR, null)
  assert.ok(perto(perfil.beOffsetR, 0.0002 / Rp))
  assert.ok(perto(perfil.trailArranqueR!, 0.001 / Rp))
  assert.ok(perto(perfil.trailDistanciaR, 0.5))
})
ok('precedência: fracção do risco manda; semTrailing tira o trailing', () => {
  const p = perfilParaSinal(configDoProvider({ ...PROV, sinais_config: { beFracaoDoRisco: 0.3, semTrailing: true } }), s, meio)
  assert.equal(p.beR, 0.3)
  assert.equal(p.beNoTp1, undefined)
  assert.equal(p.trailArranqueR, null)
})
ok('um só alvo: sem parciais, BE à distância do TP1', () => {
  const um = { ...s, tps: [s.tps[0]] }
  const p = perfilParaSinal(cfg, um, meio)
  assert.deepEqual(p.partes, [])
  assert.ok(p.beR != null && p.beR > 0)
})

console.log('replay')
const T0 = Date.parse('2026-09-16T10:00:00Z') / 1000
const velas = (precos: [number, number, number][]): Vela[] => precos.map(([h, l, c], i) => ({ t: T0 + i * 900, o: c, h, l, c }))
const base: Sinal = { id: 'x', em: T0 * 1000 - 1000, ticker: 'EURUSD', tv: '', direcao: 'buy', entrada: 1.1, sl: 1.098, tps: [1.101, 1.102, 1.104] }
const sem: Perfil = { nome: '', beR: null, beOffsetR: 0, trailArranqueR: null, trailDistanciaR: 0.5, partes: [0.5, 0.25] }
const flat = (x: number): [number, number, number] => [x, x, x]
ok('directo ao stop: −1R, fecho na vela do stop', () => {
  const r = replicar(base, velas([flat(1.0995), [1.0995, 1.0975, 1.0978], flat(1.0978), flat(1.0978)]), sem, { meio: 0 })
  assert.ok(!('erro' in r))
  if ('erro' in r) return
  assert.equal(r.motivo, 'sl')
  assert.ok(perto(r.R, -1))
  assert.equal(r.fechoEm, (T0 + 2 * 900) * 1000)
})
ok('2.ª parcial numa vela DEPOIS da 1.ª (o defeito do `break`)', () => {
  // TP1 na vela 0, TP2 na vela 2, depois volta ao stop original.
  const r = replicar(base, velas([[1.1012, 1.0999, 1.1005], flat(1.1005), [1.1021, 1.1004, 1.1015], [1.1015, 1.0975, 1.0976]]), sem, { meio: 0 })
  if ('erro' in r) throw new Error(r.erro)
  // 0,5 × 0,5R + 0,25 × 1R + 0,25 × (−1R) = 0,25
  assert.ok(perto(r.R, 0.25), `R = ${r.R}`)
})
ok('BE no TP1: o resto sai na entrada + folga', () => {
  const p: Perfil = { ...sem, beNoTp1: true, beOffsetR: 0.1 }
  const r = replicar(base, velas([[1.1012, 1.0999, 1.1005], flat(1.1005), [1.1005, 1.0990, 1.0990], flat(1.099)]), p, { meio: 0 })
  if ('erro' in r) throw new Error(r.erro)
  assert.equal(r.motivo, 'be')
  assert.ok(perto(r.R, 0.5 * 0.5 + 0.5 * 0.1), `R = ${r.R}`)
})
ok('sem velas a seguir ao sinal não se mede', () => {
  const r = replicar({ ...base, em: (T0 + 10 * 900) * 1000 }, velas([flat(1.1), flat(1.1), flat(1.1), flat(1.1)]), sem)
  assert.ok('erro' in r)
})

console.log('exposição e resumo')
const tr = (id: string, ticker: string, ini: number, fim: number, R = -1, motivo: TradeSombra['motivo'] = 'sl', barras = 10): TradeSombra =>
  ({ id, ticker, direcao: 'buy', em: ini, R, motivo, inicioEm: ini, fechoEm: fim, barras })
const H = 3_600_000
const D0 = Date.parse('2026-09-15T00:00:00Z')
ok('três sobrepostas contam 3; fecho e abertura no mesmo instante não se sobrepõem', () => {
  const e = exposicaoMaxima([tr('a', 'EURCHF', D0, D0 + 5 * H), tr('b', 'GBPCHF', D0 + H, D0 + 3 * H), tr('c', 'USDCHF', D0 + 2 * H, D0 + 4 * H), tr('d', 'EURUSD', D0 + 5 * H, D0 + 6 * H)])
  assert.equal(e.max, 3)
  assert.equal(e.moeda, 'CHF')
  assert.equal(e.moedaN, 3)
  assert.equal(e.piorMoeda, 'CHF')
})
ok('contarSo: posições de trás contam, os máximos só nas aberturas do dia', () => {
  const ts = [tr('a', 'EURCHF', D0 - 2 * H, D0 + 2 * H), tr('b', 'EURCHF', D0 - H, D0 + 2 * H), tr('c', 'GBPUSD', D0 + H, D0 + 3 * H)]
  assert.equal(exposicaoMaxima(ts, { de: D0, ate: D0 + 24 * H }).max, 3)
  assert.equal(exposicaoMaxima(ts, { de: D0 + 24 * H, ate: D0 + 48 * H }).max, 0)
})
ok('perdas seguidas e pior queda', () => {
  assert.equal(perdasSeguidas([-1, -1, 0, -1, 0.5, -1]), 3)
  assert.ok(perto(piorSequencia([1, -1, -1, 0.5, -2, 3]), -3.5))
  const r = resumir([tr('a', 'X', 1, 2, -1), tr('b', 'X', 0, 2, 0.5, 'tp'), tr('c', 'X', 3, 4, 0.2, 'aberta', 5), tr('d', 'X', 4, 5, -0.1, 'aberta', 288)])
  assert.equal(r.trades, 4)
  assert.equal(r.vitorias, 2)
  assert.equal(r.abertas, 1, 'aberta com a janela inteira já está resolvida (fechada a mercado)')
  assert.ok(perto(r.rTotal, -0.4))
})
ok('linhas por dia: dia do sinal, provisório enquanto houver trade por resolver', () => {
  const ts = [
    tr('a', 'EURCHF', D0 + H, D0 + 2 * H, -1),
    tr('b', 'EURCHF', D0 + 25 * H, D0 + 26 * H, 0.4, 'tp'),
    tr('c', 'GBPUSD', D0 + 25.5 * H, D0 + 30 * H, 0.1, 'aberta', 12),
  ]
  assert.ok(porResolver(ts[2]))
  const linhas = linhasPorDia({ estrategia: 'mtm-scanner', dias: ['2026-09-15', '2026-09-16'], trades: ts, gestao: {}, sinaisPorDia: new Map() })
  assert.equal(linhas[0].trades, 1)
  assert.equal(linhas[0].definitivo, true)
  assert.equal(linhas[1].trades, 2)
  assert.equal(linhas[1].definitivo, false)
  assert.equal(linhas[1].exposicao_max, 2)
  assert.deepEqual((linhas[1].detalhe as { risco_somado_pct: unknown }).risco_somado_pct, { a_0_25: 0.5, a_1: 2 })
})

console.log(`\nsombra-scanner: ${n} verificações ok`)
