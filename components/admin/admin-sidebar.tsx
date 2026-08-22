"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  FileText,
  Bell,
  Settings,
  Wallet,
  ArrowLeft,
  Shield,
  GraduationCap,
  Brain,
  Network,
  Send,
  Ticket,
  Inbox,
  Film,
  Award,
  Instagram,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "users", label: "Utilizadores", icon: Users },
  { id: "content", label: "Conteúdo", icon: FileText },
  { id: "education", label: "Educação (LMS)", icon: GraduationCap },
  { id: "dvr", label: "Gravações DVR", icon: Film },
  { id: "avaliacoes", label: "Avaliações", icon: Award },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "settings", label: "Configurações", icon: Settings },
]

export default function AdminSidebar({
  activeSection,
  onSectionChange,
  skoolPendingCount = 0,
}: {
  activeSection: string
  onSectionChange: (id: string) => void
  skoolPendingCount?: number
}) {
  const pathname = usePathname()

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-gray-950/90 backdrop-blur-sm">
      <div className="border-b border-[#D2A63C]/15 p-4">
        <Link href="/new-landing">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-400 hover:text-[#D2A63C] hover:bg-[#D2A63C]/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao site
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25">
          <Shield className="h-5 w-5 text-[#D2A63C]" />
        </div>
        <span className="font-semibold tracking-tight text-white">Admin</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
                  : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "users" && skoolPendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">
                  {skoolPendingCount}
                </span>
              )}
            </button>
          )
        })}
        <Link
          href="/admin/mtmcopy"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/mtmcopy" || pathname.startsWith("/admin/mtmcopy/")
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Send className="w-5 h-5 shrink-0" />
          MTMcopier
        </Link>
        <Link
          href="/admin/social"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/social" || pathname.startsWith("/admin/social/")
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Instagram className="w-5 h-5 shrink-0" />
          Conteúdo Social
        </Link>
        <Link
          href="/admin/portfolios"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/portfolios"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Wallet className="w-5 h-5 shrink-0" />
          Portfolios
        </Link>
        <Link
          href="/admin/backoffice"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/backoffice"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Network className="w-5 h-5 shrink-0" />
          MLM / Afiliados
        </Link>
        <Link
          href="/admin/coupons"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/coupons"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Ticket className="w-5 h-5 shrink-0" />
          Cupões de Oferta
        </Link>
        <Link
          href="/admin/forms"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/forms"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Inbox className="w-5 h-5 shrink-0" />
          Formulários
        </Link>
        <div className="my-2 border-t border-[#D2A63C]/10" />
        <Link
          href="/dashboard-gestao"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
            pathname.startsWith("/dashboard-gestao")
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-[#D2A63C]/30 text-[#D2A63C]/70 hover:bg-[#D2A63C]/10 hover:text-[#D2A63C]"
          )}
        >
          <Brain className="w-5 h-5 shrink-0" />
          Dashboard Gestão
        </Link>
      </nav>
    </aside>
  )
}
