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
import { GESTAO_VAZIA, alertaDispara, condicaoDoAlerta, distanciaEmPreco, selecionarParaFecho, validarGestao, type Gestao } from '../../lib/mtmfunded/simulado/avancadas'

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

// ── ordens avançadas (072) ────────────────────────────────────────────────────
const gestao = (x: Partial<Gestao>): Gestao => ({ ...GESTAO_VAZIA, ...x })
// Sem regras: aqui mede-se a gestão, não o objectivo do desafio (+10% fecharia o ciclo).
const ent = (x: Partial<EntradaAvaliacao>) => entrada({ conta: conta({ regras: null }), ...x })
const px = (bid: number) => ({ XAUUSD: { symbol: 'XAUUSD', bid, ask: bid + 0.3 } })

caso('trailing: compra a +10 com trailing de 5 sobe o SL para preço − 5', () => {
  const d = avaliarTick(ent({ posicoes: [pos({ sl: 1990, gestao: gestao({ trailing_distancia: 5 }) })], precos: px(2010) }))
  assert.equal(d.modificar.length, 1)
  assert.deepEqual([d.modificar[0].sl, d.modificar[0].motivo], [2005, 'trailing'])
  assert.equal(d.fechar.length, 0)
})

caso('trailing só aperta: preço a recuar não baixa o SL', () => {
  const d = avaliarTick(ent({ posicoes: [pos({ sl: 2005, gestao: gestao({ trailing_distancia: 5 }) })], precos: px(2008) }))
  assert.equal(d.modificar.length, 0)
})

caso('trailing anda aos saltos (passo = máx(1 pip, distância/10))', () => {
  // distância 5 → passo 0,5; SL 2004,8 e candidato 2005 (+0,2) não mexe.
  const d = avaliarTick(ent({ posicoes: [pos({ sl: 2004.8, gestao: gestao({ trailing_distancia: 5 }) })], precos: px(2010) }))
  assert.equal(d.modificar.length, 0)
})

caso('trailing com ativação só começa depois do lucro pedido', () => {
  const e = (bid: number) => avaliarTick(ent({ posicoes: [pos({ sl: 1990, gestao: gestao({ trailing_distancia: 3, trailing_ativacao: 15 }) })], precos: px(bid) }))
  assert.equal(e(2010).modificar.length, 0)
  assert.equal(e(2016).modificar[0]?.sl, 2013)
})

caso('trailing de uma venda desce o SL', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ direcao: 'sell', preco_entrada: 2020, sl: 2030, gestao: gestao({ trailing_distancia: 4 }) })],
    precos: { XAUUSD: { symbol: 'XAUUSD', bid: 2009.7, ask: 2010 } }, // venda fecha ao ASK 2010
  }))
  assert.equal(d.modificar[0]?.sl, 2014)
})

caso('break-even por distância: SL vai à entrada + offset, uma vez', () => {
  const d = avaliarTick(ent({ posicoes: [pos({ sl: 1990, gestao: gestao({ be_gatilho: 10, be_offset: 0.5 }) })], precos: px(2011) }))
  assert.deepEqual([d.modificar[0]?.sl, d.modificar[0]?.motivo, d.modificar[0]?.beFeito], [2000.5, 'break_even', true])
  const feito = avaliarTick(ent({ posicoes: [pos({ sl: 1990, gestao: gestao({ be_gatilho: 10, be_feito: true }) })], precos: px(2011) }))
  assert.equal(feito.modificar.length, 0)
})

caso('TP parcial: TP1 50% de 1 lote fecha 0,5 ao nível e o resto continua', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ tp: 2030, gestao: gestao({ volume_inicial: 1, tps: [{ preco: 2010, pct: 50, atingido: false }, { preco: 2020, pct: 25, atingido: false }] }) })],
    precos: px(2012),
  }))
  assert.equal(d.parciais.length, 1)
  assert.deepEqual([d.parciais[0].volume, d.parciais[0].preco, d.parciais[0].pnl], [0.5, 2010, 500])
  assert.deepEqual(d.parciais[0].tps?.map((t) => t.atingido), [true, false])
  assert.equal(d.fechar.length, 0)
  assert.equal(d.estado.saldo, 10500)
})

caso('TP parcial + break-even no TP1 no mesmo preço', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ sl: 1990, gestao: gestao({ volume_inicial: 1, be_no_tp1: true, tps: [{ preco: 2010, pct: 50, atingido: false }] }) })],
    precos: px(2012),
  }))
  assert.equal(d.parciais.length, 1)
  assert.deepEqual([d.modificar[0]?.sl, d.modificar[0]?.motivo], [2000, 'break_even'])
})

caso('gap salta TP1 e TP2: fecham os dois, por ordem', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ gestao: gestao({ volume_inicial: 1, tps: [{ preco: 2010, pct: 30, atingido: false }, { preco: 2020, pct: 30, atingido: false }] }) })],
    precos: px(2025),
  }))
  assert.deepEqual(d.parciais.map((p) => [p.volume, p.preco]), [[0.3, 2010], [0.3, 2020]])
})

caso('último TP a 100% fecha a posição inteira como TP', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ gestao: gestao({ volume_inicial: 1, tps: [{ preco: 2010, pct: 50, atingido: true }, { preco: 2020, pct: 50, atingido: false }] }), volume: 0.5 })],
    precos: px(2021),
  }))
  assert.equal(d.parciais.length, 0)
  assert.deepEqual([d.fechar[0]?.motivo, d.fechar[0]?.preco, d.fechar[0]?.pnl], ['tp', 2020, 1000])
})

caso('SL e TP1 no mesmo gap: vale o SL e não há parcial', () => {
  const d = avaliarTick(ent({
    posicoes: [pos({ sl: 2011, gestao: gestao({ volume_inicial: 1, tps: [{ preco: 2005, pct: 50, atingido: false }] }) })],
    precos: px(2010),
  }))
  assert.equal(d.fechar[0]?.motivo, 'sl')
  assert.equal(d.parciais.length, 0)
})

caso('OCO: uma perna dispara e a irmã sai no mesmo tick', () => {
  const d = avaliarTick(ent({
    ordens: [
      ordem({ id: 'cima', tipo: 'stop', preco: 2005, oco_grupo: 'g1' }),
      ordem({ id: 'baixo', direcao: 'sell', tipo: 'stop', preco: 1995, oco_grupo: 'g1' }),
    ],
    precos: px(2006),
  }))
  assert.deepEqual(d.executar.map((x) => x.ordemId), ['cima'])
  assert.deepEqual(d.cancelarOco, ['baixo'])
})

caso('validarGestao recusa TPs fora de ordem e % acima de 100', () => {
  const r1 = validarGestao(XAU, 'buy', 2000, 1, 1990, null, { tps: [{ preco: 2020, pct: 50, atingido: false }, { preco: 2010, pct: 50, atingido: false }] })
  assert.equal(r1.ok, false)
  const r2 = validarGestao(XAU, 'buy', 2000, 1, 1990, null, { tps: [{ preco: 2010, pct: 60, atingido: false }, { preco: 2020, pct: 50, atingido: false }] })
  assert.equal(r2.ok, false)
  const r3 = validarGestao(XAU, 'buy', 2000, 0.01, 1990, null, { tps: [{ preco: 2010, pct: 50, atingido: false }] })
  assert.equal(r3.ok, false) // 50% de 0,01 < lote mínimo
  const r4 = validarGestao(XAU, 'sell', 2000, 1, 2010, 1970, { tps: [{ preco: 1990, pct: 50, atingido: false }], trailing_distancia: 3, be_gatilho: 5, be_offset: 0.5 })
  assert.equal(r4.ok, true)
})

caso('distância em pips / $ convertida para preço', () => {
  assert.equal(distanciaEmPreco(EUR, 15, 'pips', 1, 1.1, {}), 0.0015)
  assert.equal(distanciaEmPreco(XAU, 30, 'usd', 0.1, 2000, {}), 3) // 0,1 lote de ouro: 1 $ de preço = 10 $
})

caso('fechar ganhadoras / perdedoras / por símbolo', () => {
  const ps = [pos({ id: 'g', preco_entrada: 1990 }), pos({ id: 'p', preco_entrada: 2010 }), pos({ id: 'e', symbol: 'EURUSD', preco_entrada: 1.1 })]
  const pr = entrada({}).precos
  assert.deepEqual(selecionarParaFecho(ps, 'ganhadoras', simbolos, pr).map((x) => x.id), ['g'])
  assert.deepEqual(selecionarParaFecho(ps, 'perdedoras', simbolos, pr).map((x) => x.id), ['p']) // EURUSD a zero não é nem uma nem outra
  assert.deepEqual(selecionarParaFecho(ps, 'simbolo', simbolos, pr, 'EURUSD').map((x) => x.id), ['e'])
})

caso('alerta de preço: condição pelo lado de agora, dispara ao cruzar', () => {
  assert.equal(condicaoDoAlerta(2010, 2000), 'acima')
  assert.equal(condicaoDoAlerta(1990, 2000), 'abaixo')
  const a = { id: 'a', symbol: 'XAUUSD', condicao: 'acima' as const, preco: 2010 }
  assert.equal(alertaDispara(a, px(2009.9).XAUUSD), false)
  assert.equal(alertaDispara(a, px(2010).XAUUSD), true)
})

console.log(`\n${casos} casos, todos certos.`)
