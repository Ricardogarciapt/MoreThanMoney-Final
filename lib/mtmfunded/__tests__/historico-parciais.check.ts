/**
 * O histórico das apps conta TRADES, não saídas.
 *
 *   npx tsx lib/mtmfunded/__tests__/historico-parciais.check.ts
 *
 * O que se protege aqui é a coerência entre ecrãs: o Diário, as Estatísticas e o ecrã de
 * Estratégias já agrupavam mãe+filhas por `mae_id`; o separador de Histórico não, e por isso a
 * mesma posição valia 3 trades num sítio e 1 no outro. Como os parciais são quase sempre ganhos, a
 * diferença ia toda para o mesmo lado — a taxa de acerto do Histórico ficava acima da verdadeira.
 */
import assert from 'node:assert/strict'
import {
  agruparParciais,
  entradaMaisAntiga,
  raizesPorConfirmar,
  type ParteFechada,
} from '../historico-parciais'
import { FRONTEIRA_VIES_PRECO, notaViesPrecoDesdeEntrada } from '../../pips-proof'

let n = 0
const ok = (nome: string, f: () => void) => { f(); n++; console.log(`  ✓ ${nome}`) }

// Ouro: 1 pip = 0,1. É o único símbolo aqui para as contas serem verificáveis à mão.
const pip = () => 0.1

function parte(p: Partial<ParteFechada> & { id: string; fechada_em: string }): ParteFechada {
  return {
    mae_id: null, account_id: 'conta-1', symbol: 'XAUUSD', direcao: 'buy',
    volume: 1, preco_entrada: 4000, preco_fecho: null,
    pnl: 0, comissao: 0, swap: 0, aberta_em: null,
    ...p,
  }
}

// ── Uma saída em três partes é UMA trade ─────────────────────────────────────────────────────
//
// O caso real: sai 1/3 no TP1 (+40 pips), 1/3 no TP2 (+80) e o resto volta ao breakeven (0).
// Antes disto o ecrã mostrava 3 linhas, contava 3 trades e dava 2 ganhos.
const saidaEmTres: ParteFechada[] = [
  parte({ id: 'mae', aberta_em: '2026-09-20T08:00:00.000Z', fechada_em: '2026-09-20T12:00:00.000Z', preco_fecho: 4000, volume: 0.01, pnl: 0 }),
  parte({ id: 'f1', mae_id: 'mae', fechada_em: '2026-09-20T09:00:00.000Z', preco_fecho: 4004, volume: 0.01, pnl: 40 }),
  parte({ id: 'f2', mae_id: 'mae', fechada_em: '2026-09-20T10:00:00.000Z', preco_fecho: 4008, volume: 0.01, pnl: 80 }),
]

ok('três saídas da mesma posição = uma trade', () => {
  const t = agruparParciais(saidaEmTres, new Set(['mae']), pip)
  assert.equal(t.length, 1)
  assert.equal(t[0].partes, 3)
  assert.equal(t[0].raiz, 'mae')
})

ok('o resultado soma as partes, líquido', () => {
  const comCustos = saidaEmTres.map((p) => ({ ...p, comissao: 1, swap: -0.5 }))
  const [t] = agruparParciais(comCustos, new Set(['mae']), pip)
  // 0 + 40 + 80 = 120; menos 3 comissões de 1; menos 3 swaps de 0,5.
  assert.equal(t.resultado, 120 - 3 - 1.5)
})

ok('uma trade que fecha em ganho e perda parciais é o SALDO, não uma vitória e uma derrota', () => {
  const metades: ParteFechada[] = [
    parte({ id: 'm', fechada_em: '2026-09-21T12:00:00.000Z', preco_fecho: 3960, volume: 0.5, pnl: -400 }),
    parte({ id: 'x', mae_id: 'm', fechada_em: '2026-09-21T10:00:00.000Z', preco_fecho: 4030, volume: 0.5, pnl: 300 }),
  ]
  const [t] = agruparParciais(metades, new Set(['m']), pip)
  assert.equal(t.resultado, -100, 'é UMA perda de 100')
  assert.ok(t.resultado < 0)
})

ok('os pips são pesados pelo volume — 2/3 a +40 e 1/3 a −10 não é +15', () => {
  const desiguais: ParteFechada[] = [
    parte({ id: 'm', fechada_em: '2026-09-22T12:00:00.000Z', preco_fecho: 3999, volume: 0.01 }),      // −10 pips
    parte({ id: 'y', mae_id: 'm', fechada_em: '2026-09-22T10:00:00.000Z', preco_fecho: 4004, volume: 0.02 }), // +40 pips
  ]
  const [t] = agruparParciais(desiguais, new Set(['m']), pip)
  // (−10×0,01 + 40×0,02) ÷ 0,03 = 23,3 — e NÃO a média simples, 15.
  assert.equal(t.pips, 23.3)
})

ok('a venda conta os pips ao contrário', () => {
  const venda = [parte({ id: 'v', direcao: 'sell', fechada_em: '2026-09-22T10:00:00.000Z', preco_fecho: 3990 })]
  const [t] = agruparParciais(venda, new Set(['v']), pip)
  assert.equal(t.pips, 100)
})

ok('o «quando» é o fecho MAIS RECENTE das partes', () => {
  const [t] = agruparParciais(saidaEmTres, new Set(['mae']), pip)
  assert.equal(t.quando, '2026-09-20T12:00:00.000Z')
})

// ── O parcial de uma posição ainda viva ──────────────────────────────────────────────────────
//
// Já mexeu no saldo, por isso o dinheiro conta; mas ainda não ganhou nem perdeu, por isso não
// entra na taxa de acerto. Contá-lo dava um ganho hoje e uma perda amanhã pela MESMA posição.
ok('parcial com a raiz aberta não é trade terminada', () => {
  const soAFilha = [saidaEmTres[1]]
  const [t] = agruparParciais(soAFilha, new Set(), pip)
  assert.equal(t.terminada, false)
  assert.equal(t.resultado, 40, 'o dinheiro realizado conta na mesma')
})

ok('a raiz confirmada fechada torna a trade terminada', () => {
  const [t] = agruparParciais([saidaEmTres[1]], new Set(['mae']), pip)
  assert.equal(t.terminada, true)
})

ok('raizesPorConfirmar separa o que já se sabe do que é preciso perguntar', () => {
  const { conhecidas, emFalta } = raizesPorConfirmar(saidaEmTres)
  assert.deepEqual([...conhecidas], ['mae'])
  assert.deepEqual(emFalta, [])

  const orfa = raizesPorConfirmar([saidaEmTres[1]])
  assert.deepEqual([...orfa.conhecidas], [])
  assert.deepEqual(orfa.emFalta, ['mae'], 'a mãe fechou fora da janela — há que perguntar')
})

// ── A ressalva do preço viciado: a mesma regra de pips-proof ─────────────────────────────────
ok('a entrada mais antiga é a que decide a ressalva', () => {
  const t = agruparParciais(saidaEmTres, new Set(['mae']), pip)
  assert.equal(entradaMaisAntiga(t), '2026-09-20T08:00:00.000Z')
})

ok('uma amostra aberta antes da fronteira leva a nota; depois dela, não', () => {
  const antes = new Date(Date.parse(FRONTEIRA_VIES_PRECO) - 3600_000).toISOString()
  const depois = new Date(Date.parse(FRONTEIRA_VIES_PRECO) + 3600_000).toISOString()
  assert.ok(notaViesPrecoDesdeEntrada(antes), 'entrada anterior à correcção = nota')
  assert.equal(notaViesPrecoDesdeEntrada(depois), null, 'a nota desaparece sozinha')
  // Sem entrada conhecida avisa-se à mesma: é o mesmo lado para que pips-proof erra.
  assert.ok(notaViesPrecoDesdeEntrada(null))
})

ok('sem preço de fecho não se inventam pips', () => {
  const [t] = agruparParciais([parte({ id: 'z', fechada_em: '2026-09-22T10:00:00.000Z' })], new Set(['z']), pip)
  assert.equal(t.pips, null)
})

console.log(`historico-parciais: ok (${n})`)
