"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { UserManagement, AdminStats } from "@/lib/admin-types"
import { adminApiCall, clearAdminCache } from "@/lib/admin-helpers"
import AdminSidebar from "@/components/admin/admin-sidebar"
import AdminOverview from "@/components/admin/admin-overview"
import UserManagementComponent from "@/components/admin/user-management"
import SiteContentManager from "@/components/admin/site-content-manager"
import ContentConfigManager from "@/components/admin/content-config-manager"
import NotificationsManager from "@/components/admin/notifications-manager"
import ThemeManager from "@/components/admin/theme-manager"
import SettingsManager from "@/components/admin/settings-manager"
import IntegrationsStatusPanel from "@/components/admin/integrations-status-panel"
import ChatChannelsPanel from "@/components/admin/chat-channels-panel"
import LiveSessionsManager from "@/components/admin/live-sessions-manager"
import DvrRecordingsManager from "@/components/admin/dvr-recordings-manager"
import AvaliacoesManager from "@/components/admin/avaliacoes-manager"

function AdminPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  /**
   * As secções que um endereço pode abrir.
   *
   * Faltavam "dvr" e "avaliacoes": a barra lateral mostrava-as e clicava-se nelas, mas
   * `?tab=dvr` era ignorado em silêncio e caía no resumo. Quem guardasse a ligação nos
   * favoritos, ou a recebesse de alguém, aterrava sempre no sítio errado — e como o clique
   * funcionava, ninguém suspeitava do endereço.
   */
  const validSections = new Set([
    "overview",
    "users",
    "content",
    "education",
    "dvr",
    "avaliacoes",
    "notifications",
    "settings",
  ])

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

  const highlightUserId = searchParams.get("userId")
  const skoolPendingFilter = searchParams.get("filter") === "skool_pending"
  const validationPendingFilter = searchParams.get("filter") === "access_validation_pending"

  // Permite abrir secções por URL: /admin?tab=users | etc.
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (!tab) return
    if (tab === "copygram") {
      router.replace("/admin/mtmcopy")
      return
    }
    // Fila de publicações Instagram (social_scheduled_posts) — página própria
    if (tab === "social" || tab === "social-content") {
      router.replace("/admin/social")
      return
    }
    if (validSections.has(tab)) {
      setActiveSection(tab)
    }
  }, [searchParams, router])

  const handleSectionChange = useCallback(
    (sectionId: string) => {
      setActiveSection(sectionId)
      router.replace(`/admin?tab=${sectionId}`)
    },
    [router]
  )

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
    const result = await adminApiCall<{ data?: UserManagement[] } | UserManagement[]>("/api/admin/users", {
      useCache: true,
      cacheTTL: 20000,
    })
    if (result.success && result.data) {
      const raw = result.data as UserManagement[] | { data?: UserManagement[] }
      const list = Array.isArray(raw) ? raw : raw?.data
      setUsers(Array.isArray(list) ? list : [])
    }
    if (!result.success) {
      toast({
        title: "Erro ao carregar utilizadores",
        description: result.error || "Tenta novamente.",
        variant: "destructive",
      })
    }
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
    <div className="flex min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        skoolPendingCount={stats?.skool_pending_stripe ?? 0}
      />

      <main className="flex-1 overflow-auto">
        <div className="border-b border-[#D2A63C]/15 bg-black/40 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-white">
              {activeSection === "overview" && "Visão geral"}
              {activeSection === "users" && "Utilizadores"}
              {activeSection === "content" && "Conteúdo"}
              {activeSection === "education" && "Educação / LMS"}
              {activeSection === "dvr" && "Gravações DVR"}
              {activeSection === "avaliacoes" && "Avaliações & Certificados"}
              {activeSection === "notifications" && "Notificações"}
              {activeSection === "settings" && "Configurações"}
            </h1>
            {user && (
              <span className="text-sm text-gray-400 truncate max-w-[200px]">{user.email}</span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {activeSection === "overview" && (
            <AdminOverview
              stats={stats}
              trialStats={trialStats}
              loading={loadingOverview}
            />
          )}

          {activeSection === "users" && (
            <div className="space-y-6">
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Gestão de utilizadores</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Aprovar, alterar funções e categorias. Dados reais da base de dados.
                  </p>
                </div>
                <div className="p-6">
                  <UserManagementComponent
                    users={users}
                    onRefresh={fetchUsers}
                    onApprove={handleApproveUser}
                    highlightUserId={highlightUserId}
                    initialSkoolPendingFilter={skoolPendingFilter}
                    initialValidationPendingFilter={validationPendingFilter}
                  />
                </div>
              </section>
            </div>
          )}

          {activeSection === "content" && (
            <div className="space-y-8">
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Conteúdo do site</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Links, vídeos, ficheiros e texto por categoria (navbar, footer, landing, etc.).
                  </p>
                </div>
                <div className="p-6">
                  <SiteContentManager />
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Vídeos e links (config)</h2>
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
            <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
              <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Notificações</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Campanhas push/email, templates transaccionais, boas-vindas e sequência de onboarding.
                </p>
              </div>
              <div className="p-6">
                <NotificationsManager />
              </div>
            </div>
          )}

          {activeSection === "education" && (
            <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
              <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Gestão de Educação / LMS</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Gerir academias, educadores (login separado) e canais — podes apagar canais aqui. O educador pode criar ou apagar o próprio canal e limpar o chat.
                </p>
              </div>
              <div className="p-6">
                <LiveSessionsManager />
              </div>
            </div>
          )}

          {activeSection === "dvr" && (
            <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
              <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Gravações DVR das sessões</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Explorar as gravações de todos os educadores: descarregar o original (PT) ou o
                  multi-áudio (PT + dobragens EN/ES/FR/DE), preparar a montagem e apagar do servidor.
                </p>
              </div>
              <div className="p-6">
                <DvrRecordingsManager />
              </div>
            </div>
          )}

          {activeSection === "avaliacoes" && (
            <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
              <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Avaliações &amp; Certificados</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Motor de avaliações (Fast Start, Bootcamp, Teste Final): editar perguntas e respostas certas,
                  definir nota mínima por curso, ver certificados emitidos e emitir em lote a quem já concluiu.
                </p>
              </div>
              <div className="p-6">
                <AvaliacoesManager />
              </div>
            </div>
          )}

          {activeSection === "settings" && (
            <div className="space-y-8">
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Integrações & Sistemas</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Estado em tempo real: Supabase, Stripe, MLM, email, Telegram e chat app-mobile.
                  </p>
                </div>
                <div className="p-6">
                  <IntegrationsStatusPanel />
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Tema</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Cores MTM — aplicadas globalmente ao guardar (site + app-mobile).
                  </p>
                </div>
                <div className="p-6">
                  <ThemeManager />
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Configurações gerais</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Nome do site, modo manutenção, registo e aprovações automáticas.
                  </p>
                </div>
                <div className="p-6">
                  <SettingsManager />
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
                <div className="border-b border-[#D2A63C]/15 px-6 py-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Canais de chat (app-mobile)</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Geral, Trading, Cripto, Ideias Forex, Telegram e Premium — ligados ao tab Chat da app.
                  </p>
                </div>
                <div className="p-6">
                  <ChatChannelsPanel />
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C]" />
        </div>
      }
    >
      <AdminPageClient />
    </Suspense>
  )
}
