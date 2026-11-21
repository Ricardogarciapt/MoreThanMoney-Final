/** Guarda: `npx tsx lib/vendas/funil-fases.check.ts`. */
import assert from 'node:assert/strict'
import { classificarFunil, ehRecruta, faseDoNegocio, resumirFases, PAPEL_DA_FASE, FASES } from './funil-fases'

// Fases a partir do estado do CRM
assert.equal(faseDoNegocio('lead', []), 'prospecao')
assert.equal(faseDoNegocio('contactado', null), 'qualificacao')
assert.equal(faseDoNegocio('qualificado', []), 'convite')
assert.equal(faseDoNegocio('no_show', []), 'convite')
assert.equal(faseDoNegocio('marcado', []), 'apresentacao')
assert.equal(faseDoNegocio('apresentado', []), 'edificacao')
assert.equal(faseDoNegocio('apresentado', ['edificado']), 'fecho')
assert.equal(faseDoNegocio('ganho', []), 'onboarding')
assert.equal(faseDoNegocio('ganho', ['onboarding_ok']), null)
assert.equal(faseDoNegocio('perdido', []), null)

// Cada fase tem dono
for (const f of FASES) assert.ok(PAPEL_DA_FASE[f])
assert.equal(PAPEL_DA_FASE.onboarding, 'onboarder')

// Classificação só com sinais explícitos
const s = (o: Partial<Parameters<typeof classificarFunil>[0]>) => ({ origem: null, interesse: null, broker_uid: null, etiquetas: null, ...o })
assert.equal(classificarFunil(s({ broker_uid: '123' })), 'corretora')
assert.equal(classificarFunil(s({ interesse: 'Quero abrir conta na PU Prime' })), 'corretora')
assert.equal(classificarFunil(s({ interesse: 'não tenho capital' })), 'funded')
assert.equal(classificarFunil(s({ interesse: 'Trading Educators' })), 'b2b')
assert.equal(classificarFunil(s({ interesse: 'quero aprender' })), 'educacao')
assert.equal(classificarFunil(s({ interesse: 'indeciso', origem: 'telegram' })), null)
assert.equal(classificarFunil(s({})), null)

// Recrutador
assert.equal(ehRecruta(s({ etiquetas: ['form:trading-educator'] })), true)
assert.equal(ehRecruta(s({ interesse: 'Small Products Sales Educators' })), true)
assert.equal(ehRecruta(s({ interesse: 'mtmauto' })), false)

// Resumo: importados WhatsApp não contam
const agora = Date.parse('2026-11-21T00:00:00Z')
const r = resumirFases(
  [
    { estado: 'lead', funil: null, origem: 'telegram', interesse: null, broker_uid: null, etiquetas: null, criado_em: '2026-11-20T00:00:00Z', fechado_em: null },
    { estado: 'lead', funil: null, origem: 'whatsapp_import', interesse: null, broker_uid: null, etiquetas: null, criado_em: '2026-11-20T00:00:00Z', fechado_em: null },
    { estado: 'ganho', funil: 'corretora', origem: 'corretora', interesse: null, broker_uid: '1', etiquetas: null, criado_em: '2026-11-01T00:00:00Z', fechado_em: '2026-11-19T00:00:00Z' },
    { estado: 'contactado', funil: 'b2b', origem: 'formulario', interesse: 'Trading Educators', broker_uid: null, etiquetas: null, criado_em: '2026-11-01T00:00:00Z', fechado_em: null },
  ],
  agora,
)
assert.equal(r.fases.find((f) => f.fase === 'prospecao')!.total, 1)
assert.equal(r.fases.find((f) => f.fase === 'onboarding')!.total, 1)
assert.equal(r.entradas7d, 1)
assert.equal(r.ganhos7d, 1)
assert.equal(r.recrutas, 1)
assert.equal(r.papeis.find((p) => p.papel === 'setter')!.total, 1)
assert.equal(r.conversao, 33.3)

console.log('funil-fases: ok')
