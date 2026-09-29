/**
 * CATÁLOGO das fontes de receção — módulo PURO (sem imports de servidor) para ser partilhado pelo
 * admin (cliente) e pelas rotas (servidor), como o t2t-source.ts. Os interruptores em si vivem em
 * lib/mtmcopy/intake-switches.ts (esse toca na BD).
 */
export type IntakeKey =
  | "premium"
  | "sensei"
  | "goldkiller"
  | "mtmscanner"
  | "forex_ideas"
  | "forex_swings"
  | "primeverse"
  | "perps"

export const INTAKE_CHANNELS: { key: IntakeKey; label: string; hint: string }[] = [
  { key: "premium", label: "Premium (relay Signal Master Elite)", hint: "Sinais do canal SIGNAL MASTER ELITE via relay do VPS (gmi-relay)" },
  { key: "sensei", label: "Sensei Scanner", hint: "Webhook TradingView (ouro/BTC)" },
  { key: "goldkiller", label: "GoldKiller", hint: "Webhook TradingView (XAUUSD)" },
  { key: "mtmscanner", label: "MTM Scanner", hint: "Webhook TradingView (forex + ouro/BTC)" },
  { key: "forex_ideas", label: "Ideias de Forex", hint: "Canal Telegram de forex" },
  { key: "forex_swings", label: "Forex Swings (relay James)", hint: "Relay do VPS (fs-relay)" },
  { key: "primeverse", label: "MTM Auto Edge (relay)", hint: "Estratégia Edge (fxEdge) — relay do VPS (pv-relay)" },
  { key: "perps", label: "Ideias de Cripto", hint: "Perpétuos cripto (Aurum Flow ORB) → Bybit" },
]

/**
 * Qual interruptor de recepção governa o ESPELHO de um grupo de Telegram para um canal da app.
 *
 * ⚠️ Isto NÃO é «quem produz os sinais deste canal» — e a diferença já enganou uma leitura.
 * Há dois caminhos de entrada e cada um tem a sua maneira de escolher a chave:
 *
 *  1) **Espelho do Telegram** (`app/api/telegram/webhook-aibot`): chega um grupo, `resolveAppChannelSlug`
 *     diz para que canal da app ele espelha, e é esta função que diz que interruptor o corta.
 *     É o ÚNICO sítio que chama isto. Aqui o slug identifica mesmo a fonte, porque cada grupo de
 *     Telegram só espelha para um canal.
 *  2) **Webhooks e relays** (TradingView, pv-relay, fs-relay, gmi-relay): a chave vem da FONTE, não
 *     do canal — `isIntakeEnabled('primeverse')`, `('mtmscanner')`, `('forex_swings')`… — porque a
 *     fonte é conhecida antes de se decidir o canal.
 *
 * Um slug PODE ser escrito por mais do que uma fonte, e por isso não serve para decidir sozinho:
 * o `sinais-scanner-mtm` («MTM Auto Edge») recebe hoje os sinais da Edge pelo pv-relay (444 no
 * tracking) E o ouro/BTC do MTM Scanner pelo webhook do TradingView. Os dois entram pelo caminho 2,
 * cada um com a sua chave; o que esta tabela responde é só «se o GRUPO “MTM Scanner” espelhar para
 * este canal, que interruptor o corta» — e aí a chave é mesmo `mtmscanner`.
 *
 * Quem precisar de gatear por FONTE chama `isIntakeEnabled(chave)` directamente. Não usar esta
 * função para isso.
 */
export function intakeKeyDoEspelhoTelegram(slug: string | null | undefined): IntakeKey | null {
  switch (slug) {
    case "premium-ideas": return "premium"
    case "sensei-scanner": return "sensei"
    case "sinais-goldkiller": return "goldkiller"
    case "sinais-scanner-mtm": return "mtmscanner"
    case "trade-ideas-setup": return "forex_ideas"
    case "ideias-e-sinais": return "forex_swings"
    case "cripto-perps": return "perps"
    case "aurum-flow": return "perps"
    default: return null
  }
}
