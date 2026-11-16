import assert from 'node:assert/strict'
import { TOQUES, HORAS_ENTRE_TOQUES, toqueDevido, podeTocarNoCanal, depoisDosToques } from './cadencia-seguimento'

/**
 * Guarda da cadência de seguimento (16/11): 4 toques — no dia, +24 h, +48 h, +72 h — e depois email
 * só com consentimento. No Instagram/WhatsApp nada sai fora da janela de 24 h da Meta.
 *
 *   npx tsx lib/vendas/cadencia-seguimento.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const H = 3_600_000
const t0 = Date.parse('2026-11-16T10:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

caso('são quatro toques, nem três nem cinco', () => {
  assert.equal(TOQUES, 4)
  assert.equal(HORAS_ENTRE_TOQUES.length, 4)
})
caso('o 1.º é no dia; os outros a +24 h, +48 h e +72 h do 1.º', () => {
  const [a, b, c, d] = HORAS_ENTRE_TOQUES
  assert.ok(a < 12, 'o 1.º toque tem de sair no mesmo dia')
  assert.equal(b, 24); assert.equal(b + c, 48); assert.equal(b + c + d, 72)
})
caso('toqueDevido respeita o prazo e recusa toques fora da escada', () => {
  assert.equal(toqueDevido(1, iso(t0), t0 + 3 * H), false)
  assert.equal(toqueDevido(1, iso(t0), t0 + 4 * H), true)
  assert.equal(toqueDevido(2, iso(t0), t0 + 23 * H), false)
  assert.equal(toqueDevido(2, iso(t0), t0 + 24 * H), true)
  assert.equal(toqueDevido(5, iso(t0), t0 + 999 * H), false, 'MAU: um 5.º toque')
  assert.equal(toqueDevido(0, iso(t0), t0 + 999 * H), false)
  assert.equal(toqueDevido(2, null, t0), false)
})
caso('Telegram: a cadência corre inteira', () => {
  assert.equal(podeTocarNoCanal('telegram', null, t0), true)
})
caso('MAU: Instagram/WhatsApp fora da janela de 24 h não tocam', () => {
  for (const c of ['instagram', 'whatsapp'] as const) {
    assert.equal(podeTocarNoCanal(c, iso(t0), t0 + 10 * H), true)
    assert.equal(podeTocarNoCanal(c, iso(t0), t0 + 23 * H), false, `${c} à 23.ª hora`)
    assert.equal(podeTocarNoCanal(c, iso(t0), t0 + 48 * H), false, `${c} às 48 h`)
    assert.equal(podeTocarNoCanal(c, null, t0), false)
  }
})
caso('depois dos toques: email só com consentimento ou cliente; sair é parar', () => {
  assert.equal(depoisDosToques({ temEmail: true, consentiuEmail: true, ehCliente: false, saiu: false }), 'email')
  assert.equal(depoisDosToques({ temEmail: true, consentiuEmail: false, ehCliente: true, saiu: false }), 'email')
  assert.equal(depoisDosToques({ temEmail: true, consentiuEmail: false, ehCliente: false, saiu: false }), 'parar', 'MAU: email sem base legal')
  assert.equal(depoisDosToques({ temEmail: true, consentiuEmail: true, ehCliente: true, saiu: true }), 'parar', 'MAU: quem saiu')
  assert.equal(depoisDosToques({ temEmail: false, consentiuEmail: true, ehCliente: true, saiu: false }), 'parar')
})
console.log(`cadencia-seguimento: ${n} casos — 4 toques, janelas da Meta e email com consentimento ✓`)
