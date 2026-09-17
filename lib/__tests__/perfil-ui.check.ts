/**
 * `npx tsx lib/__tests__/perfil-ui.check.ts`
 *
 * Os casos aqui não são inventados: são os estados que existem mesmo na base hoje. O que se
 * protege é a resposta ser a MESMA em todos os ecrãs para a mesma pessoa.
 */

import assert from 'node:assert/strict'
import {
  chavePerfilUi,
  contaAtivaUi,
  ehAdminUi,
  ehPremiumUi,
  ehVipUi,
  podeAcederAoTier,
  podeAcederPremiumUi,
} from '@/lib/perfil-ui'

// ── VIP marcado só pelo tipo (5 contas reais) ────────────────────────────────────────────────
const vipPorTipo = {
  user_type: 'vip',
  member_category: 'standard',
  membership_level: 'basic',
  subscription_plan: 'app_member',
  is_active: true,
}
assert.equal(ehVipUi(vipPorTipo), true, 'VIP por user_type tem de contar como VIP')
assert.equal(chavePerfilUi(vipPorTipo), 'vip')
assert.equal(podeAcederPremiumUi(vipPorTipo), true)

// ── VIP marcado só pela categoria ────────────────────────────────────────────────────────────
const vipPorCategoria = { user_type: 'member', member_category: 'vip', is_active: true }
assert.equal(ehVipUi(vipPorCategoria), true)
assert.equal(chavePerfilUi(vipPorCategoria), 'vip')

// ── VIP marcado só pelo membership_level ─────────────────────────────────────────────────────
assert.equal(ehVipUi({ user_type: 'member', membership_level: 'vip', is_active: true }), true)

// ── Premium que vive no subscription_plan, não na categoria ──────────────────────────────────
const premiumPorPlano = {
  user_type: 'member',
  member_category: 'standard',
  subscription_plan: 'premium',
  is_active: true,
}
assert.equal(ehPremiumUi(premiumPorPlano), true, 'quem paga Premium não pode aparecer como Membro')
assert.equal(chavePerfilUi(premiumPorPlano), 'premium')
assert.equal(podeAcederPremiumUi(premiumPorPlano), true)

// ── Membro (35 €) ────────────────────────────────────────────────────────────────────────────
const membro = {
  user_type: 'member',
  member_category: 'standard',
  subscription_plan: 'app_member',
  is_active: true,
}
assert.equal(ehPremiumUi(membro), false)
assert.equal(ehVipUi(membro), false)
assert.equal(chavePerfilUi(membro), 'membro')
assert.equal(podeAcederPremiumUi(membro), false, 'o Membro não entra nas Apps MTM nem no Terminal')

// ── Admin com categoria 'standard' (5 contas reais) ──────────────────────────────────────────
const admin = {
  user_type: 'admin',
  member_category: 'standard',
  subscription_plan: 'app_member',
  is_active: true,
}
assert.equal(ehAdminUi(admin), true)
assert.equal(chavePerfilUi(admin), 'admin', 'um admin não pode ser etiquetado App Member (35 €)')
assert.equal(podeAcederPremiumUi(admin), true)

// ── Conta em pausa por pagamento: is_active=false fecha tudo ──────────────────────────────────
const emPausa = {
  user_type: 'member',
  member_category: 'premium',
  subscription_plan: 'premium',
  is_active: false,
}
assert.equal(contaAtivaUi(emPausa), false)
assert.equal(ehPremiumUi(emPausa), false)
assert.equal(podeAcederPremiumUi(emPausa), false)
assert.equal(chavePerfilUi(emPausa), 'inativo')

// Nem sequer um admin suspenso mantém as ferramentas.
assert.equal(ehAdminUi({ user_type: 'admin', is_active: false }), false)
// Nem um VIP suspenso.
assert.equal(ehVipUi({ user_type: 'vip', is_active: false }), false)

// ── user_type='inactive' com a categoria ainda em 'premium' (4 contas reais) ──────────────────
const inativoComCategoriaPremium = {
  user_type: 'inactive',
  member_category: 'premium',
  subscription_plan: 'premium',
  is_active: false,
}
assert.equal(chavePerfilUi(inativoComCategoriaPremium), 'inativo')
assert.equal(podeAcederPremiumUi(inativoComCategoriaPremium), false)

// ── Trial (guest com categoria Premium) ──────────────────────────────────────────────────────
const trial = { user_type: 'guest', member_category: 'premium', is_active: true }
assert.equal(podeAcederPremiumUi(trial), true, 'durante o trial vê-se o Premium')
assert.equal(chavePerfilUi(trial), 'trial', 'mas a etiqueta diz Trial — aquilo acaba')

// ── Skool e IQ ───────────────────────────────────────────────────────────────────────────────
assert.equal(chavePerfilUi({ user_type: 'member', member_category: 'skool', is_active: true }), 'skool')
assert.equal(podeAcederPremiumUi({ user_type: 'member', member_category: 'skool', is_active: true }), false)
assert.equal(chavePerfilUi({ user_type: 'member', member_category: 'iq', is_active: true }), 'iq')
assert.equal(podeAcederPremiumUi({ user_type: 'member', member_category: 'iq', is_active: true }), true)

// ── Sem perfil ───────────────────────────────────────────────────────────────────────────────
assert.equal(ehVipUi(null), false)
assert.equal(ehAdminUi(undefined), false)
assert.equal(podeAcederPremiumUi(null), false)
assert.equal(chavePerfilUi(null), 'inativo')

// ── Níveis das salas ao vivo e das playlists ─────────────────────────────────────────────────
// Um VIP entra em tudo: era isto que a web negava e a app permitia, para a MESMA sala.
assert.equal(podeAcederAoTier(vipPorTipo, 'premium'), true)
assert.equal(podeAcederAoTier(vipPorTipo, 'app_member'), true)
assert.equal(podeAcederAoTier(vipPorTipo, 'vip'), true, 'o VIP tem de entrar na playlist VIP dele')

// O Premium entra nas salas Premium — inclusive quem o tem no `subscription_plan`.
assert.equal(podeAcederAoTier(premiumPorPlano, 'premium'), true)
assert.equal(podeAcederAoTier(premiumPorPlano, 'app_member'), true)
assert.equal(podeAcederAoTier(premiumPorPlano, 'vip'), false)

// O Membro entra nas salas dele e não nas Premium.
assert.equal(podeAcederAoTier(membro, 'app_member'), true)
assert.equal(podeAcederAoTier(membro, 'premium'), false)
assert.equal(podeAcederAoTier(membro, 'vip'), false)

// «Gratuito» é gratuito — três das quatro cópias antigas não conheciam esta palavra e fechavam-na.
assert.equal(podeAcederAoTier(membro, 'free'), true)
assert.equal(podeAcederAoTier(membro, 'all'), true)
assert.equal(podeAcederAoTier(membro, null), true)

// O admin entra em tudo; a conta em pausa não entra em nada, nem no que é gratuito.
assert.equal(podeAcederAoTier(admin, 'vip'), true)
assert.equal(podeAcederAoTier(emPausa, 'free'), false)
assert.equal(podeAcederAoTier(emPausa, 'app_member'), false)

console.log('perfil-ui: OK')
