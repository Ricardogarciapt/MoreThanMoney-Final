/**
 * Email de NOVO MEMBRO para a organização ascendente (uplines) + admin.
 * Disparado numa inscrição genuína. Idempotente via profile_data.new_member_notify_sent_at.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getOrganizationUplineUserIds } from '@/lib/mlm-uplines'
import { planLabel } from '@/lib/notifications-sales'
import { newMemberNotificationEmailTemplate } from '@/lib/email-templates'
import {
  brandedMailAttachments,
  createMailTransporter,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/** Admins que recebem sempre a notificação de novo membro. */
const ADMIN_EMAILS = ['ricardo.subtilgarcia@gmail.com', 'morethanmoneypt@gmail.com']

export interface SendNewMemberEmailParams {
  buyerUserId: string
  memberName: string
  memberUsername: string
  planId?: string
  /** Reenvio forçado (ignora idempotência) */
  force?: boolean
}

export async function sendNewMemberEmailToUplinesAndAdmin(
  params: SendNewMemberEmailParams,
): Promise<{ sent: boolean; recipients: number; skipped?: string }> {
  const supabase = getSupabaseAdmin()
  try {
    // ── Idempotência (flag no perfil do comprador) ──────────────────────
    const { data: buyer } = await supabase
      .from('profiles')
      .select('profile_data')
      .eq('id', params.buyerUserId)
      .maybeSingle()

    const pdata: Record<string, unknown> =
      buyer?.profile_data && typeof buyer.profile_data === 'object'
        ? (buyer.profile_data as Record<string, unknown>)
        : {}

    if (!params.force && typeof pdata.new_member_notify_sent_at === 'string') {
      return { sent: false, recipients: 0, skipped: 'already_sent' }
    }

    // ── Resolver emails dos uplines (organização ascendente, ativos) ────
    const uplineIds = await getOrganizationUplineUserIds(params.buyerUserId)
    const uplineRecipients: { email: string; name: string }[] = []
    if (uplineIds.length) {
      const { data: uplineProfiles } = await supabase
        .from('profiles')
        .select('email, full_name, is_active')
        .in('id', uplineIds)
      for (const p of uplineProfiles ?? []) {
        const email = (p.email as string | null)?.trim().toLowerCase()
        if (p.is_active && email && email.includes('@')) {
          uplineRecipients.push({ email, name: (p.full_name as string) || 'Membro' })
        }
      }
    }

    const planText = params.planId ? planLabel(params.planId) : 'MoreThanMoney'
    const siteUrl = getSiteUrl()
    const transporter = createMailTransporter()

    const sendOne = async (to: string, recipientName: string, isAdmin: boolean) => {
      const html = newMemberNotificationEmailTemplate({
        recipientName,
        memberName: params.memberName,
        memberUsername: params.memberUsername,
        planLabel: planText,
        isAdmin,
        siteUrl,
      })
      await transporter.sendMail({
        from: mailFrom(),
        to,
        subject: isAdmin
          ? `🔔 Novo membro — ${params.memberName} (${planText})`
          : `🎉 Novo membro na tua equipa — ${params.memberName}`,
        html: prepareBrandedEmailHtml(html),
        attachments: brandedMailAttachments(),
      })
    }

    let recipients = 0

    // Admin (ricardo.subtilgarcia + morethanmoney)
    for (const adminEmail of ADMIN_EMAILS) {
      try {
        await sendOne(adminEmail, 'Equipa MTM', true)
        recipients++
      } catch (e) {
        console.error('[new-member-email] admin falhou:', adminEmail, e)
      }
    }

    // Uplines
    for (const up of uplineRecipients) {
      // não duplicar se um upline for também um email admin
      if (ADMIN_EMAILS.includes(up.email)) continue
      try {
        await sendOne(up.email, up.name, false)
        recipients++
      } catch (e) {
        console.error('[new-member-email] upline falhou:', up.email, e)
      }
    }

    // ── Marca como enviado ──────────────────────────────────────────────
    await supabase
      .from('profiles')
      .update({
        profile_data: { ...pdata, new_member_notify_sent_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.buyerUserId)
      .then(undefined, (err) =>
        console.warn('[new-member-email] erro ao marcar flag:', err),
      )

    console.log(
      `✅ [new-member-email] ${params.memberName}: ${recipients} destinatário(s) (admin + uplines)`,
    )
    return { sent: recipients > 0, recipients }
  } catch (e) {
    console.error('[new-member-email] erro:', e)
    return { sent: false, recipients: 0, skipped: 'error' }
  }
}
