/**
 * Migração de acesso — REGRAS PURAS (sem base de dados).
 *
 * Isto vivia tudo em lib/access-migration.ts, que importa o cliente service-role do
 * Supabase. Como o middleware (Edge) chama o `needsAccessRevalidation`, arrastava
 * para o bundle do Edge o supabase-js inteiro com o realtime — o que enchia o
 * middleware e fazia o build avisar que se usavam APIs de Node sem suporte no Edge.
 * Aqui não há IO nenhum, por isso o middleware passa a importar só isto.
 */

import type { UserProfile } from '@/lib/role-redirect'

export type AccessPaymentChannel = 'stripe' | 'skool'
export type AccessValidationStatus = 'pending' | 'approved' | 'rejected' | null

export interface AccessMigrationState {
  access_revalidation_required: boolean
  access_payment_channel: AccessPaymentChannel | null
  access_validation_status: AccessValidationStatus
  access_validation_requested_at: string | null
  app_activation_coupon_code: string | null
  access_migration_completed_at: string | null
}

const DEFAULT_STATE: AccessMigrationState = {
  access_revalidation_required: false,
  access_payment_channel: null,
  access_validation_status: null,
  access_validation_requested_at: null,
  app_activation_coupon_code: null,
  access_migration_completed_at: null,
}

export function readProfileData(profile: { profile_data?: unknown } | null | undefined): Record<string, unknown> {
  if (!profile?.profile_data || typeof profile.profile_data !== 'object') return {}
  return profile.profile_data as Record<string, unknown>
}

export function readAccessMigration(profile: { profile_data?: unknown } | null | undefined): AccessMigrationState {
  const pd = readProfileData(profile)
  return {
    access_revalidation_required: pd.access_revalidation_required === true,
    access_payment_channel:
      pd.access_payment_channel === 'stripe' ||
      pd.access_payment_channel === 'skool'
        ? pd.access_payment_channel
        : null,
    access_validation_status:
      pd.access_validation_status === 'pending' ||
      pd.access_validation_status === 'approved' ||
      pd.access_validation_status === 'rejected'
        ? pd.access_validation_status
        : null,
    access_validation_requested_at:
      typeof pd.access_validation_requested_at === 'string' ? pd.access_validation_requested_at : null,
    app_activation_coupon_code:
      typeof pd.app_activation_coupon_code === 'string' ? pd.app_activation_coupon_code : null,
    access_migration_completed_at:
      typeof pd.access_migration_completed_at === 'string' ? pd.access_migration_completed_at : null,
  }
}

export function mergeAccessMigration(
  profile: { profile_data?: unknown },
  patch: Partial<AccessMigrationState>,
): Record<string, unknown> {
  const current = readProfileData(profile)
  const prev = readAccessMigration(profile)
  return {
    ...current,
    ...prev,
    ...patch,
  }
}

/** Admin e educadores LMS ficam isentos da migração forçada. */
export function isAccessMigrationExempt(
  profile: Pick<UserProfile, 'user_type' | 'email' | 'is_active'> | null | undefined,
  educatorEmails?: Set<string>,
): boolean {
  if (!profile) return false
  if (profile.user_type === 'admin') return true
  const email = profile.email?.trim().toLowerCase()
  if (email && educatorEmails?.has(email)) return true
  return false
}

/** Utilizador deve passar pelo fluxo /access-migration antes de aceder à app. */
export function needsAccessRevalidation(
  profile: (UserProfile & { profile_data?: unknown; email?: string }) | null | undefined,
  educatorEmails?: Set<string>,
): boolean {
  if (!profile || isAccessMigrationExempt(profile, educatorEmails)) return false
  const m = readAccessMigration(profile)
  if (m.access_migration_completed_at) return false
  return m.access_revalidation_required === true
}

export function accessMigrationRedirectPath(): string {
  return '/access-migration'
}

export function generateAppActivationCouponCode(userId: string): string {
  const slug = userId.replace(/-/g, '').slice(0, 8).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `MTM-APP-${slug}-${rand}`
}

