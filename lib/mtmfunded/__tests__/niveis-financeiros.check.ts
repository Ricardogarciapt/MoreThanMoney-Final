/**
 * SL/TP em dinheiro e lote por risco — contas feitas à mão para símbolos de moedas de cotação
 * diferentes (USD, JPY, EUR, GBX). A prova de fogo de cada conversão: pôr o SL pelo dinheiro e
 * medir com `lucroUsd` (a fórmula de fecho) — tem de dar o mesmo dinheiro.
 *
 *   npx tsx lib/mtmfunded/__tests__/niveis-financeiros.check.ts
 */
import { type Simbolo, type MapaPrecos, lucroUsd } from '../simulado/matematica'
import {
  precoDeValor, precoDePercentagem, valorDoNivel, volumePorRisco, percentagemDeUsd, usdPorUnidadeDePreco,
} from '../simulado/niveis-financeiros'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}
const base = { spread_pontos: 0, comissao_lote: 0, alavancagem_max: 100 }

const XAU: Simbolo = { ...base, symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, volume_min: 0.01, volume_step: 0.01, volume_max: 20 }
const EUR: Simbolo = { ...base, symbol: 'EURUSD', classe: 'forex', digits: 5, contract_size: 100000, pip_size: 0.0001, volume_min: 0.01, volume_step: 0.01, volume_max: 50 }
const JPY: Simbolo = { ...base, symbol: 'USDJPY', classe: 'forex', digits: 3, contract_size: 100000, pip_size: 0.01, volume_min: 0.01, volume_step: 0.01, volume_max: 50 }
const GER: Simbolo = { ...base, symbol: 'GER40', classe: 'indice', moeda_lucro: 'EUR', digits: 1, contract_size: 1, pip_size: 1, volume_min: 0.1, volume_step: 0.1, volume_max: 100 }
const VOD: Simbolo = { ...base, symbol: 'VOD.L', classe: 'acao', moeda_lucro: 'GBX', digits: 2, contract_size: 1, pip_size: 0.01, volume_min: 1, volume_step: 1, volume_max: 10000 }

const precos: MapaPrecos = {
  XAUUSD: { symbol: 'XAUUSD', bid: 2400, ask: 2400 },
  EURUSD: { symbol: 'EURUSD', bid: 1.1, ask: 1.1 },
  USDJPY: { symbol: 'USDJPY', bid: 150, ask: 150 },
  GBPUSD: { symbol: 'GBPUSD', bid: 1.25, ask: 1.25 },
  GER40: { symbol: 'GER40', bid: 18000, ask: 18000 },
  'VOD.L': { symbol: 'VOD.L', bid: 70, ask: 70 },
}

// ── XAUUSD: 0.10 lote → 10 $ por dólar de preço ────────────────────────────
eq('XAU: 10 $ por unidade a 0.1', usdPorUnidadeDePreco(XAU, 0.1, precos), 10)
eq('XAU compra: SL de 50 $ → 5 abaixo', precoDeValor(XAU, 'buy', 'sl', 2400, 0.1, 50, precos), 2395)
eq('XAU compra: TP de 100 $ → 10 acima', precoDeValor(XAU, 'buy', 'tp', 2400, 0.1, 100, precos), 2410)
eq('XAU venda: SL acima', precoDeValor(XAU, 'sell', 'sl', 2400, 0.1, 50, precos), 2405)
eq('XAU venda: TP abaixo', precoDeValor(XAU, 'sell', 'tp', 2400, 0.1, 100, precos), 2390)
eq('XAU: SL a 1 % de 10 000 $ = 100 $ → 10 abaixo', precoDePercentagem(XAU, 'buy', 'sl', 2400, 0.1, 1, 10000, precos), 2390)
eq('XAU: ida e volta pelo lucroUsd', lucroUsd(XAU, 'buy', 0.1, 2400, 2395, precos), -50)
eq('XAU: valor do nível (sempre positivo)', valorDoNivel(XAU, 'buy', 2400, 2395, 0.1, precos), 50)
eq('XAU: 100 $ em 10 000 = 1 %', percentagemDeUsd(100, 10000), 1)
eq('XAU: sem saldo não há %', precoDePercentagem(XAU, 'buy', 'sl', 2400, 0.1, 1, null, precos), null)
eq('XAU: dinheiro maior que o preço → null (nunca SL negativo)', precoDeValor(XAU, 'buy', 'sl', 2400, 0.01, 10_000, precos), null)

const rXau = volumePorRisco(XAU, 2400, 2390, 100, precos)
eq('XAU risco 100 $ com SL 10 → 0.1 lote', rXau.volume, 0.1)
eq('XAU risco real', rXau.riscoReal, 100)
eq('XAU sem limite', rXau.limitado, null)
const rXauBaixo = volumePorRisco(XAU, 2400, 2390, 105, precos)
eq('XAU 105 $ → arredonda PARA BAIXO a 0.1 (0.105)', rXauBaixo.volume, 0.1)
const rXauMin = volumePorRisco(XAU, 2400, 2390, 5, precos)
eq('XAU 5 $ com SL 10 → mínimo', rXauMin.volume, 0.01)
eq('XAU mínimo assinalado', rXauMin.limitado, 'min')
eq('XAU mínimo: risco real 10 $ (> pedido)', rXauMin.riscoReal, 10)
const rXauMax = volumePorRisco(XAU, 2400, 2399, 1_000_000, precos)
eq('XAU risco enorme → máximo 20', rXauMax.volume, 20)
eq('XAU máximo assinalado', rXauMax.limitado, 'max')
eq('XAU sem SL → pede o SL', volumePorRisco(XAU, 2400, null, 100, precos).motivo, 'sem_sl')

// ── EURUSD: 1 lote → 10 $ por pip ──────────────────────────────────────────
eq('EUR compra: SL de 100 $ a 1 lote → 10 pips', precoDeValor(EUR, 'buy', 'sl', 1.1, 1, 100, precos), 1.099)
eq('EUR venda: TP de 30 $ a 0.1 → 30 pips', precoDeValor(EUR, 'sell', 'tp', 1.1, 0.1, 30, precos), 1.097)
eq('EUR ida e volta', lucroUsd(EUR, 'sell', 0.1, 1.1, 1.097, precos), 30)
const rEur = volumePorRisco(EUR, 1.1, 1.098, 200, precos)
eq('EUR risco 200 $ com 20 pips → 1 lote', rEur.volume, 1)
eq('EUR 2 % de 10 000 = 200 $', precoDePercentagem(EUR, 'buy', 'sl', 1.1, 1, 2, 10000, precos), 1.098)

// ── USDJPY: lucro em JPY convertido pelo próprio par ───────────────────────
eq('JPY: 0.1 lote = 66.67 $ por iene de preço', Math.round(usdPorUnidadeDePreco(JPY, 0.1, precos)! * 100) / 100, 66.67)
eq('JPY compra: SL 100 $ a 0.1 → 1.5 abaixo', precoDeValor(JPY, 'buy', 'sl', 150, 0.1, 100, precos), 148.5)
eq('JPY ida e volta', lucroUsd(JPY, 'buy', 0.1, 150, 148.5, precos), -100)
eq('JPY risco 100 $ com SL 1.5 → 0.1', volumePorRisco(JPY, 150, 148.5, 100, precos).volume, 0.1)
eq('JPY sem USDJPY no mapa → sem conversão', volumePorRisco(JPY, 150, 148.5, 100, {}).motivo, 'sem_conversao')

// ── GER40 cotado em EUR ────────────────────────────────────────────────────
eq('GER40: 1 lote = 1.1 $ por ponto', usdPorUnidadeDePreco(GER, 1, precos), 1.1)
eq('GER40 compra: SL 110 $ a 1 lote → 100 pontos', precoDeValor(GER, 'buy', 'sl', 18000, 1, 110, precos), 17900)
eq('GER40 venda: TP 55 $ a 0.5 → 100 pontos abaixo', precoDeValor(GER, 'sell', 'tp', 18000, 0.5, 55, precos), 17900)
const rGer = volumePorRisco(GER, 18000, 17900, 250, precos)
eq('GER40 250 $ / 110 $ por lote → 2.2', rGer.volume, 2.2)
eq('GER40 risco real 242 $', rGer.riscoReal, 242)
eq('GER40 risco pequeno → mínimo 0.1', volumePorRisco(GER, 18000, 17900, 1, precos).limitado, 'min')

// ── Acção de Londres em PENCE (GBX): 100 pence = 1 libra ───────────────────
eq('VOD: 800 acções = 10 $ por penny', usdPorUnidadeDePreco(VOD, 800, precos), 10)
eq('VOD compra: SL 50 $ com 800 acções → 5 pence abaixo', precoDeValor(VOD, 'buy', 'sl', 70, 800, 50, precos), 65)
eq('VOD ida e volta', lucroUsd(VOD, 'buy', 800, 70, 65, precos), -50)
const rVod = volumePorRisco(VOD, 70, 65, 50, precos)
eq('VOD risco 50 $ com 5 pence → 800 acções', rVod.volume, 800)
eq('VOD risco 50.01 $ → continua 800 (passo 1, para baixo)', volumePorRisco(VOD, 70, 65, 50.01, precos).volume, 800)
eq('VOD risco enorme → máximo', volumePorRisco(VOD, 70, 65, 1e9, precos).limitado, 'max')
eq('VOD sem GBPUSD → sem conversão', volumePorRisco(VOD, 70, 65, 50, { 'VOD.L': precos['VOD.L'] }).motivo, 'sem_conversao')

console.log(`${ok} ok, ${mau} falharam`)
if (mau) process.exit(1)
