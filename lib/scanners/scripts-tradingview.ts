/**
 * Páginas públicas dos scripts da casa no TradingView, por scanner. Vão no email de acesso
 * pós-compra (o cliente abre a página, pede o convite e adiciona aos favoritos). Um scanner sem
 * entrada aqui recebe o email sem o botão do script, como até agora.
 */
export const SCRIPTS_TRADINGVIEW: Record<string, string> = {
  goldkiller: 'https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/',
  // SniperPro by MTM (08/11/2026): publicado pelo Ricardo.
  sniperpro: 'https://br.tradingview.com/script/1v31p5j3/',
}

/** `goldkiller_lifetime` → página do GoldKiller; planos sem script (packs, EAs) → null. */
export function scriptTradingViewDoPlano(planId: string | null | undefined): string | null {
  if (!planId) return null
  const chave = planId.replace(/_(semestral|lifetime|monthly|annual)$/, '')
  return SCRIPTS_TRADINGVIEW[chave] ?? null
}
