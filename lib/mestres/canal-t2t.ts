/**
 * CANAL DE CHAT ↔ ESTRATÉGIA — derivado dos providers, não de um mapa fixo.
 *
 * Até 05/10 o T2T pelo motor só conhecia três canais (`ESTRATEGIA_DO_CANAL` em ./t2t.ts): um provider
 * novo criado no admin nunca entrava no motor, por muito bem configurado que estivesse. Agora o mapa
 * sai de `mtmauto_providers` (slug + `canal_chat`, migração 179), com a regra de derivação IGUAL à do
 * repositório mtm-auto (`lib/providers-equipa.ts::canalChatDoProvider`): explícito ganha; senão o
 * canal de sempre da fonte MTM; senão `sinais-<slug>`. Os três fixos ficam como rede de segurança
 * (providers antigos sem `canal_chat`).
 *
 * Puro — testado em __tests__/canal-t2t.check.ts.
 */

export const CANAL_POR_FONTE_MTM: Record<string, string> = {
  premium: 'premium-ideas',
  sensei: 'sensei-scanner',
  goldkiller: 'sinais-goldkiller',
  mtmscanner: 'trade-ideas-setup',
}

/** Os três de antes (05/10): só valem quando nenhum provider reclama o canal. */
export const CANAIS_FIXOS_HISTORICOS: Record<string, string> = {
  'sensei-scanner': 'sensei',
  'sinais-goldkiller': 'Goldkiller',
  'premium-ideas': 'premium-ouro',
}

export interface ProviderParaCanal {
  slug: string
  canal_chat?: string | null
  fonte_mtm?: string | null
  apagado_em?: string | null
}

export function canalChatDoProvider(p: ProviderParaCanal): string {
  const explicito = String(p.canal_chat ?? '').trim().toLowerCase()
  if (explicito) return explicito
  const daFonte = p.fonte_mtm ? CANAL_POR_FONTE_MTM[String(p.fonte_mtm).toLowerCase()] : null
  if (daFonte) return daFonte
  return `sinais-${String(p.slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/**
 * canal → slug da estratégia. Um provider APAGADO não reclama canal nenhum (o histórico fica, o
 * motor não). Dois providers vivos no mesmo canal: o primeiro por ordem de slug ganha — e isso é
 * um erro de configuração que o admin vê no Centro, não uma decisão deste módulo.
 */
export function mapaCanalEstrategia(providers: ProviderParaCanal[]): Record<string, string> {
  const mapa: Record<string, string> = { ...CANAIS_FIXOS_HISTORICOS }
  const vivos = providers.filter((p) => !p.apagado_em && p.slug).sort((a, b) => a.slug.localeCompare(b.slug))
  // os derivados dos providers SOBREPÕEM os fixos: se o dono mudar o canal do Sensei, manda o dele
  const reclamados = new Set<string>()
  for (const p of vivos) {
    const canal = canalChatDoProvider(p)
    if (reclamados.has(canal)) continue
    reclamados.add(canal)
    mapa[canal] = p.slug
  }
  return mapa
}
