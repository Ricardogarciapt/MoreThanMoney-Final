"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  Bot,
  PhoneCall,
  Mail,
  Shield,
  PenTool,
  Handshake,
  TrendingUp,
  Rocket,
  Brain,
  GraduationCap,
  Calendar,
  ArrowLeft,
  ChevronRight,
  Smartphone,
  BarChart3,
  Radio,
} from "lucide-react"

export type DGSection =
  | "overview"
  | "metrics"
  | "prospeccao"
  | "chatbot_builder"
  | "setter"
  | "financial_email"
  | "compliance"
  | "content_creation"
  | "partnerships"
  | "trading"
  | "business_incubation"
  | "ai_control"
  | "education"
  | "app_creator"
  | "calendly"
  | "stream_vps"

export interface NavItem {
  id: DGSection
  label: string
  icon: React.ElementType
  description: string
  color: string
}

export const navItems: NavItem[] = [
  {
    id: "overview",
    label: "Visão Geral",
    icon: LayoutDashboard,
    description: "Dashboard principal",
    color: "#D2A63C",
  },
  {
    id: "metrics",
    label: "Métricas",
    icon: BarChart3,
    description: "Análise do ecossistema MTM",
    color: "#818cf8",
  },
  {
    id: "prospeccao",
    label: "Prospeção",
    icon: Search,
    description: "Qualificação de leads",
    color: "#60a5fa",
  },
  {
    id: "chatbot_builder",
    label: "Chatbot Builder",
    icon: Bot,
    description: "Flows ManyChat",
    color: "#a78bfa",
  },
  {
    id: "setter",
    label: "Setter",
    icon: PhoneCall,
    description: "Qualificação & chamadas",
    color: "#34d399",
  },
  {
    id: "financial_email",
    label: "Financeiro & Email",
    icon: Mail,
    description: "Email marketing & finanças",
    color: "#f59e0b",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: Shield,
    description: "Legalidade & RGPD",
    color: "#f87171",
  },
  {
    id: "content_creation",
    label: "Conteúdo",
    icon: PenTool,
    description: "Posts & copywriting",
    color: "#fb923c",
  },
  {
    id: "partnerships",
    label: "Parcerias",
    icon: Handshake,
    description: "Parcerias estratégicas",
    color: "#2dd4bf",
  },
  {
    id: "trading",
    label: "Trading",
    icon: TrendingUp,
    description: "Análise & sinais",
    color: "#4ade80",
  },
  {
    id: "business_incubation",
    label: "Incubação",
    icon: Rocket,
    description: "Crescimento do negócio",
    color: "#e879f9",
  },
  {
    id: "ai_control",
    label: "Controlo IA",
    icon: Brain,
    description: "Orquestração de agentes",
    color: "#D2A63C",
  },
  {
    id: "education",
    label: "Educação",
    icon: GraduationCap,
    description: "Cursos & materiais",
    color: "#38bdf8",
  },
  {
    id: "app_creator",
    label: "App Creator",
    icon: Smartphone,
    description: "Apps iOS & Android para as stores",
    color: "#06b6d4",
  },
  {
    id: "calendly",
    label: "Calendly",
    icon: Calendar,
    description: "Marcações & reuniões",
    color: "#00b4d8",
  },
  {
    id: "stream_vps",
    label: "Stream VPS",
    icon: Radio,
    description: "Controlo do servidor de streaming",
    color: "#22c55e",
  },
]

export default function DGSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: DGSection
  onSectionChange: (id: DGSection) => void
}) {
  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-zinc-950/90 backdrop-blur-sm h-screen sticky top-0">
      {/* Header */}
      <div className="border-b border-[#D2A63C]/15 p-3">
        <Link href="/admin">
          <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-gray-400 hover:text-[#D2A63C] hover:bg-[#D2A63C]/10 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Admin
          </button>
        </Link>
      </div>

      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#D2A63C]/15">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/25">
          <Brain className="h-5 w-5 text-[#D2A63C]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">Dashboard Gestão</p>
          <p className="text-xs text-gray-500 mt-0.5">MTM — Painel de Controlo</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          const isOverview = item.id === "overview"
          const isMetrics = item.id === "metrics"
          const isCalendly = item.id === "calendly"
          const isStreamVps = item.id === "stream_vps"

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all group",
                isActive
                  ? "bg-[#D2A63C]/15 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5",
                (isOverview || isMetrics || isCalendly || isStreamVps) && !isActive && "mt-1"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors",
                  isActive ? "bg-[#D2A63C]/20" : "bg-white/5 group-hover:bg-white/10"
                )}
              >
                <Icon
                  className="h-4 w-4 transition-colors"
                  style={{ color: isActive ? item.color : undefined }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium leading-none", isActive && "text-white")}>
                  {item.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
              </div>
              {isActive && <ChevronRight className="h-3 w-3 text-[#D2A63C] flex-shrink-0" />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#D2A63C]/15 p-3">
        <p className="text-center text-xs text-gray-600">12 Agentes IA · Stream VPS · Calendly</p>
        <p className="text-center text-xs text-gray-700">MoreThanMoney © 2026</p>
      </div>
    </aside>
  )
}
