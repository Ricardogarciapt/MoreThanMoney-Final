/**
 * O relógio dos painéis segue a régua viva: um reinício do dono põe as 48 h a contar de novo.
 * Corre: npx tsx lib/agentes/relogio-regua.check.ts
 */
import assert from 'node:assert/strict'
import { relogioDoJuizo, escalaDeVida } from './arvore'

const agora = new Date('2026-10-06T12:00:00Z')
const regras = (desde: string | null) => ({ janelaHoras: 48, gracaHoras: 72, regraDesde: desde })
const velho = { criado_em: '2026-10-01T09:00:00Z', estado: 'vivo', pausado: false, pilar: 'trading', pai_id: 'ceo' }

// Sem reinício, um filho de 01/10 sem receita já passou as 48 h.
assert.equal(relogioDoJuizo(velho, agora, undefined, regras(null)).fase, 'em_julgamento')
// O dono reinicia agora: faltam 48 h, e o texto diz de onde se conta.
const r = relogioDoJuizo(velho, agora, undefined, regras('2026-10-06T12:00:00Z'))
assert.equal(r.fase, 'carencia'); assert.equal(r.horas, 48); assert.match(r.texto, /reinício/)
// 10 h depois do reinício faltam 38.
assert.equal(relogioDoJuizo(velho, new Date('2026-10-06T22:00:00Z'), undefined, regras('2026-10-06T12:00:00Z')).horas, 38)
// Recém-nascido: conta a graça de 72 h, não as 48.
const novo = { ...velho, criado_em: '2026-10-06T11:00:00Z' }
assert.match(relogioDoJuizo(novo, agora, undefined, regras('2026-10-06T12:00:00Z')).texto, /graça/)
// O CEO não tem relógio de morte.
assert.equal(relogioDoJuizo({ ...velho, pilar: 'ceo', pai_id: null }, agora, undefined, regras(null)).fase, 'suspenso')
// A escala, dentro das 48 h depois da graça, não fica em «carência» (é a de julgar()).
const e = escalaDeVida({ ...velho, codigo: 'AG-X', resultado: 0, saldo: 10 }, agora, 10, regras('2026-10-06T12:00:00Z'))
assert.notEqual(e.banda, 'carencia')

console.log('relogio-regua: o reinício do dono põe as 48 h a contar nos dois painéis ✓')
