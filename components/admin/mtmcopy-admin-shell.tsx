"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  Activity,
  FlaskConical,
  LayoutDashboard,
  Send,
  SlidersHorizontal,
  UserCog,
  Users,
  Wrench,
} from "lucide-react"

export type MtmcopyAdminTab =
  | "overview"
  | "strategies"
  | "senders"
  | "subscribers"
  | "logs"
  | "tools"
  | "users"

export const MTMCOPY_ADMIN_TABS: {
  id: MtmcopyAdminTab
  label: string
  short: string
  icon: typeof LayoutDashboard
}[] = [
  { id: "overview", label: "Visão geral", short: "Visão", icon: LayoutDashboard },
  { id: "strategies", label: "Estratégias", short: "Estrat.", icon: SlidersHorizontal },
  { id: "senders", label: "Senders", short: "Senders", icon: Send },
  { id: "subscribers", label: "Subscribers", short: "Subs", icon: Users },
  { id: "logs", label: "Monitorização", short: "Logs", icon: Activity },
  { id: "tools", label: "Ferramentas", short: "Tools", icon: Wrench },
  { id: "users", label: "Utilizadores", short: "Users", icon: UserCog },
]

export function MtmcopyAdminTabNav({
  active,
  onChange,
}: {
  active: MtmcopyAdminTab
  onChange: (tab: MtmcopyAdminTab) => void
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800"
      aria-label="Secções MTMcopier"
    >
      {MTMCOPY_ADMIN_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-[#D2A63C]/15 text-[#D2A63C] ring-1 ring-[#D2A63C]/30"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function MtmcopyAdminSection({
  title,
  description,
  icon: Icon,
  accent = "gold",
  children,
  action,
}: {
  title: string
  description?: string
  icon?: typeof FlaskConical
  accent?: "gold" | "emerald" | "violet" | "sky"
  children: ReactNode
  action?: ReactNode
}) {
  const border =
    accent === "emerald"
      ? "border-emerald-500/20"
      : accent === "violet"
        ? "border-violet-500/20"
        : accent === "sky"
          ? "border-sky-500/20"
          : "border-[#D2A63C]/20"
  const titleColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "violet"
        ? "text-violet-300"
        : accent === "sky"
          ? "text-sky-400"
          : "text-[#D2A63C]"

  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-zinc-950/80", border)}>
      <div className="border-b border-zinc-800/80 px-5 sm:px-6 py-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn("text-lg font-semibold flex items-center gap-2", titleColor)}>
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            {title}
          </h2>
          {description && (
            <p className="text-sm text-zinc-400 mt-1 max-w-3xl leading-relaxed">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}
