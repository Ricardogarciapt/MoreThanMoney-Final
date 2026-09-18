/**
 * FORMATO ÚNICO DE SINAL — escrita, leitura e compatibilidade com os leitores de sempre.
 *
 * Correr: npx tsx lib/sinais/__tests__/formato-sinal.check.ts
 *
 * Os exemplos «antigos» são mensagens REAIS tiradas da base (chat_messages, 18/09/2026). Prova-se:
 *   1. o formato único escreve-se e lê-se sem perdas (entrada, zona na ordem escrita, SL, TPs, TF);
 *   2. `parseSignal` (T2T, motor, tracker) lê o formato único e continua a ler as mensagens antigas;
 *   3. o T2T reconhece a fonte (Edge/King/Wolf pela etiqueta, sem o nome da fonte externa), dá botão
 *      às entradas e não aos seguimentos; o modo (executar/seguir) decide-se pelo símbolo no canal
 *      fundido Aurum Flow & Perpétuos;
 *   4. os seguimentos continuam a ser anúncios próprios (sem botão, sem eco);
 *   5. nenhuma mensagem nova do canal Edge/King/Wolf menciona a fonte externa.
 */
import assert from 'node:assert/strict'
import {
  estrategiaDaMensagem,
  estrategiaDoTrader,
  ehFormatoUnico,
  formatarSeguimento,
  formatarSinal,
  horaTexto,
  lerSinal,
  timeframeTexto,
} from '../formato-sinal'
import { parseSignal } from '../../mtmcopy/signal-parser'
import { isT2TEntrySignal, t2tMode, t2tSourceKey, t2tAssetClass } from '../../mtmcopy/t2t-source'
import { isOwnLifecycleAnnouncement, lifecycleMessage } from '../../mtmcopy/signal-lifecycle'
import { directionFromText } from '../../mtmcopy/signal-direction'
import { traderDoConteudo } from '../../mtmfunded/estrategias-sinais/calculo'
import { premiumParaFormatoUnico } from '../premium-formato'

let ko = 0
function t(nome: string, f: () => void) {
  try {
    f()
    console.log(`  ✓ ${nome}`)
  } catch (e) {
    ko++
    console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`)
  }
}

const QUANDO = '2026-09-18T17:10:45Z' // 18:10 em Lisboa

// ── Mensagens reais (antigas) ────────────────────────────────────────────────────────────────
const ANTIGA_PV = '🔵 XAUUSD BUY\n🎯 Entrada: 4385\n🛑 SL: 4375\n✅ TP1: 4388\n✅ TP2: 4391\n✅ TP3: 4394\n✅ TP4: 4397\n✅ TP5: 4400\n\n📡 PrimeVerse · fxedge'
const ANTIGA_SENSEI = '🧠 Sensei Scanner — Entry Alert — Ideia Activada #20223 ✅\n📊 XAUUSD   🔵 COMPRA\n⏱ Timeframe: 15\n🎯 Entrada activada: 4379.22\n🛑 Stop Loss: 4371.52\n✅ Take Profit 1: 4390.78\n✅ Take Profit 2: 4398.48\n✅ Take Profit 3: 4410.04\n✅ Take Profit 4: 4425.45\n🔎 Validação: 100%\n⚠️ Não é aconselhamento financeiro.'
const ANTIGA_PREMIUM = '4. GOLD SELL SETUP\nGold Sell Zone 4388 - 4395\nSL : 4400\nTP1 : 4383\nTP2 : 4378\nTP3 : 4373\nTP4 : Hold\n🔑 Use suitable lot sizes based on your capital. Money management is key to long term success'
const ANTIGA_FOREX_SWINGS = '🔴 EURCHF SELL\nSL: 0.9483\nTP: 0.9411\n\n🌊 Forex Swings — set & forget'
const ANTIGA_AURUM = '⚡ Aurum Flow ORB — Novo Sinal\n📊 ETHUSDT   🔵 COMPRA\n⏱ Timeframe: 30\n🎯 Entrada: 2554.35\n🛑 Stop Loss: 2494.53\n✅ Take Profit 1: 2733.8\n✅ Take Profit 2: 2853.43\n✅ Take Profit 3: 3152.52\n✅ Take Profit 4: 3451.61\n🔎 Validação: 100%\n⚠️ Não é aconselhamento financeiro.'
const ANTIGA_GK = '🥇 GoldKiller Scanner — Novo Sinal\n📊 XAUUSD   🔵 COMPRA\n⏱ Timeframe: 15\n🎯 Entrada: 4378.09\n🛑 Stop Loss: 4362.2\n✅ Take Profit 1: 4398.99\n✅ Take Profit 2: 4412.55\n✅ Take Profit 3: 4449.26\n🔎 Validação: 100%\n⚠️ Não é aconselhamento financeiro.'
const ANTIGA_MTMSCANNER = '📊 MTM Scanner · Forex — Novo Sinal\n📊 GBPAUD   🔵 COMPRA\n⏱ Timeframe: 15\n🎯 Entrada: 1.87985\n🛑 Stop Loss: 1.87921\n✅ Take Profit 1: 1.88111\n✅ Take Profit 2: 1.88238\n✅ Take Profit 3: 1.88365\n🔎 Validação: 100%\n⚠️ Não é aconselhamento financeiro.'
const ANTIGA_INDICE = '🔴 US30 SELL\n🎯 Entrada: 51630\n🛑 SL: 51730\n✅ TP1: 51580\n✅ TP2: 51530\n✅ TP3: 51480\n✅ TP4: 51430\n✅ TP5: 51380\n\n📡 PrimeVerse · fxedge'

// ── Mensagens novas (formato único) ──────────────────────────────────────────────────────────
const NOVA_EDGE = formatarSinal({
  estrategia: estrategiaDoTrader('fxedge')!,
  simbolo: 'XAUUSD',
  direcao: 'buy',
  entrada: 4385,
  sl: 4375,
  tps: [4388, 4391, 4394, 4397, 4400],
  quando: QUANDO,
})
const NOVA_PREMIUM = formatarSinal({
  estrategia: 'MTM Auto Premium',
  simbolo: 'XAUUSD',
  direcao: 'sell',
  zona: [4388, 4395],
  sl: 4400,
  tps: [4383, 4378, 4373],
  alvoAberto: true,
  quando: '2026-09-18T08:38:19Z',
  extras: ['🔑 Use suitable lot sizes based on your capital. Money management is key to long term success'],
})
const NOVA_SENSEI = formatarSinal({
  estrategia: 'MTM Auto Sensei',
  simbolo: 'XAUUSD',
  direcao: 'buy',
  entrada: 4379.22,
  sl: 4371.52,
  tps: [4390.78, 4398.48, 4410.04, 4425.45],
  timeframe: '15',
  estado: 'Entrada activada #20223 ✅',
  quando: '2026-09-18T10:15:08Z',
  extras: ['🔎 Validação: 100%'],
})
const NOVA_FOREX = formatarSinal({
  estrategia: 'MTM Scanner',
  simbolo: 'GBPAUD',
  direcao: 'buy',
  entrada: 1.87985,
  sl: 1.87921,
  tps: [1.88111, 1.88238, 1.88365],
  timeframe: '15',
  quando: QUANDO,
})
const NOVA_AURUM_ETH = formatarSinal({
  estrategia: 'MTM Auto Aurum Flow',
  simbolo: 'ETHUSDT',
  direcao: 'buy',
  entrada: 2554.35,
  sl: 2494.53,
  tps: [2733.8, 2853.43],
  timeframe: '30',
  quando: QUANDO,
})
const NOVA_AURUM_OURO = formatarSinal({ estrategia: 'MTM Auto Aurum Flow', simbolo: 'XAUUSD', direcao: 'buy', entrada: 4380, sl: 4370, tps: [4390], quando: QUANDO })
const NOVA_AURUM_PERP = formatarSinal({ estrategia: 'MTM Auto Aurum Flow', simbolo: 'ONDOUSDT.P', direcao: 'sell', entrada: 0.91, sl: 0.95, tps: [0.85], quando: QUANDO })
const NOVA_MERCADO = formatarSinal({ estrategia: 'MTM Auto Wolf', simbolo: 'NAS100', direcao: 'sell', entrada: null, sl: 21500, tps: [21300], quando: QUANDO })

console.log('\n1. escrever e ler')
t('formato da entrada Edge', () => {
  assert.equal(
    NOVA_EDGE,
    '🔵 XAUUSD · COMPRA\n📌 MTM Auto Edge · Novo sinal\n🎯 Entrada: 4385\n🛑 SL: 4375\n✅ TP1: 4388\n✅ TP2: 4391\n✅ TP3: 4394\n✅ TP4: 4397\n✅ TP5: 4400\n⏱ 18/09 18:10\n⚠️ Não é aconselhamento financeiro.',
  )
})
t('hora em Lisboa (verão, UTC+1)', () => assert.equal(horaTexto(QUANDO), '18/09 18:10'))
t('timeframes', () => {
  assert.equal(timeframeTexto('15'), 'M15')
  assert.equal(timeframeTexto('60'), 'H1')
  assert.equal(timeframeTexto('240'), 'H4')
  assert.equal(timeframeTexto('1440'), 'D1')
  assert.equal(timeframeTexto('D'), 'D1')
  assert.equal(timeframeTexto('30m'), 'M30')
  assert.equal(timeframeTexto(''), null)
})
t('ler Edge', () => {
  const l = lerSinal(NOVA_EDGE)!
  assert.equal(l.estrategia, 'MTM Auto Edge')
  assert.equal(l.simbolo, 'XAUUSD')
  assert.equal(l.direcao, 'buy')
  assert.equal(l.entrada, 4385)
  assert.equal(l.sl, 4375)
  assert.deepEqual(l.tps, [4388, 4391, 4394, 4397, 4400])
  assert.equal(l.mercado, false)
})
t('ler Premium: zona na ordem escrita, ponta para a venda, alvo aberto', () => {
  const l = lerSinal(NOVA_PREMIUM)!
  assert.deepEqual(l.zona, [4388, 4395])
  assert.equal(l.zonaPrimeiro, 4388)
  assert.equal(l.entrada, 4395)
  assert.equal(l.alvoAberto, true)
  assert.deepEqual(l.tps, [4383, 4378, 4373])
})
t('ler Sensei: estado com número da ideia e timeframe', () => {
  const l = lerSinal(NOVA_SENSEI)!
  assert.equal(l.ideia, 20223)
  assert.equal(l.timeframe, 'M15')
  assert.equal(l.estado, 'Entrada activada #20223 ✅')
})
t('forex com 5 casas sem perder precisão', () => {
  const l = lerSinal(NOVA_FOREX)!
  assert.equal(l.entrada, 1.87985)
  assert.deepEqual(l.tps, [1.88111, 1.88238, 1.88365])
})
t('entrada a mercado', () => {
  const l = lerSinal(NOVA_MERCADO)!
  assert.equal(l.mercado, true)
  assert.equal(l.entrada, null)
})
t('mensagens antigas NÃO são formato único', () => {
  for (const m of [ANTIGA_PV, ANTIGA_SENSEI, ANTIGA_PREMIUM, ANTIGA_FOREX_SWINGS, ANTIGA_AURUM, ANTIGA_GK]) {
    assert.equal(ehFormatoUnico(m), false)
    assert.equal(lerSinal(m), null)
  }
})

console.log('\n2. parseSignal — novo e antigo')
t('parseSignal lê o formato único (Edge)', () => {
  const p = parseSignal(NOVA_EDGE)!
  assert.equal(p.symbol, 'XAUUSD')
  assert.equal(p.direction, 'buy')
  assert.equal(p.entry, 4385)
  assert.equal(p.sl, 4375)
  assert.deepEqual(p.tp, [4388, 4391, 4394, 4397, 4400])
})
t('parseSignal: Premium novo = Premium antigo (entrada, zona, 1.º nível, SL, TPs)', () => {
  const novo = parseSignal(NOVA_PREMIUM)!
  const antigo = parseSignal(ANTIGA_PREMIUM)!
  assert.equal(novo.direction, antigo.direction)
  assert.equal(novo.entry, antigo.entry)
  assert.deepEqual(novo.zone, antigo.zone)
  assert.equal(novo.zoneFirst, antigo.zoneFirst)
  assert.equal(novo.sl, antigo.sl)
  assert.deepEqual(novo.tp, antigo.tp)
})
t('parseSignal: Sensei novo = Sensei antigo', () => {
  const novo = parseSignal(NOVA_SENSEI)!
  const antigo = parseSignal(ANTIGA_SENSEI)!
  assert.equal(novo.symbol, antigo.symbol)
  assert.equal(novo.direction, antigo.direction)
  assert.equal(novo.entry, antigo.entry)
  assert.equal(novo.sl, antigo.sl)
  assert.deepEqual(novo.tp, antigo.tp)
})
t('parseSignal continua a ler as antigas', () => {
  assert.equal(parseSignal(ANTIGA_PV)?.entry, 4385)
  assert.equal(parseSignal(ANTIGA_FOREX_SWINGS)?.symbol, 'EURCHF')
  assert.equal(parseSignal(ANTIGA_AURUM)?.sl, 2494.53)
  assert.equal(parseSignal(ANTIGA_GK)?.entry, 4378.09)
  assert.equal(parseSignal(ANTIGA_MTMSCANNER)?.symbol, 'GBPAUD')
  assert.equal(parseSignal(ANTIGA_INDICE)?.symbol, 'US30')
})
t('a direcção lida do texto (cartões e apps) bate certo', () => {
  assert.equal(directionFromText(NOVA_EDGE), 'buy')
  assert.equal(directionFromText(NOVA_PREMIUM), 'sell') // o rodapé «long term» não conta
  assert.equal(directionFromText(NOVA_MERCADO), 'sell')
})

console.log('\n3. Tap to Trade')
t('Edge/King/Wolf reconhecidos pela etiqueta, sem o nome da fonte', () => {
  assert.equal(t2tSourceKey('sinais-scanner-mtm', NOVA_EDGE), 'primeverse')
  assert.equal(t2tSourceKey('sinais-scanner-mtm', NOVA_MERCADO), 'primeverse')
  assert.equal(t2tSourceKey('sinais-scanner-mtm', ANTIGA_PV), 'primeverse') // antigas continuam
  assert.doesNotMatch(NOVA_EDGE, /prime\s*verse|pѵ/i)
})
t('as entradas novas têm botão; os seguimentos não', () => {
  assert.equal(isT2TEntrySignal('sinais-scanner-mtm', NOVA_EDGE), true)
  assert.equal(isT2TEntrySignal('premium-ideas', NOVA_PREMIUM), true)
  assert.equal(isT2TEntrySignal('sensei-scanner', NOVA_SENSEI), true)
  assert.equal(isT2TEntrySignal('aurum-flow', NOVA_AURUM_OURO), true)
  const seg = formatarSeguimento(lifecycleMessage('partial', { symbol: 'XAUUSD', direction: 'buy', entry: 4385, price: 4388, level: 1 }).text, 'MTM Auto Edge')
  assert.equal(isT2TEntrySignal('sinais-scanner-mtm', seg), false)
  assert.equal(isOwnLifecycleAnnouncement(seg), true)
  assert.equal(estrategiaDaMensagem(seg), 'MTM Auto Edge')
})
t('canal fundido: ouro executa, ETH executa (existe no MT5), perpétuo exótico segue', () => {
  assert.equal(t2tMode('aurum-flow', NOVA_AURUM_OURO), 'execute')
  assert.equal(t2tMode('aurum-flow', NOVA_AURUM_ETH), 'execute')
  assert.equal(t2tMode('aurum-flow', NOVA_AURUM_PERP), 'follow')
  assert.equal(t2tMode('cripto-perps', ANTIGA_AURUM), 'execute') // antigo, ETH
  assert.equal(t2tMode('sinais-scanner-mtm', NOVA_EDGE), 'execute')
})
t('classe de activo: a etiqueta da estratégia não contamina', () => {
  assert.equal(t2tAssetClass(NOVA_AURUM_OURO), 'gold')
  assert.equal(t2tAssetClass(NOVA_AURUM_ETH), 'crypto')
  assert.equal(t2tAssetClass(NOVA_EDGE), 'gold')
})
t('motor das mestres / «Todos os sinais»: trader lido da etiqueta', () => {
  assert.equal(traderDoConteudo(NOVA_EDGE), 'fxedge')
  assert.equal(traderDoConteudo(NOVA_MERCADO), 'g_wolf')
  assert.equal(traderDoConteudo(ANTIGA_PV), 'fxedge')
  assert.equal(traderDoConteudo(NOVA_SENSEI), null)
})
t('só os três traders viram estratégia', () => {
  assert.equal(estrategiaDoTrader('kingfkg'), 'MTM Auto King')
  assert.equal(estrategiaDoTrader('G_Wolf'), 'MTM Auto Wolf')
  assert.equal(estrategiaDoTrader('j-momentum'), null)
  assert.equal(estrategiaDoTrader('zata'), null)
})

console.log('\n4. seguimentos')
t('seguimento leva a etiqueta uma vez só', () => {
  const base = lifecycleMessage('stop_loss', { symbol: 'XAUUSD', direction: 'buy', entry: 4385, price: 4375 }).text
  const s1 = formatarSeguimento(base, 'MTM Auto Sensei')
  assert.equal(formatarSeguimento(s1, 'MTM Auto Sensei'), s1)
  assert.match(s1, /\n📌 MTM Auto Sensei$/)
})

console.log('\n5. Premium no chat (formato único + notas do trader)')
t('setup real do Premium → formato único, com o rodapé do trader e sem perder níveis', () => {
  const c = premiumParaFormatoUnico(ANTIGA_PREMIUM, '2026-09-18T08:38:19Z')!
  assert.ok(c)
  assert.equal(c.split('\n')[0], '🔴 XAUUSD · VENDA')
  assert.match(c, /🎯 Zona: 4388 – 4395/)
  assert.match(c, /✅ TP4: deixar correr/)
  assert.match(c, /🔑 Use suitable lot sizes/)
  const a = parseSignal(ANTIGA_PREMIUM)!
  const n = parseSignal(c)!
  assert.deepEqual([n.entry, n.sl, n.tp, n.zone, n.zoneFirst], [a.entry, a.sl, a.tp, a.zone, a.zoneFirst])
})
t('zona escrita ao contrário (compra) mantém o 1.º nível', () => {
  const lit = '2. GOLD BUY SETUP\nGold Buy Zone 4643 - 4637\nSL : 4630\nTP1 : 4648\nTP2 : 4653'
  const c = premiumParaFormatoUnico(lit)!
  assert.match(c, /🎯 Zona: 4643 – 4637/)
  assert.equal(parseSignal(c)!.zoneFirst, 4643)
  assert.equal(parseSignal(c)!.entry, parseSignal(lit)!.entry)
})
t('seguimentos e recaps do Premium ficam literais', () => {
  assert.equal(premiumParaFormatoUnico('HIT TP1 ✅ +50 PIPS'), null)
  assert.equal(premiumParaFormatoUnico('London Performance\nTotal Net: 120 PIPS'), null)
})

if (ko) {
  console.error(`\n${ko} falha(s)`)
  process.exit(1)
}
console.log('\nTudo certo.')
