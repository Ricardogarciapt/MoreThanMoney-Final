/**
 * PREMIUM PELA MESTRE SIM — regras puras + a garantia de que NADA da rota antiga executa com o Premium
 * no motor (sinal_modo='live').
 *
 * Correr: npx tsx lib/mestres/__tests__/premium.check.ts
 *
 * Prova-se:
 *   1. o interruptor: só `sinal_modo='live'` corta o legado (sombra não);
 *   2. as portas de entrada da rota antiga (só ouro, 08–22 Londres, limite diário de SL, stops sãos),
 *      com mensagens REAIS do Signal Master Elite (18/09) passadas pelo parser do site;
 *   3. a regra da trade anterior (sem BE ou sem 1.º parcial → não abre outra);
 *   4. seguimentos: a mestre gere pelo preço; «SL hit» só conta para o limite diário;
 *   5. quem segue o Premium: CopyFactory Hvmg/MxsR, pick antigo `premium`, grupo Telegram directo
 *      (só com direito ao MTM Auto); contas T2T e mestres nunca;
 *   6. o espelho da conta MT5 para a SIM desliga-se quando a SIM passou a mestre do sinal;
 *   7. cada caminho antigo do Premium pergunta ao interruptor antes de executar (leitura das fontes).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSignal } from '../../mtmcopy/signal-parser'
import {
  accaoSeguimentoPremium, bloqueioPelaAnterior, decidirSinalPremium, dentroDaJanelaPremium, espelhoSubstituidoPelaMestre,
  legadoPremiumCortado, PREMIUM_IDS_COPYFACTORY, seguidoresExtra, SLUG_PREMIUM, type PosicaoMestrePremium,
} from '../premium'
import { ligacaoSegueGrupoTelegram, planearRotasDaEstrategia, type LigacaoSiteSeguidora } from '../planear'
import { ESTRATEGIA_DO_CANAL } from '../t2t'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}
const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')

// Mensagens reais do canal Premium (mtmcopy_signal_log, 18/09).
const SME_SELL = '4. GOLD SELL SETUP\nGold Sell Zone 4387 - 4395\nSL : 4400\nTP1 : 4382\nTP2 : 4377\nTP3 : 4372'
const SME_BUY = '8. GOLD BUY SETUP\nGold Buy Zone 4306 - 4300\nSL : 4295\nTP1 : 4311\nTP2 : 4316\nTP3 : 4321'
// 18/09 é BST (UTC+1): 08:36 UTC = 09:36 em Londres.
const DENTRO = new Date('2026-09-18T08:36:00Z')
const CEDO = new Date('2026-09-18T06:30:00Z') // 07:30 Londres
const TARDE = new Date('2026-09-18T21:10:00Z') // 22:10 Londres

console.log('\n1. interruptor')
t('live corta o legado', () => assert.equal(legadoPremiumCortado({ sinal_modo: 'live' }), true))
t('sombra NÃO corta (a sombra só regista)', () => assert.equal(legadoPremiumCortado({ sinal_modo: 'sombra' }), false))
t('desligado / sem linha → legado de sempre', () => {
  assert.equal(legadoPremiumCortado({ sinal_modo: 'desligado' }), false)
  assert.equal(legadoPremiumCortado(null), false)
})
t('o T2T do motor já mapeia o chat Premium para o mesmo slug', () => assert.equal(ESTRATEGIA_DO_CANAL['premium-ideas'], SLUG_PREMIUM))
t('ids CopyFactory do Premium: Hvmg (a viva) + MxsR + 9gsL', () => assert.deepEqual([...PREMIUM_IDS_COPYFACTORY], ['Hvmg', 'MxsR', '9gsL']))

console.log('\n2. entrada')
t('SME sell real → abre, níveis absolutos do trader, referência = 1.º valor da zona', () => {
  const d = decidirSinalPremium({ sinal: parseSignal(SME_SELL), agora: DENTRO })
  assert.ok(d.abrir, !d.abrir ? d.motivo : '')
  if (!d.abrir) return
  assert.equal(d.sinal.symbol, 'XAUUSD')
  assert.equal(d.sinal.direcao, 'sell')
  assert.equal(d.sinal.sl, 4400)
  assert.deepEqual(d.sinal.tps, [4382, 4377, 4372])
  assert.equal(d.sinal.referencia, 4387)
})
t('SME buy real → abre', () => {
  const d = decidirSinalPremium({ sinal: parseSignal(SME_BUY), agora: DENTRO })
  assert.ok(d.abrir && d.sinal.direcao === 'buy' && d.sinal.referencia === 4306)
})
t('fora da janela 08–22 Londres → não abre', () => {
  assert.equal(decidirSinalPremium({ sinal: parseSignal(SME_SELL), agora: CEDO }).abrir, false)
  assert.equal(decidirSinalPremium({ sinal: parseSignal(SME_SELL), agora: TARDE }).abrir, false)
  assert.equal(dentroDaJanelaPremium(new Date('2026-12-01T08:00:00Z')), true, 'inverno: 08:00 UTC = 08:00 Londres')
  assert.equal(dentroDaJanelaPremium(new Date('2026-12-01T07:59:00Z')), false)
})
t('limite diário de SL → não abre', () => {
  const d = decidirSinalPremium({ sinal: parseSignal(SME_SELL), agora: DENTRO, pausadoHoje: true })
  assert.ok(!d.abrir && /limite diário/.test(d.motivo))
})
t('outro símbolo com rótulo Premium (o precedente do Forex Swings) → não abre', () => {
  const d = decidirSinalPremium({ sinal: { symbol: 'EURUSD', direction: 'buy', entry: 1.1, sl: 1.09, tp: [1.11] }, agora: DENTRO })
  assert.ok(!d.abrir && /símbolo/.test(d.motivo))
})
t('sem SL / sem TP / SL do lado errado → não abre', () => {
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'sell', entry: 4390, sl: null, tp: [4380] }, agora: DENTRO }).abrir, false)
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'sell', entry: 4390, sl: 4400, tp: [] }, agora: DENTRO }).abrir, false)
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'sell', entry: 4390, sl: 4380, tp: [4370] }, agora: DENTRO }).abrir, false)
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'GOLD', direction: 'buy', entry: 4300, sl: 4295, tp: [4290] }, agora: DENTRO }).abrir, false, 'TP1 do lado errado')
})
t('stop absurdo → não abre (os dois sinais reais de 22/09 com um dígito perdido)', () => {
  // «🎯 Zona: 4332 – 4227 | 🛑 SL: 4222» e «🎯 Zona: 4330 – 4225 | 🛑 SL: 4220»: 1100 pips de stop
  // em vez de 100. Ambos abriram na mestre nesse dia — com esta guarda não voltam a abrir.
  const a = decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'buy', entry: 4332, sl: 4222, tp: [4337, 4342, 4347] }, agora: DENTRO })
  assert.ok(!a.abrir && /1100 pips/.test(a.motivo), !a.abrir ? a.motivo : 'abriu com 1100 pips de stop')
  const b = decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'buy', entry: 4330, sl: 4220, tp: [4335, 4340, 4345] }, agora: DENTRO })
  assert.equal(b.abrir, false)
  // …e um stop colado à entrada (0 pips) também não é um sinal.
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'buy', entry: 4330, sl: 4329.95, tp: [4335] }, agora: DENTRO }).abrir, false)
})
t('os stops REAIS do SME continuam a passar (50 a 130 pips)', () => {
  // zona 4387–4395, SL 4400: 130 pips da referência (4387) — a ponta larga do que é são.
  assert.equal(decidirSinalPremium({ sinal: parseSignal(SME_SELL), agora: DENTRO }).abrir, true)
  assert.equal(decidirSinalPremium({ sinal: parseSignal(SME_BUY), agora: DENTRO }).abrir, true)
  // e o caso mediano medido: 100 pips.
  assert.equal(decidirSinalPremium({ sinal: { symbol: 'XAUUSD', direction: 'sell', entry: 4320, sl: 4330, tp: [4315, 4310, 4305] }, agora: DENTRO }).abrir, true)
})
t('mensagens de seguimento não são entradas', () => {
  assert.equal(decidirSinalPremium({ sinal: parseSignal('HIT TP1 ✅ +50PIPS'), agora: DENTRO }).abrir, false)
  assert.equal(decidirSinalPremium({ sinal: null, agora: DENTRO }).abrir, false)
})

console.log('\n3. trade anterior')
const pos = (p: Partial<PosicaoMestrePremium>): PosicaoMestrePremium => ({
  symbol: 'XAUUSD', direcao: 'sell', preco_entrada: 4390, sl: 4400, volume: 0.1, volume_inicial: 0.1, be_feito: false, ...p,
})
t('sem posições → abre', () => assert.equal(bloqueioPelaAnterior([], 'XAUUSD'), null))
t('anterior com risco vivo → não abre', () => assert.match(bloqueioPelaAnterior([pos({})], 'XAUUSD') ?? '', /risco vivo/))
t('anterior em BE mas sem parcial → não abre (mesmo em BE)', () => assert.match(bloqueioPelaAnterior([pos({ sl: 4389 })], 'XAUUSD') ?? '', /parcial/))
t('anterior em BE e com parcial feito → abre', () => assert.equal(bloqueioPelaAnterior([pos({ sl: 4389, volume: 0.05 })], 'XAUUSD'), null))
t('be_feito conta como BE; compra com SL acima da entrada também', () => {
  assert.equal(bloqueioPelaAnterior([pos({ be_feito: true, volume: 0.05 })], 'GOLD'), null)
  assert.equal(bloqueioPelaAnterior([pos({ direcao: 'buy', preco_entrada: 4300, sl: 4301, volume: 0.05 })], 'XAUUSD'), null)
})
t('outro símbolo não bloqueia', () => assert.equal(bloqueioPelaAnterior([pos({ symbol: 'EURUSD' })], 'XAUUSD'), null))

console.log('\n4. seguimentos')
t('SL hit conta para o limite diário; o resto é da gestão por preço', () => {
  assert.equal(accaoSeguimentoPremium('sl_hit'), 'contar_sl')
  for (const k of ['hit_tp1', 'hit_tp2', 'hit_all', 'breakeven', 'take_partials', 'trade_active_close_all', null]) assert.equal(accaoSeguimentoPremium(k), 'nada')
})

console.log('\n5. quem segue o Premium')
const extra = seguidoresExtra(SLUG_PREMIUM)
const L = (p: Partial<LigacaoSiteSeguidora> & { id: string }): LigacaoSiteSeguidora =>
  ({ user_id: `u-${p.id}`, is_active: true, mt5_platform: 'mt5', mt5_login: String(1000 + p.id.charCodeAt(0)), mt5_server: 'PUPrime-Live', lot_mode: 'risk_percent', lot_value: 0.5, max_risk_percent: 2, ...p }) as LigacaoSiteSeguidora
t('grupo Telegram premium (execução directa) segue; T2T, mestre, CopyFactory de outra estratégia não', () => {
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '1', copy_method: 'telegram_group', telegram_groups: ['premium'] }), extra.gruposTelegram), true)
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '2', copy_method: 'telegram_group', telegram_groups: [] }), extra.gruposTelegram), true, 'sem grupos = premium (default antigo)')
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '3', copy_method: 'telegram_group', telegram_groups: ['sensei'] }), extra.gruposTelegram), false)
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '4', copy_method: 'telegram_group', telegram_groups: ['premium'], purpose: 'tap_to_trade' }), extra.gruposTelegram), false)
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '5', copy_method: 'telegram_group', telegram_groups: ['premium'], account_role: 'master' }), extra.gruposTelegram), false)
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '6', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B' }), extra.gruposTelegram), false)
  assert.equal(ligacaoSegueGrupoTelegram(L({ id: '7', copy_method: 'telegram_group' }), []), false, 'outras estratégias não têm grupos')
})
t('planeamento Premium: Hvmg, MxsR, pick «premium» e grupo directo; sem direito → ignorado', () => {
  const site = [
    L({ id: 'a', copy_method: 'strategy', copyfactory_strategy_pick: 'Hvmg' }),
    L({ id: 'b', copy_method: 'strategy', copyfactory_strategy_pick: 'MxsR' }),
    L({ id: 'c', copy_method: 'strategy', copyfactory_strategy_pick: 'premium' }),
    L({ id: 'd', copy_method: 'telegram_group', telegram_groups: ['premium'] }),
    L({ id: 'e', copy_method: 'telegram_group', telegram_groups: ['premium'] }),
    L({ id: 'f', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B' }),
  ]
  const { rotas, ignorados } = planearRotasDaEstrategia({
    estrategia: {
      providerId: 'p', slug: SLUG_PREMIUM, nome: 'MTM Auto Premium', contaMestreId: '1C6A3789-6981-465E-8D28-375A4079A352',
      copyfactoryIds: [...PREMIUM_IDS_COPYFACTORY], incluirMtmauto: false, picksExtra: extra.picks, gruposTelegram: extra.gruposTelegram,
    },
    site, subsAuto: [], contasAuto: [], semDireito: new Set(['u-e']),
  })
  assert.deepEqual(rotas.map((r) => r.destino_ref).sort(), ['site:a', 'site:b', 'site:c', 'site:d'])
  assert.ok(rotas.every((r) => r.origem_chave === 'mtmfunded:1c6a3789-6981-465e-8d28-375a4079a352' && r.estrategia_slug === SLUG_PREMIUM))
  assert.ok(rotas.find((r) => r.destino_ref === 'site:d')!.notas.includes('grupo Telegram'))
  assert.ok(ignorados.some((i) => i.ref === 'site:e' && /direito/.test(i.motivo)))
  assert.equal(rotas.find((r) => r.destino_ref === 'site:a')!.modo_lote, 'risco_pct')
})
t('sem extras (GoldKiller) o grupo Telegram premium não entra', () => {
  const { rotas } = planearRotasDaEstrategia({
    estrategia: { providerId: 'g', slug: 'Goldkiller', nome: 'GK', contaMestreId: 'x', copyfactoryIds: ['Wl1B'], incluirMtmauto: false, ...seguidoresExtra('Goldkiller') },
    site: [L({ id: 'd', copy_method: 'telegram_group', telegram_groups: ['premium'] })], subsAuto: [], contasAuto: [],
  })
  assert.equal(rotas.length, 0)
})

console.log('\n6. espelho da MT5 para a SIM')
t('SIM que é mestre do sinal em live → espelho desligado; sombra ou outra conta → não', () => {
  const linhas = [{ sinal_modo: 'live', conta_mestre_id: '1c6a3789-6981-465e-8d28-375a4079a352' }, { sinal_modo: 'sombra', conta_mestre_id: 'be70ca16' }]
  assert.equal(espelhoSubstituidoPelaMestre(linhas, '1C6A3789-6981-465E-8D28-375A4079A352'), true)
  assert.equal(espelhoSubstituidoPelaMestre(linhas, 'be70ca16'), false)
  assert.equal(espelhoSubstituidoPelaMestre(linhas, null), false)
})

console.log('\n7. cada caminho antigo do Premium pergunta ao interruptor')
const guardas: Array<[string, RegExp]> = [
  // entradas (MT5 mestre + CopyFactory Hvmg, execução directa), gestão por mensagem, edição de SL
  ['lib/mtmcopy/processor.ts', /premiumPeloMotor[\s\S]{0,900}if \(viaMotor\.legadoCortado\)[\s\S]{0,400}return\n/],
  // monitor de preço (conta MT5 mestre + contas de execução directa)
  ['lib/mtmcopy/premium-price-monitor.ts', /legadoPremiumDesligado\(\)\) return \{ ran: false/],
  // espelho das saídas aos subscritores (lib/gestao-real/espelho-premium)
  ['lib/mtmcopy/premium-subscriber-exits.ts', /legadoPremiumDesligado\(\)\) \{\n\s+out\.detail\.push/],
  // pendentes de zona (webhook TradingView e cron)
  ['lib/mtmcopy/premium-zone-monitor.ts', /legadoPremiumDesligado\(\)\) \{[\s\S]{0,300}status: "cancelled"/],
  // master-poll (fechos/edições da MT5 mestre para os T2T)
  ['lib/mtmcopy/master-poll.ts', /premiumCortado && \(routeBelongsToChannel\(route, 'premium-signals'\)/],
  // motor-real do VPS (Premium, subscritores e a conta provider premium-ouro)
  ['services/motor-real/escopo.ts', /switches\.premium_price_monitor && !premiumCortado/],
  ['services/motor-real/escopo.ts', /premium_subscriber_exits && !premiumCortado/],
  ['services/motor-real/escopo.ts', /premiumCortado && String\(g\.slug\)\.toLowerCase\(\) === SLUG_PREMIUM/],
  // espelho da conta MT5 para a SIM (funded-motor)
  ['services/funded-motor/espelho-provider.ts', /espelhoSubstituidoPelaMestre\(linhasMestres/],
]
for (const [f, re] of guardas) t(`${f}`, () => assert.match(ler(f), re))
t('o relay-post continua a escrever o literal/formato único no chat ANTES do processador (texto intocado)', () => {
  const r = ler('app/api/telegram/relay-post/route.ts')
  const chat = r.indexOf('content: premiumParaFormatoUnico(execText) ?? execText')
  assert.ok(chat > 0 && chat < r.lastIndexOf('await processMtmcopyTelegramMessage({'))
  assert.ok(!/mestres/.test(r), 'o relay-post não conhece o motor: a execução decide-se no processador')
})
t('Premium não é publicado pela mestre (o chat Premium fica com o literal do Telegram)', () => {
  assert.ok(!/premium/i.test(ler('lib/mestres/servidor/canais-publicados.ts').split('export const PUBLICACOES')[1].split('}\n\n')[0]))
})

if (ko) { console.error(`\n${ko} falhado(s)`); process.exit(1) }
console.log('\npremium: tudo certo')
