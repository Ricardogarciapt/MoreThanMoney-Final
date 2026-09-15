/**
 * Terminal MTM — fontes de preço, variação, idade da análise, limite de pedidos, lotes do cron,
 * técnicos. Correr: npx tsx lib/__tests__/mtm-terminal.check.ts
 */
import { TERMINAL_ASSETS, findTerminalAsset } from '@/lib/mtm-terminal-assets'
import {
  analysisAgeState, BROKER_FRESH_MS, candidateKey, chooseQuote, computeChangePercent, formatAge,
  pickAssetsToRefresh, quoteSourcePlan, refreshDecision,
} from '@/lib/mtm-terminal-live'
import { basisAdjust, computeTechnicals, computeTerminalLevels, type Candle } from '@/lib/mtm-terminal-technicals'
import { isCurrentGenModel, modelCandidates } from '@/lib/mtm-terminal-analysis'

let ok = 0, ko = 0
function t(nome: string, real: unknown, esperado: unknown) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado)
  if (bate) ok++; else { ko++; console.log(`  ✗ ${nome}\n      esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`) }
}
const NOW = Date.parse('2026-09-15T17:30:00Z')

console.log('— mapeamento de fontes —')
const gold = findTerminalAsset('XAUUSD')!
const goldPlan = quoteSourcePlan(gold)
t('ouro: gráfico OANDA spot', gold.tvSymbol, 'OANDA:XAUUSD')
t('ouro: 1.ª fonte = PU Prime XAUUSD', [goldPlan[0].kind, goldPlan[0].symbol], ['broker', 'XAUUSD'])
t('ouro: nunca futuros (GC=F) em nenhum passo', goldPlan.some((s) => /=F$/.test(s.symbol)), false)
t('ouro: nunca Yahoo', goldPlan.some((s) => s.kind === 'yahoo'), false)
t('ouro: referência ao nível do spot', gold.ref, { kind: 'binance-futures', symbol: 'XAUUSDT', sameLevel: true })
t('nenhum ativo usa futuros de metais', TERMINAL_ASSETS.filter((a) => /^(GC|SI)=F$/.test(a.ref.symbol) || /^(GC|SI)=F$/.test(a.priceSymbol)).map((a) => a.symbol), [])
t('cripto: Binance primeiro (gráfico Binance)', quoteSourcePlan(findTerminalAsset('BTCUSD')!).map((s) => s.kind), ['binance-spot', 'coingecko'])
t('S&P: corretora US500, gráfico OANDA', [findTerminalAsset('SPX500')!.brokerSymbol, findTerminalAsset('SPX500')!.tvSymbol], ['US500', 'OANDA:SPX500USD'])
t('S&P: Yahoo (futuros) só no fim e marcado como aproximação',
  quoteSourcePlan(findTerminalAsset('SPX500')!).map((s) => `${s.kind}:${s.sameLevel}`), ['broker:true', 'broker:true', 'yahoo:false'])
t('EURUSD: Yahoo ao mesmo nível antes do tick antigo', quoteSourcePlan(findTerminalAsset('EURUSD')!).map((s) => s.kind), ['broker', 'yahoo', 'broker', 'yahoo'])
t('todos os não-cripto têm símbolo de corretora', TERMINAL_ASSETS.filter((a) => a.type !== 'crypto' && !a.brokerSymbol).map((a) => a.symbol), [])

console.log('— escolha do preço —')
const fresh = { price: 4297.4, bid: 4297.3, ask: 4297.5, at: NOW - 2_000 }
const old = { price: 4290, at: NOW - 3 * 3600_000 }
t('tick fresco da corretora ganha',
  chooseQuote(goldPlan, { [candidateKey('broker', 'XAUUSD')]: fresh, [candidateKey('binance-futures', 'XAUUSDT')]: { price: 4302, at: NOW } }, NOW)?.step.kind, 'broker')
t('tick com 20 s → perpétuo Binance',
  chooseQuote(goldPlan, { [candidateKey('broker', 'XAUUSD')]: { ...fresh, at: NOW - BROKER_FRESH_MS - 5_000 }, [candidateKey('binance-futures', 'XAUUSDT')]: { price: 4302, at: NOW } }, NOW)?.step.kind, 'binance-futures')
t('tudo em baixo → tick antigo da corretora (com idade)',
  chooseQuote(goldPlan, { [candidateKey('broker', 'XAUUSD')]: old }, NOW)?.step.label, 'PU Prime')
t('sem nada → null', chooseQuote(goldPlan, {}, NOW), null)

console.log('— variação —')
t('mesmo nível: preço ao vivo vs abertura 24h', Number(computeChangePercent(4300, { base: 4000, last: 9999, basis: '24h' }, true)!.toFixed(2)), 7.5)
t('nível diferente: usa a % da referência', Number(computeChangePercent(7618, { base: 7598.5, last: 7649.75, basis: 'sessão' }, false)!.toFixed(3)), 0.674)
t('sem base → null', computeChangePercent(1, { base: null, last: 1, basis: '24h' }, true), null)

console.log('— idade —')
t('2 s', formatAge(2_000), 'há 2 s')
t('3 min', formatAge(185_000), 'há 3 min')
t('análise de hoje fresca', analysisAgeState('2026-09-15T08:04:00Z', NOW).state, 'fresh')
t('análise > 24 h = desatualizada', analysisAgeState('2026-09-14T08:04:00Z', NOW).state, 'stale')
t('análise de julho = desatualizada', analysisAgeState('2026-07-20T08:00:00Z', NOW).state, 'stale')
t('sem data = missing', analysisAgeState(null, NOW).state, 'missing')

console.log('— limite de atualização —')
t('sem histórico → pode', refreshDecision({ lastGeneratedAt: '2026-09-15T08:00:00Z', lastUserRequestAt: null, now: NOW }).allowed, true)
t('ativo gerado há 2 min → bloqueia 180 s', refreshDecision({ lastGeneratedAt: new Date(NOW - 120_000).toISOString(), lastUserRequestAt: null, now: NOW }), { allowed: false, reason: 'asset', retryAfterS: 180 })
t('utilizador pediu há 1 min → bloqueia 240 s', refreshDecision({ lastGeneratedAt: null, lastUserRequestAt: NOW - 60_000, now: NOW }), { allowed: false, reason: 'user', retryAfterS: 240 })
t('passados 5 min → pode', refreshDecision({ lastGeneratedAt: new Date(NOW - 301_000).toISOString(), lastUserRequestAt: NOW - 301_000, now: NOW }).allowed, true)

console.log('— lotes do cron —')
const gens: Record<string, string | null> = {
  XAUUSD: '2026-09-15T08:02:00Z', XRPUSD: '2026-07-10T08:00:00Z', NAS100: '2026-07-11T08:00:00Z', SOLUSD: '2026-09-11T08:00:00Z',
}
t('sem análise e mais antigos primeiro; hoje fica de fora',
  pickAssetsToRefresh(['XAUUSD', 'XRPUSD', 'NAS100', 'SOLUSD', 'AAPL'], gens, NOW, { batch: 4, minAgeMs: 20 * 3600_000 }), ['AAPL', 'XRPUSD', 'NAS100', 'SOLUSD'])
t('22 ativos cabem em 12 corridas de 4', Math.ceil(TERMINAL_ASSETS.length / 4) <= 12, true)

console.log('— técnicos —')
const candles: Candle[] = Array.from({ length: 80 }, (_, i) => {
  const c = 100 + i * 0.5
  return { t: i, o: c - 0.2, h: c + 1, l: c - 1, c }
})
const tech = computeTechnicals(candles, 140)!
t('subida contínua = tendência de alta', tech.regime, 'tendência de alta')
t('RSI de subida contínua ≥ 70', tech.rsi14! >= 70, true)
const lv = computeTerminalLevels(candles, 139)!
t('suportes abaixo do preço', lv.supports.every((s) => s < 139), true)
t('resistências acima do preço', lv.resistances.every((r) => r > 139), true)
t('base: nível igual não reescala', basisAdjust(candles, 150, true).factor, 1)
t('base: futuros → CFD reescala', Number(basisAdjust(candles, 139.5 * 0.99, false).factor.toFixed(3)), 0.99)
t('base implausível ignorada', basisAdjust(candles, 50, false).factor, 1)

console.log('— modelos —')
const envBackup = { a: process.env.ANTHROPIC_MODEL, m: process.env.MTM_TERMINAL_MODEL }
delete process.env.ANTHROPIC_MODEL; delete process.env.MTM_TERMINAL_MODEL
t('sem env: sonnet-5 e depois opus-5', modelCandidates(), ['claude-sonnet-5', 'claude-opus-5'])
process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-5'
t('env primeiro, depois atuais', modelCandidates(), ['claude-sonnet-4-5', 'claude-sonnet-5', 'claude-opus-5'])
process.env.ANTHROPIC_MODEL = envBackup.a; process.env.MTM_TERMINAL_MODEL = envBackup.m
if (envBackup.a === undefined) delete process.env.ANTHROPIC_MODEL
if (envBackup.m === undefined) delete process.env.MTM_TERMINAL_MODEL
t('sonnet-5 sem temperature', isCurrentGenModel('claude-sonnet-5'), true)
t('sonnet-4-5 com temperature', isCurrentGenModel('claude-sonnet-4-5'), false)

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
