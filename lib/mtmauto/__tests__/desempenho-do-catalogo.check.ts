/**
 * Desempenho das estratégias MTM Auto na MTM System = o da app MTM Auto, sem recálculo.
 *
 *   npx tsx lib/mtmauto/__tests__/desempenho-do-catalogo.check.ts
 */
import assert from 'node:assert/strict'
import {
  desempenhoDoCatalogo,
  resumoDoCartao,
  SEM_HISTORICO,
  temHistorico,
  simuladasDoCatalogo,
  type ProvedorMtmAuto,
} from '../desempenho-do-catalogo'

let n = 0
const ok = (nome: string, f: () => void) => { f(); n++; console.log(`  ✓ ${nome}`) }

// Linhas reais de /api/auto/providers a 2026-09-18 (conta provider 3bab6541 e 78066d2d, 90 dias).
const GOLDKILLER: ProvedorMtmAuto = {
  id: '3ba9d6f5-a325-4a14-ac20-f39842820c4f',
  nome: 'MTM Auto GoldKiller',
  sinais: 7, fechados: 7, ganhos: 5, perdas: 2, breakeven: 0,
  winrate: 71.4, fatorLucro: 1.38, daContaProvider: true,
  curva: [
    { quando: '2026-09-15T13:23:40.636Z', pips: 30, acumulado: 30 },
    { quando: '2026-09-16T10:00:00.000Z', pips: -12.1, acumulado: 17.9 },
    { quando: '2026-09-17T10:00:00.000Z', pips: 62, acumulado: 79.9 },
  ],
}
// Conta lida, zero fechos: a MTM Auto devolve winrate null e mostra «sem histórico».
const SENSEI: ProvedorMtmAuto = {
  id: '6de49c92-1849-43c9-9ddd-1e45fcd57f63', nome: 'MTM Auto Sensei',
  sinais: 0, fechados: 0, ganhos: 0, perdas: 0, breakeven: 0, winrate: null, fatorLucro: null,
  daContaProvider: true, curva: [],
}
// Sem conta de execução: a MTM Auto conta os seus sinais — 6 sinais, nenhum fechado.
const EDGE: ProvedorMtmAuto = {
  id: 'a6c2e466-fc1a-43d3-9394-2133672c2bf8', nome: 'MTM Auto Edge',
  sinais: 6, fechados: 0, ganhos: 0, perdas: 0, winrate: null, daContaProvider: false,
}

console.log('desempenho-do-catalogo')

ok('a percentagem é EXACTAMENTE a da MTM Auto (71,4%, não a reposição de 35,1%)', () => {
  const d = desempenhoDoCatalogo(GOLDKILLER)
  assert.equal(d.winrate, 71.4)
  assert.equal(d.fechados, 7)
  assert.equal(d.ganhos, 5)
  assert.equal(d.perdas, 2)
  assert.equal(d.fatorLucro, 1.38)
  assert.equal(d.origem, 'provider')
  assert.equal(d.contaProvider, 'MTM Auto GoldKiller')
  assert.equal(d.medicaoFiavel, true)
  assert.equal(d.porqueNaoFiavel, null)
  assert.equal(d.fonte, 'mtm-auto')
})

ok('pips = acumulado final da curva (o que a MTM Auto mostra), não o campo `pips` dos sinais', () => {
  const d = desempenhoDoCatalogo({ ...GOLDKILLER, pips: -433.5 } as ProvedorMtmAuto)
  assert.equal(d.pips, 79.9)
  assert.equal(d.curva.length, 3)
})

ok('nunca dinheiro: nenhum campo de saldo/resultado em moeda sai no retrato', () => {
  const d = desempenhoDoCatalogo({ ...GOLDKILLER, resultado: 88.91, saldo: 1000 } as unknown as ProvedorMtmAuto)
  const chaves = Object.keys(d)
  for (const proibida of ['resultado', 'saldo', 'equity', 'balance', 'lucro', 'profit']) {
    assert.ok(!chaves.includes(proibida), `não pode sair «${proibida}»`)
  }
})

ok('sem histórico (conta lida, 0 fechos) → winrate null, zeros verdadeiros e «Sem histórico suficiente»', () => {
  const d = desempenhoDoCatalogo(SENSEI)
  assert.equal(d.winrate, null)
  assert.equal(d.fechados, 0)
  assert.equal(d.fatorLucro, null)
  assert.equal(d.pips, null)
  assert.ok(d.porqueNaoFiavel?.startsWith(SEM_HISTORICO))
  assert.equal(resumoDoCartao(SENSEI), SEM_HISTORICO)
  assert.equal(temHistorico(SENSEI), false)
})

ok('sem conta de execução e sinais por fechar → sem histórico, origem «sinais», sem inventar 0%', () => {
  const d = desempenhoDoCatalogo(EDGE)
  assert.equal(d.origem, 'sinais')
  assert.equal(d.contaProvider, null)
  assert.equal(d.winrate, null)
  assert.equal(d.sinais, 6)
  assert.equal(resumoDoCartao(EDGE), SEM_HISTORICO)
})

ok('winrate 0 com trades fechadas é histórico real (0% ≠ sem histórico)', () => {
  const p: ProvedorMtmAuto = { id: 'x', sinais: 3, fechados: 3, ganhos: 0, perdas: 3, winrate: 0 }
  assert.equal(temHistorico(p), true)
  assert.equal(desempenhoDoCatalogo(p).winrate, 0)
  assert.equal(resumoDoCartao(p), '0% de acerto · 3 trades')
})

ok('winrate sem fechos (dados incoerentes) não passa como histórico', () => {
  const p: ProvedorMtmAuto = { id: 'x', fechados: 0, winrate: 50 }
  assert.equal(temHistorico(p), false)
  assert.equal(desempenhoDoCatalogo(p).winrate, null)
})

ok('sem limiar próprio: 1 trade na MTM Auto é 1 trade aqui (não se esconde o que lá se mostra)', () => {
  const p: ProvedorMtmAuto = { id: 'x', fechados: 1, ganhos: 1, perdas: 0, winrate: 100 }
  assert.equal(resumoDoCartao(p), '100% de acerto · 1 trade')
})

ok('cartão em PT: vírgula decimal, mesmo número', () => {
  assert.equal(resumoDoCartao(GOLDKILLER), '71,4% de acerto · 7 trades')
})

ok('curva com pontos inválidos: descartados, pips do último ponto válido', () => {
  const d = desempenhoDoCatalogo({
    ...GOLDKILLER,
    curva: [
      { quando: 'a', pips: 10, acumulado: 10 },
      { quando: 'b', pips: NaN, acumulado: NaN },
    ],
  })
  assert.equal(d.pips, 10)
  assert.equal(d.curva.length, 1)
})

ok('linha vazia (estratégia fora do catálogo do cliente) → sem histórico, nada inventado', () => {
  const d = desempenhoDoCatalogo({ id: 'y' })
  assert.equal(d.winrate, null)
  assert.equal(d.sinais, 0)
  assert.equal(d.pips, null)
  assert.equal(resumoDoCartao(null), SEM_HISTORICO)
})

// ── 90 dias de todas as contas reais (MTM Auto, 2026-09-18) ────────────────────────────────────
// Linha real depois da mudança: Sensei com as contas-mestre anteriores (143 trades do plano) +
// copiadoras + execuções da app + conta actual.
const SENSEI_90D: ProvedorMtmAuto = {
  id: '6de49c92-1849-43c9-9ddd-1e45fcd57f63', nome: 'MTM Auto Sensei',
  sinais: 150, fechados: 150, ganhos: 89, perdas: 61, breakeven: 0, winrate: 59.3, fatorLucro: 1.73,
  daContaProvider: true,
  curva: [{ quando: '2026-09-18T12:11:27.540Z', pips: -81.8, acumulado: 2729.9 }],
  historico90d: { contas: 7, porFonte: { 'plano-mestre': 143, copiadoras: 3, 'execucoes-app': 3, 'conta-provider': 1 }, desde: '2026-06-20T12:00:00.000Z' },
  simuladas: null,
}
// Edge: só contas simuladas em 90 dias → principal sem histórico, simuladas à parte.
const EDGE_SIM: ProvedorMtmAuto = {
  ...EDGE,
  simuladas: {
    origem: 'simulada', trades: 17, ganhos: 15, perdas: 2, breakeven: 0, winrate: 88.2, fatorLucro: 2.4,
    pips: 280, curva: [{ quando: '2026-09-18T18:05:46.475Z', pips: 5, acumulado: 280 }], contas: 2,
    desde: '2026-06-20T12:00:00.000Z',
  },
}

ok('90 dias: o Sensei passa a ter histórico (contas anteriores) e a MTM System lê o mesmo', () => {
  const d = desempenhoDoCatalogo(SENSEI_90D)
  assert.equal(d.winrate, 59.3)
  assert.equal(d.fechados, 150)
  assert.equal(d.fatorLucro, 1.73)
  assert.equal(d.pips, 2729.9)
  assert.equal(d.simuladas, null)
  assert.equal(resumoDoCartao(SENSEI_90D), '59,3% de acerto · 150 trades')
})

ok('só simuladas: o principal fica «sem histórico» e as simuladas vêm à parte, marcadas', () => {
  const d = desempenhoDoCatalogo(EDGE_SIM)
  assert.equal(d.winrate, null)
  assert.equal(d.fechados, 0)
  assert.equal(d.pips, null)
  assert.equal(resumoDoCartao(EDGE_SIM), SEM_HISTORICO)
  assert.equal(d.simuladas?.origem, 'simulada')
  assert.equal(d.simuladas?.trades, 17)
  assert.equal(d.simuladas?.winrate, 88.2)
  assert.equal(d.simuladas?.pips, 280)
})

ok('simuladas NUNCA ao lado de histórico real (mesmo que a linha as traga)', () => {
  const d = desempenhoDoCatalogo({ ...SENSEI_90D, simuladas: EDGE_SIM.simuladas })
  assert.equal(d.winrate, 59.3)
  assert.equal(d.simuladas, null)
})

ok('simuladas inválidas ou sem origem marcada não passam', () => {
  assert.equal(simuladasDoCatalogo({ id: 'x', simuladas: { ...EDGE_SIM.simuladas!, trades: 0 } }), null)
  assert.equal(simuladasDoCatalogo({ id: 'x', simuladas: { ...EDGE_SIM.simuladas!, origem: 'real' as 'simulada' } }), null)
  assert.equal(simuladasDoCatalogo(null), null)
})

ok('simuladas também sem dinheiro', () => {
  const s = simuladasDoCatalogo({ id: 'x', simuladas: { ...EDGE_SIM.simuladas!, resultado: 99, saldo: 1000 } as never })!
  for (const proibida of ['resultado', 'saldo', 'equity', 'balance', 'lucro', 'profit']) {
    assert.ok(!Object.keys(s).includes(proibida), `não pode sair «${proibida}»`)
  }
})

console.log(`\n${n} verificações ok`)
