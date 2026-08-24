/** Piso do lote em contas pequenas. Correr: npx tsx lib/mtmcopy/__tests__/lot-floor.check.ts */
import { getLotSizingSkipReason, computeLotSize, riscoEfetivoPct } from "../lot-sizing"
import type { ParsedSignal } from "../signal-parser"

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

// Ouro, stop de 50 pips (5 dólares): 1% de 200€ = 2€ → lote muito abaixo de 0,01.
const sinal: ParsedSignal = {
  symbol: "XAUUSD", direction: "buy", entry: 4590, sl: 4585, tp: [4600],
  orderType: "limit", raw: "",
}
const contaPequena = 200
const risco1 = { lot_mode: "risk_percent" as const, lot_value: 1, max_risk_percent: 1 }

// 1% de 200€ = 2€; com stop de 5$ em ouro dava 0,004 lotes. O piso do broker abre a 0,01 —
// a trade NÃO é saltada. Já era assim antes desta alteração; o que faltava era vê-lo.
eq("conta pequena executa no minimo", getLotSizingSkipReason(risco1, sinal, contaPequena), null)
eq("lote = minimo do broker", computeLotSize(risco1, sinal, contaPequena), 0.01)

// Conta grande: 1% de 20.000 = 200€ → lote normal, o piso não muda nada.
eq("conta grande nao salta", getLotSizingSkipReason(risco1, sinal, 20000), null)
eq("conta grande usa 1%", computeLotSize(risco1, sinal, 20000) > 0.01, true)

// E o preço disso, que ninguém via: 0,01 em ouro com stop de 5$ arrisca 5€. Numa conta de
// 200€ são 2,5% — dois e meio vezes o 1% configurado.
eq("risco efetivo do piso", riscoEfetivoPct(0.01, sinal, contaPequena), 2.5)
eq("risco efetivo conta grande", riscoEfetivoPct(0.01, sinal, 20000), 0.03)

console.log(`\n${ok} ok · ${mau} mau`)
process.exit(mau === 0 ? 0 : 1)
