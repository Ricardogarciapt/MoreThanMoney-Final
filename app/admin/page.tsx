"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { SiteContent, UserManagement, AdminStats } from "@/lib/admin-types"
import { adminApiCall, clearAdminCache } from "@/lib/admin-helpers"
import AdminSidebar from "@/components/admin/admin-sidebar"
import AdminOverview from "@/components/admin/admin-overview"
import UserManagementComponent from "@/components/admin/user-management"
import SiteContentManager from "@/components/admin/site-content-manager"
import ContentConfigManager from "@/components/admin/content-config-manager"
import NotificationsManager from "@/components/admin/notifications-manager"
import ThemeManager from "@/components/admin/theme-manager"
import SettingsManager from "@/components/admin/settings-manager"
import LiveSessionsManager from "@/components/admin/live-sessions-manager"
import { MessageCircle } from "lucide-react"

function CreateDefaultGroupsButton({
  onSuccess,
  onError,
}: {
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const handleCreate = async () => {
    setLoading(true)
    try {
      const result = await adminApiCall<{ success: boolean; message?: string }>("/api/admin/create-default-groups", {
        method: "POST",
      })
      if (result.success) {
        onSuccess()
      } else {
        onError(result.error || "Erro ao criar grupos")
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao criar grupos")
    } finally {
      setLoading(false)
    }
  }
  return (
    <Button
      onClick={handleCreate}
      disabled={loading}
      className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
      ) : (
        <MessageCircle className="w-4 h-4 mr-2" />
      )}
      Criar grupos padrão (Social, Crypto, Forex, Trade)
    </Button>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user, isLoading: authLoading, isAdmin: authIsAdmin } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [activeSection, setActiveSection] = useState("overview")
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<UserManagement[]>([])
  const [trialStats, setTrialStats] = useState<{
    activeTrials?: number
    expiredTrials?: number
    totalGuests?: number
    totalTrials?: number
  } | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  const checkAdminAccess = useCallback(() => {
    if (!user) {
      setIsAdmin(false)
      setIsChecking(false)
      router.replace("/login?redirect=/admin")
      return
    }
    const userIsAdmin = authIsAdmin || user.user_type === "admin"
    setIsAdmin(userIsAdmin)
    if (!userIsAdmin) {
      setIsChecking(false)
      router.push("/member-area")
      return
    }
    if (!user.is_active) {
      setIsAdmin(false)
      setIsChecking(false)
      router.push("/member-area")
      return
    }
    setIsChecking(false)
  }, [user, authIsAdmin, router])

  useEffect(() => {
    if (!mounted) return
    if (authLoading) return
    if (!user) {
      setIsChecking(false)
      setIsAdmin(false)
      router.replace("/login?redirect=/admin")
      return
    }
    checkAdminAccess()
  }, [mounted, authLoading, user, checkAdminAccess, router])

  const fetchStats = useCallback(async () => {
    const result = await adminApiCall<AdminStats>("/api/admin/stats", {
      useCache: true,
      cacheTTL: 30000,
    })
    if (result.success && result.data) setStats(result.data)
  }, [])

  const fetchTrialStats = useCallback(async () => {
    const result = await adminApiCall<{ activeTrials: number; expiredTrials: number; totalGuests: number; totalTrials: number }>(
      "/api/admin/trial-stats",
      { useCache: true, cacheTTL: 30000 }
    )
    if (result.success && result.data) setTrialStats(result.data)
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    const result = await adminApiCall<{ data?: UserManagement[] } | UserManagement[]>("/api/admin/users", {
      useCache: true,
      cacheTTL: 20000,
    })
    if (result.success && result.data) {
      const list = Array.isArray(result.data) ? result.data : (result.data as { data?: UserManagement[] }).data
      setUsers(list || [])
    }
    if (!result.success) {
      toast({
        title: "Erro ao carregar utilizadores",
        description: result.error || "Tenta novamente.",
        variant: "destructive",
      })
    }
    setLoadingUsers(false)
  }, [toast])

  useEffect(() => {
    if (!isAdmin || isChecking) return
    const load = async () => {
      setLoadingOverview(true)
      await Promise.all([fetchStats(), fetchTrialStats()])
      setLoadingOverview(false)
    }
    load()
  }, [isAdmin, isChecking, fetchStats, fetchTrialStats])

  useEffect(() => {
    if (isAdmin && !isChecking && activeSection === "users") {
      fetchUsers()
    }
  }, [isAdmin, isChecking, activeSection, fetchUsers])

  const handleApproveUser = async (userId: string) => {
    const result = await adminApiCall("/api/admin/approve-user", {
      method: "POST",
      body: JSON.stringify({ userId }),
    })
    if (result.success) {
      clearAdminCache("/api/admin/users")
      clearAdminCache("/api/admin/stats")
      await fetchUsers()
      await fetchStats()
      toast({ title: "Utilizador aprovado" })
    } else {
      toast({
        title: "Erro ao aprovar",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin"
    const result = await adminApiCall("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ userId, user_type: newRole }),
    })
    if (result.success) {
      clearAdminCache("/api/admin/users")
      clearAdminCache("/api/admin/stats")
      await fetchUsers()
      await fetchStats()
      toast({ title: "Permissões alteradas" })
    } else {
      toast({
        title: "Erro ao alterar permissões",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  if (!mounted || isChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-400">
            {!user && !authLoading ? "A redirecionar para o login..." : "A verificar permissões..."}
          </p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p>Acesso negado. A redirecionar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="flex-1 overflow-auto">
        <div className="border-b border-[#D2A63C]/20 bg-gray-900/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-white">
              {activeSection === "overview" && "Visão geral"}
              {activeSection === "users" && "Utilizadores"}
              {activeSection === "content" && "Conteúdo"}
              {activeSection === "education" && "Educação / LMS"}
              {activeSection === "notifications" && "Notificações"}
              {activeSection === "settings" && "Configurações"}
            </h1>
            {user && (
              <span className="text-sm text-gray-400 truncate max-w-[200px]">{user.email}</span>
            )}
          </div>
        </div>

        <div className="p-6">
          {activeSection === "overview" && (
            <AdminOverview
              stats={stats}
              trialStats={trialStats}
              loading={loadingOverview}
            />
          )}

          {activeSection === "users" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Gestão de utilizadores</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Aprovar, alterar funções e categorias. Dados reais da base de dados.
                  </p>
                </div>
                <div className="p-6">
                  <UserManagementComponent
                    users={users}
                    onRefresh={fetchUsers}
                    onApprove={handleApproveUser}
                    onToggleRole={handleToggleRole}
                  />
                </div>
              </section>
            </div>
          )}

          {activeSection === "content" && (
            <div className="space-y-8">
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Conteúdo do site</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Links, vídeos, ficheiros e texto por categoria (navbar, footer, landing, etc.).
                  </p>
                </div>
                <div className="p-6">
                  <SiteContentManager />
                </div>
              </section>
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Vídeos e links (config)</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Configuração de vídeos e links para landing e páginas.
                  </p>
                </div>
                <div className="p-6">
                  <ContentConfigManager />
                </div>
              </section>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                <h2 className="text-lg font-semibold text-[#D2A63C]">Notificações</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Enviar notificações por email e push aos utilizadores.
                </p>
              </div>
              <div className="p-6">
                <NotificationsManager />
              </div>
            </div>
          )}

          {activeSection === "education" && (
            <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                <h2 className="text-lg font-semibold text-[#D2A63C]">Gestão de Educação / LMS</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Gerir academias, educadores (login separado) e canais de live sessions.
                </p>
              </div>
              <div className="p-6">
                <LiveSessionsManager />
              </div>
            </div>
          )}

          {activeSection === "settings" && (
            <div className="space-y-8">
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Tema</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Cores e tema do site.
                  </p>
                </div>
                <div className="p-6">
                  <ThemeManager />
                </div>
              </section>
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Configurações gerais</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Nome do site, modo manutenção, registo e aprovações.
                  </p>
                </div>
                <div className="p-6">
                  <SettingsManager />
                </div>
              </section>
              <section className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#D2A63C]/20">
                  <h2 className="text-lg font-semibold text-[#D2A63C]">Grupos de chat padrão</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Cria os grupos Social Chat, Crypto Chat, Forex Chat e Trade Chat e associa-te como administrador.
                  </p>
                </div>
                <div className="p-6">
                  <CreateDefaultGroupsButton onSuccess={() => toast({ title: "Grupos criados ou atualizados com sucesso." })} onError={(err) => toast({ title: "Erro", description: err, variant: "destructive" })} />
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
