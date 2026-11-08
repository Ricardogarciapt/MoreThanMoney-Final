/**
 * Páginas públicas dos scripts da casa no TradingView, por scanner. Vão no email de acesso
 * pós-compra vitalícia (o cliente abre a página, pede o convite e adiciona aos favoritos). Um
 * scanner sem entrada aqui, ou uma compra semestral, recebe o email sem o botão, como até agora.
 */
export const SCRIPTS_TRADINGVIEW: Record<string, string> = {
  goldkiller: 'https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/',
  // SniperPro by MTM (08/11/2026): publicado pelo Ricardo.
  sniperpro: 'https://br.tradingview.com/script/1v31p5j3/',
}

/**
 * `goldkiller_lifetime` → página do GoldKiller. Só nas compras VITALÍCIAS (decisão do Ricardo,
 * 08/11/2026): o semestral recebe o email sem o botão; packs e EAs → null.
 */
export function scriptTradingViewDoPlano(planId: string | null | undefined): string | null {
  if (!planId || !planId.endsWith('_lifetime')) return null
  return SCRIPTS_TRADINGVIEW[planId.replace(/_lifetime$/, '')] ?? null
}
