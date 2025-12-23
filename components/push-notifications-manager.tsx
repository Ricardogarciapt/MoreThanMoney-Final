"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  requestNotificationPermission, 
  onMessageListener,
  removeFCMToken,
  saveFCMToken
} from '@/lib/firebase-config'
import { Bell, BellOff, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

interface NotificationToast {
  title: string
  body: string
  url?: string
}

export default function PushNotificationsManager() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    checkNotificationStatus()
    setupMessageListener()
  }, [])

  const checkNotificationStatus = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission)
      setIsEnabled(Notification.permission === 'granted')
      
      // Verificar se já tem token salvo
      const savedToken = localStorage.getItem('mtm_fcm_token')
      if (savedToken) {
        setFcmToken(savedToken)
      }
    }
  }

  const setupMessageListener = async () => {
    await onMessageListener((payload) => {
      console.log('📨 Notificação recebida (foreground):', payload)
      
      // Mostrar toast com a notificação
      if (payload.notification) {
        showNotificationToast({
          title: payload.notification.title || 'MTM Notification',
          body: payload.notification.body || '',
          url: payload.data?.url
        })
      }
    })
  }

  const showNotificationToast = (notification: NotificationToast) => {
    toast.custom((t) => (
      <Card className="bg-gray-900 border-[#D2A63C]/30 w-full max-w-md">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#D2A63C] rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-black" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white mb-1">{notification.title}</h3>
              <p className="text-sm text-gray-300">{notification.body}</p>
            </div>
            <button
              onClick={() => toast.dismiss(t)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {notification.url && (
            <Button
              onClick={() => {
                window.location.href = notification.url!
                toast.dismiss(t)
              }}
              size="sm"
              className="w-full mt-3 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
            >
              Ver Detalhes
            </Button>
          )}
        </CardContent>
      </Card>
    ), {
      duration: 10000,
      position: 'top-right'
    })
  }

  const enableNotifications = async () => {
    setIsLoading(true)
    try {
      console.log('🔔 Ativando notificações push...')

      // Solicitar permissão e obter token
      const token = await requestNotificationPermission()

      if (!token) {
        alert('❌ Não foi possível obter permissão para notificações.\n\nVerifica as configurações do teu browser.')
        setIsLoading(false)
        return
      }

      console.log('✅ Token FCM obtido:', token.substring(0, 20) + '...')
      setFcmToken(token)
      localStorage.setItem('mtm_fcm_token', token)

      // Obter usuário atual
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        alert('❌ Precisa estar logado para ativar notificações')
        setIsLoading(false)
        return
      }

      // Obter informações do dispositivo
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        timestamp: new Date().toISOString()
      }

      // Salvar token no Supabase
      const saved = await saveFCMToken(session.user.id, token)

      if (saved) {
        setIsEnabled(true)
        setNotificationPermission('granted')
        toast.success('✅ Notificações ativadas com sucesso!', {
          description: 'Vais receber alertas importantes do MTM',
          duration: 5000
        })
      } else {
        alert('❌ Erro ao salvar token de notificação')
      }
    } catch (error) {
      console.error('❌ Erro ao ativar notificações:', error)
      alert('❌ Erro ao ativar notificações. Tenta novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const disableNotifications = async () => {
    setIsLoading(true)
    try {
      console.log('🔕 Desativando notificações push...')

      if (fcmToken) {
        // Remover token do Supabase
        await removeFCMToken(fcmToken)
        localStorage.removeItem('mtm_fcm_token')
        setFcmToken(null)
      }

      setIsEnabled(false)
      toast.info('🔕 Notificações desativadas', {
        description: 'Podes reativar a qualquer momento',
        duration: 3000
      })
    } catch (error) {
      console.error('❌ Erro ao desativar notificações:', error)
      alert('❌ Erro ao desativar notificações')
    } finally {
      setIsLoading(false)
    }
  }

  // Se o browser não suportar notificações
  if (typeof window !== 'undefined' && !('Notification' in window)) {
    return (
      <Card className="bg-gray-900 border-[#D2A63C]/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <BellOff className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-400">
                Notificações push não suportadas neste browser
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <Bell className="w-5 h-5 text-green-400" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                <BellOff className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-white text-sm">
                Notificações Push
              </h3>
              <p className="text-xs text-gray-400">
                {isEnabled 
                  ? 'Ativos - Receberás alertas importantes' 
                  : 'Desativadas - Ativa para receber alertas'}
              </p>
            </div>
          </div>
          
          <Button
            onClick={isEnabled ? disableNotifications : enableNotifications}
            disabled={isLoading}
            size="sm"
            className={isEnabled 
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
              : "bg-[#D2A63C] text-black hover:bg-[#BB8525]"}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isEnabled ? (
              <>
                <X className="w-4 h-4 mr-1" />
                Desativar
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Ativar
              </>
            )}
          </Button>
        </div>

        {isEnabled && fcmToken && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              Token: {fcmToken.substring(0, 30)}...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

