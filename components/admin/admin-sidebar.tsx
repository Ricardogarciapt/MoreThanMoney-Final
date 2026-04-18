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
  Cpu,
  TerminalSquare,
  Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "users", label: "Utilizadores", icon: Users },
  { id: "mtmauto", label: "MTM Auto", icon: Cpu },
  { id: "content", label: "Conteúdo", icon: FileText },
  { id: "education", label: "Educação (LMS)", icon: GraduationCap },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "settings", label: "Configurações", icon: Settings },
]

export default function AdminSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: string
  onSectionChange: (id: string) => void
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
              {item.label}
            </button>
          )
        })}
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
          href="/admin/terminalremoto"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/terminalremoto"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <TerminalSquare className="w-5 h-5 shrink-0" />
          Terminal remoto
        </Link>
        <Link
          href="/admin/desktop-remoto"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/admin/desktop-remoto"
              ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
              : "border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white"
          )}
        >
          <Monitor className="w-5 h-5 shrink-0" />
          Desktop remoto
        </Link>
      </nav>
    </aside>
  )
}
