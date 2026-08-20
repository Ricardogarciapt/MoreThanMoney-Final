"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Flag, Loader2, Radio, RefreshCw, Trash2, XCircle,
} from "lucide-react"

type LogEntry = {
  id: string
  channel_key: string | null
  channel_label: string
  telegram_message_id: number | null
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  status: string
  detail: string | null
  raw_message: string | null
  created_at: string
  is_provider_log: boolean
  user_label: string
  connection_label: string | null
}

type LogStats = {
  total: number
  executed: number
  error: number
  skipped: number
  received: number
  open: number
  closed: number
  discarded: number
}

/**
 * Estados possíveis em mtmcopy_signal_log. Os quatro primeiros descrevem a EXECUÇÃO; os últimos
 * três são o CICLO DE VIDA da ordem do cliente (ver lib/mtmcopy/signal-lifecycle). Faltavam aqui:
 * apareciam na lista sem cor nem ícone e não entravam em nenhuma contagem.
 */
const STATUS_STYLES: Record<string, { className: string; icon: typeof CheckCircle2; label: string }> = {
  executed: { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Executado" },
  error: { className: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle, label: "Erro" },
  skipped: { className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle, label: "Ignorado" },
  received: { className: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: Clock, label: "Recebido" },
  open: { className: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Activity, label: "Aberta" },
  closed: { className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", icon: Flag, label: "Fechada" },
  discarded: { className: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Trash2, label: "Descartada" },
  pending: { className: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: Clock, label: "Pendente" },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export default function MtmcopySenderLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState("all")
  const [status, setStatus] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "80" })
      if (channel !== "all") params.set("channel", channel)
      if (status !== "all") params.set("status", status)
      const res = await fetch(`/api/admin/mtmcopy/sender-log?${params}`)
      const data = await res.json()
      if (res.ok) {
        setEntries(data.entries ?? [])
        setStats(data.stats ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [channel, status])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "Todos os canais" },
            { id: "trade-ideas", label: "Trade Ideas" },
            { id: "premium-signals", label: "Premium" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setChannel(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                channel === opt.id
                  ? "border-[#D2A63C]/50 bg-[#D2A63C]/15 text-[#D2A63C]"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Executados", value: stats.executed, color: "text-emerald-400" },
            { label: "Erros", value: stats.error, color: "text-red-400" },
            { label: "Ignorados", value: stats.skipped, color: "text-amber-400" },
            { label: "Recebidos", value: stats.received, color: "text-sky-400" },
            { label: "Abertas", value: stats.open, color: "text-blue-400" },
            { label: "Fechadas", value: stats.closed, color: "text-zinc-300" },
            { label: "Descartadas", value: stats.discarded, color: "text-slate-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {["all", "executed", "error", "skipped", "received", "open", "closed", "discarded"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded-md text-[11px] border ${
              status === s ? "border-zinc-500 bg-zinc-800 text-white" : "border-zinc-800 text-zinc-500"
            }`}
          >
            {s === "all" ? "Todos estados" : (STATUS_STYLES[s]?.label ?? s)}
          </button>
        ))}
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-10">Nenhum sinal registado ainda.</p>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {entries.map((entry) => {
            const st = STATUS_STYLES[entry.status] ?? STATUS_STYLES.received
            const Icon = st.icon
            const expanded = expandedId === entry.id
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] ${st.className}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {st.label}
                        </Badge>
                        <span className="text-xs text-zinc-500">{formatTime(entry.created_at)}</span>
                        <span className="text-xs text-[#D2A63C]/80 flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          {entry.channel_label}
                        </span>
                        {entry.is_provider_log && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D2A63C]/10 text-[#D2A63C] border border-[#D2A63C]/20">
                            Provider
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {entry.symbol ?? "—"}{" "}
                        {entry.direction && (
                          <span className={entry.direction === "buy" ? "text-emerald-400" : "text-red-400"}>
                            {entry.direction.toUpperCase()}
                          </span>
                        )}
                        {entry.lot != null && (
                          <span className="text-zinc-500 font-normal text-xs ml-2">lot {entry.lot}</span>
                        )}
                      </p>
                      {entry.detail && (
                        <p className="text-xs text-zinc-400 mt-1 truncate">{entry.detail}</p>
                      )}
                    </div>
                  </div>
                </button>
                {expanded && entry.raw_message && (
                  <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/60">
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                      {entry.raw_message}
                    </pre>
                    {(entry.sl != null || entry.tp != null) && (
                      <p className="text-[11px] text-zinc-600 mt-2">
                        SL {entry.sl ?? "—"} · TP {entry.tp ?? "—"}
                        {entry.entry != null && ` · Entry ${entry.entry}`}
                        {entry.telegram_message_id != null && ` · tg:${entry.telegram_message_id}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
