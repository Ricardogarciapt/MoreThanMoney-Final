"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, Check, X, TrendingUp, TrendingDown, Target, Shield, Zap, AlertCircle, CheckCheck, MessageSquare, ExternalLink, Lock, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { ehAdminUi, type PerfilUi } from "@/lib/perfil-ui"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  data?: any // JSONB data field
}

// Tipos de notificação que requerem acesso ao site completo (não disponível no Pack Membro 35€)
const SITE_ONLY_NOTIFICATION_TYPES = new Set([
  'dca_opportunity', 'dca_daily', 'portfolio', 'price_alert', 'take_profit', 'stop_loss',
])

interface NotificationsPanelProps {
  /** Chamado após navegar ao clicar numa notificação (para fechar o drawer) */
  onClose?: () => void
  /** Classe adicional para o container externo */
  className?: string
  /** Utilizador com Pack Membro (35€) — sem acesso ao site completo */
  isAppOnlyUser?: boolean
}

export default function NotificationsPanel({ onClose, className, isAppOnlyUser = false }: NotificationsPanelProps = {}) {
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Buscar user_id para filtrar no realtime
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
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
        data.forEach((n: Notification) => {
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

  const markAllAsRead = async () => {
    try {
      if (!currentUserId) return
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
      if (unreadIds.length === 0) return

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds)
        .eq('user_id', currentUserId)

      if (!error) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      }
    } catch (error) {
      console.error('❌ [NOTIFICATIONS PANEL] Erro ao marcar todas como lidas:', error)
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
      case 'subscription_expiry':
        return <AlertCircle className="h-4 w-4 text-orange-400" />
      case 'message':
        return <MessageSquare className="h-4 w-4 text-blue-400" />
      case 'admin_notification':
        return <Bell className="h-4 w-4 text-purple-400" />
      case 'stripe_skool_pending':
        return <AlertCircle className="h-4 w-4 text-amber-400" />
      case 'stripe_skool_revoke':
        return <AlertCircle className="h-4 w-4 text-red-400" />
      case 'new_member':
      case 'new_sale':
        return <TrendingUp className="h-4 w-4 text-green-400" />
      case 'new_client':
      case 'new_affiliate':
        return <TrendingUp className="h-4 w-4 text-[#D2A63C]" />
      case 'team_renewal':
        return <RefreshCw className="h-4 w-4 text-blue-400" />
      case 'rank_up':
        return <TrendingUp className="h-4 w-4 text-[#D2A63C]" />
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
      case 'subscription_expiry':
        return '/member-area?tab=subscription'
      case 'message':
        return notification.data?.conversation_id
          ? `/app-mobile?tab=chat`
          : '/app-mobile?tab=chat'
      case 'admin_notification':
        return '/member-area?tab=notifications'
      case 'stripe_skool_pending':
      case 'stripe_skool_revoke':
        // Estas nascem para o admin. Se chegarem a um cliente — e chegam, porque o painel não
        // filtra por tipo — mandá-lo para /admin era pô-lo a bater numa porta que não abre.
        return (
          notification.data?.url ||
          (ehAdminUi(user as PerfilUi) ? '/admin?tab=users' : '/member-area?tab=notifications')
        )
      case 'new_member':
      case 'new_sale':
      case 'new_client':
      case 'new_affiliate':
      case 'team_renewal':
      case 'rank_up':
        // `fast-start` não é um separador que exista (ver `validTabs` em /app-mobile): quem
        // carregava era despejado no Feed sem perceber porquê. Estas são de rede/afiliados.
        return '/app-mobile?tab=mlm'
      default:
        return '/member-area?tab=notifications'
    }
  }

  // Função para lidar com clique na notificação
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    // Pack Membro (35€) não tem acesso ao site — mostrar sugestão de upgrade
    if (isAppOnlyUser && SITE_ONLY_NOTIFICATION_TYPES.has(notification.type)) {
      setShowUpgradeModal(true)
      return
    }
    const destination = getNotificationDestination(notification)
    onClose?.()
    router.push(destination)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <>
    <Card className={`bg-gray-900/50 border-[#D2A63C]/30 ${className ?? ''}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <Button
                  onClick={markAllAsRead}
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Todas lidas
                </Button>
                <Badge className="bg-red-500 text-white">
                  {unreadCount} novas
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={`space-y-2 ${onClose ? '' : 'max-h-[400px] overflow-y-auto'}`}>
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

    {/* Modal de upgrade — Pack Membro sem acesso ao site */}
    {showUpgradeModal && (
      <div className="fixed inset-0 z-[999] flex items-end justify-center p-4 pb-8" onClick={() => setShowUpgradeModal(false)}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-sm bg-gray-900 border border-[#D2A63C]/30 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#D2A63C]/15 border border-[#D2A63C]/25 flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#D2A63C]" />
            </div>
            <button onClick={() => setShowUpgradeModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Funcionalidade Premium</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            Os portfólios, alertas DCA e análises de preço fazem parte do <span className="text-white font-medium">Pack Premium</span> com acesso completo ao site morethanmoney.pt.
          </p>
          <div className="space-y-2">
            <a
              href="https://www.morethanmoney.pt/register"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#D2A63C] text-black font-bold text-sm"
              onClick={() => { setShowUpgradeModal(false); onClose?.() }}
            >
              <Zap className="w-4 h-4" />
              Fazer upgrade para Premium
            </a>
            <a
              href="https://www.morethanmoney.pt"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-sm"
              onClick={() => { setShowUpgradeModal(false); onClose?.() }}
            >
              <ExternalLink className="w-4 h-4" />
              Saber mais
            </a>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

