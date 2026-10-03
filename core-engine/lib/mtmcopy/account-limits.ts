import { isMtmcopyAdmin } from './subscription'

/** Membros VIP com subscrição MTMcopier activa (Stripe). */
export const MAX_MTMCOPY_ACCOUNTS_VIP = 5

/** Membros standard com subscrição MTMcopier activa (Stripe). */
export const MAX_MTMCOPY_ACCOUNTS_MEMBER = 4

/** Slaves em grupos MTM + estratégia (métodos 1 e 2) — não-admin. */
export const MAX_MTMCOPY_SIGNAL_SLAVES = 2

export const MAX_MTMCOPY_MASTERS = 1

export const MAX_MTMCOPY_COPY_SLAVES = 2

export type MtmcopyLimitTier = 'admin' | 'vip' | 'member'

export interface MtmcopyUserLimits {
  tier: MtmcopyLimitTier
  unlimited: boolean
  maxAccounts: number
  maxSignalSlaves: number
  maxCopyTraderSlaves: number
  maxMasters: number
}

export function isMtmcopyVipMember(
  userType?: string | null,
  memberCategory?: string | null,
): boolean {
  return userType === 'vip' || memberCategory === 'vip'
}

/** Limites de contas MTMcopier por perfil (admin = ilimitado). */
export function resolveMtmcopyUserLimits(
  userType?: string | null,
  memberCategory?: string | null,
): MtmcopyUserLimits {
  if (isMtmcopyAdmin(userType)) {
    return {
      tier: 'admin',
      unlimited: true,
      maxAccounts: Number.MAX_SAFE_INTEGER,
      maxSignalSlaves: Number.MAX_SAFE_INTEGER,
      maxCopyTraderSlaves: Number.MAX_SAFE_INTEGER,
      maxMasters: Number.MAX_SAFE_INTEGER,
    }
  }

  if (isMtmcopyVipMember(userType, memberCategory)) {
    return {
      tier: 'vip',
      unlimited: false,
      maxAccounts: MAX_MTMCOPY_ACCOUNTS_VIP,
      maxSignalSlaves: MAX_MTMCOPY_SIGNAL_SLAVES,
      maxCopyTraderSlaves: MAX_MTMCOPY_COPY_SLAVES,
      maxMasters: MAX_MTMCOPY_MASTERS,
    }
  }

  return {
    tier: 'member',
    unlimited: false,
    maxAccounts: MAX_MTMCOPY_ACCOUNTS_MEMBER,
    maxSignalSlaves: MAX_MTMCOPY_SIGNAL_SLAVES,
    maxCopyTraderSlaves: MAX_MTMCOPY_COPY_SLAVES,
    maxMasters: MAX_MTMCOPY_MASTERS,
  }
}

export function mtmcopyLimitsLabel(limits: MtmcopyUserLimits): string {
  if (limits.unlimited) return 'Admin · contas ilimitadas'
  if (limits.tier === 'vip') {
    return `VIP · até ${limits.maxAccounts} contas (subscrição Stripe)`
  }
  return `Até ${limits.maxAccounts} contas (subscrição Stripe)`
}
