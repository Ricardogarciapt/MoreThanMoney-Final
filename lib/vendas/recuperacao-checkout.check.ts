import assert from 'node:assert/strict'
import { chaveDoLembrete, elegivel, linkDeRetoma, rascunhoDoLembrete, type CheckoutAbandonado } from './recuperacao-checkout'
import { linkTemAg } from '@/lib/agentes/codigos'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guardas da recuperação de checkouts. Os casos MAUS primeiro: cada um é um email que, se saísse,
 * era spam (sem consentimento), um insulto (já comprou) ou uma campanha disfarçada (sessão velha).
 */
const agora = new Date('2026-10-06T10:00:00Z')
const ontem = '2026-10-05T10:00:00Z'
const base: CheckoutAbandonado = {
  origem: 'checkout_sessions',
  referencia: '11111111-1111-1111-1111-111111111111',
  email: 'pessoa@gmail.com',
  criadoEm: ontem,
  produto: 'app_member_monthly',
  primeiroNome: 'Ana',
}
const consentiu = { baseLegal: 'consentimento' as const, retirou: false, ehCliente: false }
const nada = new Set<string>()
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('MAU: sem consentimento e não cliente → não', () => {
  const d = elegivel(base, { baseLegal: null, retirou: false, ehCliente: false }, [], nada, agora)
  assert.equal(d.pode, false)
  assert.match(d.porque, /sem consentimento/)
})
caso('MAU: cliente sem consentimento de campanha, mas retirou → não', () => {
  assert.equal(elegivel(base, { baseLegal: 'consentimento', retirou: true, ehCliente: true }, [], nada, agora).pode, false)
})
caso('MAU: já comprou depois → não', () => {
  const d = elegivel(base, consentiu, ['2026-10-05T12:00:00Z'], nada, agora)
  assert.equal(d.pode, false)
  assert.match(d.porque, /já comprou/)
})
caso('compra ANTERIOR à sessão não bloqueia (comprou outra coisa antes)', () => {
  assert.equal(elegivel(base, consentiu, ['2026-09-01T00:00:00Z'], nada, agora).pode, true)
})
caso('MAU: sessão com mais de 7 dias → não', () => {
  const d = elegivel({ ...base, criadoEm: '2026-09-09T00:57:38Z' }, consentiu, [], nada, agora)
  assert.equal(d.pode, false)
  assert.match(d.porque, /mais de 7 dias/)
})
caso('MAU: segundo lembrete da mesma sessão → não', () => {
  const d = elegivel(base, consentiu, [], new Set([chaveDoLembrete(base)]), agora)
  assert.equal(d.pode, false)
})
caso('MAU: email de teste → não', () => {
  assert.equal(elegivel({ ...base, email: 'x@example.com' }, consentiu, [], nada, agora).pode, false)
})
caso('MAU: sem email → não', () => {
  assert.equal(elegivel({ ...base, email: null }, consentiu, [], nada, agora).pode, false)
})
caso('BOM: consentiu, sessão de ontem, não comprou, sem lembrete → sim', () => {
  assert.equal(elegivel(base, consentiu, [], nada, agora).pode, true)
})
caso('BOM: cliente activo (serviço) → sim', () => {
  assert.equal(elegivel(base, { baseLegal: null, retirou: false, ehCliente: true }, [], nada, agora).pode, true)
})
caso('o link de retoma leva ?ag=AG-EMAIL e nunca o URL do Stripe', () => {
  for (const c of [base, { ...base, produto: 'mtmcopy_addon_monthly' }, { ...base, origem: 'marketplace_leads' as const, produto: 'membro-anual' }]) {
    const l = linkDeRetoma(c)
    assert.ok(linkTemAg(l), l)
    assert.ok(l.includes('ag=AG-EMAIL'), l)
    assert.ok(!l.includes('stripe.com'), l)
  }
})
caso('o texto leva o link e não promete lucro', () => {
  const link = linkDeRetoma(base)
  const r = rascunhoDoLembrete(base, link)
  assert.ok(r.texto.includes(link))
  assert.ok(!/lucro|garant|€/i.test(r.texto), r.texto)
})

caso('o cron de recuperação de checkout não envia — só cria rascunhos', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app/api/cron/recuperacao-checkout/route.ts'), 'utf8')
  for (const proibido of ['sendMail', 'createMailTransporter', 'enviarEnvioAprovado', 'aprovarEnvio']) {
    assert.ok(!src.includes(proibido), `o cron de recuperação envia sozinho (${proibido})`)
  }
})

console.log(`recuperacao-checkout: ${n} casos ✓`)
