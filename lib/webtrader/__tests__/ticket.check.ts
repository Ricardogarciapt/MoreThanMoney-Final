import assert from 'node:assert/strict'
import { modoNiveisEfectivo, modoNiveisPermitido } from '../ticket'
import { volumePorRisco } from '@/lib/mtmfunded/simulado/niveis-financeiros'
import type { MapaPrecos, Simbolo } from '@/lib/mtmfunded/simulado/matematica'

/**
 * Ticket no modo «Risco $/%»: SL em distância e o lote a sair do risco.
 * Correr: npx tsx lib/webtrader/__tests__/ticket.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('modo risco: SL/TP em $ ou % passam a Pips (acabou o círculo «Define o SL»)', () => {
  assert.equal(modoNiveisEfectivo('risco_usd', 'usd'), 'pips')
  assert.equal(modoNiveisEfectivo('risco_pct', 'pct'), 'pips')
  assert.equal(modoNiveisEfectivo('risco_usd', 'preco'), 'preco')
  assert.equal(modoNiveisEfectivo('risco_usd', 'pips'), 'pips')
  assert.equal(modoNiveisEfectivo('lote', 'usd'), 'usd', 'no lote o $ do SL continua a existir')
  assert.equal(modoNiveisPermitido('risco_usd', 'usd'), false)
  assert.equal(modoNiveisPermitido('risco_pct', 'pct'), false)
  assert.equal(modoNiveisPermitido('risco_usd', 'pips'), true)
  assert.equal(modoNiveisPermitido('lote', 'pct'), true)
})

const base = { spread_pontos: 0, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100 }
const OURO: Simbolo = { ...base, symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1 }
const EURUSD: Simbolo = { ...base, symbol: 'EURUSD', classe: 'forex', digits: 5, contract_size: 100000, pip_size: 0.0001 }
const US30: Simbolo = { ...base, symbol: 'US30', classe: 'indice', digits: 1, contract_size: 1, pip_size: 1, volume_min: 0.1, volume_step: 0.1 }
const precos: MapaPrecos = {}

caso('ouro: risco 10 $, SL a 50 pips (5,00 $ de preço) → 0,02 lotes', () => {
  // 1 lote = 100 oz → 5,00 $ × 100 = 500 $ por lote; 10 / 500 = 0,02.
  const r = volumePorRisco(OURO, 2650, 2645, 10, precos)
  assert.equal(r.volume, 0.02)
  assert.equal(r.limitado, null)
  assert.ok(Math.abs((r.riscoReal ?? 0) - 10) < 1e-6)
})

caso('ouro: arredonda PARA BAIXO ao passo (nunca arrisca mais do que o pedido)', () => {
  // 12 $ / 500 $ = 0,024 → 0,02 (e não 0,024 ou 0,03).
  const r = volumePorRisco(OURO, 2650, 2645, 12, precos)
  assert.equal(r.volume, 0.02)
  assert.ok((r.riscoReal ?? 99) <= 12)
})

caso('forex: risco 100 $, SL a 20 pips no EURUSD → 0,5 lotes', () => {
  // 20 pips = 0,0020; 1 lote = 100 000 → 200 $ por lote; 100 / 200 = 0,5.
  const r = volumePorRisco(EURUSD, 1.1, 1.098, 100, precos)
  assert.equal(r.volume, 0.5)
})

caso('índice: risco 50 $, SL a 100 pontos no US30 → 0,5 lotes (passo 0,1)', () => {
  const r = volumePorRisco(US30, 42000, 41900, 50, precos)
  assert.equal(r.volume, 0.5)
  // 37 $ → 0,37 → para baixo ao passo 0,1 = 0,3.
  assert.equal(volumePorRisco(US30, 42000, 41900, 37, precos).volume, 0.3)
})

caso('abaixo do mínimo: fica no mínimo e AVISA (risco real acima do pedido)', () => {
  // 1 $ no ouro com SL a 50 pips = 0,002 lotes < 0,01.
  const r = volumePorRisco(OURO, 2650, 2645, 1, precos)
  assert.equal(r.volume, 0.01)
  assert.equal(r.limitado, 'min')
  assert.ok((r.riscoReal ?? 0) > 1, 'o ticket diz o risco real, que é maior do que o pedido')
})

caso('sem SL ou sem risco: diz porquê (sem lote inventado)', () => {
  assert.equal(volumePorRisco(OURO, 2650, null, 10, precos).motivo, 'sem_sl')
  assert.equal(volumePorRisco(OURO, 2650, 2645, null, precos).motivo, 'sem_risco')
  assert.equal(volumePorRisco(OURO, 2650, 2650, 10, precos).motivo, 'sem_sl')
})

console.log(`\n${n} verificações OK`)
