/**
 * SEPARADORES DA APP-MOBILE — módulo puro (sem React) para a página e as guardas lerem a mesma lista.
 *
 * `normalizarTab` existe porque os links e as notificações antigas ficam a circular muito depois de
 * um separador mudar de nome ou desaparecer. Em vez de a app aterrar num ecrã vazio, cada id velho
 * é convertido aqui para o separador vivo que hoje faz o mesmo serviço:
 *   • `funded` → `scanner`: o WebTrader passou a sub-separador «Web trader» do Scanner.
 *   • `tap-to-trade` → `chat` (05/10/2026): o Tap to Trade deixou de ter separador na app-mobile — vive
 *     só na app MTM Auto. Quem tocar numa notificação ou link antigo de T2T cai no Chat, que é onde
 *     o sinal é lido e acompanhado.
 */

export const TABS_VALIDAS = [
  "social",
  "chat",
  "portfolio",
  "scanner",
  "apps",
  "live",
  "mentor",
  "settings",
  "mlm",
  "trading-alerts",
  "funded",
  "marketplace",
  // Legado: já não é separador, mas continua a ser aceite no URL para a normalização ter onde actuar.
  "tap-to-trade",
] as const

export type TabAppMobile = (typeof TABS_VALIDAS)[number]

/** Ids antigos → separador vivo. Qualquer outro id devolve-se tal como veio. */
const LEGADO: Record<string, string> = {
  funded: "scanner",
  "tap-to-trade": "chat",
}

export function ehTabValida(t: string | null | undefined): t is TabAppMobile {
  return typeof t === "string" && (TABS_VALIDAS as readonly string[]).includes(t)
}

export function normalizarTab(t: string): string {
  return LEGADO[t] ?? t
}
