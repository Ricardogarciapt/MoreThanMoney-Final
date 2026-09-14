/**
 * Teste puro da avaliação por tick — sem base, sem MetaApi, sem rede.
 *
 *   npx tsx services/funded-motor/teste-avaliacao.ts
 *
 * Cada caso é uma situação que custa dinheiro a um aluno se correr mal: o SL que não fecha, a
 * pendente que abre sem margem, a regra que não quebra, o torneio que «passa».
 */
import assert from 'node:assert/strict'
import { avaliarTick, diaCorretora, emSessao, lucroPorDiaDe, resultadoSemIdeiasPct, type ContaSim, type EntradaAvaliacao, type OrdemSim, type PosicaoSim } from './avaliacao'
import { lucroUsd, type Simbolo } from '../../lib/mtmfunded/simulado/matematica'

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 30, comissao_lote: 7, volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100, moeda_lucro: 'USD' }
const EUR: Simbolo = { symbol: 'EURUSD', classe: 'forex', digits: 5, contract_size: 100000, pip_size: 0.0001, spread_pontos: 10, comissao_lote: 7, volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100, moeda_lucro: 'USD' }
const GBP: Simbolo = { ...EUR, symbol: 'GBPUSD' }
const VOD: Simbolo = { symbol: 'VOD', classe: 'acao', digits: 2, contract_size: 100, pip_size: 0.01, spread_pontos: 5, comissao_lote: 0, volume_min: 1, volume_step: 1, volume_max: 1000, alavancagem_max: 5, moeda_lucro: 'GBX' }
const simbolos = { XAUUSD: XAU, EURUSD: EUR, GBPUSD: GBP, VOD }

const regras = { perda_diaria_pct: 5, perda_maxima_pct: 10, objetivo_pct: 8, dias_minimos: 0, consistencia_pct: 0 }
const conta = (x: Partial<ContaSim> = {}): ContaSim => ({
  id: 'c1', saldo: 10000, saldoInicial: 10000, alavancagem: 100, ancoraDia: 10000, picoEquity: 10000,
  diasNegociados: 3, inicioEm: '2026-09-01T00:00:00Z', torneio: false, regras, objetivoPct: 8, ...x,
})
const pos = (x: Partial<PosicaoSim>): PosicaoSim => ({
  id: 'p1', account_id: 'c1', symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco_entrada: 2000, sl: null, tp: null, comissao: 7, swap: 0, origem: 'manual', ...x,
})
const ordem = (x: Partial<OrdemSim>): OrdemSim => ({
  id: 'o1', account_id: 'c1', symbol: 'XAUUSD', direcao: 'buy', tipo: 'limit', volume: 0.5, preco: 1995, sl: null, tp: null, origem: 'manual', expira_em: null, ...x,
})
const agora = new Date('2026-09-14T15:00:00Z')
const entrada = (x: Partial<EntradaAvaliacao>): EntradaAvaliacao => ({
  conta: conta(), posicoes: [], ordens: [], simbolos,
  precos: { XAUUSD: { symbol: 'XAUUSD', bid: 2000, ask: 2000.3 }, EURUSD: { symbol: 'EURUSD', bid: 1.1, ask: 1.1001 }, GBPUSD: { symbol: 'GBPUSD', bid: 1.3, ask: 1.3002 } },
  negociaveis: new Set(['XAUUSD', 'EURUSD', 'GBPUSD']), agora, lucroPorDia: {}, ...x,
})

let casos = 0
function caso(nome: string, f: () => void) {
  f()
  casos++
  console.log(`✓ ${nome}`)
}

caso('SL de uma compra fecha EXACTAMENTE no nível, e o prejuízo vai ao saldo', () => {
  const d = avaliarTick(entrada({
    posicoes: [pos({ sl: 1990 })],
    precos: { XAUUSD: { symbol: 'XAUUSD', bid: 1985, ask: 1985.3 } }, // gap abaixo do SL
  }))
  assert.equal(d.fechar.length, 1)
  assert.deepEqual([d.fechar[0].motivo, d.fechar[0].preco, d.fechar[0].pnl], ['sl', 1990, -1000])
  assert.equal(d.estado.saldo, 9000)
  // 9000 é exactamente o chão de −10%: tocar no chão já é quebrar (regras.ts usa <=).
  assert.equal(d.quebra?.motivo, 'perda_maxima')
})

caso('TP de uma venda fecha no nível (compra ao ASK)', () => {
  const d = avaliarTick(entrada({
    posicoes: [pos({ id: 'p2', symbol: 'EURUSD', direcao: 'sell', volume: 0.1, preco_entrada: 1.105, tp: 1.1002 })],
  }))
  assert.equal(d.fechar[0]?.motivo, 'tp')
  assert.equal(d.fechar[0].pnl, 48)
})

caso('SL e TP no mesmo tick: vale o SL', () => {
  const d = avaliarTick(entrada({ posicoes: [pos({ sl: 2001, tp: 1999 })] }))
  assert.equal(d.fechar[0].motivo, 'sl')
})

caso('mercado fechado: último preço fica, nada executa', () => {
  const d = avaliarTick(entrada({ posicoes: [pos({ sl: 2005 })], negociaveis: new Set() }))
  assert.equal(d.fechar.length, 0)
})

caso('pendente limit dispara ao preço da ordem e debita a comissão', () => {
  const d = avaliarTick(entrada({
    ordens: [ordem({})],
    precos: { XAUUSD: { symbol: 'XAUUSD', bid: 1994.5, ask: 1994.8 } },
  }))
  assert.deepEqual(d.executar, [{ ordemId: 'o1', preco: 1995, comissao: 3.5, symbol: 'XAUUSD' }])
  assert.equal(d.estado.saldo, 9996.5)
})

caso('pendente sem margem cancela em vez de abrir', () => {
  const d = avaliarTick(entrada({
    conta: conta({ saldo: 500, saldoInicial: 500, ancoraDia: 500 }),
    ordens: [ordem({ volume: 5 })],
    precos: { XAUUSD: { symbol: 'XAUUSD', bid: 1994.5, ask: 1994.8 } },
  }))
  assert.deepEqual(d.cancelarSemMargem, ['o1'])
  assert.equal(d.executar.length, 0)
})

caso('pendente expirada sai antes de poder disparar', () => {
  const d = avaliarTick(entrada({
    ordens: [ordem({ expira_em: '2026-09-14T14:59:00Z' })],
    precos: { XAUUSD: { symbol: 'XAUUSD', bid: 1990, ask: 1990.3 } },
  }))
  assert.deepEqual(d.expirar, ['o1'])
  assert.equal(d.executar.length, 0)
})

caso('stop-out fecha a PIOR posição primeiro', () => {
  const d = avaliarTick(entrada({
    conta: conta({ saldo: 3000, saldoInicial: 3000, ancoraDia: 3000, regras: null }),
    posicoes: [
      pos({ id: 'boa', symbol: 'EURUSD', volume: 1, preco_entrada: 1.1 }),
      pos({ id: 'ma', volume: 1, preco_entrada: 2020 }), // −2000 flutuante, margem 2020
    ],
  }))
  assert.equal(d.fechar[0]?.posicaoId, 'ma')
  assert.equal(d.fechar[0].motivo, 'stop_out')
})

caso('perda diária quebra, fecha tudo e cancela pendentes', () => {
  const d = avaliarTick(entrada({
    conta: conta({ ancoraDia: 10400 }),
    posicoes: [pos({ volume: 0.5, preco_entrada: 2010 })], // −500 → equity 9500 < 10400×0,95=9880
    ordens: [ordem({ preco: 1900 })],
  }))
  assert.equal(d.quebra?.motivo, 'perda_diaria')
  assert.equal(d.fechar[0].motivo, 'regra_quebrada')
  assert.deepEqual(d.cancelarPorFim, ['o1'])
  assert.equal(d.precisaConfirmacao, true)
})

caso('objectivo atingido num desafio fecha o ciclo', () => {
  const d = avaliarTick(entrada({ posicoes: [pos({ volume: 1, preco_entrada: 1990 })] })) // +1000 = +10%
  assert.equal(d.objetivo, true)
  assert.equal(d.fechar[0].motivo, 'fim_de_ciclo')
  assert.equal(d.estado.saldo, 11000)
})

caso('torneio nunca «passa»', () => {
  const d = avaliarTick(entrada({ conta: conta({ torneio: true, objetivoPct: 0 }), posicoes: [pos({ preco_entrada: 1990 })] }))
  assert.equal(d.objetivo, false)
  assert.equal(d.fechar.length, 0)
})

caso('não elegível (dias mínimos) não passa mesmo acima do objectivo', () => {
  const d = avaliarTick(entrada({ conta: conta({ regras: { ...regras, dias_minimos: 5 } }), posicoes: [pos({ preco_entrada: 1990 })] }))
  assert.equal(d.objetivo, false)
})

caso('posição sem preço nunca decide uma quebra', () => {
  const d = avaliarTick(entrada({
    conta: conta({ ancoraDia: 99999 }),
    posicoes: [pos({ symbol: 'EURUSD', preco_entrada: 1.1 }), pos({ id: 'x', symbol: 'GBPUSD' as string, preco_entrada: 1.3 })],
    precos: { EURUSD: { symbol: 'EURUSD', bid: 1.1, ask: 1.1001 } },
  }))
  assert.equal(d.quebra, null)
  assert.deepEqual(d.estado.semPreco, ['GBPUSD'])
})

caso('acções de Londres em pence: 100 VOD × 10p = £10', () => {
  const l = lucroUsd(VOD, 'buy', 1, 100, 110, { GBPUSD: { symbol: 'GBPUSD', bid: 1.3, ask: 1.3 } })
  assert.equal(l, 13) // 10p × 100 acções = 1000p = £10 = $13
})

caso('dia da corretora vira às 22:00 UTC', () => {
  assert.equal(diaCorretora('2026-09-14T21:59:59Z'), '2026-09-14')
  assert.equal(diaCorretora('2026-09-14T22:00:00Z'), '2026-09-15')
  assert.deepEqual(lucroPorDiaDe([
    { pnl: 100, comissao: 7, fechada_em: '2026-09-14T10:00:00Z', origem: 'manual' },
    { pnl: 50, comissao: 0, fechada_em: '2026-09-14T23:00:00Z', origem: 'manual' },
  ]), { '2026-09-14': 93, '2026-09-15': 50 })
})

caso('resultado sem ideias tira o que as ideias da casa fizeram', () => {
  const r = resultadoSemIdeiasPct(10000, 10500,
    [{ pnl: 307, comissao: 7, fechada_em: '2026-09-14T10:00:00Z', origem: 'ideia_mtm' }], [], simbolos, {})
  assert.equal(r, 2) // 10500 − 300 = 10200 → +2%
})

caso('sessões em hora da corretora (UTC+3)', () => {
  const s = { MONDAY: [{ from: '16:30:00.000', to: '22:59:59.999' }] }
  assert.equal(emSessao(s, new Date('2026-09-14T13:00:00Z'), 180), false) // 16:00 servidor
  assert.equal(emSessao(s, new Date('2026-09-14T14:00:00Z'), 180), true)  // 17:00 servidor
  assert.equal(emSessao(null, agora, 180), null)
})

console.log(`\n${casos} casos, todos certos.`)
