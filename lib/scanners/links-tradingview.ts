/**
 * LINKS DOS SCRIPTS NO TRADINGVIEW — o que o cliente recebe depois de pagar.
 *
 * O acesso aos scanners é por convite (invite-only): o cliente dá o username, o admin acrescenta-o ao
 * script e, a partir daí, o script aparece em «Indicadores → Os Meus Scripts». Estes links levam-no
 * directamente à página de cada script, para o adicionar ao gráfico sem procurar — só nas compras
 * vitalícias (regra do dono, 08/11/2026).
 *
 * Chaves: o planId do Stripe (lookup_key) ou a chave do scanner no catálogo. Um scanner pode ter mais
 * do que um script (o Quantum tem o painel de preço e o oscilador).
 *
 * Módulo PURO (sem imports): serve emails, páginas e o admin.
 */
export interface LinkScriptTradingView {
  nome: string
  url: string
}

/** Links por scanner (chave do catálogo lib/scanners-catalog.ts). */
export const LINKS_SCRIPTS_POR_SCANNER: Record<string, readonly LinkScriptTradingView[]> = {
  // Quantum by MTM (08/11/2026): publicado pelo Ricardo em dois scripts invite-only.
  quantum: [
    { nome: 'Quantum by MTM', url: 'https://www.tradingview.com/script/JxLihEk6/' },
    { nome: 'Quantum Oscillator by MTM', url: 'https://www.tradingview.com/script/HLrwD3QG/' },
  ],
  goldkiller: [{ nome: 'MTM Gold Killer', url: 'https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/' }],
}

/** O scanner de um planId do Stripe (`quantum_semestral` → `quantum`, `goldkiller_lifetime` → `goldkiller`). */
export function scannerDoPlano(planId: string | null | undefined): string | null {
  const p = String(planId ?? '').toLowerCase().trim()
  if (!p) return null
  const m = p.match(/^([a-z0-9]+?)_(semestral|lifetime|monthly|mensal|vitalicio|anual)$/)
  return m ? m[1] : null
}

/** O plano é vitalício (`*_lifetime` / `*_vitalicio`)? */
export function planoVitalicio(planId: string | null | undefined): boolean {
  return /_(lifetime|vitalicio)$/.test(String(planId ?? '').toLowerCase().trim())
}

/**
 * Links a mandar no email de acesso para um planId. Regra do dono (08/11/2026): a página do script só
 * se entrega nas compras VITALÍCIAS; no semestral o cliente recebe o convite e encontra o script em
 * «Os Meus Scripts». Vazio também quando ainda não há script publicado registado.
 */
export function linksDoPlano(planId: string | null | undefined): readonly LinkScriptTradingView[] {
  if (!planoVitalicio(planId)) return []
  const s = scannerDoPlano(planId)
  return (s && LINKS_SCRIPTS_POR_SCANNER[s]) || []
}
