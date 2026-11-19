import assert from 'node:assert/strict'
import { foraDaJanelaPremiumII, horaDeLondres } from '../premium-ii-janela'

/** Horas sem entradas do Premium II (19/11). Correr: npx tsx lib/sinais/__tests__/premium-ii-janela.check.ts */
// Novembro: Londres = UTC
assert.equal(horaDeLondres(new Date('2026-11-19T14:30:00Z')), 14)
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T14:30:00Z'), undefined), true)
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T15:59:00Z'), undefined), true)
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T16:00:00Z'), undefined), false)
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T08:00:00Z'), undefined), false)
// Verão: Londres = UTC+1 → 13:30 UTC são 14:30 em Londres
assert.equal(foraDaJanelaPremiumII(new Date('2026-07-01T13:30:00Z'), undefined), true)
// Configurável: [] desliga, outra lista substitui
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T14:30:00Z'), []), false)
assert.equal(foraDaJanelaPremiumII(new Date('2026-11-19T01:10:00Z'), [1]), true)
console.log('premium-ii-janela: ok')
