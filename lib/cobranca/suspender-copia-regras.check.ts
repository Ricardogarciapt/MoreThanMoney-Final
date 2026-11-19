/**
 * Guarda da pausa da cópia por falta de pagamento. Corre: npx tsx lib/cobranca/suspender-copia-regras.check.ts
 */
import assert from 'node:assert/strict'
import { decidir, situacaoPagamento, NADA_LIGADO, type Ligado } from './suspender-copia-regras'

const agora = new Date('2026-11-19T12:00:00Z')
const futuro = '2026-12-20T00:00:00Z'
const passado = '2026-10-01T00:00:00Z'
const ligado: Ligado = { site: [], auto: ['a1'], subs: ['s1'], metaapi: [{ id: 'm1', origem: 'auto' }] }
let n = 0
const caso = (_: string, f: () => void) => {
  f()
  n++
}
const sit = (p: Record<string, unknown>, a: Record<string, unknown> = {}, o: { excecoes?: string[]; userId?: string } = {}) =>
  situacaoPagamento(p as never, a as never, { agora, ...o })

caso('admin nunca', () => assert.equal(sit({ user_type: 'admin', is_active: false }).estado, 'isento'))
caso('super admin da app nunca', () => assert.equal(sit({ user_type: 'inactive' }, { super_admin: true }).estado, 'isento'))
caso('VIP que não paga nada mantém', () => assert.equal(sit({ user_type: 'vip', subscription_status: 'inactive', is_active: true }).estado, 'isento'))
caso('VIP pela categoria', () => assert.equal(sit({ user_type: 'member', member_category: 'vip', is_active: false }).estado, 'isento'))
caso('excepção por email', () =>
  assert.equal(sit({ email: 'Fabio@x.pt', user_type: 'inactive' }, {}, { excecoes: ['fabio@x.pt'] }).estado, 'isento'))
caso('Membro 35 € a pagar', () =>
  assert.equal(sit({ user_type: 'member', subscription_plan: 'app_member', is_active: true, subscription_status: 'active', subscription_expires_at: futuro }).estado, 'paga'))
caso('Premium past_due deve', () => {
  const s = sit({ user_type: 'member', is_active: true, subscription_status: 'past_due', subscription_expires_at: futuro })
  assert.deepEqual(s, { estado: 'deve', motivo: 'pagamento_falhado' })
})
caso('cancelado deve', () => assert.equal(sit({ user_type: 'member', is_active: false, subscription_status: 'canceled' }).motivo, 'subscricao_cancelada'))
caso('expirado deve', () => assert.equal(sit({ user_type: 'member', is_active: true, subscription_status: 'active', subscription_expires_at: passado }).motivo, 'expirou'))
caso('inactive deve', () => assert.equal(sit({ user_type: 'inactive', is_active: false, subscription_status: 'inactive' }).estado, 'deve'))
caso('MTM Auto pago na Stripe ganha ao pack', () => assert.equal(sit({ user_type: 'inactive' }, { subscricao: 'active' }).estado, 'paga'))
caso('MTM Copy legado datado', () =>
  assert.equal(sit({ user_type: 'member', is_active: false, mtmcopy_subscription_active: true, mtmcopy_subscription_expires_at: futuro }).estado, 'paga'))
caso('isenção cliente_mtm não conta', () => assert.equal(sit({ user_type: 'inactive' }, { isento: true, motivo_isencao: 'cliente_mtm' }).estado, 'deve'))
caso('acesso manual no prazo', () => assert.equal(sit({ user_type: 'inactive' }, { acesso_manual: true, acesso_ate: futuro }).estado, 'isento'))

const deve = sit({ user_type: 'inactive', is_active: false })
const paga = sit({ user_type: 'member', is_active: true, subscription_status: 'active' })
caso('deve + ligado → pausar', () => assert.equal(decidir({ situacao: deve, ligado, suspensaoAberta: false, stripePaga: false }).accao, 'pausar'))
caso('deve sem nada ligado → nada', () => assert.equal(decidir({ situacao: deve, ligado: NADA_LIGADO, suspensaoAberta: false, stripePaga: false }).accao, 'nada'))
caso('Stripe diz que paga → nunca pausa', () => assert.equal(decidir({ situacao: deve, ligado, suspensaoAberta: false, stripePaga: true }).accao, 'nada'))
caso('Stripe ilegível → não corta', () => assert.equal(decidir({ situacao: deve, ligado, suspensaoAberta: false, stripePaga: 'erro' }).accao, 'nada'))
caso('pagou → religa', () => assert.equal(decidir({ situacao: paga, ligado: NADA_LIGADO, suspensaoAberta: true }).accao, 'religar'))
caso('perfil atrasado mas Stripe paga → religa', () => assert.equal(decidir({ situacao: deve, ligado: NADA_LIGADO, suspensaoAberta: true, stripePaga: true }).accao, 'religar'))
caso('continua a dever → fica', () => assert.equal(decidir({ situacao: deve, ligado: NADA_LIGADO, suspensaoAberta: true, stripePaga: false }).accao, 'nada'))
caso('passou a VIP → religa', () =>
  assert.equal(decidir({ situacao: sit({ user_type: 'vip' }), ligado: NADA_LIGADO, suspensaoAberta: true }).accao, 'religar'))

console.log(`suspender-copia-regras: ${n} casos ok`)
