import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  isCategoryEnabled,
  normalizeNotificationPreferences,
  resolveNotificationCategory,
} from '@/lib/notification-preferences'

const supabase = getSupabaseAdmin()

/** Evita executar firebase-admin no import do módulo (build / collect page data). */
async function getFirebaseAdmin() {
  const mod = (await import('firebase-admin')) as unknown as { default?: any } & Record<string, any>
  const admin = mod.default ?? mod
  if (!admin.apps?.length) {
    try {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
        })
        console.log('✅ Firebase Admin SDK inicializado')
      } else {
        console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY não configurada')
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar Firebase Admin:', error)
    }
  }
  return admin
}

interface PushNotificationPayload {
  userId?: string
  userIds?: string[]
  all?: boolean
  excludeUserId?: string
  /** Quando true, não duplica entrada in-app (o caller já inseriu em notifications) */
  skipInApp?: boolean
  title: string
  body: string
  data?: Record<string, string>
  url?: string
  icon?: string
  tag?: string
}

async function resolveTargetUserIds(payload: PushNotificationPayload): Promise<string[]> {
  if (payload.userId) return [payload.userId]
  if (payload.userIds?.length) return [...new Set(payload.userIds)]

  const { data, error } = await supabase
    .from('profiles')
    .select('id, notification_preferences, is_active')
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id as string)
}

async function filterUsersByPreferences(
  userIds: string[],
  category: ReturnType<typeof resolveNotificationCategory>,
): Promise<string[]> {
  if (!category || userIds.length === 0) return userIds

  const { data, error } = await supabase
    .from('profiles')
    .select('id, notification_preferences')
    .in('id', userIds)

  if (error) {
    console.warn('⚠️ [SEND PUSH] Erro ao ler preferências:', error.message)
    return userIds
  }

  return (data ?? [])
    .filter((row) =>
      isCategoryEnabled(normalizeNotificationPreferences(row.notification_preferences), category),
    )
    .map((row) => row.id as string)
}

// POST: Enviar notificação push + in-app
export async function POST(request: NextRequest) {
  try {
    const admin = await getFirebaseAdmin()
    const payload: PushNotificationPayload = await request.json()

    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: 'title e body são obrigatórios' }, { status: 400 })
    }

    if (!payload.userId && !payload.userIds?.length && !payload.all) {
      return NextResponse.json(
        { error: 'Especifique userId, userIds ou all=true' },
        { status: 400 },
      )
    }

    const category = resolveNotificationCategory(payload.data?.type, payload.data)
    let targetUserIds = await resolveTargetUserIds(payload)

    if (payload.excludeUserId) {
      targetUserIds = targetUserIds.filter((id) => id !== payload.excludeUserId)
    }

    targetUserIds = await filterUsersByPreferences(targetUserIds, category)

    console.log('📤 [SEND PUSH]', {
      title: payload.title,
      category,
      recipients: targetUserIds.length,
    })

    const notificationType = payload.data?.type || 'system'
    const inAppData = {
      ...(payload.data || {}),
      url: payload.url || payload.data?.url || '/app-mobile',
    }

    if (!payload.skipInApp && targetUserIds.length > 0 && notificationType !== 'system') {
      const rows = targetUserIds.map((userId) => ({
        user_id: userId,
        type: notificationType,
        title: payload.title,
        message: payload.body,
        data: inAppData,
        read: false,
      }))
      const { error: notifError } = await supabase.from('notifications').insert(rows)
      if (notifError) {
        console.warn('⚠️ [SEND PUSH] Falha ao criar notificações in-app:', notifError.message)
      } else {
        console.log(`💾 [SEND PUSH] ${rows.length} notificações in-app criadas`)
      }
    }

    if (targetUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        successCount: 0,
        failureCount: 0,
        totalDevices: 0,
        recipients: 0,
        message: 'Nenhum destinatário com esta categoria activa',
      })
    }

    const { data: fcmTokens, error: tokensError } = await supabase
      .from('fcm_tokens')
      .select('token, user_id, device_info')
      .in('user_id', targetUserIds)

    if (tokensError) {
      console.error('❌ [SEND PUSH] Erro ao buscar tokens:', tokensError)
      return NextResponse.json(
        { error: 'Erro ao buscar tokens', details: tokensError.message },
        { status: 500 },
      )
    }

    if (!fcmTokens?.length) {
      return NextResponse.json({
        success: true,
        successCount: 0,
        failureCount: 0,
        totalDevices: 0,
        recipients: targetUserIds.length,
        inAppCreated: targetUserIds.length,
        message: 'Notificações in-app criadas; nenhum dispositivo push registado',
      })
    }

    const apnsPattern = /^[0-9a-f]{64}$/i
    const webTokens = fcmTokens.filter((t) => {
      const info = t.device_info as Record<string, unknown> | null
      const isNativeApns = info?.nativeApp === true || info?.platform === 'ios-apns'
      const looksLikeApns = apnsPattern.test(t.token)
      return !isNativeApns && !looksLikeApns
    })
    const apnsTokens = fcmTokens.filter((t) => !webTokens.includes(t))

    if (apnsTokens.length > 0) {
      console.log(`📲 [SEND PUSH] ${apnsTokens.length} tokens APNs nativos (iOS) — push nativo pendente`)
    }

    if (webTokens.length === 0) {
      return NextResponse.json({
        success: true,
        successCount: 0,
        failureCount: 0,
        totalDevices: fcmTokens.length,
        recipients: targetUserIds.length,
        apnsSkipped: apnsTokens.length,
        inAppCreated: targetUserIds.length,
        message: 'Notificações in-app criadas; apenas tokens APNs nativos encontrados',
      })
    }

    const tokens = webTokens.map((t) => t.token)
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.icon || '/icon-512x512.png',
      },
      data: {
        url: payload.url || payload.data?.url || '/app-mobile',
        tag: payload.tag || 'mtm-notification',
        ...(payload.data || {}),
      },
      tokens,
    }

    if (!admin.apps?.length) {
      console.error('❌ [SEND PUSH] Firebase Admin não inicializado')
      return NextResponse.json(
        {
          success: true,
          recipients: targetUserIds.length,
          inAppCreated: targetUserIds.length,
          pushSkipped: true,
          message: 'In-app criadas; Firebase Admin não configurado para push',
        },
        { status: 200 },
      )
    }

    const response = await admin.messaging().sendEachForMulticast(message)

    const historyPromises = webTokens.map(async (tokenData, idx) => {
      const status = response.responses[idx]?.success ? 'sent' : 'failed'
      return supabase.from('notification_history').insert({
        user_id: tokenData.user_id,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        status,
        sent_at: new Date().toISOString(),
      })
    })
    await Promise.all(historyPromises)

    if (response.failureCount > 0) {
      const invalidTokens: string[] = []
      response.responses.forEach((resp: { success: boolean; error?: { code?: string } }, idx: number) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokens[idx])
          }
        }
      })
      if (invalidTokens.length > 0) {
        await supabase.from('fcm_tokens').delete().in('token', invalidTokens)
      }
    }

    return NextResponse.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalDevices: fcmTokens.length,
      recipients: targetUserIds.length,
      webSent: tokens.length,
      apnsSkipped: apnsTokens.length,
      inAppCreated: targetUserIds.length,
    })
  } catch (error) {
    console.error('❌ [SEND PUSH] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao enviar notificações', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
