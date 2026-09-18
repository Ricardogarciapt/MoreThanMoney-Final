/**
 * Fugas de receita dos sinais pagos — a regra única (lib/direito-sinais).
 *
 * Correr: npx tsx lib/__tests__/direito-sinais.check.ts
 *
 * O que se prova:
 *   1. quem paga ou tem direito (admin, VIP em qualquer campo, Premium em qualquer campo, Fundador,
 *      IQ, trial, MTM Auto com direito) CONTINUA a ler os sinais pagos — incluindo os que a regra
 *      antiga do chat (`subscription_plan === 'premium'`) deixava de fora;
 *   2. Membro, Skool, conta em pausa e visitante NÃO leem;
 *   3. só Sensei (fora forex/perps) e GoldKiller são pagos — MTM Scanner e Aurum ficam abertos;
 *   4. o alerta ocultado não leva nada com que se opere, mas mantém a montra (ativo, scanner, desfecho);
 *   5. as rotas usam a regra (Alertas, gestão IA, send-push, webhook).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  alertaDeSinalPago,
  canalDeSinaisPago,
  ocultarConteudoDoAlerta,
  temDireitoSinaisPagos,
} from '@/lib/direito-sinais'
import { canReadChannel } from '@/lib/chat-channel-permissions'
import { decidirDireitoMtmAuto } from '@/lib/entitlements'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

// ── 1. Quem tem direito ────────────────────────────────────────────────────────────────────
const casosComDireito: Array<[string, Record<string, unknown>]> = [
  ['admin', { is_active: true, user_type: 'admin', member_category: 'standard', subscription_plan: 'app_member' }],
  ['VIP por user_type (categoria standard)', { is_active: true, user_type: 'vip', member_category: 'standard', subscription_plan: null }],
  ['VIP por member_category', { is_active: true, user_type: 'member', member_category: 'vip' }],
  ['VIP por membership_level', { is_active: true, user_type: 'member', member_category: 'standard', membership_level: 'vip' }],
  ['Premium pelo plano', { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'premium' }],
  ['Premium pela categoria (plano app_member)', { is_active: true, user_type: 'member', member_category: 'premium', subscription_plan: 'app_member' }],
  ['Fundador pela categoria', { is_active: true, user_type: 'member', member_category: 'fundador' }],
  ['Founder pelo nível', { is_active: true, user_type: 'member', member_category: 'standard', membership_level: 'founder' }],
  ['IQ (65 €)', { is_active: true, user_type: 'member', member_category: 'iq' }],
  ['trial (guest com a categoria Premium)', { is_active: true, user_type: 'guest', member_category: 'premium' }],
]
for (const [nome, perfil] of casosComDireito) {
  assert.equal(temDireitoSinaisPagos(perfil), true, `${nome} tem de ler os sinais pagos`)
}

// Nunca MENOS do que o chat: tudo o que o chat deixava ler, a regra nova deixa.
for (const [, perfil] of casosComDireito) {
  if (canReadChannel('sensei-scanner', perfil as never)) assert.equal(temDireitoSinaisPagos(perfil), true)
}
// E o caso que o chat cortava por engano (Premium só na categoria) passa a ler.
const premiumSoCategoria = { is_active: true, user_type: 'member', member_category: 'premium', subscription_plan: 'app_member' }
assert.equal(canReadChannel('sensei-scanner', premiumSoCategoria as never), true, 'o chat já lê com a regra dos sinais pagos (18/09)')
assert.equal(temDireitoSinaisPagos(premiumSoCategoria), true)

// MTM Auto com direito: lê mesmo sem ser Premium no site (e mesmo com o site em pausa).
const membroComMtmAuto = { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'app_member' }
assert.equal(temDireitoSinaisPagos(membroComMtmAuto), false)
assert.equal(temDireitoSinaisPagos(membroComMtmAuto, { direitoMtmAuto: true }), true)
assert.equal(temDireitoSinaisPagos({ is_active: false, user_type: 'member' }, { direitoMtmAuto: true }), true)
// … e o direito MTM Auto que o filtro em lote usa (espelho da SQL) dá-o a quem paga a app.
const agora = new Date('2026-09-18T12:00:00Z')
assert.equal(decidirDireitoMtmAuto(membroComMtmAuto, { subscricao: 'active' }, { agora }).tem, true)
assert.equal(
  decidirDireitoMtmAuto(membroComMtmAuto, null, { agora }).tem,
  false,
  'o Membro sem MTM Auto não ganha direito por esta porta',
)

// ── 2. Quem NÃO tem ────────────────────────────────────────────────────────────────────────
const casosSemDireito: Array<[string, Record<string, unknown> | null]> = [
  ['visitante', null],
  ['Membro (app_member)', { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'app_member' }],
  ['Skool', { is_active: true, user_type: 'member', member_category: 'skool', subscription_plan: null }],
  ['Premium em pausa (is_active=false)', { is_active: false, user_type: 'member', member_category: 'premium', subscription_plan: 'premium' }],
  ['VIP em pausa', { is_active: false, user_type: 'member', member_category: 'vip', subscription_plan: 'premium' }],
  ['is_active desconhecido', { user_type: 'member', member_category: 'premium', subscription_plan: 'premium' }],
]
for (const [nome, perfil] of casosSemDireito) {
  assert.equal(temDireitoSinaisPagos(perfil), false, `${nome} não pode ler os sinais pagos`)
}

// ── 3. Que sinais são pagos ────────────────────────────────────────────────────────────────
assert.equal(canalDeSinaisPago('premium-ideas'), true)
assert.equal(canalDeSinaisPago('sensei-scanner'), true)
assert.equal(canalDeSinaisPago('sinais-goldkiller'), true)
for (const aberto of ['trade-ideas', 'trade-ideas-setup', 'sinais-scanner-mtm', 'cripto-perps', 'geral', '', null]) {
  assert.equal(canalDeSinaisPago(aberto), false, `canal ${aberto} é aberto`)
}
assert.equal(alertaDeSinalPago({ strategy: 'MTM Sensei X', assetClass: 'gold_btc' }), true)
assert.equal(alertaDeSinalPago({ strategy: 'MTM Sensei X', assetClass: 'index' }), true, 'Sensei sem canal é o scanner Premium')
assert.equal(alertaDeSinalPago({ strategy: 'MTM Sensei X', assetClass: 'forex' }), false, 'Sensei forex vai para a Ideias de Forex (aberta)')
assert.equal(alertaDeSinalPago({ strategy: 'MTM Sensei X', assetClass: 'crypto_perp' }), false, 'perps são abertos')
assert.equal(alertaDeSinalPago({ strategy: 'GoldKiller', assetClass: 'gold_btc' }), true)
assert.equal(alertaDeSinalPago({ strategy: null, alertName: 'GoldKiller XAUUSD', assetClass: 'gold_btc' }), true, 'o nome do alerta também conta')
assert.equal(alertaDeSinalPago({ strategy: 'MTMScanner', assetClass: 'gold_btc' }), false)
assert.equal(alertaDeSinalPago({ strategy: 'MTM Aurum Flow ORB', assetClass: 'crypto_perp' }), false)
assert.equal(alertaDeSinalPago({ strategy: null, alertName: null, assetClass: 'forex' }), false)

// ── 4. O que fica e o que sai ──────────────────────────────────────────────────────────────
const alerta = {
  id: 'a1', ticker: 'XAUUSD', strategy: 'MTM Sensei X', timeframe: '15', createdAt: '2026-09-18T10:00:00Z',
  tradeStatus: 'exit_2', outcomePips: 120, outcomePct: 0.5, outcomeUnit: 'pips' as const,
  action: 'buy', direction: 'buy' as const, entry: 2345.1, stopLoss: 2339, takeProfits: [2350, 2360],
  confirmations: [{ name: 'zonetouch', passed: true }], message: 'COMPRA XAUUSD @ 2345.1', aiAnalysis: '### Plano',
  chartImageUrl: 'https://s3.tradingview.com/x.png', slDistance: 6.1, slPercent: 0.26, slPips: 61,
  crypto: null,
}
const oculto = ocultarConteudoDoAlerta(alerta)
assert.equal(oculto.bloqueado, true)
assert.equal(oculto.direction, 'neutral')
for (const campo of ['action', 'entry', 'stopLoss', 'message', 'aiAnalysis', 'chartImageUrl', 'slDistance', 'slPercent', 'slPips'] as const) {
  assert.equal(oculto[campo], null, `${campo} não pode sair`)
}
assert.deepEqual(oculto.takeProfits, [])
assert.deepEqual(oculto.confirmations, [])
// Nada do conteúdo sobrevive em lado nenhum do objecto.
const json = JSON.stringify(oculto)
for (const segredo of ['2345.1', '2339', '2350', '2360', 'COMPRA', 'Plano', 'x.png', 'zonetouch']) {
  assert.equal(json.includes(segredo), false, `«${segredo}» ficou no alerta ocultado`)
}
// A montra fica.
assert.equal(oculto.ticker, 'XAUUSD')
assert.equal(oculto.strategy, 'MTM Sensei X')
assert.equal(oculto.tradeStatus, 'exit_2')
assert.equal(oculto.outcomePips, 120)

// ── 5. As rotas usam a regra ───────────────────────────────────────────────────────────────
const alertas = ler('app/api/mtm-alerts/route.ts')
assert.match(alertas, /alertaDeSinalPago\(a\)/)
assert.match(alertas, /ocultarConteudoDoAlerta/)
assert.match(alertas, /temDireitoSinaisPagosUtilizador\(userId\)/)
const gestao = ler('app/api/mtm-alerts/manage/route.ts')
assert.match(gestao, /temDireitoSinaisPagosUtilizador/)
assert.match(gestao, /status: 403/)
const push = ler('app/api/notifications/send-push/route.ts')
assert.match(push, /canalDeSinaisPago\(payload\.data\?\.channel\)/)
assert.match(push, /filtrarComDireitoSinaisPagos\(targetUserIds\)/)
// O filtro tem de vir ANTES das notificações in-app (o sino também levava o sinal).
assert.ok(push.indexOf('filtrarComDireitoSinaisPagos(targetUserIds)') < push.indexOf(".from('notifications').insert"))
const webhook = ler('app/api/webhooks/tradingview/route.ts')
assert.match(webhook, /sinal_pago: "1"/)
assert.match(webhook, /filtrarComDireitoSinaisPagos\(targets\)/)
// Os envios de canal mandam o canal em data.channel — é por aí que o send-push filtra.
assert.match(ler('lib/telegram-channel-push.ts'), /channel: slug/)
assert.match(ler('lib/chat-channel-notify.ts'), /channel: options\.channelSlug/)

// O sino (trigger em tradingview_signals, migração 115 — por aplicar) usa a mesma regra em SQL.
const sino = ler('supabase/migrations/115_sino_sinais_pagos.sql')
assert.match(sino, /not pago/)
assert.match(sino, /direito_mtm_auto\(p\.id, true\)/)
assert.match(sino, /when estrategia like '%sensei%' then classe not in \('forex', 'crypto_perp'\)/)

console.log('direito-sinais: OK')
