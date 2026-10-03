/**
 * Notificações MLM — registos, vendas, renovações e rank up.
 * Sincronizado com mlm_nodes, sponsor chain e Stripe.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getOrganizationUplineUserIds } from '@/lib/mlm-uplines'

const supabase = getSupabaseAdmin()

const MLM_TYPES = new Set([
  'new_member',
  'new_sale',
  'new_client',
  'new_affiliate',
  'team_renewal',
  'rank_up',
])

function formatUsername(username: string): string {
  const u = username.trim()
  return u.startsWith('@') ? u : `@${u}`
}

export function planLabel(planId: string): string {
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

  const url = MLM_TYPES.has(type) ? '/app-mobile?tab=fast-start' : '/app-mobile'
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
    console.warn('[MLM NOTIF] Falha in-app:', insertErr.message)
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
      data: { tag: 'mtm-mlm', ...dataPayload },
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
    console.warn('[MLM NOTIF] Erro FCM:', e)
  }
}

/** Registo novo — VIP/Admin + Sponsor */
export async function notifyNewMemberRegistration(params: {
  username: string
  sponsorUsername?: string
  eventId?: string
}): Promise<void> {
  try {
    const memberTag = formatUsername(params.username)
    const leadershipIds = await getLeadershipIds()

    if (leadershipIds.length) {
      await dispatch(
        leadershipIds,
        '👋 Boas-Vindas ao Membro Novo',
        `${memberTag} entrou na MoreThanMoney!`,
        'new_member',
        { username: params.username },
        params.eventId,
      )
    }

    const sponsorUsername = params.sponsorUsername?.trim()
    if (sponsorUsername) {
      const sponsorId = await getSponsorId(sponsorUsername)
      if (sponsorId) {
        const sponsorTag = formatUsername(sponsorUsername)
        await dispatch(
          [sponsorId],
          '🎉 Conseguiste!',
          `${sponsorTag}, ${memberTag} acabou de aumentar a tua equipa MoreThanMoney!`,
          'new_affiliate',
          { username: params.username, sponsor: sponsorUsername },
          params.eventId ? `${params.eventId}_sponsor` : undefined,
        )
      }
    }
  } catch (e) {
    console.error('[MLM NOTIF] notifyNewMemberRegistration:', e)
  }
}

/** Venda na rede descendente — VIP/Admin + organização ascendente */
export async function notifyTeamSale(params: {
  buyerUserId: string
  username: string
  planId: string
  excludeUserIds?: string[]
  eventId?: string
}): Promise<void> {
  try {
    const pack = planLabel(params.planId)
    const leadershipIds = await getLeadershipIds()
    const uplineIds = await getOrganizationUplineUserIds(params.buyerUserId, params.excludeUserIds ?? [])
    const recipientIds = [...new Set([...leadershipIds, ...uplineIds])]

    if (!recipientIds.length) return

    await dispatch(
      recipientIds,
      '💰 Venda na Tua Equipa!',
      `Parabéns, a tua equipa acabou de vender: ${pack}`,
      'new_sale',
      { username: params.username, plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[MLM NOTIF] notifyTeamSale:', e)
  }
}

/** Renovação — VIP/Admin + sponsor + uplines */
export async function notifyTeamRenewal(params: {
  memberUserId: string
  username: string
  planId: string
  eventId?: string
}): Promise<void> {
  try {
    const pack = planLabel(params.planId)
    const memberTag = formatUsername(params.username)
    const leadershipIds = await getLeadershipIds()
    const uplineIds = await getOrganizationUplineUserIds(params.memberUserId)
    const recipientIds = [...new Set([...leadershipIds, ...uplineIds])]

    if (!recipientIds.length) return

    await dispatch(
      recipientIds,
      '♻️ Renovação na Equipa!',
      `Parabéns, acabaste de renovar um membro da MoreThanMoney (${memberTag} — ${pack}). Continua assim!`,
      'team_renewal',
      { username: params.username, plan: params.planId },
      params.eventId,
    )
  } catch (e) {
    console.error('[MLM NOTIF] notifyTeamRenewal:', e)
  }
}

/** Rank up de membro descendente — organização ascendente */
export async function notifyTeamRankUp(params: {
  memberUserId: string
  username: string
  rankName: string
  eventId?: string
}): Promise<void> {
  try {
    const memberTag = formatUsername(params.username)
    const uplineIds = await getOrganizationUplineUserIds(params.memberUserId)
    if (!uplineIds.length) return

    await dispatch(
      uplineIds,
      '🏆 Rank Up na Equipa!',
      `Parabéns! ${memberTag} da tua equipa subiu de Rank: ${params.rankName}`,
      'rank_up',
      { username: params.username, rank: params.rankName },
      params.eventId,
    )
  } catch (e) {
    console.error('[MLM NOTIF] notifyTeamRankUp:', e)
  }
}

/** Resolve sponsor: perfil → metadata Stripe */
export function resolveSponsorUsername(
  profileSponsor?: string | null,
  metadataSponsor?: string | null,
): string {
  return (profileSponsor || metadataSponsor || '').trim()
}

// ── Compatibilidade com chamadas antigas ───────────────────────────────────

export async function notifyAdminsNewMember(params: {
  name: string
  planId: string
  sponsorUsername?: string
  username?: string
  eventId?: string
}): Promise<void> {
  const username = params.username || params.name.replace(/\s+/g, '').toLowerCase()
  await notifyNewMemberRegistration({
    username,
    sponsorUsername: params.sponsorUsername,
    eventId: params.eventId,
  })
}

export async function notifyAdminsVipsNewSale(params: {
  name: string
  planId: string
  amountEur?: number
  buyerUserId?: string
  username?: string
  eventId?: string
}): Promise<void> {
  if (!params.buyerUserId) return
  const username = params.username || params.name
  await notifyTeamSale({
    buyerUserId: params.buyerUserId,
    username,
    planId: params.planId,
    eventId: params.eventId,
  })
}

export async function notifySponsorNewClient(params: {
  sponsorUsername: string
  clientName: string
  planId: string
  username?: string
  eventId?: string
}): Promise<void> {
  const username = params.username || params.clientName
  await notifyNewMemberRegistration({
    username,
    sponsorUsername: params.sponsorUsername,
    eventId: params.eventId,
  })
}

export async function notifySponsorNewAffiliate(params: {
  sponsorUsername: string
  affiliateName: string
  planId: string
  username?: string
  eventId?: string
}): Promise<void> {
  const username = params.username || params.affiliateName
  await notifyNewMemberRegistration({
    username,
    sponsorUsername: params.sponsorUsername,
    eventId: params.eventId,
  })
}

export async function notifySponsorTeamRenewal(params: {
  sponsorId: string
  memberName: string
  memberUserId?: string
  username?: string
  planId?: string
  commission?: number
  eventId?: string
}): Promise<void> {
  if (!params.memberUserId) {
    const leadershipIds = await getLeadershipIds()
    const recipientIds = [...new Set([params.sponsorId, ...leadershipIds])]
    const memberTag = params.username ? formatUsername(params.username) : params.memberName
    const pack = params.planId ? planLabel(params.planId) : 'subscrição'
    await dispatch(
      recipientIds,
      '♻️ Renovação na Equipa!',
      `Parabéns, acabaste de renovar um membro da MoreThanMoney (${memberTag} — ${pack}). Continua assim!`,
      'team_renewal',
      undefined,
      params.eventId,
    )
    return
  }
  await notifyTeamRenewal({
    memberUserId: params.memberUserId,
    username: params.username || params.memberName,
    planId: params.planId || 'app_member_monthly',
    eventId: params.eventId,
  })
}
