import assert from 'node:assert/strict'
import { classificarRenovacao } from '../renovacao'

const ativa = { status: 'active', cancelaNoFim: false, fimPeriodo: '2026-10-17T00:00:00Z' }

// O caso que dava meses grátis: manual, auto_renew true por defeito, sem Stripe.
assert.equal(classificarRenovacao({ member_category: 'skool', subscription_platform: 'manual', subscription_auto_renew: true }, null), 'cobrar')
assert.equal(classificarRenovacao({ member_category: 'premium', subscription_platform: 'manual' }, null), 'cobrar')
// VIP (nos dois campos) e admin não pagam.
assert.equal(classificarRenovacao({ member_category: 'vip' }, null), 'isento')
assert.equal(classificarRenovacao({ user_type: 'vip', member_category: 'premium' }, null), 'isento')
assert.equal(classificarRenovacao({ user_type: 'admin' }, null), 'isento')
// Stripe a correr = renova sozinha.
assert.equal(classificarRenovacao({ member_category: 'premium', stripe_subscription_id: 'sub_1' }, ativa), 'stripe')
assert.equal(classificarRenovacao({ member_category: 'premium', stripe_subscription_id: 'sub_1' }, { ...ativa, status: 'past_due' }), 'stripe')
// Stripe cancelada, a cancelar no fim, ou ilegível → cobrar.
assert.equal(classificarRenovacao({ member_category: 'premium', stripe_subscription_id: 'sub_1' }, { ...ativa, status: 'canceled' }), 'cobrar')
assert.equal(classificarRenovacao({ member_category: 'premium', stripe_subscription_id: 'sub_1' }, { ...ativa, cancelaNoFim: true }), 'cobrar')
assert.equal(classificarRenovacao({ member_category: 'premium', stripe_subscription_id: 'sub_1' }, null), 'cobrar')
// Apple activa.
assert.equal(classificarRenovacao({ member_category: 'premium', subscription_platform: 'app_store', subscription_status: 'active' }, null), 'app_store')
assert.equal(classificarRenovacao({ member_category: 'premium', subscription_platform: 'app_store', subscription_status: 'active', subscription_auto_renew: false }, null), 'cobrar')

console.log('renovacao: todos certos')
