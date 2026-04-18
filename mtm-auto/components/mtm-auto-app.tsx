"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@mtm-auto/lib/utils"
import { MtmAutoSiteAuthBridge } from "@/components/mtm-auto-site-auth-bridge"
import { useAppStore } from "@mtm-auto/lib/store"
import { TopNav } from "./top-nav"
import { Sidebar, Toast, ClientMenuItem, AdminMenuItem } from "./ui-primitives"
import { DashboardPanel } from "./panels/dashboard-panel"
import { MarketplacePanel } from "./panels/marketplace-panel"
import { MyCopiesPanel } from "./panels/my-copies-panel"
import { MyAccountsPanel } from "./panels/my-accounts-panel"
import { SettingsPanel } from "./panels/settings-panel"
import { AdminDashboardPanel } from "./panels/admin-dashboard-panel"
import { AdminSubscriptionsPanel } from "./panels/admin-subscriptions-panel"
import { AdminStrategiesPanel } from "./panels/admin-strategies-panel"
import { AdminRiskPanel } from "./panels/admin-risk-panel"
import { AdminGroupsPanel } from "./panels/admin-groups-panel"
import { AdminClientsPanel } from "./panels/admin-clients-panel"
import { 
  LayoutDashboard, 
  Store, 
  Copy, 
  Wallet, 
  Settings,
  Users,
  FileCheck,
  LineChart,
  Shield,
  FolderKanban
} from "lucide-react"

export function MTMAutoApp() {
  const { user: siteUser, isLoading: authLoading, logout: siteLogout } = useAuth()
  const { user, logout: clearMtmSession, toastMessage, activePanel, setActivePanel } = useAppStore()
  const isMobile = useIsMobile()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false)
  }, [isMobile])

  const handleMenuToggle = useCallback(() => {
    if (isMobile) setMobileMenuOpen((o) => !o)
    else setSidebarCollapsed((c) => !c)
  }, [isMobile])

  const selectPanel = useCallback(
    (id: string) => {
      setActivePanel(id)
      if (isMobile) setMobileMenuOpen(false)
    },
    [isMobile, setActivePanel],
  )

  const handleLogout = async () => {
    clearMtmSession()
    await siteLogout()
  }

  const syncing = Boolean(siteUser && (!user || user.id !== siteUser.id))
  const showLoader = authLoading || !siteUser || syncing

  const isAdmin = !showLoader && user ? user.role === "admin" : false

  const clientMenuItems: ClientMenuItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "marketplace", label: "Marketplace", icon: Store },
    { id: "my-copies", label: "Minhas cópias", icon: Copy },
    { id: "my-accounts", label: "Minhas contas", icon: Wallet },
    { id: "settings", label: "Configurações", icon: Settings },
  ]

  const adminMenuItems: AdminMenuItem[] = [
    { id: "admin-dashboard", label: "Dashboard Admin", icon: LayoutDashboard },
    { id: "admin-subscriptions", label: "Subscrições", icon: FileCheck },
    { id: "admin-strategies", label: "Estratégias", icon: LineChart },
    { id: "admin-risk", label: "Risco Global", icon: Shield },
    { id: "admin-groups", label: "Grupos", icon: FolderKanban },
    { id: "admin-clients", label: "Clientes", icon: Users },
    { id: "settings", label: "Configurações", icon: Settings },
  ]

  const menuItems = isAdmin ? adminMenuItems : clientMenuItems

  const renderPanel = () => {
    if (!user) return null
    switch (activePanel) {
      case "dashboard":
        return <DashboardPanel />
      case "marketplace":
        return <MarketplacePanel />
      case "my-copies":
        return <MyCopiesPanel />
      case "my-accounts":
        return <MyAccountsPanel />
      case "settings":
        return <SettingsPanel />
      case "admin-dashboard":
        return <AdminDashboardPanel />
      case "admin-subscriptions":
        return <AdminSubscriptionsPanel />
      case "admin-strategies":
        return <AdminStrategiesPanel />
      case "admin-risk":
        return <AdminRiskPanel />
      case "admin-groups":
        return <AdminGroupsPanel />
      case "admin-clients":
        return <AdminClientsPanel />
      default:
        return <DashboardPanel />
    }
  }

  return (
    <>
      <MtmAutoSiteAuthBridge />
      {showLoader ? (
        <div className="flex min-h-screen items-center justify-center bg-[var(--mtm-bg)]">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[var(--mtm-green)]" />
            <p className="text-sm text-[var(--mtm-text2)]">A sincronizar com a tua conta MTM…</p>
          </div>
        </div>
      ) : (
        <div className="min-h-screen min-h-[100dvh] bg-[var(--mtm-bg)] pb-[env(safe-area-inset-bottom,0px)]">
          <TopNav user={user} onLogout={handleLogout} onMenuToggle={handleMenuToggle} />

          {isMobile && mobileMenuOpen ? (
            <button
              type="button"
              aria-label="Fechar menu"
              className="fixed inset-0 z-[35] bg-black/60 backdrop-blur-sm top-[calc(4rem+env(safe-area-inset-top,0px))]"
              onClick={() => setMobileMenuOpen(false)}
            />
          ) : null}

          <div className="flex">
            <Sidebar
              items={menuItems}
              activeItem={activePanel}
              onItemClick={selectPanel}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              mobileDrawer={isMobile}
              drawerOpen={isMobile ? mobileMenuOpen : true}
            />

            <main
              className={cn(
                "flex-1 min-w-0 transition-all duration-300 mt-[calc(4rem+env(safe-area-inset-top,0px))]",
                isMobile ? "ml-0 px-3 pt-3 pb-6" : sidebarCollapsed ? "ml-20 px-4 py-4" : "ml-64 px-4 py-4",
              )}
            >
              {renderPanel()}
            </main>
          </div>

          <Toast message={toastMessage} />
        </div>
      )}
    </>
  )
}
