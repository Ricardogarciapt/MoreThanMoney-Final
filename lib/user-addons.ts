/** Packs scanner e addon MTMcopier — alinhados com lib/stripe-prices.ts */

export const SCANNER_ADDON_PLANS = [
  { id: 'mtm_scanner_monthly', label: 'MTM Scanner Mensal', recurring: true },
  { id: 'mtm_scanner_lifetime', label: 'MTM Scanner Vitalício', recurring: false },
  { id: 'scanners_monthly', label: 'Scanners Mensal', recurring: true },
  { id: 'scanners_semestral', label: 'Scanners Semestral', recurring: true },
  { id: 'scanners_lifetime', label: 'Scanners Vitalício', recurring: false },
  { id: 'goldkiller_lifetime', label: 'GoldKiller Vitalício', recurring: false },
] as const

/** MTM Copy: descontinuado (fase 1) — já não se vende; fica só para ler/gerir subscrições antigas. */
export const MTMCOPY_ADDON_PLAN = {
  id: 'mtmcopy_addon_monthly',
  label: 'MTMcopier Mensal (legado, descontinuado)',
} as const

export type ScannerAddonPlanId = (typeof SCANNER_ADDON_PLANS)[number]['id']

export interface ScannerAddonState {
  plan_id: ScannerAddonPlanId | string
  active: boolean
  expires_at: string | null
  tradingview_username?: string | null
  granted_by?: 'admin' | 'stripe'
}

export interface MtmcopyAddonState {
  active: boolean
  expires_at: string | null
  granted_by?: 'admin' | 'stripe'
}

export interface UserAddonsState {
  scanner?: ScannerAddonState | null
  mtmcopy?: MtmcopyAddonState | null
}

export function isLifetimeScannerPlan(planId: string): boolean {
  return planId.includes('lifetime')
}

export function defaultScannerExpiry(planId: string): string | null {
  if (isLifetimeScannerPlan(planId)) return null
  const d = new Date()
  if (planId.includes('semestral')) {
    d.setMonth(d.getMonth() + 6)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString()
}

export function defaultMtmcopyExpiry(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

export function readUserAddons(profileData: unknown): UserAddonsState {
  if (!profileData || typeof profileData !== 'object') return {}
  const pd = profileData as Record<string, unknown>
  const addons = pd.addons
  if (!addons || typeof addons !== 'object') return {}
  return addons as UserAddonsState
}

export function mergeUserAddons(
  profileData: unknown,
  patch: Partial<UserAddonsState>
): Record<string, unknown> {
  const base =
    profileData && typeof profileData === 'object'
      ? { ...(profileData as Record<string, unknown>) }
      : {}
  const current = readUserAddons(base)
  return {
    ...base,
    addons: {
      ...current,
      ...patch,
    },
  }
}

export function scannerPlanLabel(planId?: string | null): string {
  if (!planId) return '—'
  const found = SCANNER_ADDON_PLANS.find((p) => p.id === planId)
  return found?.label ?? planId
}
