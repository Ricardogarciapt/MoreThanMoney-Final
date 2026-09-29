/**
 * Emparelhar execuções MTM Auto com o que o espelho abriu na conta MTM Funded.
 *
 *   npx tsx lib/mtmauto/__tests__/espelho-funded.check.ts
 */
import assert from 'node:assert/strict'
import {
  emparelharEspelho,
  passouOPrazo,
  PRAZO_CORTESIA_MS,
  type ExecucaoPendente,
  type PosicaoEspelho,
} from '../espelho-funded'

const T0 = Date.parse('2026-09-17T10:00:00.000Z')
const iso = (offMin: number) => new Date(T0 + offMin * 60_000).toISOString()

const exec = (p: Partial<ExecucaoPendente> = {}): ExecucaoPendente => ({
  id: 'e1', funded_account_id: 'A', symbol: 'XAUUSD', direction: 'buy', created_at: iso(0), ...p,
})
const posicao = (p: Partial<PosicaoEspelho> = {}): PosicaoEspelho => ({
  id: 'p1', account_id: 'A', symbol: 'XAUUSD', direcao: 'buy', aberta_em: iso(1), ...p,
})

// ── o caso normal ────────────────────────────────────────────────────────────────────────────
{
  const r = emparelharEspelho([exec()], [posicao()])
  assert.deepEqual(r.pares, [{ execId: 'e1', posicaoId: 'p1', candidatos: 1 }])
  assert.deepEqual(r.semPar, [])
}

// O sufixo da corretora não desfaz o par: o espelho grava XAUUSD, a conta pode dizer XAUUSD.r.
assert.equal(emparelharEspelho([exec()], [posicao({ symbol: 'XAUUSD.r' })]).pares.length, 1)

// ── o que NÃO pode casar ─────────────────────────────────────────────────────────────────────
assert.deepEqual(emparelharEspelho([exec()], [posicao({ account_id: 'B' })]).semPar, ['e1'], 'outra conta')
assert.deepEqual(emparelharEspelho([exec()], [posicao({ direcao: 'sell' })]).semPar, ['e1'], 'outra direcção')
assert.deepEqual(emparelharEspelho([exec()], [posicao({ symbol: 'EURUSD' })]).semPar, ['e1'], 'outro símbolo')
assert.deepEqual(emparelharEspelho([exec()], [posicao({ aberta_em: iso(60) })]).semPar, ['e1'], 'fora da janela à frente')
assert.deepEqual(emparelharEspelho([exec()], [posicao({ aberta_em: iso(-30) })]).semPar, ['e1'], 'fora da janela atrás')
assert.deepEqual(emparelharEspelho([exec()], [posicao({ aberta_em: null })]).semPar, ['e1'], 'sem abertura')

// US30 nunca casa com US3000 — é a garantia que `symbolMatchesCanonical` dá e que aqui se herda.
assert.deepEqual(
  emparelharEspelho([exec({ symbol: 'US30' })], [posicao({ symbol: 'US3000' })]).semPar, ['e1'],
)

// ── vários candidatos: desempate pelo TEMPO, nunca pela ordem da lista ───────────────────────
{
  const r = emparelharEspelho(
    [exec()],
    [posicao({ id: 'longe', aberta_em: iso(25) }), posicao({ id: 'perto', aberta_em: iso(2) })],
  )
  assert.equal(r.pares[0]!.posicaoId, 'perto')
  assert.equal(r.pares[0]!.candidatos, 2, 'o desempate fica contado, para quem lê saber que houve')
  // A ordem inversa dá o mesmo resultado: não pode depender de como a base devolveu as linhas.
  const inv = emparelharEspelho(
    [exec()],
    [posicao({ id: 'perto', aberta_em: iso(2) }), posicao({ id: 'longe', aberta_em: iso(25) })],
  )
  assert.equal(inv.pares[0]!.posicaoId, 'perto')
}

// ── uma posição só serve UMA execução (senão a mesma trade contava duas vezes) ───────────────
{
  const r = emparelharEspelho(
    [exec({ id: 'e1', created_at: iso(0) }), exec({ id: 'e2', created_at: iso(3) })],
    [posicao({ id: 'p1', aberta_em: iso(1) })],
  )
  assert.deepEqual(r.pares.map((p) => p.execId), ['e1'], 'a mais antiga fica com a posição')
  assert.deepEqual(r.semPar, ['e2'])
}

// ── prazo de cortesia: não se desiste cedo demais ────────────────────────────────────────────
assert.equal(passouOPrazo(iso(0), T0 + PRAZO_CORTESIA_MS - 1), false, 'ainda no prazo')
assert.equal(passouOPrazo(iso(0), T0 + PRAZO_CORTESIA_MS), true, 'prazo cumprido')
assert.equal(passouOPrazo('lixo', T0 + PRAZO_CORTESIA_MS), false, 'data ilegível não é motivo para desistir')

console.log('espelho-funded: ok')
