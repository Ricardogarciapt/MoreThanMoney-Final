/**
 * Direção dos sinais. Correr com: npx tsx lib/mtmcopy/__tests__/signal-direction.check.ts
 *
 * O caso que deu origem a isto (16/09/2026): o Tap to Trade e os chats das apps mostravam
 * «BUY +160 pips» em cima de um «3. GOLD SELL SETUP». A culpa era do rodapé com que o Gold Did
 * assina todos os cartões Premium — «…key to long term success» — cujo «long» casava com a
 * palavra de compra. Os textos abaixo são os REAIS da base de dados desse dia.
 */
import { directionFromText, directionLabelFromText, resolveDirectionLabel } from "../signal-direction"

let ok = 0
let mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (a === b) { ok++ } else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

const RODAPE = "🔑 Use suitable lot sizes based on your capital. Money management is key to long term success"

const sellSetup = `3. GOLD SELL SETUP
Gold Sell Zone 4328 - 4334
SL : 4339
TP1 : 4323
TP2 : 4318
TP3 : 4313
TP4 : Hold
${RODAPE}`

const buySetup = `7. GOLD BUY SETUP
Gold Buy Zone 4346 - 4340
SL : 4335
TP1 : 4351
TP2 : 4356
TP3 : 4361
TP4 : Hold
${RODAPE}`

// ——— o bug: o rodapé não é uma direção
eq("setup de venda (rodapé «long term»)", directionFromText(sellSetup), "sell")
eq("setup de compra", directionFromText(buySetup), "buy")
eq("rodapé sozinho não declara direção", directionFromText(RODAPE), null)
eq("«short term» também não", directionFromText("Think short term, trade well"), null)
eq("«longo prazo» também não", directionFromText("Investimento de longo prazo"), null)

// ——— «long»/«short» a sério continuam a valer
eq("long a sério", directionFromText("XAUUSD long @ 4300"), "buy")
eq("short a sério", directionFromText("NAS100 short now"), "sell")

// ——— follow-ups do ciclo de vida
eq("stop loss de venda", directionFromText("🛑 Stop loss · XAUUSD 🔴 VENDA · −50 pips · −0,12%"), "sell")
eq("posição fechada de venda", directionFromText("🏁 Posição fechada · XAUUSD 🔴 VENDA · +138 pips · +0,32%"), "sell")
eq("entry hit de venda", directionFromText("✅ ENTRY HIT · XAUUSD 🔴 VENDA · −8,3 pips · −0,02%"), "sell")
eq("scanner de compra", directionFromText("📊 EURJPY   🔵 COMPRA\n🎯 Entrada: 178.986"), "buy")
// Um «HIT TP3 ✅ +160PIPS» não declara lado nenhum — e não pode inventar um.
eq("anúncio de alvo sem lado", directionFromText("HIT TP3 ✅ +160PIPS\nHIT ALL TP ✅"), null)

// ——— etiqueta do cartão
eq("etiqueta venda", directionLabelFromText(sellSetup), "SELL")
eq("etiqueta compra", directionLabelFromText(buySetup), "BUY")
eq("etiqueta vazia", directionLabelFromText(null), "")

// ——— o servidor manda; o texto é o plano B
eq("servidor manda (sell)", resolveDirectionLabel("sell", buySetup), "SELL")
eq("servidor manda (buy)", resolveDirectionLabel("buy", sellSetup), "BUY")
eq("sem servidor cai no texto", resolveDirectionLabel(null, sellSetup), "SELL")
eq("servidor com lixo cai no texto", resolveDirectionLabel("", sellSetup), "SELL")

/**
 * ——— sinal dos pips
 *
 * Os pips vêm do servidor já com sinal (`chat_messages.outcome`). O que se garante aqui é que a
 * ETIQUETA e o SINAL contam a mesma história: uma venda que desce é ganho (+), uma venda que
 * sobe é perda (−). Se a direção fosse lida ao contrário, o cartão mostrava «BUY» verde em cima
 * de uma venda — que foi exactamente o que o cliente viu.
 */
const casos: Array<{ texto: string; dir: "buy" | "sell"; entrada: number; saida: number; ganho: boolean }> = [
  { texto: sellSetup, dir: "sell", entrada: 4331, saida: 4315, ganho: true },   // venda a descer
  { texto: sellSetup, dir: "sell", entrada: 4331, saida: 4339, ganho: false },  // venda a subir = stop
  { texto: buySetup, dir: "buy", entrada: 4343, saida: 4356, ganho: true },     // compra a subir
  { texto: buySetup, dir: "buy", entrada: 4343, saida: 4335, ganho: false },    // compra a descer = stop
]
for (const c of casos) {
  eq(`direção lida (${c.dir}, ${c.entrada}→${c.saida})`, directionFromText(c.texto), c.dir)
  const pips = (c.dir === "buy" ? c.saida - c.entrada : c.entrada - c.saida) / 0.1
  eq(`sinal dos pips (${c.dir}, ${c.entrada}→${c.saida})`, pips > 0, c.ganho)
}

console.log(`\n${mau === 0 ? "✅" : "❌"} ${ok} ok, ${mau} falhas`)
process.exit(mau === 0 ? 0 : 1)
