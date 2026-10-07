/**
 * AURUM FLOW → MESTRE SIM (07/10) — o símbolo da casa, a decisão do webhook e a ligação da fonte
 * `aurum` à estratégia `aurum-flow`. Puro: sem base, sem rede.
 *
 *   npx tsx lib/mestres/__tests__/aurum.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirAurumParaMestre, simboloDaCasaParaPerp, type EntradaDecisaoAurum } from '../aurum'
import { ESTRATEGIA_DO_WEBHOOK } from '../servidor/sinal-mestre'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; void nome }

// ── símbolo ──────────────────────────────────────────────────────────────────
caso('perpétuo Bybit → par USD da casa', () => {
  assert.equal(simboloDaCasaParaPerp('XRPUSDT.P'), 'XRPUSD')
  assert.equal(simboloDaCasaParaPerp('BYBIT:ETHUSDT.P'), 'ETHUSD')
  assert.equal(simboloDaCasaParaPerp('BTCUSDT'), 'BTCUSD')
  assert.equal(simboloDaCasaParaPerp('solusdc.p'), 'SOLUSD')
  assert.equal(simboloDaCasaParaPerp('ETHUSD'), 'ETHUSD')
})
caso('abreviaturas PU Prime confirmadas no catálogo', () => {
  assert.equal(simboloDaCasaParaPerp('DOGEUSDT.P'), 'DOGUSD')
  assert.equal(simboloDaCasaParaPerp('LINKUSDT.P'), 'LNKUSD')
  assert.equal(simboloDaCasaParaPerp('AVAXUSDT.P'), 'AVAUSD')
  assert.equal(simboloDaCasaParaPerp('NEARUSDT.P'), 'NERUSD')
})
caso('o que não é cripto contra dólar não tem símbolo', () => {
  assert.equal(simboloDaCasaParaPerp('XAUEUR'), null)
  assert.equal(simboloDaCasaParaPerp(''), null)
  assert.equal(simboloDaCasaParaPerp(null), null)
  assert.equal(simboloDaCasaParaPerp('BTCETH'), null)
})

// ── decisão ──────────────────────────────────────────────────────────────────
const base: EntradaDecisaoAurum = {
  aurum: true, classe: 'crypto_perp', tipoSinal: 'entry', ticker: 'XRPUSDT.P', direcao: 'sell',
  entrada: 1.43, sl: 1.46, stopsSaos: true, perpsGate: { allow: true, reason: '' },
}
caso('entrada Aurum com stop e gate aberto → vai, no símbolo da casa', () => {
  assert.deepEqual(decidirAurumParaMestre(base), { vai: true, simbolo: 'XRPUSD' })
})
caso('o perps-gate (trend-guard) trava também a mestre', () => {
  const d = decidirAurumParaMestre({ ...base, perpsGate: { allow: false, reason: 'BTC 4h contratendência' } })
  assert.equal(d.vai, false)
  assert.ok(d.motivo?.startsWith('perps-gate'))
})
caso('sem stop não se abre numa conta que outros seguem', () => {
  assert.equal(decidirAurumParaMestre({ ...base, sl: null }).vai, false)
})
caso('seguimentos, não-cripto, sem direcção e alertas de outras fontes não vão', () => {
  assert.equal(decidirAurumParaMestre({ ...base, tipoSinal: 'followup' }).vai, false)
  assert.equal(decidirAurumParaMestre({ ...base, classe: 'gold_btc' }).vai, false)
  assert.equal(decidirAurumParaMestre({ ...base, direcao: null }).vai, false)
  assert.equal(decidirAurumParaMestre({ ...base, aurum: false }).vai, false)
  assert.equal(decidirAurumParaMestre({ ...base, stopsSaos: false }).vai, false)
})

// ── ligação fonte → estratégia ────────────────────────────────────────────────
caso('a fonte `aurum` do webhook é a estratégia aurum-flow', () => {
  assert.equal(ESTRATEGIA_DO_WEBHOOK.aurum?.slug, 'aurum-flow')
  assert.equal(ESTRATEGIA_DO_WEBHOOK.aurum?.ignoraProviderAtivo, undefined, 'o interruptor do provider tem de continuar a valer')
})
caso('o webhook encaminha a Aurum para a mestre SIM e trava a MT5 antiga quando a SIM fica com o sinal', () => {
  const rota = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'webhooks', 'tradingview', 'route.ts'), 'utf8')
  assert.match(rota, /decidirAurumParaMestre\(/)
  assert.match(rota, /fonte: "aurum"/)
  assert.match(rota, /!aurumNaMestreSim/)
})

console.log(`aurum.check: ${n} casos OK`)
