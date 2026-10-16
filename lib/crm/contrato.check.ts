import assert from 'node:assert/strict'
import { contratoLead, estadoInicial, parametrosLead, segredoValido } from './contrato'
const base = { name: ' Ana ', phone: '+351 910 000 001', channel: 'whatsapp', aiScore: 'A', aiSummary: 'Quer conhecer o produto.' }
const lead = contratoLead.parse(base)
assert.equal(lead.name, 'Ana')
assert.equal(lead.phone, '+351910000001')
assert.equal(parametrosLead(lead).papel, 'closer')
assert.equal(parametrosLead(contratoLead.parse({ ...base, aiScore: 'B' })).papel, 'setter')
assert.equal(contratoLead.safeParse({ ...base, phone: '910000001' }).success, false)
assert.equal(contratoLead.safeParse({ ...base, phone: undefined }).success, false)
assert.equal(contratoLead.safeParse({ ...base, stage: 'WON_ONBOARDING' }).success, false)
assert.equal(contratoLead.safeParse({ ...base, stage: 'LOST' }).success, false)
assert.equal(contratoLead.safeParse({ ...base, assigned_agent_id: 'injected' }).success, false)
assert.equal(estadoInicial(contratoLead.parse({ ...base, stage: 'PRESENTATION_SCHEDULED' })), 'qualificado')
const nested = contratoLead.parse({
  lead_data: { name: 'Ana', phone: '+351910000001', channel: 'whatsapp' },
  qualification: { score: 'A', capital_available: 'High', detected_pain: base.aiSummary, target_product: 'MTM Auto' },
  workflow_routing: { action: 'ASSIGN_CLOSER', target_stage: 'QUALIFIED_SETTER', cal_injection_url: 'https://example.com/untrusted' },
})
assert.equal(parametrosLead(nested).estado, 'qualificado')
assert.equal(parametrosLead(nested).chave, parametrosLead(lead).chave)
assert.equal(segredoValido(null, undefined), false)
assert.equal(segredoValido('short', 'short'), false)
assert.equal(segredoValido('x'.repeat(32), 'x'.repeat(32)), true)
assert.equal(segredoValido('y'.repeat(32), 'x'.repeat(32)), false)
console.log('CRM: contrato e autenticação OK')
