/**
 * Página pública de cada indicador no TradingView — o link que se ENTREGA ao cliente depois da
 * compra (email de acesso) para ele abrir o script e carregar em «Adicionar ao gráfico» assim que
 * o username estiver na lista de convidados.
 *
 * Chave = planId sem o sufixo do período (`rocketnova_lifetime` → `rocketnova`). Sem entrada, o
 * email segue sem o botão, como sempre seguiu.
 */
const SCRIPTS_TRADINGVIEW: Record<string, string> = {
  goldkiller: 'https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/',
  // RocketNova by MTM (08/11/2026) — link dado pelo dono para a entrega da compra.
  rocketnova: 'https://br.tradingview.com/script/86b78YOM/',
}

export function linkTradingViewDoPlano(planId: string | null | undefined): string | null {
  if (!planId) return null
  const chave = planId.replace(/_(monthly|semestral|annual|lifetime)$/, '')
  return SCRIPTS_TRADINGVIEW[chave] ?? null
}
