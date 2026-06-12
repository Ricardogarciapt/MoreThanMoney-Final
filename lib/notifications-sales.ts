/**
 * lib/notifications-sales.ts
 * Notificações de vendas, registos e afiliados MLM.
 * Usado pelos webhooks Stripe e pela rota de complete-registration.
 * Fire-and-forget: cada função captura os seus erros internamente.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabase = getSupabaseAdmin()

// ── Firebase Admin (lazy, mesmo padrão de send-push/route.ts) ────────────────

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
          // Já inicializado — ignorar
        }
      }
    }
    return admin.apps?.length ? admin.messaging() : null
  } catch {
    return null
  }
}

// ── Labels amigáveis de planos ───────────────────────────────────────────────

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

// ── Core: envia in-app + FCM para lista de user IDs ─────────────────────────

async function dispatch(
  userIds: string[],
  title: string,
  body: string,
  type: string,
  extraData?: Record<string, string>,
): Promise<void> {
  if (!userIds.length) return

  // 1. Notificações in-app
  const rows = userIds.map((user_id) => ({
    user_id,
    type,
    title,
    message: body,
    data: { url: '/app-mobile', ...(extraData ?? {}) },
    read: false,
  }))
  await supabase
    .from('notifications')
    .insert(rows)
    .catch((e) => console.warn('[SALES NOTIF] Falha ao criar notif in-app:', e))

  // 2. FCM push
  const apnsPattern = /^[0-9a-f]{64}$/i
  const { data: allTokens } = await supabase
    .from('fcm_tokens')
    .select('token, user_id, device_info')
    .in('user_id', userIds)

  const fcmTokens = (allTokens ?? []).filter((t) => {
    const platform = (t.device_info as Record<string, unknown> | null)?.platform as string | undefined
    // Excluir apenas APNs raw — tokens Capacitor iOS/Android são FCM e devem ser enviados
    return !(platform === 'ios-apns' || apnsPattern.test(t.token))
  })

  if (!fcmTokens.length) return

  const messaging = await getMessaging()
  if (!messaging) return

  const tokenList = fcmTokens.map((t) => t.token)
  try {
    const resp = await messaging.sendEachForMulticast({
      notification: { title, body, imageUrl: '/icon-512x512.png' },
      data: { url: '/app-mobile', tag: 'mtm-sales', ...(extraData ?? {}) },
      tokens: tokenList,
    })

    // Limpar tokens inválidos/expirados
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

// ── Helpers de lookup ────────────────────────────────────────────────────────

async function getAdminIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)
  return (data ?? []).map((r) => r.id as string)
}

async function getVipIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('member_category', 'premium')
    .eq('is_active', true)
  return (data ?? []).map((r) => r.id as string)
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

// ── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Admins recebem notif quando um novo membro cria conta.
 * Chamado de: complete-registration/route.ts
 */
export async function notifyAdminsNewMember(params: {
  name: string
  planId: string
  sponsorUsername?: string
}): Promise<void> {
  try {
    const adminIds = await getAdminIds()
    if (!adminIds.length) return

    const pack = planLabel(params.planId)
    const via = params.sponsorUsername ? ` via @${params.sponsorUsername}` : ''
    await dispatch(
      adminIds,
      '🆕 Novo Membro MTM!',
      `${params.name} entrou com o ${pack}${via}`,
      'new_member',
      { plan: params.planId },
    )
    console.log(`[SALES NOTIF] Admins notificados — novo membro: ${params.name}`)
  } catch (e) {
    console.error('[SALES NOTIF] notifyAdminsNewMember:', e)
  }
}

/**
 * Admins + VIPs recebem notif de nova venda/checkout.
 * Chamado de: webhook/route.ts → handleCheckoutCompleted
 */
export async function notifyAdminsVipsNewSale(params: {
  name: string
  planId: string
  amountEur?: number
}): Promise<void> {
  try {
    const [adminIds, vipIds] = await Promise.all([getAdminIds(), getVipIds()])
    const allIds = [...new Set([...adminIds, ...vipIds])]
    if (!allIds.length) return

    const pack = planLabel(params.planId)
    const amount = params.amountEur && params.amountEur > 0 ? ` — €${params.amountEur.toFixed(2)}` : ''
    await dispatch(
      allIds,
      '💰 Nova Venda MTM!',
      `${params.name} adquiriu o ${pack}${amount}`,
      'new_sale',
      { plan: params.planId },
    )
    console.log(`[SALES NOTIF] Admins+VIPs notificados — nova venda: ${params.name}`)
  } catch (e) {
    console.error('[SALES NOTIF] notifyAdminsVipsNewSale:', e)
  }
}

/**
 * Sponsor recebe "Tens um Cliente NOVO!" quando um referido compra.
 * Chamado de: webhook/route.ts → handleCheckoutCompleted (para userId com sponsor)
 */
export async function notifySponsorNewClient(params: {
  sponsorUsername: string
  clientName: string
  planId: string
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
    )
    console.log(`[SALES NOTIF] Sponsor @${params.sponsorUsername} notificado — novo cliente: ${params.clientName}`)
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorNewClient:', e)
  }
}

/**
 * Sponsor recebe "Tens um Afiliado Novo!" quando um referido cria conta.
 * Chamado de: complete-registration/route.ts (quando sponsor_username está definido)
 */
export async function notifySponsorNewAffiliate(params: {
  sponsorUsername: string
  affiliateName: string
  planId: string
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
    )
    console.log(`[SALES NOTIF] Sponsor @${params.sponsorUsername} notificado — novo afiliado: ${params.affiliateName}`)
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorNewAffiliate:', e)
  }
}

/**
 * Sponsor recebe "A tua Equipa renovou!" em cada renovação mensal/anual.
 * Chamado de: webhook/route.ts → handlePaymentSucceeded
 */
export async function notifySponsorTeamRenewal(params: {
  sponsorId: string
  memberName: string
  commission: number
}): Promise<void> {
  try {
    const commStr =
      params.commission > 0 ? ` +€${params.commission.toFixed(2)} para ti! 💶` : ''
    await dispatch(
      [params.sponsorId],
      '♻️ A tua Equipa renovou!',
      `${params.memberName} renovou a subscrição.${commStr} Continua a construir! 🔥`,
      'team_renewal',
    )
    console.log(`[SALES NOTIF] Sponsor notificado — renovação de: ${params.memberName}`)
  } catch (e) {
    console.error('[SALES NOTIF] notifySponsorTeamRenewal:', e)
  }
}
