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
  { key: "primeverse", label: "PrimeVerse (relay)", hint: "Relay do VPS (pv-relay)" },
  { key: "perps", label: "Perpétuos cripto", hint: "Aurum Flow ORB → Bybit" },
]

/** Mapeia um slug de chat da app → chave de receção. */
export function intakeKeyForChannelSlug(slug: string | null | undefined): IntakeKey | null {
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
