/** Verificação do cálculo de desfecho. Correr com: npx tsx lib/mtmcopy/__tests__/trade-outcome.check.ts */
import { computeOutcome, outcomeLabel, outcomeShort, pipSizeForSymbol, unitFor } from "../trade-outcome"

let ok = 0
let mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++ } else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

// ——— tamanho do pip
eq("ouro", pipSizeForSymbol("XAUUSD"), 0.1)
eq("ouro minusculas", pipSizeForSymbol("xauusd.std"), 0.1)
eq("prata", pipSizeForSymbol("XAGUSD"), 0.01)
eq("iene", pipSizeForSymbol("USDJPY"), 0.01)
eq("forex", pipSizeForSymbol("EURUSD"), 0.0001)
eq("bitcoin em pontos", pipSizeForSymbol("BTCUSD"), 1)
eq("indice em pontos", pipSizeForSymbol("US30"), 1)
eq("simbolo vazio", pipSizeForSymbol(null), 1)
eq("unidade forex", unitFor("EURUSD"), "pips")
eq("unidade cripto", unitFor("BTCUSDT"), "pontos")

// ——— compra com lucro em ouro: 4370 → 4390 = 200 pips
eq("compra ouro", computeOutcome({ symbol: "XAUUSD", direction: "buy", entry: 4370, exit: 4390 }),
   { pips: 200, pct: 0.46, unit: "pips", win: true })

// ——— venda com lucro: o preço desce e o resultado é positivo
eq("venda ouro com lucro", computeOutcome({ symbol: "XAUUSD", direction: "sell", entry: 4390, exit: 4370 })?.pips, 200)
eq("venda ouro a perder", computeOutcome({ symbol: "XAUUSD", direction: "sell", entry: 4370, exit: 4390 })?.pips, -200)

// ——— forex: EURUSD 1,0850 → 1,0900 = 50 pips
eq("forex 50 pips", computeOutcome({ symbol: "EURUSD", direction: "buy", entry: 1.085, exit: 1.09 })?.pips, 50)
// ——— iene: 150,00 → 150,50 = 50 pips (e NÃO 5000, que era o que dava onde faltava o caso JPY)
eq("iene 50 pips", computeOutcome({ symbol: "USDJPY", direction: "buy", entry: 150, exit: 150.5 })?.pips, 50)
// ——— bitcoin conta em pontos
eq("bitcoin pontos", computeOutcome({ symbol: "BTCUSDT", direction: "buy", entry: 60000, exit: 63500 })?.pips, 3500)

// ——— sem preços não se inventa um zero
eq("sem saida", computeOutcome({ symbol: "XAUUSD", direction: "buy", entry: 4370, exit: null }), null)
eq("entrada zero", computeOutcome({ symbol: "XAUUSD", direction: "buy", entry: 0, exit: 4390 }), null)
eq("rotulo vazio", outcomeLabel(null), "")

// ——— formatação
eq("rotulo ganho", outcomeLabel(computeOutcome({ symbol: "XAUUSD", direction: "buy", entry: 4370, exit: 4390 })), "+200 pips · +0,46%")
eq("rotulo perda", outcomeLabel(computeOutcome({ symbol: "XAUUSD", direction: "buy", entry: 4390, exit: 4370 })), "−200 pips · −0,46%")
eq("rotulo curto", outcomeShort(computeOutcome({ symbol: "BTCUSDT", direction: "buy", entry: 60000, exit: 63500 })), "+3500pt / +5,83%")
eq("uma casa abaixo de 10", outcomeLabel(computeOutcome({ symbol: "EURUSD", direction: "buy", entry: 1.085, exit: 1.0855 })), "+5,0 pips · +0,05%")

console.log(`${ok} passaram, ${mau} falharam`)
process.exit(mau ? 1 : 0)
