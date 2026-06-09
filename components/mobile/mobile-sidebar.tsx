"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { clearCachedSession } from "@/lib/auth-cache"
import { Badge } from "@/components/ui/badge"
import {
  X,
  LogOut,
  MessageCircle,
  Settings,
  Users,
  Wallet,
  BarChart3,
  Award,
  Zap,
  ChevronRight,
  UserCircle,
  LayoutGrid,
  Video,
  Brain,
  Bell,
  MessageSquare,
  TrendingUp,
  Send,
  Network,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  username?: string
  avatar_url?: string
  user_type?: string
  member_category?: string
  is_active?: boolean
}

interface MobileSidebarProps {
  isOpen: boolean
  onClose: () => void
  currentUser: UserProfile | null
  activeTab: string
  onTabChange: (tab: string) => void
  /** Membros App Only (€35 standard) — não devem navegar fora de /app-mobile */
  isAppOnlyUser?: boolean
}

export default function MobileSidebar({
  isOpen,
  onClose,
  currentUser,
  activeTab,
  onTabChange,
  isAppOnlyUser = false,
}: MobileSidebarProps) {
  const router = useRouter()
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const [xpData, setXpData] = useState<{ xp: number; level: number } | null>(null)
  const [unreadMentorNotifications, setUnreadMentorNotifications] = useState(0)

  useEffect(() => {
    if (isOpen && currentUser?.id) {
      loadMessages()
      loadXP()
      loadMentorNotifications()
    }
  }, [isOpen, currentUser?.id])

  const loadMessages = async () => {
    try {
      if (!currentUser?.id) return
      const response = await fetch('/api/messages/unread-count')
      if (response.ok) {
        const data = await response.json()
        setUnreadMessagesCount(data.count || 0)
      } else {
        setUnreadMessagesCount(0)
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
      setUnreadMessagesCount(0)
    }
  }

  const loadXP = async () => {
    try {
      const response = await fetch('/api/xp/get')
      const data = await response.json()
      if (data.success && data.xp) {
        setXpData({
          xp: data.xp.total_xp || 0,
          level: data.xp.current_level || 1,
        })
      }
    } catch (error) {
      console.error('Erro ao carregar XP:', error)
    }
  }

  const loadMentorNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/user')
      if (!response.ok) return setUnreadMentorNotifications(0)
      const data = await response.json()
      const unread = (data.notifications || []).filter((n: any) => !n.read && (n.type === "mentor" || n.type === "onboarding" || n.type === "fast-start")).length
      setUnreadMentorNotifications(unread)
    } catch (error) {
      console.error('Erro ao carregar notificações de mentor:', error)
      setUnreadMentorNotifications(0)
    }
  }

  const handleLogout = async () => {
    clearCachedSession()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleTabClick = (tab: string) => {
    onTabChange(tab)
    onClose()
  }

  const navigationItems = [
    { id: 'social', label: 'Feed', icon: Users, href: '/app-mobile?tab=social' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, href: '/app-mobile?tab=chat' },
    { id: 'live', label: 'Ao vivo', icon: Video, href: '/app-mobile?tab=live' },
    { id: 'mentor', label: 'Mentor', icon: Brain, href: '/app-mobile?tab=mentor' },
    { id: 'portfolio', label: 'Portfólio', icon: Wallet, href: '/app-mobile?tab=portfolio' },
    { id: 'scanner', label: 'Scanner', icon: BarChart3, href: '/app-mobile?tab=scanner' },
    { id: 'apps', label: 'Apps', icon: LayoutGrid, href: '/app-mobile?tab=apps' },
    { id: 'mlm', label: 'Afiliados', icon: Network, href: '/app-mobile?tab=mlm' },
  ]


  const getUserBadge = () => {
    if (!currentUser) return null
    
    const category = currentUser.member_category || currentUser.user_type || 'member'
    const badges: Record<string, { label: string; color: string; bg: string }> = {
      admin: { label: '🔴 Admin', color: 'text-red-400', bg: 'bg-red-500/20' },
      vip: { label: '⭐ VIP', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
      iq: { label: '🎓 IQ', color: 'text-blue-400', bg: 'bg-blue-500/20' },
      skool: { label: '📚 Skool', color: 'text-purple-400', bg: 'bg-purple-500/20' },
      premium: { label: '💎 Premium', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
      standard: { label: '📱 App Member', color: 'text-green-400', bg: 'bg-green-500/20' },
      member: { label: '👤 Membro', color: 'text-gray-400', bg: 'bg-gray-500/20' },
    }
    
    return badges[category] || badges.member
  }

  const badge = getUserBadge()

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 border-r border-gray-800 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header — safe area top padding so it clears the iPhone status bar */}
          <div
            className="flex items-center justify-between p-4 border-b border-gray-800"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center gap-3">
              <Image
                src="/logo-new.png"
                alt="MTM Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h2 className="font-bold text-white text-lg">MTM System</h2>
                <p className="text-xs text-gray-400">Menu</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* User Profile Section */}
          <div className="p-4 border-b border-gray-800 bg-gray-800/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                {currentUser?.avatar_url ? (
                  <Image
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name || 'User'}
                    width={56}
                    height={56}
                    className="rounded-full border-2 border-[#D2A63C]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#D2A63C]/20 border-2 border-[#D2A63C] flex items-center justify-center">
                    <UserCircle className="w-8 h-8 text-[#D2A63C]" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white truncate">
                  {currentUser?.full_name || currentUser?.username || 'Utilizador'}
                </h3>
                <p className="text-xs text-gray-400 truncate">
                  {currentUser?.email}
                </p>
                {badge && (
                  <Badge className={`mt-1 ${badge.bg} ${badge.color} border-0 text-xs`}>
                    {badge.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* XP & Level */}
            {xpData && (
              <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-[#D2A63C]/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[#D2A63C]" />
                    <span className="text-xs text-gray-400">Nível {xpData.level}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs font-semibold text-yellow-400">
                      {xpData.xp.toLocaleString()} XP
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] h-1.5 rounded-full transition-all"
                    style={{
                      width: `${((xpData.xp % 1000) / 1000) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Navigation Tabs */}
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Navegação</h3>
              <nav className="space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        isActive
                          ? 'bg-[#D2A63C]/20 text-[#D2A63C] border border-[#D2A63C]/30'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-[#D2A63C]' : ''}`} />
                      <span className="flex-1 text-left font-medium">{item.label}</span>
                      {item.id === "mentor" && unreadMentorNotifications > 0 && (
                        <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-0">
                          {unreadMentorNotifications}
                        </Badge>
                      )}
                      {isActive && <ChevronRight className="w-4 h-4 text-[#D2A63C]" />}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* Comunicação */}
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Comunicação</h3>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    handleTabClick("mentor")
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
                >
                  <Bell className="w-5 h-5" />
                  <span className="flex-1 text-left font-medium">Mentor & Progresso</span>
                  {unreadMentorNotifications > 0 && (
                    <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-0">
                      {unreadMentorNotifications}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (onTabChange) {
                      onTabChange('chat')
                    } else {
                      router.push('/app-mobile?tab=chat')
                    }
                    onClose()
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
                >
                  <div className="relative">
                    <MessageCircle className="w-5 h-5" />
                    {unreadMessagesCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center">
                        {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                      </span>
                    )}
                  </div>
                  <span className="flex-1 text-left font-medium">Mensagens</span>
                  {unreadMessagesCount > 0 && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-0">
                      {unreadMessagesCount}
                    </Badge>
                  )}
                </button>
              </div>
            </div>

            {/* Abrir Conta + Settings */}
            <div className="p-4 space-y-1">
              {/* Abrir Conta na Corretora */}
              <Link
                href="/app-mobile/accountopen"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] hover:bg-[#D2A63C]/20 transition-all"
              >
                <TrendingUp className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">Abrir Conta</span>
                <ChevronRight className="w-4 h-4" />
              </Link>

              {/* Copygram — addon Telegram → MT5 */}
              <Link
                href="/mtmcopy"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
              >
                <Send className="w-5 h-5 text-[#D2A63C]" />
                <span className="flex-1 text-left font-medium">Copygram</span>
                <Badge className="bg-[#D2A63C]/15 text-[#D2A63C] border-[#D2A63C]/30 text-[10px] px-1.5 py-0">+20€/mês</Badge>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </Link>

              {isAppOnlyUser ? (
                <button
                  onClick={() => { handleTabClick("settings") }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
                >
                  <Settings className="w-5 h-5" />
                  <span className="flex-1 text-left font-medium">Definições</span>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              ) : (
                <button
                  onClick={() => { handleTabClick("settings"); onClose() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
                >
                  <Settings className="w-5 h-5" />
                  <span className="flex-1 text-left font-medium">Definições</span>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {/* Footer - Logout */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="flex-1 text-left font-medium">Terminar Sessão</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

