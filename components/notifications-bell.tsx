"use client"

import { useState, useEffect } from "react"
import { Bell, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import NotificationsPanel from "@/components/notifications-panel"
import { supabase } from "@/lib/supabase"

export default function NotificationsBell() {
  const [mounted, setMounted] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    loadUser()
  }, [])

  useEffect(() => {
    if (!mounted || !currentUserId) return

    loadUnreadCount()
    
    // Real-time subscription para contagem
    const channel = supabase
      .channel(`notifications-count-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        (payload) => {
          console.log('🔄 [BELL] Real-time update recebida:', payload.eventType)
          // Pequeno delay para garantir que a DB foi atualizada
          setTimeout(() => {
            loadUnreadCount()
          }, 500)
        }
      )
      .subscribe()

    // Verificar a cada 30 segundos (fallback)
    const interval = setInterval(loadUnreadCount, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [mounted, currentUserId])

  const loadUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) {
        console.error('❌ [BELL] Erro ao carregar usuário:', error)
        return
      }
      
      if (user) {
        console.log('✅ [BELL] User carregado:', user.id)
        setCurrentUserId(user.id)
      } else {
        console.warn('⚠️ [BELL] Nenhum usuário autenticado')
      }
    } catch (error) {
      console.error('❌ [BELL] Erro ao carregar usuário:', error)
    }
  }

  const loadUnreadCount = async () => {
    try {
      if (!currentUserId) {
        console.log('⚠️ [BELL] Sem currentUserId, ignorando loadUnreadCount')
        return
      }
      
      console.log('🔔 [BELL] Carregando contagem para user:', currentUserId)
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('read', false)

      if (error) {
        console.error('❌ [BELL] Erro ao carregar contagem:', error)
        return
      }

      const count = notifications?.length || 0
      console.log('✅ [BELL] Contagem de não lidas:', count)
      setUnreadCount(count)
    } catch (error) {
      console.error('❌ [BELL] Erro ao carregar contagem:', error)
    }
  }

  // Não retornar null - mostrar sino sempre, mesmo enquanto carrega
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 rounded-full hover:bg-[#D2A63C]/10 transition-colors"
        disabled
      >
        <Bell className="h-5 w-5 text-gray-300" />
      </Button>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={(open) => {
      console.log('🔄 [BELL] Popover onOpenChange chamado:', open, 'Estado atual:', isOpen)
      setIsOpen(open)
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full hover:bg-[#D2A63C]/10 transition-colors z-50"
          type="button"
        >
          <Bell className="h-5 w-5 text-gray-300 hover:text-[#D2A63C]" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold rounded-full animate-pulse"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[380px] md:w-[420px] p-0 bg-gray-900 border-[#D2A63C]/30"
        align="end"
        sideOffset={10}
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{ zIndex: 10000 }}
      >
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-[#D2A63C] flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white ml-2">
                {unreadCount} novas
              </Badge>
            )}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <NotificationsPanel />
        </div>
      </PopoverContent>
    </Popover>
  )
}

