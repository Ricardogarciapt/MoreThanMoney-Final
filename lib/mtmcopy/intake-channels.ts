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
  | "perps"

export const INTAKE_CHANNELS: { key: IntakeKey; label: string; hint: string }[] = [
  // A fonte do Premium é o canal SIGNAL MASTER ELITE (-1003671953091), lido pelo gmi-relay no VPS e
  // publicado no grupo Premium (-1002424441843) via relay-post. É a ÚNICA rota do relay desde 15/09.
  { key: "premium", label: "Premium (relay Signal Master Elite)", hint: "Sinais do canal SIGNAL MASTER ELITE (-1003671953091) via relay do VPS (gmi-relay) → grupo Premium (-1002424441843)" },
  { key: "sensei", label: "Sensei Scanner", hint: "Webhook TradingView (ouro/BTC)" },
  { key: "goldkiller", label: "GoldKiller", hint: "Webhook TradingView (XAUUSD)" },
  { key: "mtmscanner", label: "MTM Scanner", hint: "Webhook TradingView (forex + ouro/BTC)" },
  { key: "forex_ideas", label: "Ideias de Forex", hint: "Canal Telegram de forex" },
  // 2026-10-04: a fonte externa (fs-relay) saiu; o que este interruptor corta hoje é o ESPELHO do grupo
  // Telegram da casa «MTM Auto FOREX swings» para o canal da app `ideias-e-sinais`.
  { key: "forex_swings", label: "Forex Swings (grupo Telegram → app)", hint: "Espelho do grupo da casa para o canal ideias-e-sinais; a fonte externa saiu a 04/10" },
  // 2026-10-04: a chave `primeverse` saiu do catálogo — só gateava a rota primeverse-exec, que devolve 410
  // desde que o pv-relay foi desligado. Um interruptor que não corta nada parece que se pode ligar.
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
 *  2) **Webhooks e relays** (TradingView, gmi-relay): a chave vem da FONTE, não do canal —
 *     `isIntakeEnabled('premium')`, `('mtmscanner')`… — porque a fonte é conhecida antes de se
 *     decidir o canal. (Os relays pv-relay e fs-relay saíram a 04/10/2026.)
 *
 * Um slug PODE ser escrito por mais do que uma fonte, e por isso não serve para decidir sozinho:
 * o `sinais-scanner-mtm` («MTM Auto Edge») recebeu até 02/10 os sinais da Edge pelo pv-relay (444 no
 * tracking) E recebe o ouro/BTC do MTM Scanner pelo webhook do TradingView. Os dois entram pelo caminho 2,
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
