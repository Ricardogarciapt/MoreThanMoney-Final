/**
 * Frescura do radar de leads — puro, sem rede. Fica fora de radar.ts para a fila de comentários o
 * poder importar sem arrastar o código de publicação (a guarda da fila proíbe-o).
 */

/** Idade máxima de um post no radar e na fila (06/10, pedido do dono: conteúdo fresco, não de semanas). */
export const RADAR_IDADE_MAX_DIAS = 3

/** Um post entra se tiver data e for recente; sem data, só se vier do balde dos recentes. */
export function postFresco(publicadoEm: string | null, origem: "fresco" | "popular", agora = Date.now()): boolean {
  const t = publicadoEm ? Date.parse(publicadoEm) : NaN
  if (Number.isFinite(t)) return agora - t <= RADAR_IDADE_MAX_DIAS * 86_400_000
  return origem === "fresco"
}

/** O filtro PostgREST equivalente, para a lista e para a fila: com data recente, ou fresco sem data visto há pouco. */
export function filtroFrescoPostgrest(agora = Date.now()): string {
  const limite = new Date(agora - RADAR_IDADE_MAX_DIAS * 86_400_000).toISOString()
  const vistoHaPouco = new Date(agora - 2 * 86_400_000).toISOString()
  return `publicado_em.gte.${limite},and(publicado_em.is.null,origem.eq.fresco,encontrado_em.gte.${vistoHaPouco})`
}
