"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Server, Play, Square, RefreshCw, ExternalLink, Terminal,
  CheckCircle2, XCircle, Loader2, Zap, Activity, HardDrive,
  Download, ChevronDown, ChevronUp, Bot, Mail, MessageSquare, TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────
interface N8nStatus {
  n8nRunning: boolean
  n8nStatus: string
  diskUsage: string
  allContainers: string
  vpsHost: string
  /** O /api/admin/n8n-vps?cmd=status devolve-o; faltava aqui e o painel nunca
   *  chegava a usar o endereco real — caia sempre no `https://${VPS_HOST}`. */
  n8nUrl?: string
  error?: string
}

interface ActionResult {
  success?: boolean
  output?: string
  error?: string
}

// ── Workflow cards ─────────────────────────────────────────────────────────────
const WORKFLOWS = [
  {
    id: "telegram",
    label: "Telegram Bot",
    icon: MessageSquare,
    color: "#60a5fa",
    description: "/sinais · /portfolio · /scanner · /alertas",
    webhook: "/webhook/telegram-mtm",
  },
  {
    id: "",
    label: " → Supabase",
    icon: Bot,
    color: "#a78bfa",
    description: "Sync leads Instagram · Scoring automático",
    webhook: "/webhook/-mtm",
  },
  {
    id: "email",
    label: "Email Sequences",
    icon: Mail,
    color: "#f59e0b",
    description: "Onboarding automático · Cron horário",
    webhook: "/webhook/email-enroll",
  },
  {
    id: "trading",
    label: "Trading Alerts",
    icon: TrendingUp,
    color: "#4ade80",
    description: "TradingView webhooks · Fear & Greed · Alertas",
    webhook: "/webhook/tradingview-alert",
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatusBadge({ running, loading }: { running: boolean; loading: boolean }) {
  if (loading) return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <Loader2 className="h-3 w-3 animate-spin" /> A verificar…
    </span>
  )
  return running ? (
    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Online
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-red-400">
      <XCircle className="h-3 w-3" /> Offline
    </span>
  )
}

function ActionButton({
  label, icon: Icon, onClick, loading, variant = "default", disabled,
}: {
  label: string; icon: React.ElementType; onClick: () => void
  loading?: boolean; variant?: "default" | "primary" | "danger"; disabled?: boolean
}) {
  const styles = {
    default: "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10",
    primary: "bg-[#D2A63C]/20 hover:bg-[#D2A63C]/30 text-[#D2A63C] border-[#D2A63C]/30",
    danger:  "bg-red-900/20 hover:bg-red-900/30 text-red-400 border-red-500/20",
  }
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
        styles[variant],
        (loading || disabled) && "opacity-50 cursor-not-allowed"
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export default function DGN8nPanel() {
  const [status, setStatus] = useState<N8nStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [view, setView] = useState<"panel" | "embed" | "terminal">("panel")
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState("")
  const [termCmd, setTermCmd] = useState("")
  const [termHistory, setTermHistory] = useState<{ cmd: string; out: string }[]>([])
  const termRef = useRef<HTMLDivElement>(null)

  const VPS_HOST = status?.vpsHost || "173.249.23.54"
  const N8N_URL = status?.n8nUrl || `https://${VPS_HOST}`

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/n8n-vps?cmd=status")
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus(prev => prev ? { ...prev, error: "Erro de rede" } : null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [termHistory])

  const runAction = async (action: string) => {
    setActionLoading(action)
    setActionResult(null)
    try {
      const res = await fetch("/api/admin/n8n-vps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      setActionResult(data)
      // Refresh status after action
      setTimeout(fetchStatus, 3000)
    } catch (err: any) {
      setActionResult({ error: err.message })
    } finally {
      setActionLoading(null)
    }
  }

  const fetchLogs = async () => {
    setShowLogs(true)
    const res = await fetch("/api/admin/n8n-vps?cmd=logs")
    const data = await res.json()
    setLogs(data.logs || "Sem logs")
  }

  const runTerminalCmd = async () => {
    if (!termCmd.trim()) return
    const cmd = termCmd.trim()
    setTermCmd("")
    try {
      const res = await fetch("/api/admin/n8n-vps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shell", command: cmd }),
      })
      const data = await res.json()
      setTermHistory(h => [...h, { cmd, out: data.output || data.error || "" }])
    } catch (err: any) {
      setTermHistory(h => [...h, { cmd, out: `Erro: ${err.message}` }])
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/20">
            <Zap className="h-5 w-5 text-[#D2A63C]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">n8n — Automações MTM</h2>
            <p className="text-xs text-gray-500">VPS Contabo · {VPS_HOST}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge running={!!status?.n8nRunning} loading={statusLoading} />
          <button
            onClick={fetchStatus}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── View switcher ── */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit border border-white/5">
        {(["panel", "embed", "terminal"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize",
              view === v ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-gray-500 hover:text-gray-300"
            )}
          >
            {v === "panel" ? "Painel" : v === "embed" ? "n8n Editor" : "Terminal VPS"}
          </button>
        ))}
      </div>

      {/* ── Panel view ── */}
      {view === "panel" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left — Controls */}
          <div className="lg:col-span-1 flex flex-col gap-4">

            {/* VPS Info card */}
            <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-4">
              <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">Servidor VPS</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Host</span>
                  <span className="text-white font-mono text-xs">{VPS_HOST}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Disco</span>
                  <span className={cn("text-xs font-mono", parseInt(status?.diskUsage || "0") > 80 ? "text-red-400" : "text-emerald-400")}>
                    {status?.diskUsage || "…"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">n8n Port</span>
                  <span className="text-white text-xs font-mono">5678</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Estado</span>
                  <StatusBadge running={!!status?.n8nRunning} loading={statusLoading} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-4">
              <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">Ações</p>
              <div className="flex flex-col gap-2">
                {!status?.n8nRunning && (
                  <ActionButton
                    label="Deploy n8n" icon={Download}
                    onClick={() => runAction("deploy")}
                    loading={actionLoading === "deploy"}
                    variant="primary"
                  />
                )}
                <ActionButton
                  label="Iniciar" icon={Play}
                  onClick={() => runAction("start")}
                  loading={actionLoading === "start"}
                  disabled={!!status?.n8nRunning}
                />
                <ActionButton
                  label="Reiniciar" icon={RefreshCw}
                  onClick={() => runAction("restart")}
                  loading={actionLoading === "restart"}
                  disabled={!status?.n8nRunning}
                />
                <ActionButton
                  label="Parar" icon={Square}
                  onClick={() => runAction("stop")}
                  loading={actionLoading === "stop"}
                  variant="danger"
                  disabled={!status?.n8nRunning}
                />
                <ActionButton
                  label="Ver Logs" icon={Activity}
                  onClick={fetchLogs}
                  loading={false}
                />
                {status?.n8nRunning && (
                  <a
                    href={N8N_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir n8n
                  </a>
                )}
              </div>
            </div>

            {/* Action result */}
            {actionResult && (
              <div className={cn(
                "rounded-xl border p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto",
                actionResult.error
                  ? "border-red-500/20 bg-red-950/20 text-red-300"
                  : "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
              )}>
                {actionResult.error || actionResult.output}
              </div>
            )}

            {/* Logs */}
            {showLogs && (
              <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Logs n8n</p>
                  <button onClick={() => setShowLogs(false)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                </div>
                <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed">
                  {logs || "A carregar…"}
                </pre>
              </div>
            )}
          </div>

          {/* Right — Workflows */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-4">
              <p className="text-xs font-medium text-gray-400 mb-4 uppercase tracking-wider">Workflows MTM</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WORKFLOWS.map(wf => {
                  const Icon = wf.icon
                  return (
                    <div
                      key={wf.id}
                      className="rounded-lg border border-white/8 bg-zinc-950/60 p-3 flex flex-col gap-2"
                      style={{ borderColor: `${wf.color}15` }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-md"
                          style={{ background: `${wf.color}15` }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: wf.color }} />
                        </div>
                        <span className="text-sm font-medium text-white">{wf.label}</span>
                        <span className={cn(
                          "ml-auto text-[10px] px-1.5 py-0.5 rounded-full",
                          status?.n8nRunning
                            ? "bg-emerald-950/40 text-emerald-400"
                            : "bg-zinc-800 text-gray-600"
                        )}>
                          {status?.n8nRunning ? "Ativo" : "Offline"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">{wf.description}</p>
                      <p className="text-[10px] text-gray-700 font-mono truncate">
                        {status?.n8nRunning ? `${N8N_URL}${wf.webhook}` : "n8n offline"}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Import instructions */}
            {!status?.n8nRunning && (
              <div className="rounded-xl border border-[#D2A63C]/15 bg-[#D2A63C]/5 p-4">
                <p className="text-sm font-medium text-[#D2A63C] mb-2">📋 Setup em 3 passos</p>
                <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
                  <li>Clica em <strong className="text-white">Deploy n8n</strong> para instalar no VPS</li>
                  <li>Quando ficar Online, clica em <strong className="text-white">n8n Editor</strong></li>
                  <li>Importa os 4 ficheiros JSON de <code className="text-[#D2A63C]">n8n-setup/workflows/</code></li>
                </ol>
                <p className="text-[10px] text-gray-600 mt-2">
                  Adiciona <code>VPS_PASSWORD</code> às variáveis de ambiente Vercel antes de fazer deploy.
                </p>
              </div>
            )}

            {/* Docker containers raw */}
            {status?.allContainers && (
              <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-3.5 w-3.5 text-gray-500" />
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Containers Docker</p>
                </div>
                <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap leading-relaxed">
                  {status.allContainers || "Nenhum container ativo"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── n8n Embed view ── */}
      {view === "embed" && (
        <div className="rounded-xl border border-white/8 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
          {status?.n8nRunning ? (
            <iframe
              src={N8N_URL}
              className="w-full h-full"
              title="n8n Editor"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-900/60">
              <XCircle className="h-12 w-12 text-red-400/40" />
              <p className="text-gray-400">n8n está offline</p>
              <button
                onClick={() => { setView("panel"); runAction("deploy") }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D2A63C]/20 text-[#D2A63C] text-sm font-medium border border-[#D2A63C]/30 hover:bg-[#D2A63C]/30 transition-all"
              >
                <Download className="h-4 w-4" /> Deploy n8n
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Terminal view ── */}
      {view === "terminal" && (
        <div className="rounded-xl border border-white/8 bg-zinc-950 overflow-hidden flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-zinc-900/60">
            <Terminal className="h-3.5 w-3.5 text-gray-500" />
            <p className="text-xs text-gray-500 font-mono">root@{VPS_HOST} — Terminal n8n</p>
          </div>
          {/* Output */}
          <div ref={termRef} className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed space-y-3">
            {termHistory.length === 0 && (
              <p className="text-gray-600">Terminal pronto. Escreve um comando abaixo.</p>
            )}
            {termHistory.map((entry, i) => (
              <div key={i}>
                <div className="text-[#D2A63C]">$ {entry.cmd}</div>
                <pre className="text-gray-400 whitespace-pre-wrap">{entry.out}</pre>
              </div>
            ))}
          </div>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5 bg-zinc-900/40">
            <span className="text-[#D2A63C] font-mono text-xs flex-shrink-0">$</span>
            <input
              type="text"
              value={termCmd}
              onChange={e => setTermCmd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runTerminalCmd()}
              placeholder="docker ps | ls /opt/mtm-n8n | …"
              className="flex-1 bg-transparent text-white text-xs font-mono outline-none placeholder-gray-700"
            />
            <button
              onClick={runTerminalCmd}
              disabled={!termCmd.trim()}
              className="text-gray-500 hover:text-[#D2A63C] transition-colors disabled:opacity-30"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
