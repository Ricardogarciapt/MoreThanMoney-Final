"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  Send,
  Wifi,
  WifiOff,
  AlertCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Lock,
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Connection {
  id: string
  account_label?: string | null
  mt5_login_last4?: string | null
  mt5_server?: string | null
  mt5_status: "pending" | "connected" | "error" | "disconnected"
  telegram_status: "pending" | "connected" | "error" | "disconnected"
  copy_method?: string | null
  is_active: boolean
  last_signal_at?: string | null
  last_error?: string | null
  account_balance?: number | null
  account_equity?: number | null
}

interface AccessStatus {
  hasAccess: boolean
  subscribed: boolean
  canActivate: boolean
  reason: string
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    case "pending":
      return <Clock className="w-4 h-4 text-yellow-400" />
    case "error":
      return <XCircle className="w-4 h-4 text-red-400" />
    default:
      return <WifiOff className="w-4 h-4 text-gray-500" />
  }
}

function StatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "Ligado", cls: "text-emerald-400" },
    pending: { label: "A ligar…", cls: "text-yellow-400" },
    error: { label: "Erro", cls: "text-red-400" },
    disconnected: { label: "Desligado", cls: "text-gray-500" },
  }
  const s = map[status] ?? { label: status, cls: "text-gray-400" }
  return <span className={`text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function methodLabel(method?: string | null): string {
  switch (method) {
    case "telegram_group": return "Grupos de sinais"
    case "strategy": return "Estratégia MTM"
    case "master_slave": return "Copy Trader pessoal"
    default: return "Automático"
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MtmcopierMobilePage() {
  const router = useRouter()
  const [access, setAccess] = useState<AccessStatus | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  // ── Load access + connections ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/app-mobile/login"); return }

      const token = session.access_token
      const headers = { Authorization: `Bearer ${token}` }

      const [accessRes, connRes] = await Promise.all([
        fetch("/api/mtmcopy/access", { headers }),
        fetch("/api/mtmcopy/connection", { headers }),
      ])

      if (accessRes.ok) {
        const data = await accessRes.json()
        setAccess(data)
      }

      if (connRes.ok) {
        const data = await connRes.json()
        setConnections(data.connections ?? [])
      }
    } catch (err) {
      console.error("[MTMcopier mobile] Erro:", err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Toggle connection active/paused ──
  const toggleConnection = async (conn: Connection) => {
    setToggling(conn.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch("/api/mtmcopy/connection", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: conn.id, is_active: !conn.is_active }),
      })
      setConnections((prev) =>
        prev.map((c) => c.id === conn.id ? { ...c, is_active: !c.is_active } : c)
      )
    } catch (err) {
      console.error("[MTMcopier] Erro ao alterar estado:", err)
    } finally {
      setToggling(null)
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-[#D2A63C] animate-spin" />
      </div>
    )
  }

  // ─── No Access ────────────────────────────────────────────────────────────
  if (!access?.hasAccess) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
          <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Send className="w-5 h-5 text-[#D2A63C]" />
          <h1 className="font-bold text-lg">MTMcopier</h1>
        </div>

        {/* No access state */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
            <Lock className="w-9 h-9 text-gray-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Sem acesso a esta função</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              O MTMcopier ainda não está disponível no teu plano.
              Verifica com o teu sponsor ou visita o nosso site para mais informações.
            </p>
          </div>

          <div className="w-full space-y-3">
            <a
              href="https://www.morethanmoney.pt"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-semibold transition-all hover:bg-[#D2A63C]/20"
            >
              <ExternalLink className="w-4 h-4" />
              morethanmoney.pt
            </a>
            <button
              onClick={() => router.back()}
              className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Has Access ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800 sticky top-0 bg-black z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <Send className="w-5 h-5 text-[#D2A63C]" />
        <div className="flex-1">
          <h1 className="font-bold text-lg leading-none">MTMcopier</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestão de contas MT5</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Subscribed badge */}
        {access.subscribed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-emerald-400 font-medium">Subscrição activa</span>
          </div>
        )}

        {/* Connections */}
        {connections.length === 0 ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto border border-gray-700">
              <Wifi className="w-7 h-7 text-gray-500" />
            </div>
            <div>
              <p className="text-white font-semibold">Nenhuma conta configurada</p>
              <p className="text-gray-400 text-sm mt-1">
                Configura as tuas contas MT5 no site completo
              </p>
            </div>
            <a
              href="https://www.morethanmoney.pt/mtmcopy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-semibold text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Configurar no site
            </a>
          </div>
        ) : (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              As tuas contas ({connections.length})
            </h2>

            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className={`rounded-xl border p-4 space-y-3 transition-all ${
                    conn.is_active
                      ? "bg-gray-900 border-gray-700"
                      : "bg-gray-900/50 border-gray-800 opacity-70"
                  }`}
                >
                  {/* Top row: label + toggle */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {conn.account_label || `Conta ···${conn.mt5_login_last4 || "----"}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{conn.mt5_server || "—"}</p>
                    </div>
                    <button
                      onClick={() => toggleConnection(conn)}
                      disabled={toggling === conn.id}
                      className="flex-shrink-0 p-1 transition-colors"
                      aria-label={conn.is_active ? "Pausar" : "Activar"}
                    >
                      {toggling === conn.id ? (
                        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                      ) : conn.is_active ? (
                        <ToggleRight className="w-6 h-6 text-[#D2A63C]" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-500" />
                      )}
                    </button>
                  </div>

                  {/* Method badge */}
                  <Badge className="bg-[#D2A63C]/10 text-[#D2A63C] border-[#D2A63C]/20 text-[11px]">
                    {methodLabel(conn.copy_method)}
                  </Badge>

                  {/* Status row */}
                  <div className="flex items-center gap-4 pt-1">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={conn.mt5_status} />
                      <StatusLabel status={conn.mt5_status} />
                      <span className="text-xs text-gray-600">MT5</span>
                    </div>
                    {conn.copy_method !== "master_slave" && (
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={conn.telegram_status} />
                        <StatusLabel status={conn.telegram_status} />
                        <span className="text-xs text-gray-600">Telegram</span>
                      </div>
                    )}
                  </div>

                  {/* Balance */}
                  {(conn.account_balance != null || conn.account_equity != null) && (
                    <div className="flex gap-4 pt-1 border-t border-gray-800">
                      {conn.account_balance != null && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Saldo</p>
                          <p className="text-sm font-semibold text-white">
                            {conn.account_balance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} $
                          </p>
                        </div>
                      )}
                      {conn.account_equity != null && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Equity</p>
                          <p className="text-sm font-semibold text-white">
                            {conn.account_equity.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} $
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Last signal */}
                  {conn.last_signal_at && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Activity className="w-3 h-3" />
                      <span>
                        Último sinal:{" "}
                        {new Date(conn.last_signal_at).toLocaleString("pt-PT", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}

                  {/* Error */}
                  {conn.last_error && conn.mt5_status === "error" && (
                    <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{conn.last_error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Quick links */}
        <div className="pt-2 space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Acesso rápido</h2>

          <a
            href="https://www.morethanmoney.pt/mtmcopy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-200 hover:border-[#D2A63C]/30 transition-all"
          >
            <TrendingUp className="w-5 h-5 text-[#D2A63C] flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">Configurar contas</span>
            <ExternalLink className="w-4 h-4 text-gray-500" />
          </a>

          <a
            href="https://www.morethanmoney.pt/mtmcopy/metrics"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-200 hover:border-[#D2A63C]/30 transition-all"
          >
            <Activity className="w-5 h-5 text-[#D2A63C] flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">Ver métricas e performance</span>
            <ExternalLink className="w-4 h-4 text-gray-500" />
          </a>
        </div>

        {/* Safe area bottom padding */}
        <div style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }} />
      </div>
    </div>
  )
}
