/**
 * UMA CONTA, UMA VIA (F3, 05/10) — trava anti-duplicação entre o executor da MTM Auto e o motor das
 * mestres. CÓPIA igual no repositório mtm-auto (lib/mestres/via-unica.ts).
 *
 * Incidente 23/09: a conta 8049315 (Pedro, FXIFY) estava em `mestres_contas` (rota site: do Edge em
 * live) E recebia ordens do executor da MTM Auto pela subscrição — a mesma trade abria a dobrar. Dois
 * motores que não se conheciam. A regra: se a chave física da conta tem uma rota ACTIVA e APROVADA
 * do motor das mestres (`copia_rotas.mestres=true`, site: ou auto:), quem a gere é o motor das
 * mestres e mais ninguém abre nela. Sem rota → caminho de sempre (executor / T2T legado).
 *
 * Puro. A chave física é a mesma dos dois lados (`mt:<login>@<servidor>`, `tl:…`).
 */
export interface RotaMestresMin {
  destino_chave: string
  ativa: boolean
  estado: string
  mestres?: boolean | null
  estrategia_slug?: string | null
}

export type ViaDaConta = { via: 'mestres'; rota: RotaMestresMin } | { via: 'mtmauto' }

export function viaDaConta(chaveFisica: string | null | undefined, rotasMestres: RotaMestresMin[]): ViaDaConta {
  const chave = String(chaveFisica ?? '').trim().toLowerCase()
  if (!chave) return { via: 'mtmauto' }
  const rota = rotasMestres.find((r) => r.mestres !== false && r.ativa && r.estado === 'aprovada' && String(r.destino_chave).toLowerCase() === chave)
  return rota ? { via: 'mestres', rota } : { via: 'mtmauto' }
}

export const MOTIVO_VIA_MESTRES = 'conta gerida pelo motor das mestres (via única) — o executor da MTM Auto não abre nela'
