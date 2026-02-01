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
import { adminApiCall } from "@/lib/admin-helpers"

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
      const result = await adminApiCall<AdminStats>('/api/admin/stats')
      if (result.success && result.data) {
        setStats(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar stats:', result.error)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar stats:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const result = await adminApiCall<UserManagement[]>('/api/admin/users')
      if (result.success && result.data) {
        setUsers(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar users:', result.error)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContent = async () => {
    try {
      const result = await adminApiCall<SiteContent[]>('/api/admin/content')
      if (result.success && result.data) {
        setContent(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar content:', result.error)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar content:', error)
    }
  }

  const fetchTrialStats = async () => {
    try {
      const result = await adminApiCall('/api/admin/trial-stats')
      if (result.success && result.data) {
        setTrialStats(result.data)
      } else {
        console.error('❌ [ADMIN] Erro ao buscar trial stats:', result.error)
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
        await fetchUsers()
        console.log('✅ Utilizador aprovado com sucesso')
      }
    } catch (error) {
      console.error('❌ Erro ao aprovar utilizador:', error)
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
        await fetchUsers()
        console.log('✅ Role alterada com sucesso')
      }
    } catch (error) {
      console.error('❌ Erro ao alterar role:', error)
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
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/new-landing">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-[#D2A63C] flex items-center">
                <Shield className="w-8 h-8 mr-3" />
                Dashboard Admin
              </h1>
              <p className="text-gray-300">Painel de controlo unificado</p>
            </div>
          </div>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-lg px-4 py-2">
            Admin
          </Badge>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Total Utilizadores</p>
                    <p className="text-3xl font-bold text-[#D2A63C]">{stats.total_users || 0}</p>
                  </div>
                  <Users className="w-12 h-12 text-[#D2A63C]/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-blue-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Utilizadores Ativos</p>
                    <p className="text-3xl font-bold text-blue-400">{stats.active_users || 0}</p>
                  </div>
                  <Activity className="w-12 h-12 text-blue-400/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Membros</p>
                    <p className="text-3xl font-bold text-green-400">{stats.total_members || 0}</p>
                  </div>
                  <Shield className="w-12 h-12 text-green-400/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-purple-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Trials Ativos</p>
                    <p className="text-3xl font-bold text-purple-400">{trialStats?.activeTrials || 0}</p>
                  </div>
                  <BarChart3 className="w-12 h-12 text-purple-400/50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Dashboard Unificado - Seções Expansíveis */}
        <div className="space-y-6">
          {/* Analytics Section */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Analytics
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('analytics')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'analytics' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'analytics' && (
              <CardContent>
                <AnalyticsManager />
              </CardContent>
            )}
          </Card>

          {/* Utilizadores Section */}
          <Card className="bg-gray-900/50 border-blue-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-blue-400 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Gestão de Utilizadores
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('users')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'users' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'users' && (
              <CardContent>
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
          <Card className="bg-gray-900/50 border-purple-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-purple-400 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Gestão de Conteúdo
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('content')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'content' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'content' && (
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Conteúdo do Site</h3>
                  <SiteContentManager />
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Vídeos & Links</h3>
                  <ContentConfigManager />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Chats & Mensagens Section */}
          <Card className="bg-gray-900/50 border-cyan-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-cyan-400 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Chats & Mensagens
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('chats')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'chats' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'chats' && (
              <CardContent>
                <ChatsMessagesManager />
              </CardContent>
            )}
          </Card>

          {/* Email Marketing Section */}
          <Card className="bg-gray-900/50 border-amber-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-amber-400 flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Email Marketing
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('email')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'email' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'email' && (
              <CardContent>
                <EmailMarketingManager />
              </CardContent>
            )}
          </Card>

          {/* Notificações Section */}
          <Card className="bg-gray-900/50 border-orange-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-orange-400 flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notificações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('notifications')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'notifications' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'notifications' && (
              <CardContent>
                <NotificationsManager />
              </CardContent>
            )}
          </Card>

          {/* Documentos Section */}
          <Card className="bg-gray-900/50 border-yellow-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-yellow-400 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Documentos
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('documents')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'documents' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'documents' && (
              <CardContent>
                <DocumentsManager />
              </CardContent>
            )}
          </Card>

          {/* Integrações Section */}
          <Card className="bg-gray-900/50 border-indigo-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-indigo-400 flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  Integrações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('integrations')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'integrations' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'integrations' && (
              <CardContent>
                <IntegrationsManager setActiveTab={() => {}} />
              </CardContent>
            )}
          </Card>

          {/* Fast Start Section */}
          <Card className="bg-gray-900/50 border-pink-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-pink-400 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Fast Start
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('fast-start')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'fast-start' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'fast-start' && (
              <CardContent>
                <FastStartManager />
              </CardContent>
            )}
          </Card>

          {/* Configurações Section */}
          <Card className="bg-gray-900/50 border-gray-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-400 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('settings')}
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSection === 'settings' ? 'Recolher' : 'Expandir'}
                </Button>
              </div>
            </CardHeader>
            {expandedSection === 'settings' && (
              <CardContent className="space-y-6">
                <ThemeManager />
                <SettingsManager />
              </CardContent>
            )}
          </Card>

          {/* Portfolios Link */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Gestão de Portfolios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 mb-4">Gerir ativos crypto e ETF</p>
              <Button
                onClick={() => router.push('/admin/portfolios')}
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
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
