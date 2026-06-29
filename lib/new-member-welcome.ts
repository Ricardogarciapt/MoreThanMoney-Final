import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendWelcomeEmail } from '@/lib/email-service'
import { readProfileData } from '@/lib/access-migration'
import {
  notifyNewMemberRegistration,
  notifyTeamSale,
} from '@/lib/notifications-sales'
import { sendNewMemberEmailToUplinesAndAdmin } from '@/lib/new-member-email'

export type WelcomeEmailSource = 'stripe' | 'app_store' | 'google_play' | 'admin' | 'manual'

export interface SendNewMemberWelcomeParams {
  userId: string
  source: WelcomeEmailSource
  /** Renovação — não envia boas-vindas */
  isRenewal?: boolean
  /** Reenvio forçado (ex.: admin) */
  force?: boolean
  planId?: string
  sponsorUsername?: string
  /** Notificações push MLM (admin/VIP/sponsor) */
  notifyTeam?: boolean
  eventId?: string
}

export interface SendNewMemberWelcomeResult {
  sent: boolean
  skipped: boolean
  reason?: string
}

function welcomeAlreadySent(profileData: Record<string, unknown>): boolean {
  return typeof profileData.welcome_email_sent_at === 'string' && profileData.welcome_email_sent_at.length > 0
}

/** Email de boas-vindas ao membro — idempotente via profile_data.welcome_email_sent_at */
export async function sendNewMemberWelcomeIfEligible(
  params: SendNewMemberWelcomeParams,
): Promise<SendNewMemberWelcomeResult> {
  if (params.isRenewal) {
    return { sent: false, skipped: true, reason: 'renewal' }
  }

  const supabase = getSupabaseAdmin()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, profile_data, mlm_sponsor_username, is_active, subscription_status')
    .eq('id', params.userId)
    .maybeSingle()

  if (error || !profile) {
    return { sent: false, skipped: true, reason: 'profile_not_found' }
  }

  const email = profile.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { sent: false, skipped: true, reason: 'email_missing' }
  }

  const profileData = readProfileData(profile)
  if (!params.force && welcomeAlreadySent(profileData)) {
    return { sent: false, skipped: true, reason: 'already_sent' }
  }

  const userName = profile.full_name?.trim() || email.split('@')[0] || 'Membro'
  const username = profile.username?.trim() || email.split('@')[0] || 'membro'

  const mailResult = await sendWelcomeEmail(email, userName, username)
  if (!mailResult.success) {
    console.error('[new-member-welcome] Falha ao enviar:', mailResult.error)
    return { sent: false, skipped: true, reason: 'send_failed' }
  }

  const sentAt = new Date().toISOString()
  await supabase
    .from('profiles')
    .update({
      profile_data: {
        ...profileData,
        welcome_email_sent_at: sentAt,
        welcome_email_source: params.source,
      },
      updated_at: sentAt,
    })
    .eq('id', params.userId)
    .then(undefined, (err) => {
      console.warn('[new-member-welcome] Erro ao marcar welcome_email_sent_at:', err)
    })

  if (params.notifyTeam === true) {
    const sponsor =
      params.sponsorUsername?.trim() || profile.mlm_sponsor_username?.trim() || undefined
    const eventId = params.eventId || `welcome_${params.userId}_${sentAt.slice(0, 10)}`
    void notifyNewMemberRegistration({
      username,
      sponsorUsername: sponsor,
      eventId,
    })
    if (params.planId) {
      void notifyTeamSale({
        buyerUserId: params.userId,
        username,
        planId: params.planId,
        eventId: `${eventId}_sale`,
      })
    }
    // Email "novo membro" → uplines + admin (idempotente via profile_data)
    void sendNewMemberEmailToUplinesAndAdmin({
      buyerUserId: params.userId,
      memberName: userName,
      memberUsername: username,
      planId: params.planId,
    })
  }

  console.log(`✅ [new-member-welcome] Enviado para ${email} (${params.source})`)
  return { sent: true, skipped: false }
}
