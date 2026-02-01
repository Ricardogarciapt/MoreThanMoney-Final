"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  FileText, 
  Settings, 
  Activity, 
  Shield,
  BarChart3,
  Loader2,
  ArrowLeft,
  Wallet,
  Mail,
  TrendingUp,
  Bell,
  MessageCircle,
  Database,
  Video,
  Link as LinkIcon
} from "lucide-react"
import type { SiteContent, UserManagement, AdminStats } from "@/lib/admin-types"
import ThemeManager from "@/components/admin/theme-manager"
import SettingsManager from "@/components/admin/settings-manager"
import UserManagementComponent from "@/components/admin/user-management"
import ContentConfigManager from "@/components/admin/content-config-manager"
import SiteContentManager from "@/components/admin/site-content-manager"
import IntegrationsManager from "@/components/admin/integrations-manager"
import DocumentsManager from "@/components/admin/documents-manager"
import EmailMarketingManager from "@/components/admin/email-marketing-manager"
import AnalyticsManager from "@/components/admin/analytics-manager"
import NotificationsManager from "@/components/admin/notifications-manager"
import FastStartManager from "@/components/admin/fast-start-manager"
import ChatsMessagesManager from "@/components/admin/chats-messages-manager"
import Link from "next/link"
import { adminApiCall, clearAdminCache } from "@/lib/admin-helpers"

export default function AdminPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAdmin: authIsAdmin } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<UserManagement[]>([])
  const [content, setContent] = useState<SiteContent[]>([])
  const [loading, setLoading] = useState(true)
  const [trialStats, setTrialStats] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !authLoading) {
      console.log('🔐 [ADMIN] Verificando permissões...')
      checkAdminAccess()
    }
  }, [mounted, authLoading, user])

  const checkAdminAccess = () => {
    if (!user) {
      console.log('❌ [ADMIN] Sem utilizador, redirecionando para login...')
      setIsAdmin(false)
      setIsChecking(false)
      window.location.href = '/login?redirect=/admin'
      return
    }

    console.log('👤 [ADMIN] Utilizador do auth-context:', {
      email: user.email,
      user_type: user.user_type,
      is_active: user.is_active
    })
    
    const userIsAdmin = authIsAdmin || user.user_type === 'admin'
    setIsAdmin(userIsAdmin)
    
    if (!userIsAdmin) {
      console.warn('⚠️ [ADMIN] Acesso negado - não é admin')
      setIsChecking(false)
      router.push('/member-area')
      return
    }

    if (!user.is_active) {
      console.log('❌ [ADMIN] Utilizador inativo')
      setIsAdmin(false)
      setIsChecking(false)
      router.push('/member-area')
      return
    }

    console.log('✅ [ADMIN] Acesso autorizado para:', user.email)
    setIsChecking(false)
    
    // Carregar dados
    fetchStats()
    fetchUsers()
    fetchContent()
    fetchTrialStats()
  }

  const fetchStats = async () => {
    try {
      const result = await adminApiCall<AdminStats>('/api/admin/stats', {
        useCache: true,
        cacheTTL: 30000 // Cache por 30s
      })
      if (result.success && result.data) {
        setStats(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar stats:', result.error, result.details)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar stats:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const result = await adminApiCall<UserManagement[]>('/api/admin/users', {
        useCache: true,
        cacheTTL: 20000 // Cache por 20s
      })
      if (result.success && result.data) {
        setUsers(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar users:', result.error, result.details)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContent = async () => {
    try {
      const result = await adminApiCall<SiteContent[]>('/api/admin/content', {
        useCache: true,
        cacheTTL: 30000 // Cache por 30s
      })
      if (result.success && result.data) {
        setContent(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar content:', result.error, result.details)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar content:', error)
    }
  }

  const fetchTrialStats = async () => {
    try {
      const result = await adminApiCall('/api/admin/trial-stats', {
        useCache: true,
        cacheTTL: 30000 // Cache por 30s
      })
      if (result.success && result.data) {
        setTrialStats(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar trial stats:', result.error, result.details)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar trial stats:', error)
    }
  }

  const handleApproveUser = async (userId: string) => {
    try {
      const result = await adminApiCall('/api/admin/approve-user', {
        method: 'POST',
        body: JSON.stringify({ userId })
      })

      if (result.success) {
        // Limpar cache e recarregar
        clearAdminCache('/api/admin/users')
        await fetchUsers()
        await fetchStats() // Atualizar stats também
        console.log('✅ Utilizador aprovado com sucesso')
      } else {
        console.error('❌ Erro ao aprovar utilizador:', result.error, result.details)
        alert(`Erro ao aprovar utilizador: ${result.error}`)
      }
    } catch (error: any) {
      console.error('❌ Erro ao aprovar utilizador:', error)
      alert(`Erro ao aprovar utilizador: ${error.message || 'Erro desconhecido'}`)
    }
  }

  const handleToggleRole = async (userId: string, currentRole: string) => {
    try {
      const newRole = currentRole === 'admin' ? 'member' : 'admin'
      
      const result = await adminApiCall('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId, user_type: newRole })
      })

      if (result.success) {
        // Limpar cache e recarregar
        clearAdminCache('/api/admin/users')
        clearAdminCache('/api/admin/stats')
        await fetchUsers()
        await fetchStats()
        console.log('✅ Role alterada com sucesso')
      } else {
        console.error('❌ Erro ao alterar role:', result.error, result.details)
        alert(`Erro ao alterar role: ${result.error}`)
      }
    } catch (error: any) {
      console.error('❌ Erro ao alterar role:', error)
      alert(`Erro ao alterar role: ${error.message || 'Erro desconhecido'}`)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  if (!mounted || isChecking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-300">A verificar permissões...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #D2A63C 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header Melhorado */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link href="/new-landing">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-400 hover:text-[#D2A63C] hover:bg-[#D2A63C]/10 transition-all duration-300"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#D2A63C]/20 to-[#BB8525]/10 border border-[#D2A63C]/30">
                  <Shield className="w-8 h-8 text-[#D2A63C]" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-[#D2A63C] via-[#F3F3E6] to-[#D2A63C] bg-clip-text text-transparent">
                    Dashboard Admin
                  </h1>
                  <p className="text-gray-400 mt-1">Painel de controlo unificado</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-gradient-to-r from-[#D2A63C]/20 to-[#BB8525]/20 text-[#D2A63C] border-[#D2A63C]/40 text-sm px-4 py-2 font-semibold shadow-lg">
                <Activity className="w-3 h-3 mr-2" />
                Sistema Ativo
              </Badge>
              <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-sm px-4 py-2 font-semibold shadow-lg">
                <Shield className="w-3 h-3 mr-2" />
                Admin
              </Badge>
            </div>
          </div>
          
          {/* Welcome Message */}
          {user && (
            <Card className="bg-gradient-to-r from-[#D2A63C]/10 via-[#BB8525]/5 to-[#D2A63C]/10 border-[#D2A63C]/30 mb-6">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Bem-vindo,</p>
                    <p className="text-lg font-semibold text-[#D2A63C]">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Database className="w-4 h-4" />
                    <span>Supabase Conectado</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Stats Overview Melhorado */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <Card className="group bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/5 border-[#D2A63C]/40 hover:border-[#D2A63C]/60 transition-all duration-300 hover:shadow-xl hover:shadow-[#D2A63C]/20 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg bg-[#D2A63C]/20 group-hover:bg-[#D2A63C]/30 transition-colors">
                    <Users className="w-6 h-6 text-[#D2A63C]" />
                  </div>
                  <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/40">Total</Badge>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Utilizadores</p>
                  <p className="text-4xl font-bold text-[#D2A63C] mb-2">{stats.total_users || 0}</p>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] rounded-full transition-all duration-500"
                      style={{ width: '100%' }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/40 hover:border-blue-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">Ativos</Badge>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Utilizadores Ativos</p>
                  <p className="text-4xl font-bold text-blue-400 mb-2">{stats.active_users || 0}</p>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${stats.total_users ? (stats.active_users / stats.total_users) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/40 hover:border-green-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/20 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                    <Shield className="w-6 h-6 text-green-400" />
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/40">Premium</Badge>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Membros</p>
                  <p className="text-4xl font-bold text-green-400 mb-2">{stats.total_members || 0}</p>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                      style={{ width: `${stats.total_users ? (stats.total_members / stats.total_users) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/40 hover:border-purple-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                    <BarChart3 className="w-6 h-6 text-purple-400" />
                  </div>
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40">Trials</Badge>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Trials Ativos</p>
                  <p className="text-4xl font-bold text-purple-400 mb-2">{trialStats?.activeTrials || 0}</p>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-500"
                      style={{ width: trialStats?.activeTrials ? '75%' : '0%' }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Dashboard Unificado - Seções Expansíveis */}
        <div className="space-y-6">
          {/* Analytics Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-[#D2A63C]/40 hover:border-[#D2A63C]/60 transition-all duration-300 hover:shadow-lg hover:shadow-[#D2A63C]/10">
            <CardHeader className="bg-gradient-to-r from-[#D2A63C]/10 to-transparent border-b border-[#D2A63C]/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#D2A63C] flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-[#D2A63C]/20">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  Analytics & Métricas
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('analytics')}
                  className="text-gray-400 hover:text-[#D2A63C] hover:bg-[#D2A63C]/10 transition-all"
                >
                  {expandedSection === 'analytics' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'analytics' && (
              <CardContent className="pt-6">
                <AnalyticsManager />
              </CardContent>
            )}
          </Card>

          {/* Utilizadores Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-blue-500/40 hover:border-blue-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
            <CardHeader className="bg-gradient-to-r from-blue-500/10 to-transparent border-b border-blue-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-blue-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Users className="w-5 h-5" />
                  </div>
                  Gestão de Utilizadores
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('users')}
                  className="text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                >
                  {expandedSection === 'users' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'users' && (
              <CardContent className="pt-6">
                <UserManagementComponent 
                  users={users} 
                  onRefresh={fetchUsers}
                  onApprove={handleApproveUser}
                  onToggleRole={handleToggleRole}
                />
              </CardContent>
            )}
          </Card>

          {/* Conteúdo Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-purple-500/40 hover:border-purple-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
            <CardHeader className="bg-gradient-to-r from-purple-500/10 to-transparent border-b border-purple-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-purple-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <FileText className="w-5 h-5" />
                  </div>
                  Gestão de Conteúdo
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('content')}
                  className="text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                >
                  {expandedSection === 'content' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'content' && (
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-4 p-4 rounded-lg bg-gray-800/30 border border-purple-500/20">
                  <h3 className="text-lg font-semibold text-purple-300 flex items-center gap-2">
                    <Video className="w-5 h-5" />
                    Conteúdo do Site
                  </h3>
                  <SiteContentManager />
                </div>
                <div className="space-y-4 p-4 rounded-lg bg-gray-800/30 border border-purple-500/20">
                  <h3 className="text-lg font-semibold text-purple-300 flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    Vídeos & Links
                  </h3>
                  <ContentConfigManager />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Chats & Mensagens Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-cyan-500/40 hover:border-cyan-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
            <CardHeader className="bg-gradient-to-r from-cyan-500/10 to-transparent border-b border-cyan-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-cyan-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  Chats & Mensagens
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('chats')}
                  className="text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                >
                  {expandedSection === 'chats' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'chats' && (
              <CardContent className="pt-6">
                <ChatsMessagesManager />
              </CardContent>
            )}
          </Card>

          {/* Email Marketing Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-amber-500/40 hover:border-amber-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10">
            <CardHeader className="bg-gradient-to-r from-amber-500/10 to-transparent border-b border-amber-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-amber-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <Mail className="w-5 h-5" />
                  </div>
                  Email Marketing
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('email')}
                  className="text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                >
                  {expandedSection === 'email' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'email' && (
              <CardContent className="pt-6">
                <EmailMarketingManager />
              </CardContent>
            )}
          </Card>

          {/* Notificações Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-orange-500/40 hover:border-orange-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10">
            <CardHeader className="bg-gradient-to-r from-orange-500/10 to-transparent border-b border-orange-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-orange-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Bell className="w-5 h-5" />
                  </div>
                  Notificações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('notifications')}
                  className="text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
                >
                  {expandedSection === 'notifications' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'notifications' && (
              <CardContent className="pt-6">
                <NotificationsManager />
              </CardContent>
            )}
          </Card>

          {/* Documentos Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-yellow-500/40 hover:border-yellow-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/10">
            <CardHeader className="bg-gradient-to-r from-yellow-500/10 to-transparent border-b border-yellow-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-yellow-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <FileText className="w-5 h-5" />
                  </div>
                  Documentos
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('documents')}
                  className="text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all"
                >
                  {expandedSection === 'documents' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'documents' && (
              <CardContent className="pt-6">
                <DocumentsManager />
              </CardContent>
            )}
          </Card>

          {/* Integrações Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-indigo-500/40 hover:border-indigo-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 to-transparent border-b border-indigo-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-indigo-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-indigo-500/20">
                    <LinkIcon className="w-5 h-5" />
                  </div>
                  Integrações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('integrations')}
                  className="text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                >
                  {expandedSection === 'integrations' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'integrations' && (
              <CardContent className="pt-6">
                <IntegrationsManager setActiveTab={() => {}} />
              </CardContent>
            )}
          </Card>

          {/* Fast Start Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-pink-500/40 hover:border-pink-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-pink-500/10">
            <CardHeader className="bg-gradient-to-r from-pink-500/10 to-transparent border-b border-pink-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-pink-400 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-pink-500/20">
                    <Activity className="w-5 h-5" />
                  </div>
                  Fast Start
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('fast-start')}
                  className="text-gray-400 hover:text-pink-400 hover:bg-pink-500/10 transition-all"
                >
                  {expandedSection === 'fast-start' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'fast-start' && (
              <CardContent className="pt-6">
                <FastStartManager />
              </CardContent>
            )}
          </Card>

          {/* Configurações Section */}
          <Card className="group bg-gradient-to-br from-gray-900/80 to-gray-800/50 border-gray-500/40 hover:border-gray-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-gray-500/10">
            <CardHeader className="bg-gradient-to-r from-gray-500/10 to-transparent border-b border-gray-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-300 flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-lg bg-gray-500/20">
                    <Settings className="w-5 h-5" />
                  </div>
                  Configurações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('settings')}
                  className="text-gray-400 hover:text-gray-300 hover:bg-gray-500/10 transition-all"
                >
                  {expandedSection === 'settings' ? (
                    <>
                      <span className="mr-2">Recolher</span>
                      <span className="text-xs">▲</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-2">Expandir</span>
                      <span className="text-xs">▼</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'settings' && (
              <CardContent className="pt-6 space-y-6">
                <ThemeManager />
                <SettingsManager />
              </CardContent>
            )}
          </Card>

          {/* Portfolios Link */}
          <Card className="group bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/5 border-[#D2A63C]/40 hover:border-[#D2A63C]/60 transition-all duration-300 hover:shadow-xl hover:shadow-[#D2A63C]/20">
            <CardHeader className="bg-gradient-to-r from-[#D2A63C]/20 to-transparent border-b border-[#D2A63C]/30">
              <CardTitle className="text-[#D2A63C] flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-[#D2A63C]/30">
                  <Wallet className="w-5 h-5" />
                </div>
                Gestão de Portfolios
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-gray-300 mb-6">Gerir ativos crypto e ETF de forma centralizada</p>
              <Button
                onClick={() => router.push('/admin/portfolios')}
                className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Abrir Gestão de Portfolios
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
