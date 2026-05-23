"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Loader2 } from "lucide-react"
import DGSidebar, { type DGSection, navItems } from "@/components/dashboard-gestao/dg-sidebar"
import AgentChat from "@/components/dashboard-gestao/agent-chat"
import CalendlySection from "@/components/dashboard-gestao/calendly-section"
import DGOverview from "@/components/dashboard-gestao/dg-overview"

const VALID_SECTIONS = new Set<DGSection>(navItems.map((n) => n.id))

function DashboardGestaoClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading, isAdmin: authIsAdmin } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [activeSection, setActiveSection] = useState<DGSection>("overview")

  useEffect(() => { setMounted(true) }, [])

  const checkAccess = useCallback(() => {
    if (!user) {
      setIsAdmin(false)
      setIsChecking(false)
      router.replace("/login?redirect=/dashboard-gestao")
      return
    }
    const ok = authIsAdmin || user.user_type === "admin"
    setIsAdmin(ok)
    if (!ok || !user.is_active) {
      setIsChecking(false)
      router.push("/member-area")
      return
    }
    setIsChecking(false)
  }, [user, authIsAdmin, router])

  useEffect(() => {
    if (!mounted || authLoading) return
    if (!user) {
      setIsChecking(false)
      setIsAdmin(false)
      router.replace("/login?redirect=/dashboard-gestao")
      return
    }
    checkAccess()
  }, [mounted, authLoading, user, checkAccess, router])

  // URL tab sync
  useEffect(() => {
    const tab = searchParams.get("tab") as DGSection | null
    if (tab && VALID_SECTIONS.has(tab)) setActiveSection(tab)
  }, [searchParams])

  const handleSectionChange = useCallback(
    (id: DGSection) => {
      setActiveSection(id)
      router.replace(`/dashboard-gestao?tab=${id}`)
    },
    [router]
  )

  // Loading / auth states
  if (!mounted || isChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-500 text-sm">
            {!user && !authLoading ? "A redirecionar para o login..." : "A verificar acesso..."}
          </p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-500">Acesso negado. A redirecionar...</p>
      </div>
    )
  }

  const activeNavItem = navItems.find((n) => n.id === activeSection)
  const isAgentSection =
    activeSection !== "overview" && activeSection !== "calendly"

  return (
    <div className="flex h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white overflow-hidden">
      <DGSidebar activeSection={activeSection} onSectionChange={handleSectionChange} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 border-b border-[#D2A63C]/15 bg-black/40 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeNavItem && (
                <>
                  <activeNavItem.icon
                    className="h-4 w-4"
                    style={{ color: activeNavItem.color }}
                  />
                  <h1 className="text-sm font-semibold text-white">{activeNavItem.label}</h1>
                  {isAgentSection && (
                    <span className="text-xs text-gray-600 ml-1">— Agente IA MTM</span>
                  )}
                </>
              )}
            </div>
            {user && (
              <span className="text-xs text-gray-600 truncate max-w-[200px]">{user.email}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-auto ${isAgentSection ? "flex flex-col" : "p-6"}`}>
          {activeSection === "overview" && (
            <DGOverview onNavigate={handleSectionChange} />
          )}

          {activeSection === "calendly" && (
            <CalendlySection />
          )}

          {isAgentSection && activeNavItem && (
            <div className="flex-1 flex flex-col h-full">
              <AgentChat agent={activeNavItem} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function DashboardGestaoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C]" />
        </div>
      }
    >
      <DashboardGestaoClient />
    </Suspense>
  )
}
