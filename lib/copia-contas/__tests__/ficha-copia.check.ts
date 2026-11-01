/**
 * A FICHA DE CÓPIA — a regra pura do que o admin pode mudar numa conta de subscritor a partir da
 * gaveta da conta (lib/copia-contas/ficha-copia-regras.ts).
 *
 *  · lerPedidoFicha recusa referências que não sejam site:/auto: e lotes fora de 0–50;
 *  · cada patch só aceita colunas conhecidas, nos limites da casa, e devolve null onde «vazio = sem limite»;
 *  · BE/trailing na subscrição são tri-estado (herda · sim · não);
 *  · retirar do site mata os três caminhos de planear.ts (strategy_lots, pick, grupo Telegram).
 *
 *   npx tsx lib/copia-contas/__tests__/ficha-copia.check.ts
 */
import assert from 'node:assert/strict'
import { ligacaoSegueEstrategia, ligacaoSegueGrupoTelegram } from '../../mestres/planear'
import {
  lerPedidoFicha, patchContaAuto, patchLigacaoSite, patchMestresConta, patchRetirarSite, patchSubscricaoAuto, textoLote,
} from '../ficha-copia-regras'

let n = 0
const ok = (f: () => void) => { f(); n++ }
const ID = '11111111-2222-3333-4444-555555555555'

// ── pedidos ──
ok(() => {
  assert.deepEqual(lerPedidoFicha({ accao: 'parametros', ref: `SITE:${ID}`, campos: { copy_sl: true } }), { accao: 'parametros', ref: `site:${ID}`, campos: { copy_sl: true } })
  assert.ok('erro' in lerPedidoFicha({ accao: 'parametros', ref: `funded:${ID}` }), 'funded não tem ficha de cópia')
  assert.ok('erro' in lerPedidoFicha({ accao: 'ligar', ref: `auto:${ID}`, slug: 'premium-ouro', lote: 80 }), 'lote > 50 recusado')
  assert.deepEqual(lerPedidoFicha({ accao: 'ligar', ref: `auto:${ID}`, slug: 'premium-ouro', lote: '' }), { accao: 'ligar', ref: `auto:${ID}`, slug: 'premium-ouro', lote: null })
  assert.ok('erro' in lerPedidoFicha({ accao: 'subscricao', ref: `auto:${ID}`, slug: 'x y' }), 'slug com espaço')
  assert.ok('erro' in lerPedidoFicha({ accao: 'apagar_rota', ref: `auto:${ID}` }), 'não há acção que escreva na rota')
  assert.deepEqual(lerPedidoFicha({ accao: 'retirar', ref: `site:${ID}`, confirmacao: ' RETIRAR ' }), { accao: 'retirar', ref: `site:${ID}`, confirmacao: 'RETIRAR' })
})

// ── site ──
ok(() => {
  const r = patchLigacaoSite({ lot_mode: 'RISK_PERCENT', lot_value: '0,5', max_risk_percent: '', copy_sl: false, symbols_whitelist: 'xauusd, eurusd xauusd' })
  assert.ok(r.ok)
  assert.deepEqual(r.patch, { lot_mode: 'risk_percent', lot_value: 0.5, max_risk_percent: null, copy_sl: false, symbols_whitelist: ['XAUUSD', 'EURUSD'] })
  assert.ok(!patchLigacaoSite({ lot_mode: 'multiplier' }).ok, 'multiplier no site nunca inventa lotes — não se grava')
  assert.ok(!patchLigacaoSite({ lot_mode: 'risk_percent', lot_value: 20 }).ok, 'risco % acima de 10')
  assert.ok(!patchLigacaoSite({ strategy_lots: {} }).ok, 'strategy_lots só por ligar/desligar')
  assert.ok(!patchLigacaoSite({ copy_sl: 'sim' }).ok)
  assert.ok(!patchLigacaoSite({}).ok, 'nada para alterar')
})

// ── MTM Auto ──
ok(() => {
  const r = patchContaAuto({ risco_pct: '0,4', risco_max_pct: 2, be_ativo: false, trailing_ativo: false, equity_minima: '', max_posicoes: '3.7' })
  assert.ok(r.ok)
  assert.deepEqual(r.patch, { risco_pct: 0.4, risco_max_pct: 2, be_ativo: false, trailing_ativo: false, equity_minima: null, max_posicoes: 4 })
  assert.ok(r.avisos.some((a) => /copiar_modificacoes/.test(a)), 'avisa que o SL da mestre passa a ser copiado')
  assert.ok(!patchContaAuto({ risco_pct: 6 }).ok, 'risco acima do limite da app (5 %)')
  assert.ok(!patchContaAuto({ risco_pct: 3, risco_max_pct: 1 }).ok, 'risco acima do tecto')
  assert.ok(!patchContaAuto({ saidas_pct: [50, 30, 20] }).ok, 'as saídas parciais têm dono (ficha da estratégia / app)')
})

// ── subscrição ──
ok(() => {
  const r = patchSubscricaoAuto({ modo_risco: 'risco', risco_pct: 0.25, be_ativo: 'herda', trailing_ativo: true, lote_fixo: '' })
  assert.ok(r.ok)
  assert.deepEqual(r.patch, { modo_risco: 'risco', risco_pct: 0.25, be_ativo: null, trailing_ativo: true, lote_fixo: null })
  assert.ok(!patchSubscricaoAuto({ be_ativo: 'talvez' }).ok)
  assert.ok(!patchSubscricaoAuto({ ativo: false }).ok, 'ligar/desligar é outra acção (ligarSubscritor)')
  const l = patchSubscricaoAuto({ modo_risco: 'lote' })
  assert.ok(l.ok && l.avisos.length === 1, 'modo lote sem lote fixo avisa')
})

// ── mestres_contas ──
ok(() => {
  const r = patchMestresConta({ lote_fixo_forcado: '', max_risco_total_pct: '2', max_posicoes: 3 })
  assert.ok(r.ok)
  assert.deepEqual(r.patch, { lote_fixo_forcado: null, max_risco_total_pct: 2, max_posicoes: 3 })
  assert.ok(!patchMestresConta({ lote_fixo_forcado: 6 }).ok, 'check da 116: lote forçado ≤ 5')
  assert.ok(!patchMestresConta({ modo: 'live' }).ok, 'o modo live tem a sua palavra e o seu caminho')
  assert.ok(!patchMestresConta({ notas: 'x' }).ok)
})

// ── retirar do site mata os três caminhos de planear.ts ──
ok(() => {
  const ids = ['cf-premium']
  const base = { id: 'l1', user_id: 'u1', strategy_lots: { 'premium-ouro': true }, copy_method: 'telegram_group', copyfactory_strategy_pick: 'cf-premium', telegram_groups: null }
  assert.ok(ligacaoSegueEstrategia(base as never, ids, 'premium-ouro'))
  const depois = { ...base, ...patchRetirarSite(base) }
  assert.equal(ligacaoSegueEstrategia(depois as never, ids, 'premium-ouro'), false, 'strategy_lots vazio + pick null')
  assert.equal(ligacaoSegueGrupoTelegram(depois as never, ['premium']), false, 'copy_method passou a strategy: o grupo por omissão «premium» já não conta')
  // uma ligação que já era `strategy` mantém o método
  assert.deepEqual(patchRetirarSite({ copy_method: 'strategy' }), { strategy_lots: {}, copyfactory_strategy_pick: null })
  // sem método gravado = telegram_group por omissão (parseTelegramGroups) → também muda
  assert.equal(patchRetirarSite({ copy_method: null }).copy_method, 'strategy')
})

ok(() => {
  assert.equal(textoLote('risco_pct', 0.4), 'risco 0,4 %')
  assert.equal(textoLote('fixo', 0.02), '0,02 lotes')
})

console.log(`ficha-copia: ${n} grupos OK`)
