/** Verificação dos desfechos gravados. Correr com: npx tsx lib/mtmcopy/__tests__/signal-outcomes.check.ts */
import { precosDoSetup, calcularDesfecho, emparelhar } from "../signal-outcomes"

let ok = 0
let mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++ } else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

const senseiCard = `🧠 Sensei Scanner — Entry Alert — Ideia Activada #13843 ✅

📊 XAUUSD   🔵 COMPRA
⏱ Timeframe: 15
🎯 Entrada activada: 4591.79
🛑 Stop Loss: 4579.14
✅ Take Profit 1: 4600.5
✅ Take Profit 2: 4610.2

🔎 Validação: 78%`

const premiumCard = `5. GOLD BUY SETUP
Gold Buy Zone 4586  - 4580
SL : 4575
TP1 : 4591
TP2 : 4596
TP3 : 4601`

// ——— leitura dos preços do cartão
eq("sensei entrada", precosDoSetup(senseiCard).entry, 4591.79)
eq("sensei stop", precosDoSetup(senseiCard).sl, 4579.14)
eq("sensei alvos", precosDoSetup(senseiCard).tps, [4600.5, 4610.2])
eq("premium zona (meio)", precosDoSetup(premiumCard).entry, 4583)
eq("premium stop", precosDoSetup(premiumCard).sl, 4575)
eq("premium alvos", precosDoSetup(premiumCard).tps, [4591, 4596, 4601])
// Milhares não são decimais: 53 160.6 não pode virar 53,16.
eq("milhares ingleses", precosDoSetup("Entrada: 53,160.6\nStop Loss: 53,102.5").entry, 53160.6)

const setup = (content: string) => ({ id: "e1", channel_slug: "sensei-scanner", content, created_at: "2026-08-21T10:00:00Z" })
const fecho = (content: string) => ({ id: "f1", channel_slug: "sensei-scanner", content, created_at: "2026-08-21T11:00:00Z" })

// ——— número anunciado pela fonte manda
eq("anunciado", calcularDesfecho(setup(premiumCard), fecho("HIT TP3 ✅ +200PIPS\nHIT ALL TP ✅"))?.label,
   "+200 pips · +0,44%")

// ——— stop: mede-se no próprio cartão (12.65 de distância = 126 pips de ouro)
const noStop = calcularDesfecho(setup(senseiCard), fecho("🛑 Stop loss · XAUUSD\nA trade fechou no stop."))
eq("stop pips", noStop ? Math.round(noStop.pips!) : null, -126)
eq("stop tipo", noStop?.kind, "lost")
eq("stop origem", noStop?.source, "stop")

// ——— alvo final
const noAlvo = calcularDesfecho(setup(senseiCard), fecho("🏁 Alvo final · XAUUSD\nPosição encerrada."))
eq("alvo pips", noAlvo ? Math.round(noAlvo.pips!) : null, 184)

// ——— cancelado diz-se por palavras, não com um zero
eq("cancelado", calcularDesfecho(setup(senseiCard), fecho("❌ Sinal cancelado · XAUUSD"))?.label, "Cancelado")
eq("cancelado sem pips", calcularDesfecho(setup(senseiCard), fecho("❌ Sinal cancelado · XAUUSD"))?.pips, null)

// ——— um stop impossível não gera número nenhum
const disparatado = calcularDesfecho(
  setup("📊 XAUUSD 🔵 COMPRA\n🎯 Entrada: 4591.79\n🛑 Stop Loss: 12.5"),
  fecho("🛑 Stop loss · XAUUSD"),
)
eq("stop implausivel", disparatado, null)

// ——— um fecho pertence ao setup que estava vivo; as zonas anteriores fecham sem número
const msgs = [
  { id: "a", channel_slug: "premium-ideas", content: "3. GOLD BUY SETUP\nGold Buy Zone 4580 - 4575\nSL : 4570\nTP1 : 4590", created_at: "2026-08-21T09:00:00Z" },
  { id: "b", channel_slug: "premium-ideas", content: "4. GOLD BUY SETUP\nGold Buy Zone 4584 - 4578\nSL : 4573\nTP1 : 4594", created_at: "2026-08-21T09:30:00Z" },
  { id: "c", channel_slug: "premium-ideas", content: "HIT TP3 ✅ +163PIPS\nHIT ALL TP ✅\nClose all now.", created_at: "2026-08-21T10:00:00Z" },
]
const mapa = emparelhar(msgs)
eq("so o setup vivo leva numero", [...mapa.keys()], ["b"])
eq("numero do setup vivo", mapa.get("b")?.pips, 163)

/**
 * ——— o rodapé do Premium não é uma direção (16/09/2026)
 *
 * O Gold Did assina todos os cartões com «…Money management is key to long term success». O
 * «long» dessa frase era lido como COMPRA, e um fecho de compra colava os seus pips a um setup
 * de VENDA — foi assim que o cliente viu «BUY +160 pips» em cima de um «GOLD SELL SETUP».
 */
const RODAPE = "🔑 Use suitable lot sizes based on your capital. Money management is key to long term success"
const cartaoVenda = {
  id: "v",
  channel_slug: "premium-ideas",
  content: `3. GOLD SELL SETUP\nGold Sell Zone 4328 - 4334\nSL : 4339\nTP1 : 4323\nTP2 : 4318\n${RODAPE}`,
  created_at: "2026-09-16T08:02:53Z",
}
const fechoCompra = { id: "f", channel_slug: "premium-ideas", content: "🏁 Posição fechada · 🔵 COMPRA · +160 pips · +0,37%", created_at: "2026-09-16T08:12:44Z" }
const fechoVenda = { id: "f", channel_slug: "premium-ideas", content: "🏁 Posição fechada · 🔴 VENDA · −50 pips · −0,12%", created_at: "2026-09-16T08:12:44Z" }
eq("fecho de COMPRA não encerra setup de VENDA", [...emparelhar([cartaoVenda, fechoCompra]).keys()], [])
const fechoDaVenda = emparelhar([cartaoVenda, fechoVenda])
eq("fecho de VENDA encerra setup de VENDA", [...fechoDaVenda.keys()], ["v"])

/**
 * ——— o menos anunciado é uma perda
 *
 * Só se olhava para o «SL HIT»/❌, que é como as fontes de fora escrevem uma perda. Os NOSSOS
 * cartões escrevem-na com um menos, e uma venda fechada a −50 pips ficava gravada como +50
 * pips GANHOS — a verde, no cartão e nas somas do mês.
 */
eq("perda anunciada mantém-se negativa", fechoDaVenda.get("v")?.pips, -50)
eq("perda anunciada é 'lost'", fechoDaVenda.get("v")?.kind, "lost")
eq("ganho anunciado continua positivo",
   calcularDesfecho(cartaoVenda, { id: "g", channel_slug: "premium-ideas", content: "HIT TP3 ✅ +160PIPS\nHIT ALL TP ✅", created_at: "2026-09-16T08:12:44Z" })?.pips,
   160)

console.log(`\n${ok} ok · ${mau} mau`)
process.exit(mau === 0 ? 0 : 1)
