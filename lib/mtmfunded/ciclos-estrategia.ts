/**
 * NOVO CICLO por estratégia: o track record público da conta-mestre conta só a partir desta data.
 *
 * Espelho de `CICLO_DESDE` no repositório da app MTM Auto (`lib/metricas-desde.ts`), que decide as
 * métricas dos cartões das apps. As duas listas têm de dizer o mesmo: mudar uma é mudar as duas.
 *
 * Pedido do Ricardo a 11/11/2026: o MTM Scanner conta desde 26/10 (SL de 100 pips); setembro e
 * outubro eram outra configuração. Nada se apaga — só muda onde começa a contagem que se mostra.
 * A chave é o `slug` da estratégia (`mtmauto_providers.slug` = `provider_slug` da conta-mestre).
 */
export const CICLO_DESDE: Record<string, string> = {
  // 26/10/2026 00:00 em Lisboa (WET, UTC+0).
  'mtm-scanner': '2026-10-26T00:00:00.000Z',
}

export function inicioDoCiclo(slug: string | null | undefined): string | null {
  return (slug && CICLO_DESDE[slug]) || null
}
