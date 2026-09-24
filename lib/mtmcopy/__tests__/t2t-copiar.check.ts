/** Tap to copy: parâmetros do sinal em texto. Correr: npx tsx lib/mtmcopy/__tests__/t2t-copiar.check.ts */
import { camposDoSinal, precoLegivel, rotuloDirecao, textoParaColar } from "../t2t-copiar"

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

// ── Preços: as casas do cartão, não as do indicador ────────────────────────────
eq("ouro a 2 casas", precoLegivel(4452.9733242788, "XAUUSD"), "4452.97")
eq("forex a 5 casas", precoLegivel(1.0812345678, "EURUSD"), "1.08123")
eq("iene a 3 casas", precoLegivel(157.12345, "USDJPY"), "157.123")
eq("sem zeros a mais", precoLegivel(4435.8, "XAUUSD"), "4435.8")
eq("nada nao inventa", precoLegivel(null, "XAUUSD"), "—")

// ── Direcção: o vocabulário do cartão ──────────────────────────────────────────
eq("buy = COMPRA", rotuloDirecao("buy"), "COMPRA")
eq("LONG = COMPRA", rotuloDirecao("LONG"), "COMPRA")
eq("sell = VENDA", rotuloDirecao("sell"), "VENDA")
eq("lixo nao vira direccao", rotuloDirecao("talvez"), null)

// ── O bloco que se cola ────────────────────────────────────────────────────────
const premium = { simbolo: "XAUUSD", direcao: "buy", entrada: 4385, sl: 4375, tps: [4388, 4391] }
eq("campos por ordem", camposDoSinal(premium).map((c) => c.rotulo), ["Símbolo", "Direção", "Entrada", "Stop loss", "TP1", "TP2"])
eq(
  "texto para o MT5",
  textoParaColar(premium),
  "Símbolo: XAUUSD\nDireção: COMPRA\nEntrada: 4385\nStop loss: 4375\nTP1: 4388\nTP2: 4391",
)

// Entrada a mercado: não se inventa um preço, diz-se o que é.
eq("a mercado", textoParaColar({ simbolo: "XAUUSD", direcao: "sell", mercado: true, sl: 4400, tps: [4380] }),
  "Símbolo: XAUUSD\nDireção: VENDA\nEntrada: Mercado\nStop loss: 4400\nTP1: 4380")

// Um stop que não existe não se copia como "—" para dentro de uma ordem.
eq("sem stop escrito", camposDoSinal({ simbolo: "BTCUSD", direcao: "buy", entrada: 64000, sl: null, tps: [65000] }).map((c) => c.rotulo),
  ["Símbolo", "Direção", "Entrada", "TP1"])

// Perpétuo: é um sinal como os outros para efeitos de copiar os parâmetros.
eq("perpetuo copia na mesma", textoParaColar({ simbolo: "SOLUSDT.P", direcao: "sell", entrada: 212.45, sl: 218.9, tps: [205.1, 198] }),
  "Símbolo: SOLUSDT.P\nDireção: VENDA\nEntrada: 212.45\nStop loss: 218.9\nTP1: 205.1\nTP2: 198")

// Sem um único preço não há nada para replicar — e um botão que copia lixo é pior do que não haver botão.
eq("sem precos nao ha texto", textoParaColar({ simbolo: "XAUUSD", direcao: "buy" }), "")
eq("tps nulos sao ignorados", camposDoSinal({ simbolo: "XAUUSD", direcao: "buy", entrada: 4385, tps: [null, 4391, undefined] }).map((c) => c.valor),
  ["XAUUSD", "COMPRA", "4385", "4391"])

console.log(mau === 0 ? `✓ ${ok} verificações` : `${ok} ok, ${mau} falhas`)
if (mau > 0) process.exit(1)
