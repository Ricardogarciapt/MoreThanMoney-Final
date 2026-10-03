"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Users, Calendar, TrendingUp, Zap, MessageSquare, Search,
  Bot, PhoneCall, Mail, Shield, PenTool, Handshake, Rocket,
  Brain, GraduationCap, ExternalLink, RefreshCw, Smartphone,
  AppWindow, Store, Code2, Bell,
} from "lucide-react"
import type { NavItem } from "./dg-sidebar"
import { cn } from "@/lib/utils"

// ── Quick prompts per agent ───────────────────────────────────────────────────
const QUICK_PROMPTS: Record<string, string[]> = {
  prospeccao: [
    "Cria um script de prospeção para Instagram DM para quem comentou num post de trading",
    "Quais são os critérios para qualificar um lead como quente?",
    "Quantos utilizadores ativos temos na plataforma?",
    "Cria uma lista de perguntas de qualificação para stories",
  ],
  chatbot_builder: [
    "Mostra-me os flows disponíveis no ",
    "Cria uma mensagem de boas-vindas para o flow SCANNER",
    "Lista todas as tags disponíveis no ",
    "Escreve uma sequência de 3 mensagens para o flow LIBERDADE",
  ],
  setter: [
    "Mostra-me as próximas marcações Calendly",
    "Cria um script de follow-up pós-chamada de onboarding",
    "Como responder à objeção 'não tenho dinheiro'?",
    "Quais são as marcações desta semana?",
  ],
  financial_email: [
    "Escreve um email de boas-vindas para novos membros",
    "Cria uma sequência de 5 emails de nurture para leads frios",
    "Qual é a taxa de conversão das chamadas Calendly?",
    "Escreve um email de upsell para membros trial",
  ],
  compliance: [
    "Revê este disclaimer para posts de trading: [cola aqui]",
    "Que informação de RGPD devo incluir no formulário de registo?",
    "É legal prometer resultados de trading no marketing?",
    "Quais os requisitos legais para vender mentoria financeira em Portugal?",
  ],
  content_creation: [
    "Cria um hook poderoso para um Reel sobre liberdade financeira",
    "Escreve uma caption para um post de segunda-feira sobre mindset",
    "Cria 5 ideias de conteúdo para a fase de decisão do funil",
    "Escreve um script de 60 segundos para Reel sobre o Scanner GoldKiller",
  ],
  partnerships: [
    "Escreve uma proposta de parceria para um coach de produtividade",
    "Quais os melhores tipos de parceria para um negócio de mentoria?",
    "Cria um pitch de 2 minutos para proposta de co-criação",
    "Como estruturar um acordo de comissão com parceiros?",
  ],
  trading: [
    "Explica a estratégia do Scanner GoldKiller em termos simples",
    "Cria uma análise educativa sobre XAUUSD para a comunidade",
    "Quais os melhores horários para fazer trading de ouro?",
    "Escreve um post educativo sobre gestão de risco no trading",
  ],
  business_incubation: [
    "Quais são os KPIs mais importantes para o negócio MTM agora?",
    "Quantos membros e marcações temos atualmente?",
    "Cria um roadmap para os próximos 3 meses",
    "Quais os próximos produtos que devemos lançar?",
  ],
  ai_control: [
    "Faz um relatório do estado de todos os sistemas MTM",
    "Quais os flows  ativos e as tags existentes?",
    "Como melhorar a integração entre Calendly e Supabase?",
    "Mostra-me as estatísticas gerais da plataforma",
  ],
  education: [
    "Cria a estrutura de um módulo introdutório ao trading para iniciantes",
    "Escreve um guia de 'Primeiros Passos' para novos membros",
    "Cria 10 perguntas de quiz sobre gestão de risco",
    "Desenvolve um checklist de onboarding para novos membros MTM",
  ],
  app_creator: [
    "Como converter a app-mobile MTM para iOS e Android com Capacitor? Dá os comandos exatos",
    "Quais os requisitos completos da App Store para uma app de educação financeira?",
    "Cria a metadata completa para submeter a app MTM nas stores (nome, descrição, keywords)",
    "Que passos preciso para obter Apple Developer Account e publicar pela primeira vez?",
    "Como configurar push notifications Firebase para iOS e Android via Capacitor?",
    "Qual a estratégia de monetização correta para evitar a comissão de 30% das stores?",
  ],
}

// ── Capabilities per agent ─────────────────────────────────────────────────────
const CAPABILITIES: Record<string, { label: string; icon: React.ElementType }[]> = {
  prospeccao: [
    { label: "Qualificação de leads", icon: Search },
    { label: "Scripts de prospeção", icon: MessageSquare },
    { label: "Dados de utilizadores", icon: Users },
    { label: "Análise de fit MTM", icon: TrendingUp },
  ],
  chatbot_builder: [
    { label: "Flows ", icon: Bot },
    { label: "Tags & keywords", icon: Zap },
    { label: "Mensagens automatizadas", icon: MessageSquare },
    { label: "Jornadas de cliente", icon: TrendingUp },
  ],
  setter: [
    { label: "Marcações Calendly", icon: Calendar },
    { label: "Scripts de qualificação", icon: PhoneCall },
    { label: "Gestão de objeções", icon: MessageSquare },
    { label: "Follow-ups pós-chamada", icon: Mail },
  ],
  financial_email: [
    { label: "Email marketing", icon: Mail },
    { label: "Sequências automatizadas", icon: Zap },
    { label: "Análise de conversões", icon: TrendingUp },
    { label: "Estratégia de pricing", icon: Rocket },
  ],
  compliance: [
    { label: "Verificação legal PT", icon: Shield },
    { label: "Disclaimers de trading", icon: Shield },
    { label: "Conformidade RGPD", icon: Shield },
    { label: "Revisão de contratos", icon: Shield },
  ],
  content_creation: [
    { label: "Captions Instagram", icon: PenTool },
    { label: "Scripts de Reel", icon: PenTool },
    { label: "CTAs ", icon: Bot },
    { label: "Calendário editorial", icon: Calendar },
  ],
  partnerships: [
    { label: "Propostas de parceria", icon: Handshake },
    { label: "Modelos de colaboração", icon: TrendingUp },
    { label: "Pitch decks", icon: Rocket },
    { label: "Acordos de comissão", icon: Mail },
  ],
  trading: [
    { label: "Análise XAUUSD", icon: TrendingUp },
    { label: "Scanner GoldKiller", icon: Zap },
    { label: "Gestão de risco", icon: Shield },
    { label: "Conteúdo educativo", icon: GraduationCap },
  ],
  business_incubation: [
    { label: "KPIs & métricas", icon: TrendingUp },
    { label: "Dados da plataforma", icon: Users },
    { label: "Roadmap de produto", icon: Rocket },
    { label: "Estratégia de crescimento", icon: Brain },
  ],
  ai_control: [
    { label: "Status de sistemas", icon: Brain },
    { label: "Flows ", icon: Bot },
    { label: "Dados Supabase", icon: Zap },
    { label: "Relatórios de performance", icon: TrendingUp },
  ],
  education: [
    { label: "Estrutura de cursos", icon: GraduationCap },
    { label: "Materiais educativos", icon: PenTool },
    { label: "Quiz & exercícios", icon: Zap },
    { label: "Jornadas de aprendizagem", icon: TrendingUp },
  ],
  app_creator: [
    { label: "Conversão web→nativo (Capacitor)", icon: Smartphone },
    { label: "App Store compliance (Apple)", icon: Store },
    { label: "Google Play compliance", icon: Store },
    { label: "ASO & metadata", icon: AppWindow },
    { label: "Push notifications", icon: Bell },
    { label: "In-App Purchases / Monetização", icon: Code2 },
  ],
}

// ── Quick links per agent ─────────────────────────────────────────────────────
const QUICK_LINKS: Record<string, { label: string; url: string }[]> = {
  prospeccao: [
    { label: "Instagram MTM", url: "https://instagram.com/morethanmoney.pt" },
    { label: "", url: "https://app..com" },
  ],
  chatbot_builder: [
    { label: " Dashboard", url: "https://app..com" },
    { label: "Instagram MTM", url: "https://instagram.com/morethanmoney.pt" },
  ],
  setter: [
    { label: "Agendar · Onboarding", url: "/agendar?t=onboarding" },
    { label: "Agendar · todos os assuntos", url: "/agendar" },
  ],
  financial_email: [
    { label: "Gmail MTM", url: "https://mail.google.com" },
    { label: "Supabase Dashboard", url: "https://supabase.com/dashboard" },
  ],
  compliance: [
    { label: "CNPD Portugal", url: "https://www.cnpd.pt" },
    { label: "CMVM", url: "https://www.cmvm.pt" },
  ],
  content_creation: [
    { label: "Instagram MTM", url: "https://instagram.com/morethanmoney.pt" },
    { label: "Canva", url: "https://www.canva.com" },
    { label: "Social MTM (motor próprio)", url: "/admin/social" },
  ],
  partnerships: [
    { label: "LinkedIn", url: "https://linkedin.com" },
    { label: "Instagram MTM", url: "https://instagram.com/morethanmoney.pt" },
  ],
  trading: [
    { label: "TradingView XAUUSD", url: "https://www.tradingview.com/chart/?symbol=XAUUSD" },
    { label: "Skool Comunidade", url: "https://www.skool.com/morethanmoney-1132" },
  ],
  business_incubation: [
    { label: "Supabase Analytics", url: "https://supabase.com/dashboard" },
    { label: "Skool", url: "https://www.skool.com/morethanmoney-1132" },
  ],
  ai_control: [
    { label: "Supabase", url: "https://supabase.com/dashboard" },
    { label: "", url: "https://app..com" },
    { label: "Vercel", url: "https://vercel.com/dashboard" },
    { label: "Anthropic Console", url: "https://console.anthropic.com" },
  ],
  education: [
    { label: "Skool Cursos", url: "https://www.skool.com/morethanmoney-1132" },
    { label: "Canva", url: "https://www.canva.com" },
  ],
  app_creator: [
    { label: "Apple Developer", url: "https://developer.apple.com" },
    { label: "App Store Connect", url: "https://appstoreconnect.apple.com" },
    { label: "Google Play Console", url: "https://play.google.com/console" },
    { label: "Capacitor Docs", url: "https://capacitorjs.com/docs" },
    { label: "Firebase Console", url: "https://console.firebase.google.com" },
    { label: "App Store Guidelines", url: "https://developer.apple.com/app-store/review/guidelines/" },
  ],
}

// ── Stats widget ─────────────────────────────────────────────────────────────
function StatsWidget({ agentId }: { agentId: string }) {
  const [stats, setStats] = useState<{ users?: { total: number; active: number }; bookings?: { active: number; total: number } } | null>(null)
  const [loading, setLoading] = useState(false)

  const showStats = ["setter", "business_incubation", "ai_control", "financial_email", "prospeccao"].includes(agentId)

  // loadStats declared before useEffect so the hook is always called in the same order
  const loadStats = useCallback(async () => {
    if (!showStats) return
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard-gestao/bookings?status=active&limit=5")
      if (res.ok) {
        const data = await res.json()
        setStats({
          bookings: { active: data.stats?.totalActive ?? 0, total: (data.stats?.totalActive ?? 0) + (data.stats?.totalCancelled ?? 0) },
        })
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [agentId, showStats])

  useEffect(() => { loadStats() }, [loadStats])

  // All hooks above — safe to return early now
  if (!showStats) return null
  if (!stats && !loading) return null

  return (
    <div className="p-4 border-b border-white/5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Dados em Tempo Real</p>
        <button onClick={loadStats} className="text-gray-600 hover:text-gray-400 transition-colors">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-2">
          {stats.bookings && (
            <>
              <div className="bg-white/5 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-500 mb-0.5">Marcações ativas</p>
                <p className="text-lg font-bold text-white">{stats.bookings.active}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-500 mb-0.5">Total marcações</p>
                <p className="text-lg font-bold text-white">{stats.bookings.total}</p>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AgentContextPanel({
  agent,
  onPrompt,
}: {
  agent: NavItem
  onPrompt: (prompt: string) => void
}) {
  const Icon = agent.icon
  const prompts = QUICK_PROMPTS[agent.id] || []
  const capabilities = CAPABILITIES[agent.id] || []
  const links = QUICK_LINKS[agent.id] || []

  return (
    <div className="w-64 flex-shrink-0 border-r border-[#D2A63C]/10 bg-black/30 flex flex-col overflow-y-auto">
      {/* Agent card */}
      <div className="p-4 border-b border-white/5">
        <div
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: `${agent.color}10`, border: `1px solid ${agent.color}20` }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: `${agent.color}20` }}
          >
            <Icon className="h-5 w-5" style={{ color: agent.color }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">{agent.label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{agent.description}</p>
          </div>
        </div>
      </div>

      {/* Live stats */}
      <StatsWidget agentId={agent.id} />

      {/* Quick prompts */}
      {prompts.length > 0 && (
        <div className="p-4 border-b border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Ações Rápidas</p>
          <div className="space-y-1.5">
            {prompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onPrompt(prompt)}
                className="w-full text-left text-[11px] px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-all border border-transparent hover:border-white/10 leading-snug"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div className="p-4 border-b border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Ferramentas</p>
          <div className="space-y-2">
            {capabilities.map(({ label, icon: CapIcon }, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-gray-500">
                <CapIcon className="h-3 w-3 flex-shrink-0" style={{ color: agent.color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      {links.length > 0 && (
        <div className="p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Links Rápidos</p>
          <div className="space-y-1.5">
            {links.map(({ label, url }, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[11px] text-gray-500 hover:text-[#D2A63C] transition-colors"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                {label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
