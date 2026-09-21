import { readFileSync } from 'node:fs'
import { join } from 'node:path'
/**
 * Terminal MTM — velas diárias ao vivo (regressão de 17/09).
 *
 * O que partiu: as funções node da Vercel correm em iad1 (EUA) apesar do preferredRegion "fra1", e
 * fapi.binance.com responde 451 a IPs dos EUA. O ouro e a prata só tinham essa referência → zero
 * velas → seis cartões com «—» e variação % nula. Estes testes simulam exatamente isso (fapi a
 * devolver 451) e exigem que as velas e a variação cheguem por uma referência de reserva, marcada
 * como fora do nível do gráfico (para ser reescalada), e que a página mostre um aviso só.
 *
 * Correr: npx tsx lib/__tests__/mtm-terminal-velas.check.ts
 */
import { TERMINAL_ASSETS, findTerminalAsset, referencePlan } from '@/lib/mtm-terminal-assets'
import { candlesCacheHeader, computeChangePercent, liveBlockState, quoteSourcePlan } from '@/lib/mtm-terminal-live'
import { basisAdjust } from '@/lib/mtm-terminal-technicals'

let ok = 0, ko = 0
function t(nome: string, real: unknown, esperado: unknown) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado)
  if (bate) ok++; else { ko++; console.log(`  ✗ ${nome}\n      esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`) }
}
const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

// ─── fetch simulado: Binance futuros bloqueada (como em iad1), o resto responde ─────────────
const DIA = 86_400_000
const klines = (n: number, base: number) =>
  Array.from({ length: n }, (_, i) => [i * DIA, String(base + i), String(base + i + 5), String(base + i - 5), String(base + i + 1)])
const yahoo = (n: number, base: number) => ({
  chart: { result: [{
    timestamp: Array.from({ length: n }, (_, i) => i * 86_400),
    meta: { regularMarketPrice: base + n, regularMarketTime: 1_789_600_000 },
    indicators: { quote: [{
      open: Array.from({ length: n }, (_, i) => base + i), high: Array.from({ length: n }, (_, i) => base + i + 5),
      low: Array.from({ length: n }, (_, i) => base + i - 5), close: Array.from({ length: n }, (_, i) => base + i + 1),
    }] },
  }] },
})
const pedidos: string[] = []
let paxgEmBaixo = false
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input)
  pedidos.push(url)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (url.includes('fapi.binance.com')) return json({ code: 0, msg: 'Service unavailable from a restricted location' }, 451)
  if (url.includes('PAXGUSDT')) {
    if (paxgEmBaixo) return json({}, 503)
    if (url.includes('/klines')) return json(klines(260, 4000))
    if (url.includes('/ticker/24hr')) return json({ lastPrice: '4400', openPrice: '4312', bidPrice: '4399', askPrice: '4401' })
  }
  if (url.includes('api.coingecko.com')) return json({}, 404)
  if (url.includes('finance.yahoo.com')) {
    if (url.includes('GC%3DF')) return json(yahoo(250, 4040))
    if (url.includes('SI%3DF')) return json(yahoo(250, 60))
  }
  return json({}, 404)
}) as typeof fetch

async function main() {
  console.log('— catálogo: toda a referência que pode estar bloqueada tem reserva —')
  const gold = findTerminalAsset('XAUUSD')!
  const silver = findTerminalAsset('XAGUSD')!
  t('ouro: principal continua a ser o perpétuo (ao nível do spot)', referencePlan(gold)[0], { kind: 'binance-futures', symbol: 'XAUUSDT', sameLevel: true })
  t('ouro: reservas PAXG → GC=F', referencePlan(gold).slice(1).map((r) => r.symbol), ['PAXGUSDT', 'GC=F'])
  t('prata: reserva SI=F', referencePlan(silver).slice(1).map((r) => r.symbol), ['SI=F'])
  t('todo o ativo com referência fapi tem reserva fora da fapi (a regressão)',
    TERMINAL_ASSETS.filter((a) => a.ref.kind === 'binance-futures' && !referencePlan(a).some((r) => r.kind !== 'binance-futures')).map((a) => a.symbol), [])
  t('reservas nunca se dizem ao nível do gráfico (têm de ser reescaladas)',
    TERMINAL_ASSETS.flatMap((a) => a.refFallbacks ?? []).filter((r) => r.sameLevel).map((r) => r.symbol), [])
  t('reservas nunca entram no plano do PREÇO (o número mostrado não é futuros)',
    TERMINAL_ASSETS.filter((a) => quoteSourcePlan(a).some((s) => (a.refFallbacks ?? []).some((r) => r.symbol === s.symbol))).map((a) => a.symbol), [])

  const { fetchTerminalCandleSeries, fetchTerminalLevels, MIN_CANDLES } = await import('@/lib/mtm-terminal-levels')
  const { fetchReferenceChange } = await import('@/lib/mtm-terminal-quote')

  console.log('— velas com a fapi bloqueada (451) —')
  const sOuro = await fetchTerminalCandleSeries(gold)
  t('ouro: tentou a fapi primeiro', pedidos.some((u) => u.includes('fapi.binance.com') && u.includes('XAUUSDT')), true)
  t('ouro: velas vêm do PAXG', [sOuro.ref.symbol, sOuro.ref.sameLevel, sOuro.candles.length], ['PAXGUSDT', false, 260])
  paxgEmBaixo = true
  // As velas de referência ficam uns segundos em cache (lib/mercado/velas-referencia.ts): a queda simula-se sem ela.
  ;(await import('@/lib/mercado/velas-referencia')).limparCacheReferencias()
  const sOuro2 = await fetchTerminalCandleSeries(gold)
  t('ouro: PAXG em baixo → GC=F', [sOuro2.ref.symbol, sOuro2.candles.length >= MIN_CANDLES], ['GC=F', true])
  paxgEmBaixo = false
  const sPrata = await fetchTerminalCandleSeries(silver)
  t('prata: velas vêm do SI=F', [sPrata.ref.symbol, sPrata.ref.sameLevel, sPrata.candles.length], ['SI=F', false, 250])
  const btc = await fetchTerminalCandleSeries(findTerminalAsset('BTCUSD')!)
  t('cripto sem reserva continua igual', btc.ref.symbol, 'BTCUSDT')

  console.log('— reescala ao preço ao vivo —')
  const livePrice = 4366
  const adj = basisAdjust(sOuro.candles, livePrice, sOuro.ref.sameLevel)
  t('última vela da reserva fica no preço ao vivo', Number(adj.candles[adj.candles.length - 1].c.toFixed(2)), livePrice)
  const lv = await fetchTerminalLevels(gold, livePrice)
  t('níveis do ouro existem com a fapi bloqueada', !!lv && lv.supports.length + lv.resistances.length > 0, true)

  console.log('— variação com a fapi bloqueada —')
  const chg = await fetchReferenceChange(gold)
  t('ouro: variação vem do PAXG, marcada fora do nível', [chg?.base, chg?.last, chg?.sameLevel], [4312, 4400, false])
  // fetchLiveQuote: sameLevel = passo && referência → false → usa a % da própria referência.
  t('% do ouro = a do PAXG, não preço ao vivo vs abertura PAXG',
    Number(computeChangePercent(4366, chg, true && (chg?.sameLevel ?? true))!.toFixed(3)), Number((((4400 - 4312) / 4312) * 100).toFixed(3)))
  const chgPrata = await fetchReferenceChange(silver)
  t('prata: variação vem do SI=F', [chgPrata?.basis, chgPrata?.sameLevel], ['sessão', false])

  console.log('— cache: o vazio não martela as fontes —')
  t('vazio vai para o CDN (curto), não no-store', /no-store/.test(candlesCacheHeader(0)) || !/s-maxage=\d+/.test(candlesCacheHeader(0)), false)
  t('com velas: CDN 60 s', /s-maxage=60/.test(candlesCacheHeader(260)), true)

  console.log('— bloco «ao vivo»: um estado, um aviso —')
  const base = { hasTechnicals: false, candlesLoaded: true, candleCount: 0, hasPrice: true, fallbackLevelCount: 0 }
  t('com técnicos → cartões', liveBlockState({ ...base, hasTechnicals: true, candleCount: 260 }), 'live')
  t('sem velas nem níveis → aviso único (o caso da captura)', liveBlockState(base), 'no-candles')
  t('sem velas mas com níveis da análise → só níveis', liveBlockState({ ...base, fallbackLevelCount: 4 }), 'levels-only')
  t('1.º pedido por responder → a carregar', liveBlockState({ ...base, candlesLoaded: false }), 'loading')
  t('velas sem preço → à espera do preço', liveBlockState({ ...base, candleCount: 260, hasPrice: false }), 'waiting-price')

  console.log('— ligações no código —')
  const rota = ler('app/api/mtm-terminal/candles/route.ts')
  t('rota usa a série com reservas', /fetchTerminalCandleSeries/.test(rota), true)
  t('rota devolve a referência que deu as velas (não asset.ref)', /ref:\s*hit!?\.ref/.test(rota) && !/ref:\s*asset\.ref/.test(rota), true)
  t('rota já não manda no-store', /["']no-store["']|:\s*"[^"]*no-store/.test(rota), false)
  const pagina = ler('app/mtm-terminal/page.tsx')
  t('página reescala com o sameLevel das velas recebidas', /basisAdjust\(candles, price, candlesSameLevel\)/.test(pagina), true)
  t('página não usa o sameLevel fixo do ativo', /basisAdjust\([^)]*selected\.ref\.sameLevel/.test(pagina), false)
  t('página decide o bloco por liveBlockState', /liveBlockState\(/.test(pagina), true)
  t('já não há o rótulo antigo', pagina.includes('níveis da análise (sem velas ao vivo)'), false)
  const analise = ler('lib/mtm-terminal-analysis.ts')
  t('análise diária reescala com a referência que deu as velas', /basisAdjust\(candles, quote\.price, series\.ref\.sameLevel\)/.test(analise), true)

  console.log(`\n${ok} passaram, ${ko} falharam`)
  process.exit(ko ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
