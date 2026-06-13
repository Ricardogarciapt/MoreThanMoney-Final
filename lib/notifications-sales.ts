/**
 * lib/notifications-sales.ts
 * Notificações de vendas, registos e afiliados MLM.
 * Destinatários: Admin, VIP (user_type) e Sponsor do cliente — nunca membros normais.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabase = getSupabaseAdmin()

const SALES_TYPES = new Set([
  'new_member',
  'new_sale',
  'new_client',
  'new_affiliate',
  'team_renewal',
])

async function getMessaging(): Promise<any | null> {
  try {
    const mod = (await import('firebase-admin')) as unknown as { default?: any } & Record<string, any>
    const admin = mod.default ?? mod
    if (!admin.apps?.length) {
      const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
      if (key) {
        try {
          admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) })
        } catch {
          // Já inicializado
        }
      }
    }
    return admin.apps?.length ? admin.messaging() : null
  } catch {
    return null
  }
}

function planLabel(planId: string): string {
  const map: Record<string, string> = {
    app_member_monthly: 'Pack Membro MTM (Mensal)',
    app_member_annual: 'Pack Membro MTM (Anual)',
    premium_monthly: 'Pack Premium MTM (Mensal)',
    premium_annual: 'Pack Premium MTM (Anual)',
    goldkiller_lifetime: 'Scanner Gold Killer (Vitalício)',
    mtm_scanner_monthly: 'Scanner MTM V3.4 (Mensal)',
    mtm_scanner_lifetime: 'Scanner MTM V3.4 (Vitalício)',
    scanners_monthly: 'Pack Total de Scanners (Mensal)',
    scanners_semestral: 'Pack Total de Scanners (Semestral)',
    scanners_lifetime: 'Pack Total de Scanners (Vitalício)',
    mtmcopy_addon_monthly: 'MTMCopy Addon (Mensal)',
    app_member: 'Pack Membro MTM',
    premium: 'Pack Premium MTM',
  }
  return map[planId] ?? planId
}

/** Admin + VIP (user_type) — liderança da rede */
async function getLeadershipIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_active', true)
    .in('user_type', ['admin', 'vip'])
  return [...new Set((data ?? []).map((r) => r.id as string))]
}

async function getSponsorId(sponsorUsername: string): Promise<string | null> {
  if (!sponsorUsername?.trim()) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername.trim())
    .maybeSingle()
  return data?.id ?? null
}

/** Evita duplicar a mesma notificação (ex: webhook + complete-registration) */
async function filterAlreadyNotified(
  userIds: string[],
  type: string,
  eventId?: string,
): Promise<string[]> {
  if (!eventId || !userIds.length) return userIds
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notifications')
    .select('user_id, data')
    .in('user_id', userIds)
    .eq('type', type)
    .gte('created_at', since)

  const seen = new Set(
    (data ?? [])
      .filter((row) => {
        const d = row.data as Record<string, unknown> | null
        return d?.event_id === eventId
      })
      .map((row) => row.user_id as string),
  )
  return userIds.filter((id) => !seen.has(id))
}

async function dispatch(
  userIds: string[],
  title: string,
  body: string,
  type: string,
  extraData?: Record<string, string>,
  eventId?: string,
): Promise<void> {
  if (!userIds.length) return

  const targets = await filterAlreadyNotified(userIds, type, eventId)
  if (!targets.length) return

  const url = SALES_TYPES.has(type) ? '/app-mobile?tab=fast-start' : '/app-mobile'
  const dataPayload = { url, ...(eventId ? { event_id: eventId } : {}), ...(extraData ?? {}) }

  const rows = targets.map((user_id) => ({
    user_id,
    type,
    title,
    message: body,
    data: dataPayload,
    read: false,
  }))

  const { error: insertErr } = await supabase.from('notifications').insert(rows)
  if (insertErr) {
    console.warn('[SALES NOTIF] Falha in-app:', insertErr.message)
  }

  const apnsPattern = /^[0-9a-f]{64}$/i
  const { data: allTokens } = await supabase
    .from('fcm_tokens')
    .select('token, user_id, device_info')
    .in('user_id', targets)

  const fcmTokens = (allTokens ?? []).filter((t) => {
    const platform = (t.device_info as Record<string, unknown> | null)?.platform as string | undefined
    return !(platform === 'ios-apns' || apnsPattern.test(t.token))
  })

  if (!fcmTokens.length) return

  const messaging = await getMessaging()
  if (!messaging) return

  const tokenList = fcmTokens.map((t) => t.token)
  try {
    const resp = await messaging.sendEachForMulticast({
      notification: { title, body, imageUrl: '/icon-512x512.png' },
      data: { url, tag: 'mtm-sales', ...dataPayload },
      tokens: tokenList,
    })

    const invalid: string[] = []
    resp.responses.forEach((r: any, i: number) => {
      const code = r?.error?.code as string | undefined
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalid.push(tokenList[i])
      }
    })
    if (invalid.length) {
      await supabase.from('fcm_tokens').delete().in('token', invalid)
    }
  } catch (e) {
    console.warn('[SALES NOTIF] Erro FCM:', e)
  }
}

/** Admin + VIP — novo membro registado */
export async function notifyAdminsNewMember(params: {
  name: string
  planId: string
  sponsorUsername?: string
  eventId?: string
}): Promise<void> {
  try {
    const leadershipIds = await getLeadershipIds()
    if (!leadershipIds.length) return

    const pack = planLabel(params.planId)
    const via = params.sponsorUsername ? ` via @${params.sponsorUsername}` : ''
    await dispatch(
      leadershipIds,
      '🆕 Novo Membro MTM!',
      `${params.name} entrou com o ${pack}${via}`,
      'new_member',
      { plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[SALES NOTIF] notifyAdminsNewMember:', e)
  }
}

/** Admin + VIP — nova venda/checkout */
export async function notifyAdminsVipsNewSale(params: {
  name: string
  planId: string
  amountEur?: number
  eventId?: string
}): Promise<void> {
  try {
    const leadershipIds = await getLeadershipIds()
    if (!leadershipIds.length) return

    const pack = planLabel(params.planId)
    const amount = params.amountEur && params.amountEur > 0 ? ` — €${params.amountEur.toFixed(2)}` : ''
    await dispatch(
      leadershipIds,
      '💰 Nova Venda MTM!',
      `${params.name} adquiriu o ${pack}${amount}`,
      'new_sale',
      { plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[SALES NOTIF] notifyAdminsVipsNewSale:', e)
  }
}

/** Sponsor — cliente novo na rede */
export async function notifySponsorNewClient(params: {
  sponsorUsername: string
  clientName: string
  planId: string
  eventId?: string
}): Promise<void> {
  try {
    const sponsorId = await getSponsorId(params.sponsorUsername)
    if (!sponsorId) return

    const pack = planLabel(params.planId)
    await dispatch(
      [sponsorId],
      '🎉 Tens um Cliente NOVO!',
      `${params.clientName} acabou de entrar com o ${pack}. A tua rede está a crescer! 🚀`,
      'new_client',
      { plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorNewClient:', e)
  }
}

/** Sponsor — afiliado novo (registo) */
export async function notifySponsorNewAffiliate(params: {
  sponsorUsername: string
  affiliateName: string
  planId: string
  eventId?: string
}): Promise<void> {
  try {
    const sponsorId = await getSponsorId(params.sponsorUsername)
    if (!sponsorId) return

    const pack = planLabel(params.planId)
    await dispatch(
      [sponsorId],
      '🌟 Tens um Afiliado Novo!',
      `${params.affiliateName} entrou na tua rede com o ${pack}. Juntos chegamos mais longe! 💪`,
      'new_affiliate',
      { plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorNewAffiliate:', e)
  }
}

/** Sponsor + Admin + VIP — renovação na equipa */
export async function notifySponsorTeamRenewal(params: {
  sponsorId: string
  memberName: string
  commission: number
  eventId?: string
}): Promise<void> {
  try {
    const leadershipIds = await getLeadershipIds()
    const recipientIds = [...new Set([params.sponsorId, ...leadershipIds])]

    const commStr = params.commission > 0 ? ` +€${params.commission.toFixed(2)} para o sponsor! 💶` : ''
    await dispatch(
      recipientIds,
      '♻️ Renovação na Equipa!',
      `${params.memberName} renovou a subscrição.${commStr}`,
      'team_renewal',
      undefined,
      params.eventId,
    )
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorTeamRenewal:', e)
  }
}

/** Resolve sponsor: perfil → metadata Stripe */
export function resolveSponsorUsername(
  profileSponsor?: string | null,
  metadataSponsor?: string | null,
): string {
  return (profileSponsor || metadataSponsor || '').trim()
}
