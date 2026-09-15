import assert from 'node:assert/strict'
import {
  SEM_DIREITOS,
  appMemberSemAcessoMtmAuto,
  contarExtras,
  decidirDireitoMtmAuto,
  motivoCopiaDoDireito,
  pareceDemo,
  podeLigarConta,
  type ContaLigada,
  type Direitos,
} from '../../entitlements'

/**
 * A regra das contas mexe em dinheiro nos dois sentidos: apertada de mais recusa quem pagou,
 * larga de mais dá de graça o que se vende. É por isso que tem testes.
 */

const membro: Direitos = { ...SEM_DIREITOS }
const comCopia: Direitos = { ...SEM_DIREITOS, copiaAutomatica: true, motivoCopia: 'premium', premium: true }
const admin: Direitos = { ...SEM_DIREITOS, admin: true }

// ── Demo reconhece-se pelo nome do servidor ───────────────────────────────────────────────────
assert.equal(pareceDemo('PUPrime-Demo'), true)
assert.equal(pareceDemo('PUPrime-Live'), false)
assert.equal(pareceDemo('VTMarkets-Practice'), true)

// ── Tap to Trade: aberto a membros, uma real e uma demo incluídas ──────────────────────────────
assert.equal(podeLigarConta(membro, 't2t', false, []).ok, true, 'o membro tem direito a uma conta T2T')
assert.equal(
  podeLigarConta(membro, 't2t', true, [{ superficie: 't2t', demo: false }]).ok,
  true,
  'a demo entra mesmo com a real ligada',
)
const t2tCheio: ContaLigada[] = [
  { superficie: 't2t', demo: false },
  { superficie: 't2t', demo: true },
]
const terceira = podeLigarConta(membro, 't2t', false, t2tCheio)
assert.equal(terceira.ok, false)
assert.equal(terceira.codigo, 'conta_extra')
assert.equal(terceira.precoEur, 7, 'o "não" traz o preço — senão não vende nada')

// ── A cópia automática é a parte paga ─────────────────────────────────────────────────────────
const semDireito = podeLigarConta(membro, 'mtmcopy', false, [])
assert.equal(semDireito.ok, false)
assert.equal(semDireito.codigo, 'sem_copia_automatica')
assert.equal(podeLigarConta(comCopia, 'mtmcopy', false, []).ok, true)
assert.equal(podeLigarConta(comCopia, 'mtmauto', true, []).ok, true)

// ── Cada produto tem o SEU incluído ───────────────────────────────────────────────────────────
// Ter a real do Tap to Trade não gasta a real do MTM Auto: são produtos diferentes.
assert.equal(
  podeLigarConta(comCopia, 'mtmauto', false, [{ superficie: 't2t', demo: false }]).ok,
  true,
  'o incluído de um produto não se gasta noutro',
)

// ── As extras são um saco comum ───────────────────────────────────────────────────────────────
const comUmaExtra: Direitos = { ...comCopia, extrasPagas: 1 }
assert.equal(podeLigarConta(comUmaExtra, 't2t', false, t2tCheio).ok, true, 'com uma extra paga, entra')

const extraGasta: ContaLigada[] = [...t2tCheio, { superficie: 't2t', demo: false }]
assert.equal(
  podeLigarConta(comUmaExtra, 'mtmauto', false, [
    ...extraGasta,
    { superficie: 'mtmauto', demo: false },
    { superficie: 'mtmauto', demo: true },
  ]).ok,
  false,
  'a extra gasta no T2T não pode ser gasta outra vez no MTM Auto',
)

// ── O bónus da corretora vale uma extra ───────────────────────────────────────────────────────
const comBonus: Direitos = { ...membro, bonusCorretora: true, depositoUsd: 400 }
assert.equal(podeLigarConta(comBonus, 't2t', false, t2tCheio).ok, true, 'a corretora validada dá a primeira')
assert.equal(
  podeLigarConta(comBonus, 't2t', true, extraGasta).ok,
  false,
  'só a primeira é oferecida — as seguintes pagam-se',
)

// ── Admin não tem limite ──────────────────────────────────────────────────────────────────────
assert.equal(podeLigarConta(admin, 'mtmcopy', false, extraGasta).ok, true)

// ── A contagem das extras ─────────────────────────────────────────────────────────────────────
assert.equal(contarExtras([]), 0)
assert.equal(contarExtras(t2tCheio), 0, 'o incluído não conta como extra')
assert.equal(contarExtras(extraGasta), 1)

// ── Direito ao MTM Auto: a regra única (fase 1) ───────────────────────────────────────────────
// Espelho de supabase/migrations/073_direito_mtm_auto.sql — se um destes mudar, mudam os dois.
{
  const agora = new Date('2026-09-15T12:00:00Z')
  const futuro = '2026-10-01T00:00:00Z'
  const passado = '2026-09-01T00:00:00Z'
  const d = (perfil: Parameters<typeof decidirDireitoMtmAuto>[0], auto: Parameters<typeof decidirDireitoMtmAuto>[1] = null, appMemberSemAcesso = true) =>
    decidirDireitoMtmAuto(perfil, auto, { agora, appMemberSemAcesso })
  const ativo = { is_active: true, subscription_status: 'active' }

  // Admin, pelo site ou pelo MTM Auto
  assert.deepEqual(d({ user_type: 'admin' }), { tem: true, motivo: 'admin' })
  assert.deepEqual(d(null, { papel: 'admin' }), { tem: true, motivo: 'admin' })

  // Premium activo tem; inactivo, cancelado ou fora do prazo não
  assert.deepEqual(d({ ...ativo, user_type: 'member', subscription_plan: 'premium', member_category: 'premium', subscription_expires_at: futuro }), { tem: true, motivo: 'premium' })
  assert.equal(d({ ...ativo, user_type: 'member', subscription_plan: 'premium', is_active: false }).tem, false, 'is_active=false fecha tudo')
  assert.equal(d({ ...ativo, user_type: 'inactive', member_category: 'premium' }).tem, false, 'inactive perde tudo, mesmo com a categoria premium')
  assert.equal(d({ ...ativo, user_type: 'member', subscription_plan: 'premium', subscription_status: 'canceled' }).tem, false)
  assert.equal(d({ ...ativo, user_type: 'member', subscription_plan: 'premium', subscription_expires_at: passado }).tem, false)
  assert.equal(d({ ...ativo, user_type: 'member', membership_level: 'founder' }).motivo, 'premium', 'o Fundador é Premium')

  // VIP vive em dois campos — qualquer um serve; inactive perde
  assert.deepEqual(d({ ...ativo, user_type: 'vip', member_category: 'standard', subscription_plan: 'app_member' }), { tem: true, motivo: 'vip' })
  assert.deepEqual(d({ ...ativo, user_type: 'member', member_category: 'vip', subscription_plan: 'app_member' }), { tem: true, motivo: 'vip' })
  assert.equal(d({ ...ativo, user_type: 'inactive', member_category: 'vip' }).tem, false)
  assert.equal(d({ user_type: 'vip', member_category: 'vip', is_active: false }).tem, false, 'VIP com o acesso fechado não tem')

  // Membro (app_member): sem MTM Auto por defeito; só com a flag desligada
  const membro = { ...ativo, user_type: 'member', member_category: 'standard', subscription_plan: 'app_member' }
  assert.deepEqual(d(membro), { tem: false, motivo: 'nenhum' }, 'o Membro NÃO tem MTM Auto')
  assert.deepEqual(d(membro, null, false), { tem: true, motivo: 'membro_mtm' }, 'com MTMAUTO_APP_MEMBER_SEM_ACESSO=0 volta a ter')
  // … e a isenção 'cliente_mtm' gravada no passado não lhe dá acesso: revê-se pelo perfil de hoje
  assert.equal(d(membro, { isento: true, motivo_isencao: 'cliente_mtm' }).tem, false)
  assert.equal(d({ ...membro, user_type: 'inactive', subscription_plan: 'premium' }, { isento: true, motivo_isencao: 'cliente_mtm' }).tem, false, 'Premium que deixou de pagar perde a isenção derivada')
  // Uma isenção dada à mão (outro motivo) continua a valer
  assert.deepEqual(d(membro, { isento: true, motivo_isencao: 'VIP do site' }), { tem: true, motivo: 'mtmauto_isento' })

  // MTM Copy legado: só pago E datado
  assert.deepEqual(d({ ...membro, mtmcopy_subscription_active: true, mtmcopy_subscription_expires_at: futuro }), { tem: true, motivo: 'legado_mtmcopy' }, 'legado datado = subscritor do MTM Auto, mesmo sendo Membro')
  assert.equal(d({ ...membro, mtmcopy_subscription_active: true, mtmcopy_subscription_expires_at: null }).tem, false, 'legado SEM data não conta')
  assert.equal(d({ ...membro, mtmcopy_subscription_active: true, mtmcopy_subscription_expires_at: passado }).tem, false, 'legado expirado não conta')
  assert.equal(d({ ...membro, mtmcopy_subscription_active: false, mtmcopy_subscription_expires_at: futuro }).tem, false)
  assert.equal(motivoCopiaDoDireito({ tem: true, motivo: 'legado_mtmcopy' }), 'mtmcopy')

  // Planos do próprio MTM Auto
  assert.deepEqual(d(null, { subscricao: 'active' }), { tem: true, motivo: 'mtmauto_stripe' }, 'quem só tem MTM Auto não precisa de perfil no site')
  assert.equal(d(null, { subscricao: 'canceled' }).tem, false)
  assert.deepEqual(d(null, { apple_estado: 'active', apple_expira_em: futuro }), { tem: true, motivo: 'mtmauto_apple' })
  assert.equal(d(null, { apple_estado: 'active', apple_expira_em: passado }).tem, false)
  assert.equal(d(null, { apple_estado: 'grace', apple_expira_em: passado }).tem, true, 'período de graça da Apple conta')
  assert.deepEqual(d(null, { acesso_manual: true }), { tem: true, motivo: 'mtmauto_manual' })
  assert.equal(d(null, { acesso_manual: true, acesso_ate: passado }).tem, false)

  // A suspensão manda em tudo — até no admin e no Premium
  assert.deepEqual(d({ user_type: 'admin' }, { suspenso: true }), { tem: false, motivo: 'suspenso' })
  assert.equal(d({ ...ativo, user_type: 'vip' }, { suspenso: true, subscricao: 'active' }).tem, false)

  // Sem nada
  assert.deepEqual(d(null, null), { tem: false, motivo: 'nenhum' })

  // A flag: por defeito o Membro fica sem acesso
  const antes = process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO
  delete process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO
  assert.equal(appMemberSemAcessoMtmAuto(), true)
  process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO = '0'
  assert.equal(appMemberSemAcessoMtmAuto(), false)
  if (antes === undefined) delete process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO
  else process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO = antes
}

console.log('✓ entitlements: 55 verificações')
