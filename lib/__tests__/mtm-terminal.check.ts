import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
import {
  isCurrentGenModel, missingDashboardParts, modelCandidates, modelTuning, normaliseDashboard,
} from '@/lib/mtm-terminal-analysis'

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
// O caso que partia a 16/09: regeneradas às 17:25 à mão; na manhã seguinte (05:40 UTC) têm ~12 h.
// Com a idade mínima a 20 h ficavam paradas até ao dia a seguir. A idade mínima só tem de ser
// maior do que a janela do cron (~4 h); a rota usa 12 h.
const rota = readFileSync(join(process.cwd(), 'app/api/cron/mtm-terminal-daily/route.ts'), 'utf-8')
const minAge = Number(/const MIN_AGE_MS = (\d+) \* 3600_000/.exec(rota)?.[1]) * 3600_000
const manha = Date.parse('2026-09-17T05:40:00Z')
t('gerada às 17:25 da véspera é refeita na janela da manhã',
  pickAssetsToRefresh(['XAUUSD'], { XAUUSD: '2026-09-16T17:25:38Z' }, manha, { batch: 4, minAgeMs: minAge }), ['XAUUSD'])
t('gerada às 05:40 não é refeita na mesma janela (08:40)',
  pickAssetsToRefresh(['XAUUSD'], { XAUUSD: '2026-09-17T05:40:00Z' }, Date.parse('2026-09-17T08:40:00Z'), { batch: 4, minAgeMs: minAge }), [])

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

// ─── Regressão 2026-09-16: análises guardadas OCAS (sem veredito nem cenários) ───────────────
// ANTHROPIC_MODEL=claude-sonnet-4-5 não é da geração atual, e o `format` estava preso ao mesmo
// teste do `effort`: o modelo ficava sem schema, inventava os nomes das chaves e a página mostrava
// cartões vazios — sem UM erro nos logs, porque a linha era guardada como sucesso.
console.log('— parâmetros por modelo —')
const FMT = { type: 'json_schema' as const, schema: { type: 'object' } }
t('sonnet-4-5: schema SIM, effort NÃO, temperature SIM',
  modelTuning('claude-sonnet-4-5', FMT),
  { output_config: { format: FMT }, temperature: 0.2 })
t('sonnet-5: schema e effort, sem temperature',
  modelTuning('claude-sonnet-5', FMT),
  { output_config: { effort: 'low', format: FMT } })
t('pesquisa web (sem schema): sonnet-4-5 não leva output_config',
  modelTuning('claude-sonnet-4-5', null), { temperature: 0.2 })

console.log('— análise incompleta —')
const entrada = {
  asset: findTerminalAsset('BTCUSD')!,
  quote: { price: 75_000, source: 'Binance' },
  levels: { supports: [74_968], resistances: [77_607] },
  technicals: null,
  signals: [],
} as never
const semFontes = new Map() as never
// A forma EXATA que o claude-sonnet-4-5 sem schema devolveu em produção.
const semSchema = normaliseDashboard({
  verdict: { bias: 'NEUTRO', conviction: 'Média', summary: 'Consolidação lateral.' },
  macro: ['fator a'],
  scenarios: [
    { name: 'Bull – rutura acima da EMA20', movePct: 4.9, trigger: 'fecho acima de 77607' },
    { name: 'Base – consolidação', movePct: '0,8 %', trigger: 'mantém o intervalo' },
    { name: 'Bear – perda do suporte', movePct: -3.7, trigger: 'fecho abaixo de 74968' },
  ],
  risks: ['risco a'],
  recommendation: { bias: 'AGUARDAR', timing: 'esperar', risk: 'stop técnico' },
} as never, entrada, semFontes, false)
t('sinónimo bias/summary é aceite', [semSchema.verdict.direction, semSchema.verdict.rationale], ['NEUTRO', 'Consolidação lateral.'])
t('conviction «Média» → «Médio»', semSchema.verdict.conviction, 'Médio')
t('kind lido do nome do cenário', semSchema.scenarios.map((s) => s.kind), ['bull', 'base', 'bear'])
t('movePct em texto («0,8 %») é lido', semSchema.scenarios[1].movePct, 0.8)
t('triggers lê o sinónimo trigger', semSchema.scenarios[0].triggers, 'fecho acima de 77607')
t('análise completa não tem partes em falta', missingDashboardParts(semSchema), [])

const oco = normaliseDashboard({ macro: ['só macro'], risks: ['só risco'] } as never, entrada, semFontes, false)
t('análise oca é detetada (nunca se guarda)', missingDashboardParts(oco),
  ['leitura do veredito', 'cenários', 'recomendação'])

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
