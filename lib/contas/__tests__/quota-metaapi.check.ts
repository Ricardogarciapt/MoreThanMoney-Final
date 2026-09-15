import assert from 'node:assert/strict'
import { SEM_DIREITOS, type Direitos } from '../../entitlements'
import {
  contarContasMetaApi,
  decidirQuotaMetaApi,
  ehContaMetaApi,
  estadoDaQuota,
  planoDaQuota,
  type LinhaConta,
} from '../quota-metaapi'

/**
 * Quota de contas MetaApi (2026-09-15): grátis 1 · Premium/VIP/MTM Auto 2 · admin sem limite ·
 * + extras pagas. TradeLocker e MTM Funded não contam. Conta nos dois produtos.
 */

const gratis: Direitos = { ...SEM_DIREITOS }
const premium: Direitos = { ...SEM_DIREITOS, premium: true }
// VIP marcado só por UM dos campos: carregarDireitos põe vip=true nos dois casos; aqui sem cópia.
const vipSoCategoria: Direitos = { ...SEM_DIREITOS, vip: true }
const mtmAuto: Direitos = { ...SEM_DIREITOS, copiaAutomatica: true, motivoCopia: 'mtmauto' }
const admin: Direitos = { ...SEM_DIREITOS, admin: true }

const mt5 = (id: string, login = id, servidor = 'PUPrime-Live'): LinhaConta => ({ metaapi_account_id: id, login, servidor, plataforma: 'mt5', estado: 'connected' })
const tl: LinhaConta = { metaapi_account_id: null, login: null, servidor: 'x · TradeLocker', plataforma: 'tradelocker', estado: 'connected' }
const funded: LinhaConta = { metaapi_account_id: null, login: '77001234', servidor: 'MTM Funded', plataforma: 'mtmfunded', estado: 'connected' }

// ── planos ────────────────────────────────────────────────────────────────────────────────────
assert.equal(planoDaQuota(gratis), 'gratis')
assert.equal(planoDaQuota(premium), 'premium')
assert.equal(planoDaQuota(vipSoCategoria), 'premium', 'VIP (qualquer dos dois campos) = 2')
assert.equal(planoDaQuota(mtmAuto), 'premium', 'direito ao MTM Auto = 2')
assert.equal(planoDaQuota(admin), 'admin')

// ── grátis: 1 ─────────────────────────────────────────────────────────────────────────────────
assert.equal(decidirQuotaMetaApi(gratis, []).ok, true, 'grátis liga a primeira')
const g2 = decidirQuotaMetaApi(gratis, [mt5('a')])
assert.equal(g2.ok, false, 'grátis não liga a segunda')
assert.equal(g2.codigo, 'quota_metaapi')
assert.match(g2.erro ?? '', /Premium ou MTM Auto/, 'a mensagem traz o caminho do upgrade')

// ── premium / vip / mtm auto: 2 ────────────────────────────────────────────────────────────────
for (const d of [premium, vipSoCategoria, mtmAuto]) {
  assert.equal(decidirQuotaMetaApi(d, [mt5('a')]).ok, true)
  assert.equal(decidirQuotaMetaApi(d, [mt5('a'), mt5('b')]).ok, false)
}

// ── admin: sem limite ─────────────────────────────────────────────────────────────────────────
assert.equal(decidirQuotaMetaApi(admin, [mt5('a'), mt5('b'), mt5('c'), mt5('d')]).ok, true)
assert.equal(estadoDaQuota(admin, 9).acimaDoLimite, false)

// ── extras já pagas somam por cima da base ─────────────────────────────────────────────────────
assert.equal(decidirQuotaMetaApi({ ...gratis, extrasPagas: 1 }, [mt5('a')]).ok, true, 'grátis + 1 extra = 2')
assert.equal(decidirQuotaMetaApi({ ...gratis, extrasPagas: 1 }, [mt5('a'), mt5('b')]).ok, false)
assert.equal(decidirQuotaMetaApi({ ...premium, extrasPagas: 2 }, [mt5('a'), mt5('b'), mt5('c')]).ok, true, 'premium + 2 = 4')
assert.equal(decidirQuotaMetaApi({ ...gratis, bonusCorretora: true }, [mt5('a')]).ok, true, 'bónus da corretora conta como uma extra')
assert.equal(estadoDaQuota({ ...premium, extrasPagas: 1, bonusCorretora: true }, 0).limite, 4)

// ── TradeLocker e MTM Funded não contam ────────────────────────────────────────────────────────
assert.equal(ehContaMetaApi(tl), false)
assert.equal(ehContaMetaApi(funded), false)
assert.equal(contarContasMetaApi([tl, funded, tl]), 0)
assert.equal(decidirQuotaMetaApi(gratis, [tl, funded, tl, funded]).ok, true, 'TL + Funded não gastam a conta grátis')
assert.equal(ehContaMetaApi({ ...mt5('x'), plataforma: 'mt4' }), true, 'MT4 conta')

// ── contagem entre produtos (site + MTM Auto) ──────────────────────────────────────────────────
const doSite = mt5('meta-1', '5550001', 'PUPrime-Live')
const doAutoMesmaConta = mt5('meta-1', '5550001', 'PUPrime-Live')
const doAutoOutroId = { ...mt5('meta-9', '5550001', 'puprime-live') }
const doAutoOutra = mt5('meta-2', '5550002', 'VTMarkets-Live')
assert.equal(contarContasMetaApi([doSite, doAutoMesmaConta]), 1, 'mesmo metaapi_account_id nos dois produtos conta 1')
assert.equal(contarContasMetaApi([doSite, doAutoOutroId]), 1, 'mesmo login+servidor conta 1')
assert.equal(contarContasMetaApi([doSite, doAutoOutra]), 2, 'uma no site + uma no MTM Auto = 2')
assert.equal(decidirQuotaMetaApi(premium, [doSite, doAutoOutra]).ok, false, 'premium cheio com 1 em cada produto')
assert.equal(
  decidirQuotaMetaApi(gratis, [doSite], { login: '5550001', servidor: 'PUPrime-Live' }).ok,
  true,
  'religar no outro produto a MESMA conta não custa mais uma',
)

// ── estados ───────────────────────────────────────────────────────────────────────────────────
assert.equal(ehContaMetaApi({ ...mt5('z'), estado: 'disconnected' }), false, 'desligada não conta')
assert.equal(ehContaMetaApi({ metaapi_account_id: null, login: '1', servidor: 's', plataforma: 'mt5', estado: 'pending' }), true, 'a ser criada conta')
assert.equal(ehContaMetaApi({ metaapi_account_id: null, login: '1', servidor: 's', plataforma: 'mt5', estado: 'error' }), false, 'falhou antes da MetaApi não conta')

// ── acima do limite: aviso, sem apagar nada ────────────────────────────────────────────────────
const acima = estadoDaQuota(gratis, 3)
assert.equal(acima.acimaDoLimite, true)
assert.equal(acima.livres, 0)
const v = decidirQuotaMetaApi(gratis, [mt5('a'), mt5('b'), mt5('c')])
assert.equal(v.ok, false)
assert.match(v.erro ?? '', /continuam a funcionar/)

console.log('quota-metaapi.check: ok')
