/**
 * PROVIDERS DAS EQUIPAS — quem vê que estratégia, e que providers servem de fonte de cópia.
 * Puro e testado (lib/copia-contas/__tests__/copia-equipas.check.ts).
 *
 * A regra de visibilidade é a MESMA do catálogo do MTM Auto (mtm-auto/app/api/auto/providers):
 *   estratégia sem dono → toda a gente · da equipa do utilizador → sim · partilhada com a equipa dele → sim.
 * Quem não tem equipa é cliente da casa (equipa com slug 'mtm').
 */
export interface ProviderVisibilidade {
  tenantId: string | null
  /** equipas com quem foi partilhada (mtmauto_provider_tenants) */
  partilhadaCom: string[]
}

export function providerVisivel(p: ProviderVisibilidade, equipaDoUtilizador: string | null, equipaDaCasa: string | null): boolean {
  if (!p.tenantId) return true
  const minha = equipaDoUtilizador ?? equipaDaCasa
  if (!minha) return false
  return p.tenantId === minha || p.partilhadaCom.includes(minha)
}

export type TipoProvider = 'mtm_t2t' | 'metaapi' | 'telegram' | 'mtmfunded' | 'tradelocker'

/** Serve de ORIGEM de cópia? Só os que são uma conta legível. */
export function providerEhFonteDeCopia(p: { tipo: string; metaapi_account_id?: string | null; funded_account_id?: string | null; tl_account_id?: string | null }): boolean {
  if (p.tipo === 'metaapi') return Boolean(p.metaapi_account_id)
  if (p.tipo === 'mtmfunded') return Boolean(p.funded_account_id)
  if (p.tipo === 'tradelocker') return Boolean(p.tl_account_id)
  return false
}
