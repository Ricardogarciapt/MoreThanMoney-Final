import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, Messaging, isSupported } from 'firebase/messaging'

const trimEnv = (value: string | undefined) => (value || '').trim()

// Configuração do Firebase
// IMPORTANTE: Adicionar estas variáveis no .env.local e Vercel (sem newline no final)
const firebaseConfig = {
  apiKey: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: trimEnv(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID),
}

// Validar se Firebase está configurado
const isFirebaseConfigured = () => {
  return Boolean(
    firebaseConfig.projectId &&
    firebaseConfig.apiKey &&
    firebaseConfig.messagingSenderId &&
    !firebaseConfig.apiKey.startsWith('AIzaSyCUcY') // Não é o placeholder antigo
  )
}

// Logar status de configuração
if (typeof window !== 'undefined') {
  if (!isFirebaseConfigured()) {
    console.warn('⚠️ [FCM] Firebase não está configurado corretamente')
    console.warn('⚠️ [FCM] Notificações push não estarão disponíveis')
    console.warn('⚠️ [FCM] Consulte: PUSH_NOTIFICATIONS_SETUP.md')
  } else {
    console.log('✅ [FCM] Firebase configurado:', firebaseConfig.projectId)
  }
}

let app: FirebaseApp | undefined
let messaging: Messaging | undefined

// Inicializar Firebase apenas no client-side E se estiver configurado
if (typeof window !== 'undefined' && isFirebaseConfigured()) {
  if (!getApps().length) {
    try {
      app = initializeApp(firebaseConfig)
      console.log('✅ [FCM] Firebase App inicializado')
    } catch (error) {
      console.error('❌ [FCM] Erro ao inicializar Firebase:', error)
    }
  } else {
    app = getApps()[0]
    console.log('✅ [FCM] Usando Firebase App existente')
  }
}

// Obter instância do Messaging (apenas no client-side e se suportado)
export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') return null
  
  try {
    const supported = await isSupported()
    if (!supported) {
      console.warn('⚠️ [FCM] Push notifications não suportadas neste browser')
      return null
    }
    
    if (!messaging && app) {
      messaging = getMessaging(app)
    }
    return messaging || null
  } catch (error) {
    console.error('❌ [FCM] Erro ao obter messaging:', error)
    return null
  }
}

// Solicitar permissão e obter token FCM
export const requestNotificationPermission = async (): Promise<string | null> => {
  try {
    console.log('🔔 [FCM] Solicitando permissão para notificações...')
    
    // Verificar se já tem permissão
    if (Notification.permission === 'granted') {
      console.log('✅ [FCM] Permissão já concedida')
      return await getFCMToken()
    }
    
    // Solicitar permissão
    const permission = await Notification.requestPermission()
    
    if (permission === 'granted') {
      console.log('✅ [FCM] Permissão concedida!')
      return await getFCMToken()
    } else if (permission === 'denied') {
      console.warn('❌ [FCM] Permissão negada pelo utilizador')
      return null
    } else {
      console.warn('⚠️ [FCM] Permissão não decidida')
      return null
    }
  } catch (error) {
    console.error('❌ [FCM] Erro ao solicitar permissão:', error)
    return null
  }
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
    if (existing?.active) return existing
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  } catch (error) {
    console.error('❌ [FCM] Erro ao registar service worker:', error)
    return null
  }
}

// Obter token FCM
export const getFCMToken = async (): Promise<string | null> => {
  try {
    const messagingInstance = await getMessagingInstance()
    if (!messagingInstance) {
      console.warn('⚠️ [FCM] Messaging não disponível')
      return null
    }
    
    const vapidKey = trimEnv(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)
    if (!vapidKey) {
      console.error('❌ [FCM] VAPID Key não configurada')
      return null
    }

    const swRegistration = await getServiceWorkerRegistration()
    if (!swRegistration) {
      console.error('❌ [FCM] Service worker não disponível para push')
      return null
    }
    
    console.log('🔑 [FCM] Obtendo token FCM...')
    
    const token = await getToken(messagingInstance, { vapidKey, serviceWorkerRegistration: swRegistration })
    
    if (token) {
      console.log('✅ [FCM] Token obtido:', token.substring(0, 20) + '...')
      return token
    } else {
      console.warn('⚠️ [FCM] Nenhum token disponível')
      return null
    }
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ [FCM] Erro ao obter token:', code || message, error)
    return null
  }
}

// Listener para mensagens em foreground
export const onMessageListener = async (callback: (payload: any) => void) => {
  try {
    const messagingInstance = await getMessagingInstance()
    if (!messagingInstance) return
    
    onMessage(messagingInstance, (payload) => {
      console.log('📨 [FCM] Mensagem recebida (foreground):', payload)
      callback(payload)
    })
  } catch (error) {
    console.error('❌ [FCM] Erro ao configurar listener:', error)
  }
}

// Salvar token no Supabase
export const saveFCMToken = async (userId: string, token: string) => {
  try {
    console.log('💾 [FCM] Salvando token no Supabase...')
    
    const response = await fetch('/api/notifications/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        token,
        deviceInfo: { platform: 'web-fcm', nativeApp: false },
      }),
    })
    
    if (response.ok) {
      console.log('✅ [FCM] Token salvo com sucesso!')
      return true
    } else {
      console.error('❌ [FCM] Erro ao salvar token:', await response.text())
      return false
    }
  } catch (error) {
    console.error('❌ [FCM] Erro ao salvar token:', error)
    return false
  }
}

// Remover token do Supabase (logout)
export const removeFCMToken = async (token: string) => {
  try {
    console.log('🗑️ [FCM] Removendo token...')
    
    const response = await fetch('/api/notifications/fcm-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    
    if (response.ok) {
      console.log('✅ [FCM] Token removido com sucesso!')
      return true
    } else {
      console.error('❌ [FCM] Erro ao remover token')
      return false
    }
  } catch (error) {
    console.error('❌ [FCM] Erro ao remover token:', error)
    return false
  }
}

export { app }

