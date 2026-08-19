"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import MTMcopierManager from "@/components/admin/mtmcopier-manager"
import MtmcopyOpsHub from "@/components/admin/mtmcopy-ops-hub"
import MtmcopySyncAllPanel from "@/components/admin/mtmcopy-sync-all-panel"
import MtmcopyTestPanel from "@/components/admin/mtmcopy-test-panel"
import MtmcopySenderLog from "@/components/admin/mtmcopy-sender-log"
import MtmcopyStrategyControl from "@/components/admin/mtmcopy-strategy-control"
import {
  MtmcopyAdminSection,
  MtmcopyAdminTabNav,
  MTMCOPY_ADMIN_TABS,
  type MtmcopyAdminTab,
} from "@/components/admin/mtmcopy-admin-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  Bot,
  Loader2,
  Shield,
  Radio,
  RefreshCw,
  ExternalLink,
  Send,
  Users,
  Activity,
  BarChart3,
  Globe,
  Zap,
  FlaskConical,
} from "lucide-react"
import { PipelineFlow } from "@/components/mtmcopy/mtmcopy-shared"
import MtmcopyGlobalPerformance from "@/components/admin/mtmcopy-global-performance"
import { coerceBotUsername, formatTelegramBotLabel } from "@/lib/telegram-bot-display"

function parseTab(
  raw: string | null,
  opts: { userId?: string | null; routeId?: string | null },
): MtmcopyAdminTab {
  // Fonte única: MTMCOPY_ADMIN_TABS (evita a lista de tabs desincronizar entre sidebar/nav/parse).
  const valid: MtmcopyAdminTab[] = MTMCOPY_ADMIN_TABS.map((t) => t.id)
  if (raw && valid.includes(raw as MtmcopyAdminTab)) return raw as MtmcopyAdminTab
  if (opts.userId) return "users"
  if (opts.routeId) return "senders"
  return "overview"
}

export default function AdminMtmcopyPage() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightUserId = searchParams.get("userId")
  const highlightRouteId = searchParams.get("routeId")
  const [mounted, setMounted] = useState(false)
  const [webhookInfo, setWebhookInfo] = useState<Record<string, unknown> | null>(null)
  const [botUsername, setBotUsername] = useState("MoreThanMoney_aibot")

  const initialTab = useMemo(
    () => parseTab(searchParams.get("tab"), { userId: highlightUserId, routeId: highlightRouteId }),
    [searchParams, highlightUserId, highlightRouteId],
  )
  const [activeTab, setActiveTab] = useState<MtmcopyAdminTab>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const setTab = useCallback(
    (tab: MtmcopyAdminTab) => {
      setActiveTab(tab)
      const params = new URLSearchParams(searchParams.toString())
      if (tab === "overview") params.delete("tab")
      else params.set("tab", tab)
      const qs = params.toString()
      router.replace(qs ? `/admin/mtmcopy?${qs}` : "/admin/mtmcopy", { scroll: false })
    },
    [router, searchParams],
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!user) {
      router.replace("/login?redirect=/admin/mtmcopy")
      return
    }
    if (!isAdmin) {
      router.replace("/member-area")
    }
  }, [mounted, isLoading, user, isAdmin, router])

  const loadSystem = useCallback(async () => {
    try {
      const [wh, defs] = await Promise.all([
        fetch("/api/telegram/webhook").then((r) => r.json()),
        fetch("/api/mtmcopy/telegram/defaults").then((r) => r.json()),
      ])
      setWebhookInfo(wh)
      if (defs.bot_username) setBotUsername(coerceBotUsername(defs.bot_username))
    } catch {
      setWebhookInfo(null)
    }
  }, [])

  useEffect(() => {
    if (mounted && isAdmin) loadSystem()
  }, [mounted, isAdmin, loadSystem])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const webhookStatus = (webhookInfo as { status?: string })?.status ?? "—"

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-zinc-950/90 p-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-400 hover:text-[#D2A63C] mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Admin
          </Button>
        </Link>
        <div className="flex items-center gap-2 px-1 mb-4">
          <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25">
            <Shield className="h-4 w-4 text-[#D2A63C]" />
          </div>
          <span className="font-semibold text-sm">MTMcopier Ops</span>
        </div>
        <nav className="space-y-1 text-sm">
          {MTMCOPY_ADMIN_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === item.id
                  ? "bg-[#D2A63C]/15 text-[#D2A63C] border-l-2 border-[#D2A63C]"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="pt-4 mt-2 border-t border-zinc-800">
            <Link
              href="/mtmcopy"
              className="block px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50"
            >
              Página cliente
            </Link>
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="border-b border-[#D2A63C]/15 bg-black/40 px-4 sm:px-6 py-4 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#D2A63C] mb-1">
                <Radio className="w-3 h-3" /> Admin · Operações
              </div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Bot className="w-6 h-6 text-[#D2A63C]" />
                Consola MTMcopier
              </h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadSystem} className="border-zinc-700">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Sistema
              </Button>
              <Button asChild variant="outline" size="sm" className="border-zinc-700">
                <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> @{botUsername}
                </a>
              </Button>
            </div>
          </div>
          <MtmcopyAdminTabNav active={activeTab} onChange={setTab} />
        </header>

        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
          {activeTab === "overview" && (
            <>
              <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-[#D2A63C]/40 to-transparent" />
                <CardContent className="pt-2 pb-4">
                  <PipelineFlow botUsername={botUsername} />
                </CardContent>
              </Card>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="bg-zinc-900/60 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Webhook</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-emerald-400">{webhookStatus}</p>
                    <p className="text-xs text-zinc-600 mt-1 truncate">
                      {formatTelegramBotLabel((webhookInfo as { bot?: unknown })?.bot, botUsername)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/60 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Stack</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-white">Bot API · Vercel · Supabase</p>
                    <p className="text-xs text-zinc-600 mt-1">MetaAPI CopyFactory</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/60 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Execução</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-white">MetaAPI (MT5) · Bybit (perps)</p>
                    <p className="text-xs text-zinc-600 mt-1">Métricas por estratégia abaixo ↓</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/60 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Acesso rápido</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="border-zinc-700 h-8 text-xs" onClick={() => setTab("senders")}>
                      <Send className="w-3 h-3 mr-1" /> Senders
                    </Button>
                    <Button size="sm" variant="outline" className="border-zinc-700 h-8 text-xs" onClick={() => setTab("subscribers")}>
                      <Users className="w-3 h-3 mr-1" /> Subscribers
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Painel «Desempenho das estratégias» retirado da Visão geral (pedido Ricardo
                  2026-08-19). A «Visão global do sistema», abaixo, mantém a performance agregada. */}

              <MtmcopyAdminSection
                title="Visão global do sistema"
                description="Performance agregada de TODAS as contas e utilizadores (copiado, manual e auditado) — curva de equity, drawdown, profit factor, P&L por conta/mês e alertas de risco. Mesmo motor do terminal do utilizador."
                icon={Globe}
                accent="gold"
              >
                <MtmcopyGlobalPerformance />
              </MtmcopyAdminSection>

              <div className="grid gap-6">
                {/* "Sincronizar tudo" vive só na tab Ferramentas (fonte única) — evita 2 botões iguais. */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-sm text-zinc-300">Mapa da consola</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-zinc-400">
                    <p><strong className="text-emerald-400">Senders</strong> — canais Telegram, webhook Sensei e rotas provider.</p>
                    <p><strong className="text-[#D2A63C]">Subscribers</strong> — contas CopyFactory e estado MetaAPI.</p>
                    <p><strong className="text-sky-400">Monitorização</strong> — log de sinais e tentativas de execução.</p>
                    <p><strong className="text-violet-300">Ferramentas</strong> — testes manuais e sync global.</p>
                    <p><strong className="text-zinc-300">Utilizadores</strong> — gestão por membro e ligações MT5.</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {activeTab === "strategies" && (
            <MtmcopyAdminSection
              title="Controlo de estratégias"
              description="On/off por estratégia (runtime, sem redeploy), modos PrimeVerse/Forex Swings, limites de risco dos perps, sugestões de watchlist e o estado das flags de execução da Vercel."
              icon={BarChart3}
              accent="emerald"
            >
              <MtmcopyStrategyControl />
            </MtmcopyAdminSection>
          )}

          {activeTab === "senders" && (
            <MtmcopyOpsHub initialRouteId={highlightRouteId} panel="senders" />
          )}

          {activeTab === "subscribers" && (
            <MtmcopyOpsHub panel="subscribers" />
          )}

          {activeTab === "logs" && (
            <MtmcopyAdminSection
              title="Log de sinais"
              description="Últimas trades e tentativas dos canais MTM — validação IA, erros de mercado e parser."
              icon={Activity}
              accent="sky"
            >
              <MtmcopySenderLog />
            </MtmcopyAdminSection>
          )}

          {activeTab === "tools" && (
            <div className="space-y-6">
              {/* Uma só moldura por painel (MtmcopyAdminSection), como nas restantes tabs:
                  antes cada componente trazia o seu próprio cabeçalho violeta e a tab
                  ficava com dois títulos concorrentes. */}
              <MtmcopyAdminSection
                title="Sincronização total"
                description="Alinha Supabase, rotas provider, estratégias CopyFactory, subscribers, riscos de conta financiada, baselines e erros pendentes — MetaAPI, site e motor de trades/parciais/IA."
                icon={Zap}
                accent="violet"
              >
                <MtmcopySyncAllPanel />
              </MtmcopyAdminSection>

              <MtmcopyAdminSection
                title="Testes · provider e Telegram"
                description="Envia uma trade de teste às contas MTM Auto ou publica um sinal nos canais via @MoreThanMoney_aibot, com a opção de correr o pipeline completo."
                icon={FlaskConical}
                accent="sky"
              >
                <MtmcopyTestPanel />
              </MtmcopyAdminSection>
            </div>
          )}

          {activeTab === "users" && (
            <MtmcopyAdminSection
              title="Gestão por utilizador"
              description="Ligação à base de dados — MetaAPI, Telegram, MT5 e histórico por membro."
              icon={Users}
              accent="gold"
            >
              <MTMcopierManager highlightUserId={highlightUserId} />
            </MtmcopyAdminSection>
          )}
        </div>
      </main>
    </div>
  )
}
