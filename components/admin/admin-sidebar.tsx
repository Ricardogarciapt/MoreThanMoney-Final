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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "users", label: "Utilizadores", icon: Users },
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
    <aside className="w-64 flex-shrink-0 border-r border-[#D2A63C]/20 bg-gray-900/80 flex flex-col">
      <div className="p-4 border-b border-[#D2A63C]/20">
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
        <div className="p-2 rounded-lg bg-[#D2A63C]/20">
          <Shield className="w-5 h-5 text-[#D2A63C]" />
        </div>
        <span className="font-semibold text-white">Admin</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#D2A63C]/20 text-[#D2A63C]"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/60"
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
            "mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/admin/portfolios"
              ? "bg-[#D2A63C]/20 text-[#D2A63C]"
              : "text-gray-400 hover:text-white hover:bg-gray-800/60"
          )}
        >
          <Wallet className="w-5 h-5 shrink-0" />
          Portfolios
        </Link>
      </nav>
    </aside>
  )
}
