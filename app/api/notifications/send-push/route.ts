import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  isCategoryEnabled,
  normalizeNotificationPreferences,
  resolveNotificationCategory,
} from '@/lib/notification-preferences'

const supabase = getSupabaseAdmin()

/** Parse FIREBASE_SERVICE_ACCOUNT_KEY — suporta JSON com newlines literais na private key. */
function parseFirebaseServiceAccount(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    try {
      return JSON.parse(trimmed.replace(/\n/g, '\\n')) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

/** Evita executar firebase-admin no import do módulo (build / collect page data). */
async function getFirebaseAdmin() {
  const mod = (await import('firebase-admin')) as unknown as { default?: any } & Record<string, any>
  const admin = mod.default ?? mod
  if (!admin.apps?.length) {
    try {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
      if (serviceAccount) {
        const parsed = parseFirebaseServiceAccount(serviceAccount)
        if (!parsed) {
          console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY inválido (JSON não parseável)')
        } else {
          const clientProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
          const serverProject = String(parsed.project_id ?? '')
          if (clientProject && serverProject && clientProject !== serverProject) {
            console.error(
              `❌ Firebase project mismatch: client=${clientProject} server=${serverProject}`,
            )
          }
          admin.initializeApp({
            credential: admin.credential.cert(parsed),
          })
          console.log('✅ Firebase Admin SDK inicializado:', serverProject || clientProject)
        }
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

    let inAppCreated = 0
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
        inAppCreated = rows.length
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

    // Apenas tokens activos; deduplica por token para evitar envios duplos
    const { data: fcmTokensRaw, error: tokensError } = await supabase
      .from('fcm_tokens')
      .select('token, user_id, device_info')
      .in('user_id', targetUserIds)
      .eq('active', true)

    if (tokensError) {
      console.error('❌ [SEND PUSH] Erro ao buscar tokens:', tokensError)
      return NextResponse.json(
        { error: 'Erro ao buscar tokens', details: tokensError.message },
        { status: 500 },
      )
    }

    // Deduplica por token (o mesmo dispositivo pode ter registado o token várias vezes)
    const seen = new Set<string>()
    const fcmTokens = (fcmTokensRaw ?? []).filter((t) => {
      if (seen.has(t.token)) return false
      seen.add(t.token)
      return true
    })

    if (!fcmTokens?.length) {
      return NextResponse.json({
        success: true,
        successCount: 0,
        failureCount: 0,
        totalDevices: 0,
        recipients: targetUserIds.length,
        inAppCreated,
        message: 'Notificações in-app criadas; nenhum dispositivo push registado',
      })
    }

    // Tokens APNs: platform explicitamente 'ios-apns' OU exactamente 64 hex chars (32 bytes)
    // Tudo o resto (Android FCM, iOS FCM via Firebase SDK) vai pelo Firebase Admin
    const apnsPattern = /^[0-9a-f]{64}$/i
    const isApnsToken = (t: { token: string; device_info: unknown }) => {
      const info = t.device_info as Record<string, unknown> | null
      const platform = info?.platform as string | undefined
      return platform === 'ios-apns' || apnsPattern.test(t.token)
    }
    const apnsTokens = fcmTokens.filter(isApnsToken)
    const webTokens = fcmTokens.filter((t) => !isApnsToken(t))

    // APNs direct push for native iOS tokens
    let apnsSent = 0
    let apnsFailed = 0
    if (apnsTokens.length > 0) {
      const apnsResult = await sendApnsNotifications(apnsTokens, payload)
      apnsSent   = apnsResult.sent
      apnsFailed = apnsResult.failed
      console.log(`📲 [SEND PUSH] APNs: ${apnsSent} enviadas, ${apnsFailed} falharam`)
    }

    if (webTokens.length === 0) {
      return NextResponse.json({
        success: true,
        successCount: apnsSent,
        failureCount: apnsFailed,
        totalDevices: fcmTokens.length,
        recipients: targetUserIds.length,
        apnsSent,
        apnsFailed,
        inAppCreated,
      })
    }

    const tokens = webTokens.map((t) => t.token)
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
        // FCM exige URL absoluta — URL relativa causa messaging/invalid-payload
        ...(payload.icon?.startsWith('http') ? { imageUrl: payload.icon } : {}),
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
          inAppCreated,
          pushSkipped: true,
          message: 'In-app criadas; Firebase Admin não configurado para push',
        },
        { status: 200 },
      )
    }

    const response = await admin.messaging().sendEachForMulticast(message)

    const invalidTokens: string[] = []
    const historyPromises = webTokens.map(async (tokenData, idx) => {
      const resp = response.responses[idx]
      const status = resp?.success ? 'sent' : 'failed'
      const errorCode = resp?.error?.code as string | undefined
      const errorMessage = errorCode ?? (resp?.success ? undefined : 'unknown_error')

      // Tokens inválidos/expirados — remover da DB
      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/mismatched-credential'
      ) {
        invalidTokens.push(tokens[idx])
      }

      if (!resp?.success && errorCode) {
        console.warn(`⚠️ [SEND PUSH] Token falhou (${errorCode}): ${tokens[idx].substring(0, 20)}...`)
      }

      return supabase.from('notification_history').insert({
        user_id: tokenData.user_id,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        status,
        error_message: errorMessage ?? null,
        sent_at: new Date().toISOString(),
      })
    })
    await Promise.all(historyPromises)

    if (invalidTokens.length > 0) {
      console.log(`🗑️ [SEND PUSH] Removing ${invalidTokens.length} invalid tokens`)
      await supabase.from('fcm_tokens').delete().in('token', invalidTokens)
    }

    return NextResponse.json({
      success: true,
      successCount: response.successCount + apnsSent,
      failureCount: response.failureCount + apnsFailed,
      totalDevices: fcmTokens.length,
      recipients: targetUserIds.length,
      webSent: tokens.length,
      apnsSent,
      inAppCreated,
    })
  } catch (error) {
    console.error('❌ [SEND PUSH] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao enviar notificações', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

// ---------------------------------------------------------------------------
// APNs direct push via HTTP/2 JWT (iOS native tokens)
// APNs requires HTTP/2 — uses Node.js http2 module (not fetch which is HTTP/1.1)
// Requires env vars: APNS_AUTH_KEY (p8 content), APNS_KEY_ID, APNS_TEAM_ID
// ---------------------------------------------------------------------------

async function sendApnsNotifications(
  tokens: Array<{ token: string; user_id: string }>,
  payload: { title: string; body: string; data?: Record<string, string>; url?: string },
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 }

  // Support both actual newlines and \n escape in env var
  const authKey  = process.env.APNS_AUTH_KEY?.trim().replace(/\\n/g, '\n')
  const keyId    = process.env.APNS_KEY_ID?.trim()
  const teamId   = process.env.APNS_TEAM_ID?.trim()
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || 'pt.morethanmoney.app'

  if (!authKey || !keyId || !teamId) {
    console.warn('⚠️ [APNs] APNS_AUTH_KEY / APNS_KEY_ID / APNS_TEAM_ID não configurados — iOS push ignorado')
    return { sent: 0, failed: tokens.length }
  }

  const jwtToken = await buildApnsJwt(authKey, keyId, teamId)

  const apnsPayload = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      badge: 1,
      // Categoria de ações (ex: botão "Tap to Trade" no iPhone e no Apple Watch)
      ...(payload.data?.category ? { category: payload.data.category } : {}),
    },
    url: payload.url || payload.data?.url || '/app-mobile',
    ...(payload.data || {}),
  })

  let sent = 0, failed = 0

  const { connect } = await import('http2')

  return new Promise<{ sent: number; failed: number }>((resolve) => {
    const client = connect('https://api.push.apple.com', { rejectUnauthorized: true })

    client.on('error', (err) => {
      console.error('⚠️ [APNs] HTTP/2 session error:', err.message)
      client.destroy()
      resolve({ sent, failed: tokens.length })
    })

    let pending = tokens.length

    const finish = () => {
      if (--pending === 0) {
        client.close(() => resolve({ sent, failed }))
      }
    }

    for (const { token } of tokens) {
      const req = client.request({
        ':method':       'POST',
        ':path':         `/3/device/${token}`,
        ':scheme':       'https',
        ':authority':    'api.push.apple.com',
        'authorization': `bearer ${jwtToken}`,
        'apns-topic':    bundleId,
        'apns-push-type':'alert',
        'apns-priority': '10',
        'content-type':  'application/json',
      })

      req.on('response', (headers) => {
        const status = headers[':status'] as number
        if (status === 200) {
          sent++
          req.resume()
          req.on('end', finish)
        } else {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body)
              console.warn(`⚠️ [APNs] ${token.substring(0, 16)}... status=${status} reason=${(parsed as any).reason}`)
            } catch {}
            failed++
            finish()
          })
        }
      })

      req.on('error', (err) => {
        console.warn(`⚠️ [APNs] Request error for ${token.substring(0, 16)}...`, err.message)
        failed++
        finish()
      })

      req.write(apnsPayload, 'utf8')
      req.end()
    }
  })
}

async function buildApnsJwt(authKey: string, keyId: string, teamId: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header   = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url')
  const claims   = Buffer.from(JSON.stringify({ iss: teamId, iat: issuedAt })).toString('base64url')
  const unsigned = `${header}.${claims}`

  // Web Crypto API (Node.js 18+ / OpenSSL 3 compatible)
  // subtle.sign retorna ECDSA em formato raw R||S (ieee-p1363) — correcto para APNs JWT
  const keyDer = Buffer.from(
    authKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''),
    'base64',
  )
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    Buffer.from(unsigned),
  )
  const signature = Buffer.from(sigBuffer).toString('base64url')
  return `${unsigned}.${signature}`
}
