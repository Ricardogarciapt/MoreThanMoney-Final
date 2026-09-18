/**
 * Gestão automática num toque (Auto BE, Auto Trailing, Trailing já) — valores por defeito por
 * classe, conversão pips/pontos → preço, níveis de BE/trailing e os pedidos `gestao` que o ecrã
 * envia (têm de preservar o resto da gestão e passar em `validarGestao`, e o motor tem de fazer
 * com eles o que o botão promete).
 *
 *   npx tsx lib/mtmfunded/__tests__/gestao-auto.check.ts
 */
import assert from 'node:assert/strict'
import type { Simbolo } from '../simulado/matematica'
import { GESTAO_VAZIA, decidirGestao, validarGestao, type Gestao } from '../simulado/avancadas'
import {
  arredondarBonito, classeGestao, emPreco, emUnidades, estadoGestaoAuto, nivelBreakEven, nivelTrailing,
  pedidoAutoBe, pedidoAutoTrailing, pedidoTrailingJa, precoDoGatilho, previsaoTrailingJa, unidadeGestao,
  validarValores, valoresPorDefeito,
} from '../simulado/gestao-auto'

const base = { contract_size: 100, spread_pontos: 0, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100 }
const XAU: Simbolo = { ...base, symbol: 'XAUUSD', classe: 'metal', digits: 2, pip_size: 0.1 }
const XAG: Simbolo = { ...base, symbol: 'XAGUSD', classe: 'metal', digits: 3, pip_size: 0.1, contract_size: 5000 }
const EUR: Simbolo = { ...base, symbol: 'EURUSD', classe: 'forex', digits: 5, pip_size: 0.0001, contract_size: 100000 }
const JPY: Simbolo = { ...base, symbol: 'USDJPY', classe: 'forex', digits: 3, pip_size: 0.01, contract_size: 100000 }
const US30: Simbolo = { ...base, symbol: 'US30', classe: 'indice', digits: 2, pip_size: 0.01, contract_size: 1 }
const US500: Simbolo = { ...base, symbol: 'US500', classe: 'indice', digits: 2, pip_size: 0.01, contract_size: 1 }
const BTC: Simbolo = { ...base, symbol: 'BTCUSD', classe: 'cripto', digits: 2, pip_size: 0.01, contract_size: 1 }
const ONDO: Simbolo = { ...base, symbol: 'ONDOUSD', classe: 'cripto', digits: 5, pip_size: 0.01, contract_size: 1 }

// ── 1. classes e unidades ──────────────────────────────────────────────────────
{
  assert.equal(classeGestao(XAU), 'ouro')
  assert.equal(classeGestao(EUR), 'forex')
  assert.equal(classeGestao(US30), 'indice')
  assert.equal(classeGestao(BTC), 'cripto')
  assert.equal(classeGestao(XAG), 'outro', 'prata não é ouro')
  // Sem classe do catálogo (contas da corretora): pelo nome.
  assert.equal(classeGestao({ symbol: 'GBPJPY' }), 'forex')
  assert.equal(classeGestao({ symbol: 'BTCUSD' }), 'cripto', 'BTCUSD tem 6 letras mas não é forex')
  assert.equal(classeGestao({ symbol: 'GER40' }), 'indice')
  assert.equal(classeGestao({ symbol: 'XAUUSD.r' }), 'ouro')
  assert.equal(classeGestao({ symbol: 'XAGUSD' }), 'outro')

  assert.deepEqual(unidadeGestao(XAU), { tamanho: 0.1, nome: 'pips' })
  assert.deepEqual(unidadeGestao(EUR), { tamanho: 0.0001, nome: 'pips' })
  assert.deepEqual(unidadeGestao(JPY), { tamanho: 0.01, nome: 'pips' })
  assert.deepEqual(unidadeGestao(US30), { tamanho: 1, nome: 'pontos' }, 'índices em pontos, não no pip 0,01 do catálogo')
  assert.deepEqual(unidadeGestao(BTC), { tamanho: 1, nome: 'pontos' })
  assert.deepEqual(unidadeGestao(XAG), { tamanho: 0.01, nome: 'pips' }, 'prata: pip da casa (0,01)')

  assert.equal(emPreco(XAU, 30), 3)
  assert.equal(emPreco(EUR, 15), 0.0015)
  assert.equal(emPreco(US30, 66), 66)
  assert.equal(emUnidades(XAU, 3), 30)
  assert.equal(emUnidades(EUR, 0.0015), 15)
  assert.equal(emUnidades(ONDO, 0.00117), 0.00117)
  console.log('ok  classes e unidades')
}

// ── 2. valores por defeito ─────────────────────────────────────────────────────
{
  assert.deepEqual(valoresPorDefeito(XAU, 2650), { beGatilho: 30, beOffset: 2, trailAtivacao: 50, trailDistancia: 30 }, 'ouro fixo, mesmo com preço')
  assert.deepEqual(valoresPorDefeito(EUR, 1.08), { beGatilho: 15, beOffset: 1, trailAtivacao: 20, trailDistancia: 15 })
  assert.deepEqual(valoresPorDefeito(US30, 44000), { beGatilho: 66, beOffset: 6.6, trailAtivacao: 110, trailDistancia: 66 }, 'US30 proporcional')
  assert.deepEqual(valoresPorDefeito(US500, 5800), { beGatilho: 8.7, beOffset: 0.87, trailAtivacao: 15, trailDistancia: 8.7 }, 'US500 proporcional (30 pts seria 0,5%)')
  assert.deepEqual(valoresPorDefeito(BTC, 60000), { beGatilho: 180, beOffset: 18, trailAtivacao: 300, trailDistancia: 180 }, 'cripto = o dobro')
  assert.deepEqual(valoresPorDefeito(US30), { beGatilho: 30, beOffset: 3, trailAtivacao: 50, trailDistancia: 30 }, 'sem preço: fixos da classe')
  assert.deepEqual(valoresPorDefeito(BTC, null), { beGatilho: 150, beOffset: 15, trailAtivacao: 250, trailDistancia: 150 })
  // Todos passam na regra do motor: folga < gatilho.
  for (const [s, p] of [[XAU, 2650], [EUR, 1.08], [US30, 44000], [BTC, 60000], [ONDO, 0.39], [XAG, 31]] as const) {
    const v = valoresPorDefeito(s, p)
    assert.ok(v.beOffset < v.beGatilho && v.trailDistancia > 0 && v.beGatilho > 0, `defeitos válidos em ${s.symbol}`)
    assert.ok(validarValores(v), `validarValores aceita os defeitos de ${s.symbol}`)
  }
  assert.equal(arredondarBonito(66.3), 66)
  assert.equal(arredondarBonito(152), 150)
  assert.equal(arredondarBonito(8.7), 8.7)
  assert.equal(arredondarBonito(0.00117), 0.0012)
  assert.equal(validarValores({ beGatilho: '10', beOffset: '10', trailAtivacao: 0, trailDistancia: 5 }), null, 'folga = gatilho recusada')
  assert.equal(validarValores({ beGatilho: 10, beOffset: 1, trailAtivacao: 0, trailDistancia: 0 }), null, 'distância 0 recusada')
  assert.deepEqual(validarValores({ beGatilho: '12,5', beOffset: '1', trailAtivacao: '0', trailDistancia: '8' }), { beGatilho: 12.5, beOffset: 1, trailAtivacao: 0, trailDistancia: 8 }, 'vírgula decimal')
  console.log('ok  valores por defeito')
}

// ── 3. níveis ──────────────────────────────────────────────────────────────────
{
  assert.equal(nivelBreakEven('buy', 2650, 0.2, 2), 2650.2)
  assert.equal(nivelBreakEven('sell', 2650, 0.2, 2), 2649.8)
  assert.equal(nivelBreakEven('buy', 1.08, -1, 5), 1.08, 'folga negativa não conta')
  assert.equal(nivelTrailing('buy', 2660, 3, 2), 2657)
  assert.equal(nivelTrailing('sell', 2640, 3, 2), 2643)
  assert.equal(precoDoGatilho('buy', 2650, 3, 2), 2653)
  assert.equal(precoDoGatilho('sell', 1.08, 0.0015, 5), 1.0785)
  assert.deepEqual(previsaoTrailingJa('buy', 2660, 2640, 3, 2, 0.1), { nivel: 2657, mexe: true })
  assert.deepEqual(previsaoTrailingJa('buy', 2660, 2658, 3, 2, 0.1), { nivel: 2657, mexe: false }, 'SL já mais apertado: não alarga')
  assert.deepEqual(previsaoTrailingJa('sell', 2640, null, 3, 2, 0.1), { nivel: 2643, mexe: true }, 'sem SL: passa a ter')
  console.log('ok  níveis de BE e trailing')
}

// ── 4. pedidos: preservam o resto e o validador aceita ────────────────────────
const comTps: Gestao = { ...GESTAO_VAZIA, tps: [{ preco: 2660, pct: 50, atingido: false }], volume_inicial: 0.1 }
{
  const v = valoresPorDefeito(XAU, 2650)
  const be = pedidoAutoBe(comTps, true, XAU, v)
  assert.deepEqual([be.be_gatilho, be.be_offset, be.trailing_distancia], [3, 0.2, null])
  assert.deepEqual(be.tps, [{ preco: 2660, pct: 50, atingido: false }], 'TPs parciais ficam')
  assert.ok(validarGestao(XAU, 'buy', 2650, 0.1, 2640, 2680, be).ok, 'Auto BE passa na validação')

  const armado: Gestao = { ...comTps, be_gatilho: 3, be_offset: 0.2 }
  const tr = pedidoAutoTrailing(armado, true, XAU, v)
  assert.deepEqual([tr.trailing_distancia, tr.trailing_ativacao, tr.be_gatilho, tr.be_offset], [3, 5, 3, 0.2], 'ligar o trailing não mexe no BE')
  assert.ok(validarGestao(XAU, 'buy', 2650, 0.1, 2640, 2680, tr).ok)

  const ja = pedidoTrailingJa(armado, XAU, v)
  assert.deepEqual([ja.trailing_distancia, ja.trailing_ativacao], [3, null], 'trailing já = sem ativação')

  const semBe = pedidoAutoBe({ ...armado, be_no_tp1: true, trailing_distancia: 3, trailing_ativacao: 5 }, false, XAU, v)
  assert.deepEqual([semBe.be_gatilho, semBe.be_no_tp1, semBe.be_offset, semBe.trailing_distancia], [null, false, 0, 3], 'desligar o BE não desliga o trailing')
  const semTr = pedidoAutoTrailing({ ...armado, trailing_distancia: 3, trailing_ativacao: 5 }, false, XAU, v)
  assert.deepEqual([semTr.trailing_distancia, semTr.trailing_ativacao, semTr.be_gatilho], [null, null, 3])

  // Índices: 66 pontos são 66 de preço (não 0,66).
  const ind = pedidoAutoTrailing(GESTAO_VAZIA, true, US30, valoresPorDefeito(US30, 44000))
  assert.deepEqual([ind.trailing_distancia, ind.trailing_ativacao], [66, 110])
  // Cripto barata: a distância nunca fica abaixo de 1 pip do catálogo (o validador recusava).
  const barata = pedidoTrailingJa(GESTAO_VAZIA, ONDO, valoresPorDefeito(ONDO, 0.39))
  assert.equal(barata.trailing_distancia, 0.01)
  assert.ok(validarGestao(ONDO, 'buy', 0.39, 10, null, null, barata).ok)
  // Folga igual ou maior do que o gatilho (valores à mão) cai para zero em vez de ser recusada.
  const folgaGrande = pedidoAutoBe(GESTAO_VAZIA, true, XAU, { beGatilho: 10, beOffset: 12, trailAtivacao: 0, trailDistancia: 5 })
  assert.equal(folgaGrande.be_offset, 0)
  console.log('ok  pedidos preservam a gestão e passam no validador')
}

// ── 5. estado dos botões/etiquetas ────────────────────────────────────────────
{
  assert.deepEqual(estadoGestaoAuto(GESTAO_VAZIA, 'buy', 2650, 2655), { be: 'off', trailingModo: 'off', trailing: 'off' })
  const g: Gestao = { ...GESTAO_VAZIA, be_gatilho: 3, trailing_distancia: 3, trailing_ativacao: 5 }
  assert.deepEqual(estadoGestaoAuto(g, 'buy', 2650, 2654), { be: 'armado', trailingModo: 'auto', trailing: 'a_espera' })
  assert.deepEqual(estadoGestaoAuto(g, 'buy', 2650, 2655), { be: 'armado', trailingModo: 'auto', trailing: 'ativo' })
  assert.deepEqual(estadoGestaoAuto(g, 'sell', 2650, 2645), { be: 'armado', trailingModo: 'auto', trailing: 'ativo' })
  assert.deepEqual(estadoGestaoAuto({ ...g, be_feito: true, trailing_ativacao: null }, 'buy', 2650, null), { be: 'feito', trailingModo: 'ja', trailing: 'ativo' })
  assert.equal(estadoGestaoAuto({ ...GESTAO_VAZIA, be_no_tp1: true }, 'buy', 1, 1).be, 'armado', 'BE no TP1 conta como Auto BE ligado')
  console.log('ok  estado dos botões')
}

// ── 6. o motor faz o que o botão promete ──────────────────────────────────────
{
  const precos = { XAUUSD: { symbol: 'XAUUSD', bid: 2653.5, ask: 2653.7 } }
  const pos = (gestao: Gestao, sl: number | null = 2640) => ({ id: 'p', symbol: 'XAUUSD', direcao: 'buy' as const, volume: 0.1, preco_entrada: 2650, sl, tp: 2680, gestao })
  const v = valoresPorDefeito(XAU)
  const be = validarGestao(XAU, 'buy', 2650, 0.1, 2640, 2680, pedidoAutoBe(GESTAO_VAZIA, true, XAU, v))
  assert.ok(be.ok)
  const d1 = decidirGestao(pos(be.gestao), XAU, precos.XAUUSD, precos)
  assert.deepEqual([d1.novoSl, d1.motivoSl, d1.beFeito], [nivelBreakEven('buy', 2650, 0.2, 2), 'break_even', true], 'Auto BE: +3,5 ≥ gatilho 3 → SL na entrada + 0,2')

  const tr = validarGestao(XAU, 'buy', 2650, 0.1, 2640, 2680, pedidoAutoTrailing(GESTAO_VAZIA, true, XAU, v))
  assert.ok(tr.ok)
  assert.equal(decidirGestao(pos(tr.gestao), XAU, precos.XAUUSD, precos).novoSl, null, 'Auto trailing: +3,5 < ativação 5 → espera')
  const longe = { XAUUSD: { symbol: 'XAUUSD', bid: 2656, ask: 2656.2 } }
  assert.equal(decidirGestao(pos(tr.gestao), XAU, longe.XAUUSD, longe).novoSl, nivelTrailing('buy', 2656, 3, 2), 'Auto trailing: +6 → SL a 3 do preço')

  const ja = validarGestao(XAU, 'buy', 2650, 0.1, 2640, 2680, pedidoTrailingJa(GESTAO_VAZIA, XAU, v))
  assert.ok(ja.ok)
  const prev = previsaoTrailingJa('buy', 2653.5, 2640, 3, 2, XAU.pip_size)
  const d3 = decidirGestao(pos(ja.gestao), XAU, precos.XAUUSD, precos)
  assert.deepEqual([d3.novoSl, prev.mexe], [prev.nivel, true], 'Trailing já: o motor põe o SL onde a previsão diz')
  console.log('ok  o motor executa o que os botões pedem')
}
