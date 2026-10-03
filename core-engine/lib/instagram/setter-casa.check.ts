import assert from 'node:assert/strict'
import { ehDaCasa, normalizarHandle } from './setter-casa'

// ── O mesmo handle escrito de várias maneiras é o mesmo handle ──────────────

for (const v of ['ruipaulo.fxcripto', '@ruipaulo.fxcripto', ' @RuiPaulo.FXcripto ', 'https://instagram.com/ruipaulo.fxcripto/', 'https://www.instagram.com/ruipaulo.fxcripto']) {
  assert.equal(normalizarHandle(v), 'ruipaulo.fxcripto', `«${v}» tem de dar o mesmo handle`)
}
assert.equal(normalizarHandle(null), '')
assert.equal(normalizarHandle('  '), '')
// Handles diferentes continuam diferentes — a normalização não pode juntar pessoas.
assert.notEqual(normalizarHandle('rafaelb10'), normalizarHandle('rafaelb11'))

// ── A guarda que impede escrever a gente nossa ─────────────────────────────

const fora = new Set(['ruipaulo.fxcripto', 'rafaelb10'])
assert.equal(ehDaCasa('@RuiPaulo.FXcripto', fora), true, 'o Rui Rodrigues é sub-IB: não se aborda')
assert.equal(ehDaCasa('rafaelb10', fora), true)
assert.equal(ehDaCasa('alguem.novo', fora), false, 'um desconhecido com handle é um lead a sério')

/**
 * SEM HANDLE assume-se que é da casa — e é a decisão certa pela razão errada de parecer estranha:
 * a Meta dá UMA private reply por comentário. Escrever a alguém que não se conseguiu identificar
 * gasta esse tiro único num destinatário que ninguém sabe quem é. Perder um lead é recuperável;
 * queimar o comentário não é.
 */
assert.equal(ehDaCasa(null, fora), true)
assert.equal(ehDaCasa('', fora), true)
assert.equal(ehDaCasa('   ', fora), true)

// Uma lista vazia significa «não consegui ler a base» — e aí quem tem handle passa, mas quem não
// tem continua a não ser abordado.
assert.equal(ehDaCasa(null, new Set()), true)

console.log('instagram/setter-casa: OK')
