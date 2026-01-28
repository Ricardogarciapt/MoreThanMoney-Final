"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  FileText, 
  Settings, 
  Activity, 
  Shield,
  BarChart3,
  Palette,
  Link as LinkIcon,
  Loader2,
  ArrowLeft,
  Wallet,
  Mail,
  TrendingUp,
  Database,
  Bell,
  Timer,
  Video
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
import GroupsManager from "@/components/admin/groups-manager"
import Link from "next/link"

export default function AdminPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<UserManagement[]>([])
  const [content, setContent] = useState<SiteContent[]>([])
  const [loading, setLoading] = useState(true)
  const [trialStats, setTrialStats] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      console.log('🔐 [ADMIN] Verificando permissões...')
      checkAdminAccess()
    }
  }, [mounted])

  const checkAdminAccess = async () => {
    try {
      console.log('🔐 [ADMIN] Iniciando verificação de acesso...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        console.log('❌ [ADMIN] Sem sessão, redirecionando para login...')
        setIsAdmin(false)
        setIsChecking(false)
        window.location.href = '/login?redirect=/admin'
        return
      }

      console.log('✅ [ADMIN] Sessão encontrada:', session.user.email)

      // Buscar perfil com fallback
      let profile = null
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_type, is_active, email, member_category')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.warn('⚠️ [ADMIN] Erro ao buscar perfil, tentando API...', profileError)
        
        // Fallback: API bypass RLS
        try {
          const apiResponse = await fetch(`/api/profile/get?userId=${session.user.id}`)
          if (apiResponse.ok) {
            const apiData = await apiResponse.json()
            profile = apiData.profile
            console.log('✅ [ADMIN] Perfil via API:', profile?.email)
          }
        } catch (apiError) {
          console.error('❌ [ADMIN] API fallback falhou:', apiError)
        }
      } else {
        profile = profileData
      }

      console.log('👤 [ADMIN] Perfil carregado:', {
        email: profile?.email,
        user_type: profile?.user_type,
        is_active: profile?.is_active
      })

      // Verificar se é admin
      if (!profile || profile.user_type !== 'admin') {
        console.log('❌ [ADMIN] Utilizador não é admin')
        console.log('   Email:', profile?.email || session.user.email)
        console.log('   Tipo:', profile?.user_type || 'undefined')
        setIsAdmin(false)
        setIsChecking(false)
        
        // Aguardar um pouco antes de redirecionar (evitar loop)
        setTimeout(() => {
          window.location.href = '/member-area'
        }, 1000)
        return
      }

      if (!profile.is_active) {
        console.log('❌ [ADMIN] Utilizador inativo')
        setIsAdmin(false)
        setIsChecking(false)
        window.location.href = '/member-area'
        return
      }

      console.log('✅ [ADMIN] Acesso autorizado para:', profile.email)
      setIsAdmin(true)
      setIsChecking(false)
      
      // Carregar dados
      fetchStats()
      fetchUsers()
      fetchContent()
      fetchTrialStats()
    } catch (error) {
      console.error('❌ [ADMIN] Erro crítico:', error)
      setIsAdmin(false)
      setIsChecking(false)
      
      setTimeout(() => {
        window.location.href = '/login?redirect=/admin'
      }, 1000)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats')
      const result = await response.json()
      setStats(result.data)
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar stats:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users')
      const result = await response.json()
      setUsers(result.data || [])
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContent = async () => {
    try {
      const response = await fetch('/api/admin/content')
      const result = await response.json()
      setContent(result.data || [])
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar content:', error)
    }
  }

  const fetchTrialStats = async () => {
    try {
      const response = await fetch('/api/admin/trial-stats')
      if (response.ok) {
        const result = await response.json()
        setTrialStats(result.data)
      }
    } catch (error) {
      console.error('❌ [ADMIN] Erro ao buscar trial stats:', error)
    }
  }

  const handleApproveUser = async (userId: string) => {
    try {
      const response = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })

      if (response.ok) {
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
      
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, user_type: newRole })
      })

      if (response.ok) {
        await fetchUsers()
        console.log('✅ Role alterada com sucesso')
      }
    } catch (error) {
      console.error('❌ Erro ao alterar role:', error)
    }
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
                Painel Admin
              </h1>
              <p className="text-gray-300">Gerir conteúdo, utilizadores e configurações</p>
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

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-11 bg-gray-900 border border-[#D2A63C]/30 mb-8 overflow-x-auto">
            <TabsTrigger 
              value="dashboard" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <Users className="w-4 h-4 mr-2" />
              Utilizadores
            </TabsTrigger>
            <TabsTrigger 
              value="content" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <FileText className="w-4 h-4 mr-2" />
              Conteúdo
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              Integrações
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <FileText className="w-4 h-4 mr-2" />
              Documentos
            </TabsTrigger>
            <TabsTrigger 
              value="email" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <Mail className="w-4 h-4 mr-2" />
              Email Marketing
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <Bell className="w-4 h-4 mr-2" />
              Notificações
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger 
              value="fast-start" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Fast Start
            </TabsTrigger>
            <TabsTrigger 
              value="groups" 
              className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Grupos
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Welcome Card */}
            <Card className="bg-gradient-to-br from-[#D2A63C]/20 to-[#BB8525]/10 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] text-2xl flex items-center gap-2">
                  <Shield className="w-6 h-6" />
                  Visão Geral do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-lg mb-4">
                  Bem-vindo ao painel administrativo MoreThanMoney. Aqui tens controlo total sobre a plataforma.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                  <button
                    onClick={() => setActiveTab('users')}
                    className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-all group"
                  >
                    <Users className="w-8 h-8 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Gerir Utilizadores</h3>
                    <p className="text-sm text-gray-400 mt-1">Aprovar, editar e remover membros</p>
                  </button>
                  
                  <button
                    onClick={() => router.push('/admin/portfolios')}
                    className="p-4 bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-lg hover:bg-[#D2A63C]/20 transition-all group"
                  >
                    <Wallet className="w-8 h-8 text-[#D2A63C] mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Gerir Portfolios</h3>
                    <p className="text-sm text-gray-400 mt-1">Editar ativos crypto e ETF</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('content')}
                    className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-all group"
                  >
                    <FileText className="w-8 h-8 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Gerir Conteúdo</h3>
                    <p className="text-sm text-gray-400 mt-1">Vídeos e links externos</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('documents')}
                    className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-all group"
                  >
                    <FileText className="w-8 h-8 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Documentos</h3>
                    <p className="text-sm text-gray-400 mt-1">Biblioteca educacional</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('email')}
                    className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-all group"
                  >
                    <Mail className="w-8 h-8 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Email Marketing</h3>
                    <p className="text-sm text-gray-400 mt-1">Campanhas e testes</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('analytics')}
                    className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-all group"
                  >
                    <TrendingUp className="w-8 h-8 text-green-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Analytics</h3>
                    <p className="text-sm text-gray-400 mt-1">Métricas e insights</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('notifications')}
                    className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-all group"
                  >
                    <Bell className="w-8 h-8 text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Notificações</h3>
                    <p className="text-sm text-gray-400 mt-1">Push e emails</p>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="p-4 bg-gray-500/10 border border-gray-500/30 rounded-lg hover:bg-gray-500/20 transition-all group"
                  >
                    <Settings className="w-8 h-8 text-gray-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h3 className="text-white font-semibold">Configurações</h3>
                    <p className="text-sm text-gray-400 mt-1">Temas e sistema</p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Estatísticas Detalhadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Estatísticas de Utilizadores */}
              <Card className="bg-gray-900/50 border-blue-500/30">
                <CardHeader>
                  <CardTitle className="text-blue-400 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Estatísticas de Utilizadores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-300">Total de Utilizadores</span>
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {stats?.total_users || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-300">Utilizadores Ativos</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        {stats?.active_users || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-300">Membros Premium</span>
                      <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">
                        {stats?.total_members || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-300">Trials Ativos</span>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {trialStats?.activeTrials || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-300">Guests</span>
                      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                        {trialStats?.totalGuests || 0}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Taxa de Conversão</span>
                      <span className="text-[#D2A63C] font-semibold">
                        {stats?.total_users ? Math.round(((stats.total_members || 0) / stats.total_users) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] h-2 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${stats?.total_users ? ((stats.total_members || 0) / stats.total_users) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Atividade Recente */}
              <Card className="bg-gray-900/50 border-green-500/30">
                <CardHeader>
                  <CardTitle className="text-green-400 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Atividade do Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-green-500">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">Sistema Operacional</span>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          Online
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">Todas as funcionalidades ativas</p>
                    </div>

                    <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-blue-500">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">Base de Dados</span>
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Conectado
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">Supabase sincronizado</p>
                    </div>

                    <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-purple-500">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">Autenticação</span>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                          Ativo
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">Google OAuth + Email/Password</p>
                    </div>

                    <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-[#D2A63C]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">TradingView Widget</span>
                        <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">
                          Funcional
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">Scanners AI operacionais</p>
                    </div>

                    <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-cyan-500">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">Google Translate</span>
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                          21 Idiomas
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">Tradução automática ativa</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Ações Rápidas */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Ações Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Button
                    onClick={() => setActiveTab('users')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-blue-500/30 hover:bg-blue-500/10"
                  >
                    <Users className="w-6 h-6 text-blue-400" />
                    <span className="text-sm">Ver Utilizadores</span>
                  </Button>

                  <Button
                    onClick={() => router.push('/admin/portfolios')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-[#D2A63C]/30 hover:bg-[#D2A63C]/10"
                  >
                    <Wallet className="w-6 h-6 text-[#D2A63C]" />
                    <span className="text-sm">Gerir Portfolios</span>
                  </Button>

                  <Button
                    onClick={() => setActiveTab('email')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    <Mail className="w-6 h-6 text-amber-400" />
                    <span className="text-sm">Email Marketing</span>
                  </Button>

                  <Button
                    onClick={() => window.open('/new-landing', '_blank')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-green-500/30 hover:bg-green-500/10"
                  >
                    <Activity className="w-6 h-6 text-green-400" />
                    <span className="text-sm">Ver Site</span>
                  </Button>

                  <Button
                    onClick={() => setActiveTab('content')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-purple-500/30 hover:bg-purple-500/10"
                  >
                    <FileText className="w-6 h-6 text-purple-400" />
                    <span className="text-sm">Editar Conteúdo</span>
                  </Button>

                  <Button
                    onClick={() => setActiveTab('analytics')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-green-500/30 hover:bg-green-500/10"
                  >
                    <TrendingUp className="w-6 h-6 text-green-400" />
                    <span className="text-sm">Analytics</span>
                  </Button>

                  <Button
                    onClick={() => setActiveTab('notifications')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-orange-500/30 hover:bg-orange-500/10"
                  >
                    <Bell className="w-6 h-6 text-orange-400" />
                    <span className="text-sm">Notificações</span>
                  </Button>

                  <Button
                    onClick={() => setActiveTab('settings')}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-cyan-500/30 hover:bg-cyan-500/10"
                  >
                    <Settings className="w-6 h-6 text-cyan-400" />
                    <span className="text-sm">Configurações</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Informações do Sistema */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gray-900/50 border-amber-500/30">
                <CardHeader>
                  <CardTitle className="text-amber-400 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Métricas de Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-400">Páginas Ativas</p>
                      <p className="text-2xl font-bold text-white">63</p>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      Online
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-400">Rotas Protegidas</p>
                      <p className="text-2xl font-bold text-white">6</p>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      Seguras
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-400">API Endpoints</p>
                      <p className="text-2xl font-bold text-white">44</p>
                    </div>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      Ativos
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-red-500/30">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Segurança e Acesso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-green-500">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Autenticação Google OAuth</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Ativo
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-green-500">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Login Email/Password</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Ativo
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Proteção de Rotas</span>
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        Client-Side
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-800/50 rounded-lg border-l-4 border-purple-500">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Admin Exclusivo</span>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        1 Admin
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recursos e Integrações */}
            <Card className="bg-gray-900/50 border-cyan-500/30">
              <CardHeader>
                <CardTitle className="text-cyan-400 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Recursos e Integrações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">📊</div>
                    <p className="text-xs text-gray-400">TradingView</p>
                    <p className="text-sm font-semibold text-white mt-1">Widget Avançado</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">🌐</div>
                    <p className="text-xs text-gray-400">Google Translate</p>
                    <p className="text-sm font-semibold text-white mt-1">21 Idiomas</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">🎬</div>
                    <p className="text-xs text-gray-400">YouTube</p>
                    <p className="text-sm font-semibold text-white mt-1">Embed Otimizado</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">💬</div>
                    <p className="text-xs text-gray-400">WhatsApp</p>
                    <p className="text-sm font-semibold text-white mt-1">CTA Flutuante</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">🔐</div>
                    <p className="text-xs text-gray-400">Supabase</p>
                    <p className="text-sm font-semibold text-white mt-1">Auth + DB</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">📧</div>
                    <p className="text-xs text-gray-400">Gmail SMTP</p>
                    <p className="text-sm font-semibold text-white mt-1">Emails</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">🎨</div>
                    <p className="text-xs text-gray-400">Temas</p>
                    <p className="text-sm font-semibold text-white mt-1">4 + Custom</p>
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                    <div className="text-2xl mb-1">⚡</div>
                    <p className="text-xs text-gray-400">Vercel</p>
                    <p className="text-sm font-semibold text-white mt-1">Deploy Auto</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Links Úteis */}
            <Card className="bg-gray-900/50 border-indigo-500/30">
              <CardHeader>
                <CardTitle className="text-indigo-400 flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  Links Úteis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <a
                    href="https://site-morethanmoney-final.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <span className="text-gray-300">Site em Produção</span>
                    <Activity className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
                  </a>

                  <a
                    href="https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <span className="text-gray-300">Dashboard Vercel</span>
                    <Activity className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  </a>

                  <a
                    href="https://supabase.com/dashboard/project/iwscxotvmtkphajmasof"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <span className="text-gray-300">Dashboard Supabase</span>
                    <Activity className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  </a>

                  <a
                    href="https://github.com/Ricardogarciapt/SITE-MORETHANMONEY-FINAL"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <span className="text-gray-300">Repositório GitHub</span>
                    <Activity className="w-4 h-4 text-[#D2A63C] group-hover:scale-110 transition-transform" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagementComponent 
              users={users} 
              onRefresh={fetchUsers}
              onApprove={handleApproveUser}
              onToggleRole={handleToggleRole}
            />
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-6">
            <Tabs defaultValue="site-content" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="site-content">
                  <FileText className="w-4 h-4 mr-2" />
                  Conteúdo do Site
                </TabsTrigger>
                <TabsTrigger value="videos-links">
                  <Video className="w-4 h-4 mr-2" />
                  Vídeos & Links
                </TabsTrigger>
              </TabsList>
              <TabsContent value="site-content">
                <SiteContentManager />
              </TabsContent>
              <TabsContent value="videos-links">
                <ContentConfigManager />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <IntegrationsManager setActiveTab={setActiveTab} />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <DocumentsManager />
          </TabsContent>

          {/* Email Marketing Tab */}
          <TabsContent value="email">
            <EmailMarketingManager />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsManager />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <NotificationsManager />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <ThemeManager />
            <SettingsManager />
          </TabsContent>

          {/* Fast Start Tab */}
          <TabsContent value="fast-start" className="space-y-6">
            <FastStartManager />
          </TabsContent>

          {/* Groups Tab */}
          <TabsContent value="groups" className="space-y-6">
            <GroupsManager />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
