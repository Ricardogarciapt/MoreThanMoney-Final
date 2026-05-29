"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, Check, X, TrendingUp, TrendingDown, Target, Shield, Zap } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  data?: any // JSONB data field
}

export default function NotificationsPanel() {
  const [mounted, setMounted] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
    // Buscar user_id para filtrar no realtime
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        loadNotifications()
      }
    })
  }, [])

  useEffect(() => {
    if (!mounted || !currentUserId) return
    
    loadNotifications()
    
    // Real-time subscription para notificações
    const channel = supabase
      .channel(`user-notifications-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        () => {
          console.log('🔄 [NOTIFICATIONS] Real-time update recebida')
          loadNotifications()
        }
      )
      .subscribe()
    
    // Verificar notificações a cada 1 minuto (fallback)
    const interval = setInterval(loadNotifications, 60000)
    
    return () => {
      if (channel) supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [mounted, currentUserId])

  const loadNotifications = async () => {
    try {
      if (!currentUserId) {
        setLoading(false)
        return
      }

      // Usar Supabase diretamente para evitar problemas de autenticação
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50)

      // Parse data field se for string
      if (data) {
        data.forEach(n => {
          if (typeof n.data === 'string') {
            try {
              n.data = JSON.parse(n.data)
            } catch (e) {
              n.data = {}
            }
          }
        })
      }

      if (error) {
        console.error('❌ [NOTIFICATIONS PANEL] Erro ao carregar:', error)
        setNotifications([])
      } else {
        setNotifications(data || [])
      }
    } catch (error) {
      console.error('❌ [NOTIFICATIONS PANEL] Erro ao carregar notificações:', error)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    try {
      if (!currentUserId) return
      
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('user_id', currentUserId)

      if (error) {
        console.error('❌ [NOTIFICATIONS PANEL] Erro ao marcar como lida:', error)
      } else {
        setNotifications(prev => prev.map(n => 
          n.id === id ? { ...n, read: true } : n
        ))
      }
    } catch (error) {
      console.error('❌ [NOTIFICATIONS PANEL] Erro ao marcar como lida:', error)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      if (!currentUserId) return
      
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUserId)

      if (error) {
        console.error('❌ [NOTIFICATIONS PANEL] Erro ao deletar:', error)
      } else {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }
    } catch (error) {
      console.error('❌ [NOTIFICATIONS PANEL] Erro ao deletar notificação:', error)
    }
  }

  const router = useRouter()

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'take_profit':
        return <Target className="h-4 w-4 text-green-400" />
      case 'stop_loss':
        return <Shield className="h-4 w-4 text-red-400" />
      case 'dca_opportunity':
      case 'dca_daily':
        return <Zap className="h-4 w-4 text-[#D2A63C]" />
      case 'price_alert':
        return <Bell className="h-4 w-4 text-blue-400" />
      case 'social_post':
        return <TrendingUp className="h-4 w-4 text-blue-400" />
      case 'admin_notification':
        return <Bell className="h-4 w-4 text-purple-400" />
      default:
        return <Bell className="h-4 w-4 text-gray-400" />
    }
  }

  // Função para determinar destino da notificação
  const getNotificationDestination = (notification: Notification): string => {
    // Se houver URL no data, usar essa
    if (notification.data?.url) {
      return notification.data.url
    }

    // Mapear tipo para destino
    switch (notification.type) {
      case 'dca_opportunity':
      case 'dca_daily':
        return '/portfolios?tab=dca' // Ir para portfolios com tab DCA
      case 'social_post':
        return '/app-mobile?tab=social'
      case 'price_alert':
      case 'take_profit':
      case 'stop_loss':
      case 'portfolio':
        return '/portfolios'
      case 'admin_notification':
        return '/member-area?tab=notifications'
      default:
        return '/member-area?tab=notifications'
    }
  }

  // Função para lidar com clique na notificação
  const handleNotificationClick = async (notification: Notification) => {
    // Marcar como lida
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    // Navegar para destino
    const destination = getNotificationDestination(notification)
    router.push(destination)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <Card className="bg-gray-900/50 border-[#D2A63C]/30">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white">
              {unreadCount} novas
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-4 text-gray-400">A carregar...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sem notificações</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`p-3 rounded-lg border transition-all cursor-pointer hover:bg-[#D2A63C]/5 ${
                notification.read
                  ? 'bg-gray-800/30 border-gray-700'
                  : 'bg-[#D2A63C]/10 border-[#D2A63C]/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-white text-sm mb-1">
                    {notification.title}
                  </h4>
                  <p className="text-xs text-gray-300 mb-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(notification.created_at).toLocaleString('pt-PT')}
                  </p>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {!notification.read && (
                    <Button
                      onClick={() => markAsRead(notification.id)}
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 hover:bg-green-500/20"
                    >
                      <Check className="h-3 w-3 text-green-400" />
                    </Button>
                  )}
                  <Button
                    onClick={() => deleteNotification(notification.id)}
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-red-500/20"
                  >
                    <X className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

