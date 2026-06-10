import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabase = getSupabaseAdmin()

/** Evita executar firebase-admin no import do módulo (build / collect page data). */
async function getFirebaseAdmin() {
  const mod = (await import("firebase-admin")) as unknown as { default?: any } & Record<string, any>
  const admin = mod.default ?? mod
  if (!admin.apps?.length) {
    try {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
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
  userId?: string // Se fornecido, envia só para este usuário
  userIds?: string[] // Se fornecido, envia para múltiplos usuários
  all?: boolean // Se true, envia para todos os usuários
  title: string
  body: string
  data?: Record<string, string>
  url?: string // URL para redirecionar ao clicar
  icon?: string
  tag?: string
}

// POST: Enviar notificação push
export async function POST(request: NextRequest) {
  try {
    const admin = await getFirebaseAdmin()
    const payload: PushNotificationPayload = await request.json()

    if (!payload.title || !payload.body) {
      return NextResponse.json(
        { error: 'title e body são obrigatórios' },
        { status: 400 }
      )
    }

    console.log('📤 [SEND PUSH] Preparando para enviar:', {
      title: payload.title,
      userId: payload.userId,
      userIds: payload.userIds?.length,
      all: payload.all
    })

    // Buscar tokens FCM (inclui device_info para distinguir web FCM de APNs nativo)
    let tokensQuery = supabase
      .from('fcm_tokens')
      .select('token, user_id, device_info')

    if (payload.userId) {
      tokensQuery = tokensQuery.eq('user_id', payload.userId)
    } else if (payload.userIds && payload.userIds.length > 0) {
      tokensQuery = tokensQuery.in('user_id', payload.userIds)
    } else if (!payload.all) {
      return NextResponse.json(
        { error: 'Especifique userId, userIds ou all=true' },
        { status: 400 }
      )
    }

    const { data: fcmTokens, error: tokensError } = await tokensQuery

    if (tokensError) {
      console.error('❌ [SEND PUSH] Erro ao buscar tokens:', tokensError)
      return NextResponse.json(
        { error: 'Erro ao buscar tokens', details: tokensError.message },
        { status: 500 }
      )
    }

    if (!fcmTokens || fcmTokens.length === 0) {
      console.warn('⚠️ [SEND PUSH] Nenhum token encontrado')
      return NextResponse.json({
        success: false,
        message: 'Nenhum dispositivo encontrado para enviar'
      })
    }

    console.log(`📱 [SEND PUSH] Encontrados ${fcmTokens.length} dispositivos`)

    // Separar tokens FCM (web/PWA) de tokens APNs nativos (iOS)
    // Tokens APNs são hex-strings de 64 chars ou têm device_info.nativeApp=true
    // Firebase Admin não suporta tokens APNs directamente — são enviados via APNs provider API
    const apnsPattern = /^[0-9a-f]{64}$/i
    const webTokens = fcmTokens.filter(t => {
      const info = t.device_info as Record<string, unknown> | null
      const isNativeApns = info?.nativeApp === true || info?.platform === 'ios-apns'
      const looksLikeApns = apnsPattern.test(t.token)
      return !isNativeApns && !looksLikeApns
    })
    const apnsTokens = fcmTokens.filter(t => {
      const info = t.device_info as Record<string, unknown> | null
      const isNativeApns = info?.nativeApp === true || info?.platform === 'ios-apns'
      const looksLikeApns = apnsPattern.test(t.token)
      return isNativeApns || looksLikeApns
    })

    if (apnsTokens.length > 0) {
      console.log(`📲 [SEND PUSH] ${apnsTokens.length} tokens APNs nativos (iOS) — a aguardar suporte APNs directo`)
    }

    if (webTokens.length === 0) {
      console.warn('⚠️ [SEND PUSH] Nenhum token FCM (web/PWA) para enviar')
      return NextResponse.json({
        success: true,
        successCount: 0,
        failureCount: 0,
        totalDevices: fcmTokens.length,
        apnsSkipped: apnsTokens.length,
        message: 'Apenas tokens APNs nativos encontrados — push web não enviado'
      })
    }

    // Preparar mensagem FCM (apenas tokens web/PWA)
    const tokens = webTokens.map(t => t.token)
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.icon || '/icon-512x512.png'
      },
      data: {
        url: payload.url || '/app-mobile',
        tag: payload.tag || 'mtm-notification',
        ...payload.data
      },
      tokens
    }

    // Enviar via Firebase Cloud Messaging
    if (!admin.apps?.length) {
      console.error('❌ [SEND PUSH] Firebase Admin não inicializado')
      return NextResponse.json(
        { error: 'Firebase Admin não configurado' },
        { status: 500 }
      )
    }

    console.log('🚀 [SEND PUSH] Enviando notificações...')
    
    const response = await admin.messaging().sendEachForMulticast(message)

    console.log(`✅ [SEND PUSH] Enviadas: ${response.successCount}/${tokens.length}`)
    console.log(`❌ [SEND PUSH] Falharam: ${response.failureCount}`)

    // Salvar histórico de notificações (apenas tokens web enviados)
    const historyPromises = webTokens.map(async (tokenData) => {
      const status = response.responses.find((r: { success: boolean }, i: number) => tokens[i] === tokenData.token)
        ?.success
        ? 'sent'
        : 'failed'

      return supabase.from('notification_history').insert({
        user_id: tokenData.user_id,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        status,
        sent_at: new Date().toISOString()
      })
    })

    await Promise.all(historyPromises)
    console.log('💾 [SEND PUSH] Histórico salvo')

    // Criar entradas na tabela notifications (se data.type existir, usar esse tipo)
    const notificationType = payload.data?.type || 'system'
    if (notificationType !== 'system' || payload.data?.type) { // Só criar se não for genérico 'system'
      const notificationPromises = webTokens.map(async (tokenData) => {
        try {
          await supabase.from("notifications").insert({
            user_id: tokenData.user_id,
            type: notificationType,
            title: payload.title,
            message: payload.body,
            data: payload.data || {},
            read: false,
          })
        } catch (err: unknown) {
          console.warn(
            `⚠️ [SEND PUSH] Falha ao criar notification para ${tokenData.user_id}:`,
            err instanceof Error ? err.message : err
          )
        }
      })
      await Promise.all(notificationPromises)
      console.log(`💾 [SEND PUSH] ${fcmTokens.length} notificações criadas na tabela notifications (type: ${notificationType})`)
    }

    // Remover tokens inválidos
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
        console.log(`🗑️ [SEND PUSH] Removendo ${invalidTokens.length} tokens inválidos`)
        await supabase
          .from('fcm_tokens')
          .delete()
          .in('token', invalidTokens)
      }
    }

    return NextResponse.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalDevices: fcmTokens.length,
      webSent: tokens.length,
      apnsSkipped: apnsTokens.length
    })
  } catch (error) {
    console.error('❌ [SEND PUSH] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao enviar notificações', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

