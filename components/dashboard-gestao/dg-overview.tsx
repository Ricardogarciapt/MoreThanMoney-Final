"use client"

import { Search, Bot, PhoneCall, Mail, Shield, PenTool, Handshake, TrendingUp, Rocket, Brain, GraduationCap, Calendar, ArrowRight } from "lucide-react"
import type { DGSection, NavItem } from "./dg-sidebar"
import { navItems } from "./dg-sidebar"

const agents = navItems.filter((n) => n.id !== "overview" && n.id !== "calendly")

export default function DGOverview({ onNavigate }: { onNavigate: (id: DGSection) => void }) {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl border border-[#D2A63C]/20 bg-gradient-to-br from-[#D2A63C]/10 via-zinc-950 to-zinc-950 p-8">
        <div className="flex items-center gap-3 mb-3">
          <Brain className="h-8 w-8 text-[#D2A63C]" />
          <h1 className="text-2xl font-bold text-white">Dashboard Gestão MTM</h1>
        </div>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          Centro de controlo com 11 agentes IA especializados para gerir e escalar o negócio MoreThanMoney.
          Cada agente tem contexto completo sobre o teu negócio e responde em Português de Portugal.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => onNavigate("ai_control")}
            className="flex items-center gap-2 px-4 py-2 bg-[#D2A63C] hover:bg-[#BB8525] text-black rounded-xl text-sm font-semibold transition-colors"
          >
            <Brain className="h-4 w-4" />
            Controlo IA
          </button>
          <button
            onClick={() => onNavigate("calendly")}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Ver marcações
          </button>
        </div>
      </div>

      {/* Status badges */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {[
          { label: "Agentes IA", value: "11", color: "#D2A63C" },
          { label: "Calendly", value: "Ativo", color: "#4ade80" },
          { label: "ManyChat", value: "Live", color: "#60a5fa" },
          { label: "Supabase", value: "Saudável", color: "#a78bfa" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-center"
          >
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Agents grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          11 Agentes IA — clica para conversar
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => {
            const Icon = agent.icon
            return (
              <button
                key={agent.id}
                onClick={() => onNavigate(agent.id)}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-left hover:border-[#D2A63C]/20 hover:bg-zinc-900 transition-all group"
              >
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}
                >
                  <Icon className="h-5 w-5" style={{ color: agent.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{agent.label}</p>
                  <p className="text-xs text-gray-500 truncate">{agent.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-[#D2A63C] transition-colors flex-shrink-0" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Integrations status */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Integrações ativas</h2>
        <div className="space-y-3">
          {[
            { name: "Calendly → Supabase", desc: "Webhook ativo — onboarding + reunião pontual", status: "ok" },
            { name: "Zoom → Google Calendar", desc: "morethanmoneypt@gmail.com autorizado", status: "ok" },
            { name: "ManyChat → Instagram", desc: "Flows publicados: SCANNER, SISTEMA, BOOTCAMP, RESULTADOS...", status: "ok" },
            { name: "Story Reply + Default Reply", desc: "Automações básicas ativas", status: "ok" },
          ].map((intg) => (
            <div key={intg.name} className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${intg.status === "ok" ? "bg-green-500" : "bg-yellow-500"}`} />
              <div>
                <p className="text-sm text-white">{intg.name}</p>
                <p className="text-xs text-gray-500">{intg.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
