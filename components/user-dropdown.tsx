"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  User, 
  LogOut, 
  Shield, 
  ScanEye, 
  LayoutDashboard, 
  Loader2, 
  Home,
  UserCircle,
  TrendingUp,
  ChevronRight,
  Smartphone,
  Bell,
  MessageCircle
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  username?: string
  avatar_url?: string
  user_type?: string
  is_active?: boolean
}

export default function UserDropdown() {
  const pathname = usePathname()
  const { user: authUser, isLoading: authLoading, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const [xpData, setXpData] = useState<{ xp: number; level: number } | null>(null)

  // Usar user do auth-context (única fonte de verdade)
  const user = authUser ? {
    id: authUser.id,
    email: authUser.email,
    full_name: authUser.full_name,
    username: authUser.username,
    avatar_url: authUser.avatar_url,
    user_type: authUser.user_type,
    is_active: authUser.is_active
  } : null

  // Carregar XP quando user estiver disponível
  useEffect(() => {
    if (!user?.id) return

    const loadXP = async () => {
      try {
        console.log('🎮 [USER DROPDOWN] Carregando XP diretamente do Supabase...')
        console.log('👤 [USER DROPDOWN] User ID:', user.id)
        
        const { data: xpData, error } = await supabase
          .from('user_xp')
          .select('total_xp, current_level')
          .eq('user_id', user.id)
          .single()

        if (error) {
          if (error.code === 'PGRST116') {
            // Não existe registro, usar valores padrão
            console.log('ℹ️ [USER DROPDOWN] Sem XP registrado, usando padrão')
            setXpData({ xp: 0, level: 1 })
          } else {
            console.error('❌ [USER DROPDOWN] Erro ao carregar XP:', error)
            setXpData({ xp: 0, level: 1 })
          }
        } else if (xpData) {
          console.log(`✅ [USER DROPDOWN] XP carregado: ${xpData.total_xp} XP, Nível ${xpData.current_level}`)
          setXpData({
            xp: xpData.total_xp || 0,
            level: xpData.current_level || 1
          })
        } else {
          setXpData({ xp: 0, level: 1 })
        }
      } catch (error) {
        console.error('❌ [USER DROPDOWN] Erro ao carregar XP:', error)
        setXpData({ xp: 0, level: 1 })
      }
    }

    loadXP()

    // Listener para evento customizado de atualização de XP
    const handleXPUpdate = (event: CustomEvent) => {
      console.log('🔄 [USER DROPDOWN] Evento XP atualizado recebido:', event.detail)
      setXpData({
        xp: event.detail.total_xp || 0,
        level: event.detail.level || 1
      })
    }

    window.addEventListener('xpUpdated', handleXPUpdate as EventListener)

    // Subscribir a mudanças em tempo real (apenas se houver sessão válida)
    let channel: any = null
    let subscriptionAttempts = 0
    const MAX_SUBSCRIPTION_ATTEMPTS = 1 // Apenas uma tentativa
    
    const setupRealtime = async () => {
      // Evitar múltiplas tentativas
      if (subscriptionAttempts >= MAX_SUBSCRIPTION_ATTEMPTS) {
        console.warn('⚠️ [USER DROPDOWN] Limite de tentativas de subscription atingido, usando apenas polling')
        return
      }
      
      try {
        let { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        // Se não há sessão ou token, tentar renovar
        if (!session?.access_token) {
          console.log('🔄 [USER DROPDOWN] Tentando renovar sessão para XP...')
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
          if (refreshedSession?.access_token) {
            session = refreshedSession
            sessionError = null
          }
        }
        
        if (sessionError || !session?.access_token) {
          console.warn('⚠️ [USER DROPDOWN] Sem sessão válida para Realtime XP, usando apenas polling')
          subscriptionAttempts++
          return
        }

        subscriptionAttempts++
        
        // Criar channel com configuração explícita
        channel = supabase
          .channel(`user_xp_${user.id}`, {
            config: {
              broadcast: { self: false }
            }
          })
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_xp',
              filter: `user_id=eq.${user.id}`
            },
            (payload) => {
              console.log('🔄 [USER DROPDOWN] Mudança detectada na tabela user_xp:', payload)
              loadXP()
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ [USER DROPDOWN] Subscription Realtime XP ativa')
              subscriptionAttempts = 0 // Reset contador se sucesso
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('⚠️ [USER DROPDOWN] Erro na subscription Realtime XP:', status)
              // Não tentar reconectar - usar apenas polling
              if (channel) {
                try {
                  supabase.removeChannel(channel)
                } catch (e) {
                  // Ignorar erros ao remover
                }
                channel = null
              }
            }
          })
      } catch (error) {
        console.warn('⚠️ [USER DROPDOWN] Erro ao configurar Realtime para XP:', error)
        subscriptionAttempts++
        if (channel) {
          try {
            supabase.removeChannel(channel)
          } catch (e) {
            // Ignorar erros ao remover
          }
          channel = null
        }
      }
    }
    
    setupRealtime()

    return () => {
      window.removeEventListener('xpUpdated', handleXPUpdate as EventListener)
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id])

  // Carregar contagem de mensagens não lidas
  useEffect(() => {
    if (!user?.id) {
      setUnreadMessagesCount(0)
      return
    }

    const loadUnreadMessages = async () => {
      try {
        const response = await fetch('/api/messages/unread-count')
        if (response.ok) {
          const data = await response.json()
          setUnreadMessagesCount(data.count || 0)
        }
      } catch (error) {
        console.error('Erro ao carregar mensagens não lidas:', error)
      }
    }

    loadUnreadMessages()
    const interval = setInterval(loadUnreadMessages, 30000) // Atualizar a cada 30s

    return () => clearInterval(interval)
  }, [user?.id])

  // Carregar contagem de notificações quando user estiver disponível
  useEffect(() => {
    if (!user?.id) {
      setUnreadNotificationsCount(0)
      return
    }

    let channel: any = null
    let interval: NodeJS.Timeout | null = null

    const setupNotifications = async () => {
      // Carregar inicialmente
      loadUnreadNotificationsCount()
      
      // Se não há user, não criar subscription
      if (!user?.id) {
        return
      }

      let notificationSubscriptionAttempts = 0
      const MAX_NOTIFICATION_ATTEMPTS = 1
      
      try {
        // Verificar se há sessão válida antes de subscrever
        let { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        // Se não há sessão ou token, tentar renovar
        if (!session?.access_token) {
          console.log('🔄 [USER DROPDOWN] Tentando renovar sessão para notificações...')
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
          if (refreshedSession?.access_token) {
            session = refreshedSession
            sessionError = null
          }
        }
        
        if (sessionError || !session?.access_token) {
          console.warn('⚠️ [USER DROPDOWN] Sem sessão válida, usando apenas polling para notificações')
          interval = setInterval(loadUnreadNotificationsCount, 30000)
          return
        }

        // Evitar múltiplas tentativas
        if (notificationSubscriptionAttempts >= MAX_NOTIFICATION_ATTEMPTS) {
          console.warn('⚠️ [USER DROPDOWN] Limite de tentativas de subscription notificações atingido')
          interval = setInterval(loadUnreadNotificationsCount, 30000)
          return
        }

        notificationSubscriptionAttempts++

        // Real-time subscription para notificações (apenas se tiver sessão válida)
        channel = supabase
          .channel(`user-dropdown-notifications-${user.id}`, {
            config: {
              broadcast: { self: false }
            }
          })
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`
            },
            () => {
              // Pequeno delay para garantir sincronização
              setTimeout(() => {
                loadUnreadNotificationsCount()
              }, 500)
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ [USER DROPDOWN] Subscription Realtime notificações ativa')
              notificationSubscriptionAttempts = 0 // Reset se sucesso
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('⚠️ [USER DROPDOWN] Erro na subscription Realtime notificações, usando fallback')
              // Remover channel e usar apenas polling
              if (channel) {
                try {
                  supabase.removeChannel(channel)
                } catch (e) {
                  // Ignorar erros
                }
                channel = null
              }
              // Fallback: polling a cada 30s
              if (!interval) {
                interval = setInterval(loadUnreadNotificationsCount, 30000)
              }
            }
          })
      } catch (error) {
        console.warn('⚠️ [USER DROPDOWN] Erro ao configurar Realtime, usando fallback:', error)
        notificationSubscriptionAttempts++
        if (channel) {
          try {
            supabase.removeChannel(channel)
          } catch (e) {
            // Ignorar erros
          }
          channel = null
        }
        // Fallback: polling a cada 30s
        if (!interval) {
          interval = setInterval(loadUnreadNotificationsCount, 30000)
        }
      }

      // Verificar a cada 30 segundos (fallback sempre ativo)
      if (!interval) {
        interval = setInterval(loadUnreadNotificationsCount, 30000)
      }
    }

    setupNotifications()

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch(console.warn)
      }
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [user?.id])

  const loadUnreadNotificationsCount = async () => {
    try {
      if (!user?.id) return

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('read', false)

      if (error) {
        console.error('❌ [USER DROPDOWN] Erro ao carregar notificações:', error)
        return
      }

      const count = notifications?.length || 0
      setUnreadNotificationsCount(count)
    } catch (error) {
      console.error('❌ [USER DROPDOWN] Erro ao carregar notificações:', error)
    }
  }

  const handleLogout = async () => {
    try {
      console.log('🚪 [USER DROPDOWN] Fazendo logout...')
      setIsLoggingOut(true)
      
      // Usar logout do auth-context (já limpa tudo)
      await logout()
      
      console.log('✅ [USER DROPDOWN] Logout concluído')
      window.location.href = '/new-landing'
    } catch (error) {
      console.error('❌ [USER DROPDOWN] Erro no logout:', error)
      window.location.href = '/new-landing'
    }
  }

  // Loading state - usar authLoading do auth-context
  if (authLoading) {
    return (
      <div className="flex items-center justify-center w-10 h-10">
        <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  // Não logado - mostrar botão de login
  if (!user) {
    // Não adicionar redirect se já estiver em /login (evitar loop)
    const loginUrl = pathname !== '/login' && pathname !== '/register' 
      ? `/login?redirect=${encodeURIComponent(pathname)}` 
      : '/login'
    
    return (
      <Link href={loginUrl}>
        <Button 
          variant="ghost" 
          className="h-10 px-4 py-2 text-gray-300 hover:text-[#F3F3E6] hover:bg-[#D2A63C]/10 transition-colors border border-[#D2A63C]/30"
        >
          <User className="h-4 w-4 mr-2" />
          Iniciar Sessão
        </Button>
      </Link>
    )
  }

  // Logado - mostrar dropdown
  const displayName = user.full_name || user.username || "Utilizador"
  const displayEmail = user.email || ""
  const avatarUrl = user.avatar_url || null
  const isAdmin = user.user_type === 'admin'

  // Debug: verificar tipo de usuário
  console.log('🔍 [USER DROPDOWN] Renderizando:', {
    email: user.email,
    user_type: user.user_type,
    isAdmin: isAdmin
  })

  const userTypeBadge: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    member: { label: "Membro", color: "bg-green-500/20 text-green-400 border-green-500/30" },
    vip: { label: "VIP", color: "bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30" },
    trial: { label: "Trial", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    guest: { label: "Guest", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    presentation: { label: "Apresentação", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
    pending: { label: "Aguardando", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    affiliate: { label: "Afiliado", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    inactive: { label: "Inativo", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  }

  const badge = userTypeBadge[user.user_type || 'member'] || userTypeBadge.member

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="relative h-10 w-10 rounded-full p-0 hover:bg-[#D2A63C]/10 transition-colors outline-none focus:outline-none focus:ring-2 focus:ring-[#D2A63C]/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D2A63C]/20 text-[#D2A63C] border border-[#D2A63C]/30 overflow-hidden hover:border-[#D2A63C]/50 transition-all">
            {avatarUrl ? (
              <Image 
                src={avatarUrl} 
                alt={displayName}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
          </div>
          {/* Badge de Notificações */}
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900 animate-pulse">
              {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-72 bg-gray-900 border-[#D2A63C]/30 shadow-xl" 
        align="end"
        sideOffset={5}
      >
        {/* User Info */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-3 p-2">
            <div className="flex items-center space-x-3">
              {avatarUrl ? (
                <Image 
                  src={avatarUrl} 
                  alt={displayName}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-[#D2A63C]/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                  <User className="h-5 w-5 text-[#D2A63C]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none text-white truncate">
                  {displayName}
                </p>
                <p className="text-xs leading-none text-gray-400 mt-1 truncate">
                  {displayEmail}
                </p>
              </div>
            </div>
            {/* User Type Badge */}
            <div className="flex items-center justify-center">
              <span className={`text-xs px-3 py-1 rounded-full border ${badge.color}`}>
                {badge.label}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>

        {/* XP Display */}
        {xpData && (
          <DropdownMenuLabel className="font-normal py-2">
            <div className="px-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Nível {xpData.level}</span>
                <span className="text-xs font-semibold text-[#D2A63C]">{xpData.xp.toLocaleString()} XP</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#D2A63C] to-yellow-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, ((xpData.xp % 100) / 100) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {Math.max(0, 100 - (xpData.xp % 100))} XP até próximo nível
              </p>
            </div>
          </DropdownMenuLabel>
        )}
        
        <DropdownMenuSeparator className="bg-[#D2A63C]/20" />
        
        {/* Mensagens */}
        <div className="py-1">
          <Link href="/messages">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <MessageCircle className="mr-3 h-4 w-4" />
              <span>Mensagens</span>
              {unreadMessagesCount > 0 && (
                <span className="ml-auto bg-[#D2A63C] text-black text-xs px-2 py-0.5 rounded-full font-bold">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </DropdownMenuItem>
          </Link>
        </div>

        {/* Notificações */}
        {unreadNotificationsCount > 0 && (
          <>
            <div className="py-1">
              <Link href="/member-area?tab=notifications">
                <DropdownMenuItem className="cursor-pointer text-white hover:text-white hover:bg-red-500/20 focus:bg-red-500/20 focus:text-white">
                  <Bell className="mr-3 h-4 w-4 text-red-400" />
                  <span>Notificações</span>
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                </DropdownMenuItem>
              </Link>
            </div>
            <DropdownMenuSeparator className="bg-[#D2A63C]/20" />
          </>
        )}
        
        {/* Navigation Links */}
        <div className="py-1">
          <Link href="/new-landing">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <Home className="mr-3 h-4 w-4" />
              <span>Início</span>
            </DropdownMenuItem>
          </Link>

          <Link href="/member-area">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <UserCircle className="mr-3 h-4 w-4" />
              <span>O Meu Perfil</span>
            </DropdownMenuItem>
          </Link>

          <Link href="/scanner-access">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <ScanEye className="mr-3 h-4 w-4" />
              <span>Scanner ao Vivo</span>
            </DropdownMenuItem>
          </Link>

          <Link href="/portfolios">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <LayoutDashboard className="mr-3 h-4 w-4" />
              <span>Portfólios Inteligentes</span>
            </DropdownMenuItem>
          </Link>

          <Link href="/trading-ideas">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <TrendingUp className="mr-3 h-4 w-4" />
              <span>Ideias de Trading</span>
            </DropdownMenuItem>
          </Link>

          <Link href="/app-mobile">
            <DropdownMenuItem className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white">
              <Smartphone className="mr-3 h-4 w-4" />
              <span>App Mobile</span>
            </DropdownMenuItem>
          </Link>
        </div>

        <DropdownMenuSeparator className="bg-[#D2A63C]/20" />

        {/* Admin Section (apenas para admins) */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="bg-[#D2A63C]/20" />
            <div className="py-1">
              <Link href="/admin">
                <DropdownMenuItem className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300">
                  <Shield className="mr-3 h-4 w-4" />
                  <span>Painel Admin</span>
                </DropdownMenuItem>
              </Link>
            </div>
          </>
        )}
        
        <DropdownMenuSeparator className="bg-[#D2A63C]/20" />
        
        {/* Logout */}
        <div className="py-1">
          <DropdownMenuItem 
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="cursor-pointer text-gray-300 hover:text-white hover:bg-red-500/10 focus:bg-red-500/10 focus:text-white"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-3 h-4 w-4 animate-spin" />
                <span>A sair...</span>
              </>
            ) : (
              <>
                <LogOut className="mr-3 h-4 w-4" />
                <span>Sair</span>
              </>
            )}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
