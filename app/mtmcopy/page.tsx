"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Breadcrumbs from "@/components/breadcrumbs"
import ParticleBackground from "@/components/particle-background"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight, Send, LineChart, ShieldCheck, Zap, Loader2, Check,
  AlertTriangle, RefreshCw, Power, Settings2,
  ToggleLeft, ToggleRight, History, ChevronDown, ChevronUp, BarChart3,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { waitForSupabaseSession } from "@/lib/supabase-session"
import { useAuth } from "@/contexts/auth-context"
import {
  StatusPill, SignalCard, EmptySignals, ModeBanner, CopyTraderBanner,
  formatRelative, formatMt5Money,
} from "@/components/mtmcopy/mtmcopy-shared"
import {
  COPY_METHODS,
  TELEGRAM_GROUPS,
  copyMethodLabel,
  parseTelegramGroups,
  telegramGroupsLabel,
  type MtmcopyCopyMethod,
} from "@/lib/mtmcopy/copy-methods"
import SetupModal, { type MTMcopierConnection, type MtmcopySenderMode } from "@/components/mtmcopy/setup-modal"
import {
  getClientConnectionTitle,
  isMasterConnection,
  MTM_MASTER_LABEL,
} from "@/lib/mtmcopy/display-utils"

type MTMcopierConnectionRow = MTMcopierConnection & {
  last_signal_at: string | null
  last_error: string | null
  account_balance?: number | null
  account_equity?: number | null
}

interface SignalLog {
  id: string
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  status: "received" | "executed" | "skipped" | "error"
  detail: string | null
  created_at: string
}

function connectionTitle(conn: MTMcopierConnectionRow, index: number) {
  return getClientConnectionTitle(conn, index)
}

// ---------------------------------------------------------------------------
// Componente: Histórico de sinais
// ---------------------------------------------------------------------------

function SignalHistory({ accessToken }: { accessToken: string }) {
  const [signals, setSignals] = useState<SignalLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mtmcopy/signals?limit=30", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (res.ok) {
        setSignals(data.signals ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  const visible = expanded ? signals : signals.slice(0, 5)

  return (
    <div className="mb-14">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-[#D2A63C]" />
          Histórico de sinais
          {total > 0 && <span className="text-sm font-normal text-gray-400 ml-1">({total} total)</span>}
        </h2>
        <button
          onClick={load}
          className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 text-[#D2A63C] animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <EmptySignals />
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(sig => (
              <SignalCard key={sig.id} signal={sig} />
            ))}
          </div>

          {signals.length > 5 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full mt-2 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-white py-2 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-4 h-4" /> Ver menos</>
                : <><ChevronDown className="w-4 h-4" /> Ver todos os {signals.length} sinais</>}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Como funciona
// ---------------------------------------------------------------------------

const HOW_IT_WORKS = [
  { icon: Send, title: "Escolhe o teu método", text: "Estratégia MTM, grupo de sinais (Premium ou Forex) ou copy trader entre as tuas contas." },
  { icon: Settings2, title: "Configura risco e saídas", text: "Define lote, percentagem de risco e — no Premium — a percentagem fechada em cada exit." },
  { icon: LineChart, title: "Activa após pagamento", text: "Pré-configura as contas quando quiseres. A cópia só arranca quando a subscrição estiver activa." },
  { icon: ShieldCheck, title: "Acompanha no terminal", text: "Monitoriza execuções, saldos e desempenho no teu dashboard de métricas." },
]

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function MtmCopyPage() {
  const { user } = useAuth()
  const [connections, setConnections] = useState<MTMcopierConnectionRow[]>([])
  const [connectionsLoaded, setConnectionsLoaded] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupSelectionId, setSetupSelectionId] = useState<string | "new" | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState("")
  const [error, setError] = useState("")
  const [senderMode, setSenderMode] = useState<MtmcopySenderMode>("telegram")
  const [copyMethod, setCopyMethod] = useState<MtmcopyCopyMethod>("telegram_group")
  const [subscribed, setSubscribed] = useState(false)

  const hasConnections = (connections?.length ?? 0) > 0
  const masterConn = connections?.find((c) => c.account_role === "master") ?? null
  const isCopyTrader = senderMode === "master_account" || Boolean(masterConn)

  const loadConnections = useCallback(async (token: string) => {
    const res = await fetch("/api/mtmcopy/connection", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) {
      setConnections(data.connections ?? [])
      if (data.sender_mode) setSenderMode(data.sender_mode)
      const first = (data.connections ?? [])[0]
      if (first?.copy_method) setCopyMethod(first.copy_method)
      else if (data.sender_mode === "master_account") setCopyMethod("master_slave")
      setSubscribed(Boolean(data.subscribed))
      setConnectionsLoaded(true)
    } else {
      setConnections([])
      setConnectionsLoaded(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const finish = () => {
      if (!cancelled) setConnectionsLoaded(true)
    }

    const load = async () => {
      try {
        const token = await waitForSupabaseSession()
        if (!token) {
          if (!cancelled) setConnections([])
          return
        }

        setAccessToken(token)
        const res = await fetch("/api/mtmcopy/connection", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!cancelled && res.ok) {
          setConnections(data.connections ?? [])
          if (data.sender_mode) setSenderMode(data.sender_mode)
          const firstConn = (data.connections ?? [])[0]
          if (firstConn?.copy_method) setCopyMethod(firstConn.copy_method)
          else if (data.sender_mode === "master_account") setCopyMethod("master_slave")
          setSubscribed(Boolean(data.subscribed))
        } else if (!cancelled) {
          setConnections([])
        }
      } catch {
        if (!cancelled) setConnections([])
      } finally {
        finish()
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id])

  const openSetupWithMethod = async (
    method: MtmcopyCopyMethod,
    selectionId: string | "new" | null = null,
  ) => {
    setCopyMethod(method)
    await openSetup(selectionId, method)
  }

  const openSetup = async (
    selectionId: string | "new" | null = null,
    methodOverride?: MtmcopyCopyMethod,
  ) => {
    try {
      const token = await waitForSupabaseSession()
      if (!token) {
        setError("Sessão indisponível no browser. Recarrega a página ou faz login novamente.")
        return
      }

      setAccessToken(token)

      const res = await fetch("/api/mtmcopy/connection", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const list = (res.ok ? data.connections ?? [] : connections) as MTMcopierConnectionRow[]
      setConnections(list)
      if (data.sender_mode) setSenderMode(data.sender_mode)
      if (data.subscribed != null) setSubscribed(Boolean(data.subscribed))
      setConnectionsLoaded(true)

      const conn =
        selectionId && selectionId !== "new"
          ? list.find((c) => c.id === selectionId)
          : list[0]

      if (methodOverride) {
        setCopyMethod(methodOverride)
      } else if (conn?.copy_method) {
        setCopyMethod(conn.copy_method)
      } else if (conn?.account_role === "master") {
        setCopyMethod("master_slave")
      } else if (conn) {
        setCopyMethod(conn.sender_mode === "master_account" ? "master_slave" : "telegram_group")
      }

      setSetupSelectionId(selectionId)
      setShowSetup(true)
    } catch {
      setError("Não foi possível abrir a configuração. Tenta novamente.")
    }
  }

  const handleSetupSaved = async () => {
    if (accessToken) await loadConnections(accessToken)
    setShowSetup(false)
  }

  const handleAddonCheckout = async () => {
    setError("")
    setCheckingOut(true)
    try {
      const token = await waitForSupabaseSession()
      if (!token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: "mtmcopy_addon_monthly" }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || "Erro ao iniciar o pagamento. Tenta novamente.")
        setCheckingOut(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError("Erro de rede. Tenta novamente.")
      setCheckingOut(false)
    }
  }

  const handleToggleActive = async (conn: MTMcopierConnectionRow) => {
    if (!accessToken) return
    setTogglingId(conn.id)
    setError("")
    try {
      const res = await fetch("/api/mtmcopy/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ connection_id: conn.id, is_active: !conn.is_active }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erro ao atualizar estado.")
        if (res.status === 402) handleAddonCheckout()
      } else {
        await loadConnections(accessToken)
      }
    } catch {
      setError("Erro de rede. Tenta novamente.")
    } finally {
      setTogglingId(null)
    }
  }

  const handleVerifyTelegram = async () => {
    if (!accessToken) return
    setVerifying(true)
    setVerifyMsg("")
    try {
      const res = await fetch("/api/mtmcopy/telegram/verify", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (data.ok) {
        setVerifyMsg(data.message || "Ligação Telegram confirmada.")
        await loadConnections(accessToken)
      } else {
        setVerifyMsg(data.error || "Não foi possível verificar.")
      }
    } catch {
      setVerifyMsg("Erro de rede.")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      {showSetup && (
        <SetupModal
          connections={connections}
          initialSelectionId={setupSelectionId}
          initialSenderMode={senderMode}
          initialCopyMethod={copyMethod}
          onClose={() => setShowSetup(false)}
          onSaved={handleSetupSaved}
        />
      )}

      <div className="relative min-h-screen bg-black overflow-x-hidden">
        <ParticleBackground />
        <Breadcrumbs />

        <main className="relative z-10 container mx-auto px-4 py-16 max-w-6xl">

          {/* Hero */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <Badge className="mb-5 bg-[#D2A63C]/15 text-[#D2A63C] border-[#D2A63C]/30 px-4 py-1.5 text-sm">
              🔗 Addon · Copy Trading Automático
            </Badge>
            <h1 className="text-4xl md:text-6xl font-black mb-5 text-white leading-[1.1] tracking-tight">
              <span className="bg-gradient-to-r from-[#D2A63C] via-[#E8C56A] to-[#D2A63C] bg-clip-text text-transparent [-webkit-background-clip:text]">MTMcopier</span>
              <br className="hidden sm:block" />
              <span className="text-2xl md:text-4xl font-bold text-zinc-300"> Cópia automática profissional</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed">
              Replica sinais dos grupos MTM ou estratégias na tua conta MT5 — com o teu risco, as tuas regras e um terminal de performance dedicado.
            </p>

            <div className="mt-10 grid sm:grid-cols-3 gap-4 text-left max-w-4xl mx-auto">
              {COPY_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    openSetupWithMethod(
                      m.id,
                      hasConnections ? connections[0]?.id ?? "new" : "new",
                    )
                  }
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition-colors hover:border-[#D2A63C]/40 hover:bg-zinc-900/80"
                >
                  <p className="text-white font-bold mb-2">{m.title}</p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{m.description}</p>
                  <p className="text-xs text-[#D2A63C] mt-3 font-medium">Configurar →</p>
                </button>
              ))}
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4 text-left max-w-3xl mx-auto">
              {TELEGRAM_GROUPS.map((g) => (
                <div key={g.id} className="rounded-xl border border-[#D2A63C]/15 bg-[#D2A63C]/5 p-4">
                  <p className="text-[#D2A63C] font-semibold text-sm mb-1">{g.title}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{g.description}</p>
                </div>
              ))}
            </div>

            <div className="inline-flex items-baseline gap-2 mt-8 px-6 py-3 rounded-2xl border border-[#D2A63C]/25 bg-[#D2A63C]/5">
              <span className="text-4xl font-black text-white">+20€</span>
              <span className="text-zinc-400 text-sm">/mês · addon Pack MTM</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button
                onClick={() => hasConnections ? openSetup(connections[0]?.id ?? null) : handleAddonCheckout()}
                disabled={checkingOut}
                size="lg"
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
              >
                {checkingOut ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
                ) : hasConnections ? (
                  <><Settings2 className="mr-2 h-5 w-5" />Gerir contas</>
                ) : (
                  <>Ativar o MTMcopier <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </Button>
              <Button onClick={() => openSetup("new")} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                {hasConnections ? "+ Adicionar conta" : "Pré-configurar contas"}
              </Button>
              {hasConnections && subscribed && (
                <Button asChild variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10">
                  <Link href="/mtmcopy/metrics"><BarChart3 className="mr-2 h-4 w-4" />Terminal de métricas</Link>
                </Button>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400 mt-4 max-w-md mx-auto">{error}</p>
            )}
          </div>

          {hasConnections && !subscribed && (
            <div className="mb-10 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-center max-w-2xl mx-auto">
              <p className="text-amber-100/90 text-sm mb-3">
                Contas pré-configuradas. A cópia automática só arranca após activares a subscrição (+20€/mês).
              </p>
              <Button onClick={handleAddonCheckout} disabled={checkingOut} className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold">
                {checkingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Activar subscrição
              </Button>
            </div>
          )}

          {/* Contas ligadas */}
          {hasConnections && (
            <div className="mb-14 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Power className="w-5 h-5 text-[#D2A63C]" />
                  As tuas contas ({connections.length}{isCopyTrader ? "/3" : "/2"})
                </h2>
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-300" onClick={() => openSetup("new")}>
                  + Adicionar conta
                </Button>
              </div>

              {isCopyTrader && masterConn && (
                <CopyTraderBanner strategyId={masterConn.copyfactory_strategy_id} />
              )}

              {connections.map((connection, index) => (
                <Card key={connection.id} className="bg-zinc-900/70 border-zinc-800 backdrop-blur overflow-hidden">
                  <div className="h-px bg-gradient-to-r from-transparent via-[#D2A63C]/30 to-transparent" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-white text-base">
                        {connectionTitle(connection, index)}
                      </CardTitle>
                      <button
                        onClick={() => handleToggleActive(connection)}
                        disabled={togglingId === connection.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all shrink-0 ${
                          connection.is_active
                            ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        {togglingId === connection.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : connection.is_active ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                        {connection.is_active ? "Ativo" : "Pausado"}
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {connection.account_role !== "master" && !isCopyTrader && (
                      <div className="mb-4">
                        <ModeBanner customChannel={connection.telegram_channel} />
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      {isMasterConnection(connection.account_role) ? (
                        <div className="rounded-xl bg-zinc-950/50 border border-[#D2A63C]/30 p-4 sm:col-span-2">
                          <p className="text-[10px] uppercase tracking-widest text-[#D2A63C]/80 mb-2">Copy trader pessoal</p>
                          <p className="text-white font-semibold mb-1">{MTM_MASTER_LABEL}</p>
                          <p className="text-xs text-zinc-500 mb-3">
                            Conta sender MoreThanMoney — as trades são replicadas para as tuas contas slave.
                          </p>
                          <StatusPill status={connection.mt5_status} />
                        </div>
                      ) : (
                        <>
                          <div className="rounded-xl bg-zinc-950/50 border border-zinc-800 p-4">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Método</p>
                            <p className="text-white font-semibold mb-2 truncate">
                              {isCopyTrader
                                ? MTM_MASTER_LABEL
                                : connection.copy_method === "strategy"
                                  ? "Estratégia MTM"
                                  : copyMethodLabel(connection.copy_method)}
                            </p>
                            {!isCopyTrader && connection.copy_method === "telegram_group" && (
                              <p className="text-xs text-zinc-500 mb-2">
                                {telegramGroupsLabel(parseTelegramGroups(connection))}
                              </p>
                            )}
                            <StatusPill status={isCopyTrader ? "connected" : connection.telegram_status} />
                          </div>
                          <div className="rounded-xl bg-zinc-950/50 border border-zinc-800 p-4">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">MetaTrader</p>
                            <p className="text-white font-semibold mb-2">
                              {connection.mt5_server || "—"}
                              {connection.mt5_login_last4 && (
                                <span className="text-zinc-500 font-mono text-sm"> ····{connection.mt5_login_last4}</span>
                              )}
                            </p>
                            <StatusPill status={connection.mt5_status} />
                          </div>
                        </>
                      )}
                    </div>

                    {connection.account_role !== "master" && (
                    <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                      <div className="rounded-lg bg-[#D2A63C]/10 border border-[#D2A63C]/25 px-3 py-2.5 text-center sm:col-span-1">
                        <p className="text-xs text-[#D2A63C]/80 mb-0.5">Saldo MT5</p>
                        <p className="text-white text-sm font-semibold tabular-nums">
                          {formatMt5Money(connection.account_balance)}
                        </p>
                        {connection.account_equity != null &&
                          connection.account_equity !== connection.account_balance && (
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Equity {formatMt5Money(connection.account_equity)}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2.5 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Modo lote</p>
                        <p className="text-white text-sm font-medium">
                          {connection.lot_mode === "fixed" ? "Fixo" : connection.lot_mode === "risk_percent" ? "% Risco" : "Multiplicador"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2.5 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Valor</p>
                        <p className="text-white text-sm font-medium">{connection.lot_value}</p>
                      </div>
                      <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2.5 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Risco máx./dia</p>
                        <p className="text-white text-sm font-medium">{connection.max_risk_percent ?? "—"}%</p>
                      </div>
                      <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2.5 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Último sinal</p>
                        <p className="text-white text-sm font-medium">
                          {connection.last_signal_at ? formatRelative(connection.last_signal_at) : "Nenhum"}
                        </p>
                      </div>
                    </div>
                    {connection.lot_mode === "risk_percent" && connection.account_balance == null && connection.mt5_status === "connected" && (
                      <div className="flex items-start gap-2.5 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>
                          Saldo indisponível — o modo <strong>% risco</strong> via CopyFactory precisa do saldo da conta.
                          Clica em <strong>Atualizar</strong> ou verifica a ligação MetaAPI.
                        </p>
                      </div>
                    )}
                    {connection.lot_mode === "risk_percent" && connection.account_balance != null && (
                      <p className="text-xs text-zinc-500 mb-4 -mt-1">
                        Com {connection.lot_value}% de risco, cada trade arrisca ~{" "}
                        <strong className="text-zinc-300">
                          {formatMt5Money((connection.account_balance * Number(connection.lot_value)) / 100)}
                        </strong>{" "}
                        do saldo (conforme distância ao SL no sinal).
                      </p>
                    )}
                    </>
                    )}

                    {connection.account_role !== "master" && connection.symbols_whitelist && connection.symbols_whitelist.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        <span className="text-xs text-gray-500">Filtro:</span>
                        {connection.symbols_whitelist.map((sym) => (
                          <span key={sym} className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-mono">
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}

                    {connection.telegram_status === "pending" && connection.telegram_channel && (
                      <div className="flex items-start gap-2.5 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>Adiciona <strong>@MoreThanMoney_aibot</strong> como admin de <strong>{connection.telegram_channel}</strong>.</p>
                      </div>
                    )}
                    {connection.mt5_status === "pending" && (
                      <div className="flex items-start gap-2.5 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>A ligar a conta — normalmente 1–3 minutos.</p>
                      </div>
                    )}
                    {connection.last_error && (
                      <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>{connection.last_error}</p>
                      </div>
                    )}

                    <Button
                      onClick={() => openSetup(connection.id)}
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                      <Settings2 className="mr-2 h-4 w-4" /> Editar esta conta
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {verifyMsg && (
                <p className={`text-sm ${verifyMsg.includes("confirmad") || verifyMsg.includes("activo") || verifyMsg.includes("predefinição") ? "text-emerald-400" : "text-amber-400"}`}>
                  {verifyMsg}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {subscribed && (
                <Button asChild variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10">
                  <Link href="/mtmcopy/metrics"><BarChart3 className="mr-2 h-4 w-4" />Terminal de métricas</Link>
                </Button>
                )}
                {!isCopyTrader && (
                <Button
                  onClick={handleVerifyTelegram}
                  disabled={verifying}
                  className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold"
                >
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Verificar Telegram
                </Button>
                )}
                <Button variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-800" onClick={() => accessToken && loadConnections(accessToken)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                </Button>
              </div>
            </div>
          )}

          {hasConnections && accessToken && subscribed && (
            <SignalHistory accessToken={accessToken} />
          )}

          {/* Como funciona */}
          <div className="mb-14">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Como funciona</h2>
            <p className="text-zinc-500 text-sm text-center mb-8">Quatro passos até à cópia automática</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {HOW_IT_WORKS.map(({ icon: Icon, title, text }, i) => (
                <div key={title} className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-[#D2A63C]/25 hover:bg-zinc-900/60 transition-all">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/20 flex items-center justify-center shrink-0 group-hover:shadow-[0_0_20px_-4px_rgba(210,166,60,0.4)] transition-shadow">
                      <Icon className="w-5 h-5 text-[#D2A63C]" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#D2A63C]/60 uppercase tracking-widest">Passo {i + 1}</span>
                      <h3 className="text-white font-bold mt-0.5 mb-2">{title.replace(/^\d+\.\s*/, "")}</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Segurança */}
          <div className="rounded-2xl border border-[#D2A63C]/20 bg-gray-900/40 p-6 md:p-8 mb-14">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#D2A63C]" /> A tua segurança em primeiro lugar
            </h2>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-gray-300">
              {[
                "Ligação segura à tua conta de trading — credenciais encriptadas e nunca partilhadas",
                "Define limites de risco diário — o MTMcopier pára de copiar se o limite for atingido",
                "Ativa, pausa ou desliga a cópia a qualquer momento, sem perder a configuração",
                "Histórico completo de sinais recebidos e ordens executadas, sempre disponível para consulta",
                "Funciona como addon — precisas de ter um Pack MTM (Membro ou Premium) ativo",
                "Suporte dedicado para configurares o teu canal e a tua conta corretamente",
              ].map(point => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D2A63C] mt-0.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA final */}
          <div className="text-center">
            <Button
              onClick={() => hasConnections ? openSetup(null) : handleAddonCheckout()}
              disabled={checkingOut}
              size="lg"
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
            >
              {checkingOut ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
              ) : hasConnections ? (
                <>Gerir contas <Settings2 className="ml-2 h-5 w-5" /></>
              ) : (
                <>Ativar o MTMcopier por +20€/mês <Zap className="ml-2 h-5 w-5" /></>
              )}
            </Button>
            <p className="text-xs text-gray-500 mt-3">Pagamento seguro via Stripe · cancela quando quiseres</p>
          </div>

        </main>
      </div>
    </>
  )
}
