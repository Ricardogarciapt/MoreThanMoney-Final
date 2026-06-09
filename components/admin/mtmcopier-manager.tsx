"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  RefreshCw, Search, Send, AlertTriangle, Check, X, Loader2,
  TrendingUp, TrendingDown, Activity, Power, PowerOff, ChevronDown, ChevronUp,
  Edit2, Clock, Wifi, WifiOff,
} from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"

// ── tipos ────────────────────────────────────────────────────────────────────

interface MTMcopierConnection {
  id: string
  user_id: string
  telegram_channel: string | null
  telegram_status: "pending" | "connected" | "error" | "disconnected"
  mt5_login_last4: string | null
  mt5_server: string | null
  mt5_status: "pending" | "connected" | "error" | "disconnected"
  lot_mode: string
  lot_value: number
  max_risk_percent: number | null
  symbols_whitelist: string[] | null
  copy_sl: boolean
  copy_tp: boolean
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  metaapi_account_id: string | null
  profiles: {
    email: string | null
    full_name: string | null
    username: string | null
  } | null
}

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  connected:    "bg-green-500/15 text-green-400 border-green-500/30",
  pending:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  error:        "bg-red-500/15 text-red-400 border-red-500/30",
  disconnected: "bg-gray-500/15 text-gray-400 border-gray-500/30",
}

const STATUS_LABELS: Record<string, string> = {
  connected: "Ligado", pending: "Pendente", error: "Erro", disconnected: "Desligado",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ── mini editor de status ────────────────────────────────────────────────────

function StatusEditor({
  connection,
  onUpdate,
}: {
  connection: MTMcopierConnection
  onUpdate: (id: string, changes: Record<string, any>) => Promise<void>
}) {
  const [tStatus, setTStatus] = useState(connection.telegram_status)
  const [m5Status, setM5Status] = useState(connection.mt5_status)
  const [metaapiId, setMetaapiId] = useState(connection.metaapi_account_id ?? "")
  const [lastError, setLastError] = useState(connection.last_error ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const STATUSES = ["pending", "connected", "error", "disconnected"] as const

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(connection.id, {
      telegram_status: tStatus,
      mt5_status: m5Status,
      metaapi_account_id: metaapiId,
      last_error: lastError,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Telegram status */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Status Telegram</label>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map(s => (
            <button key={s} type="button" onClick={() => setTStatus(s)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${tStatus === s ? STATUS_COLORS[s] : "border-gray-700 text-gray-500 hover:border-gray-600"}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      {/* MT5 status */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Status MT5</label>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map(s => (
            <button key={s} type="button" onClick={() => setM5Status(s)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${m5Status === s ? STATUS_COLORS[s] : "border-gray-700 text-gray-500 hover:border-gray-600"}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      {/* MetaAPI account ID */}
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">MetaAPI Account ID</label>
        <Input value={metaapiId} onChange={e => setMetaapiId(e.target.value)}
          placeholder="account ID do MetaAPI (opcional)"
          className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
      </div>
      {/* Last error */}
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Erro / Nota para o utilizador</label>
        <Input value={lastError} onChange={e => setLastError(e.target.value)}
          placeholder="Deixa vazio para limpar o erro"
          className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
      </div>
      {/* Guardar */}
      <div className="sm:col-span-2 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}
          className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold text-xs h-7 px-3">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
           saved ? <><Check className="w-3.5 h-3.5 mr-1" /> Guardado</> :
           "Guardar alterações"}
        </Button>
      </div>
    </div>
  )
}

// ── row expandível ────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  onUpdate,
}: {
  conn: MTMcopierConnection
  onUpdate: (id: string, changes: Record<string, any>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  const handleToggleActive = async () => {
    setTogglingActive(true)
    await onUpdate(conn.id, { is_active: !conn.is_active })
    setTogglingActive(false)
  }

  const hasPending = conn.telegram_status === "pending" || conn.mt5_status === "pending"
  const hasError   = conn.telegram_status === "error"   || conn.mt5_status === "error"

  return (
    <div className={`rounded-xl border transition-colors ${
      hasError ? "border-red-500/30 bg-red-500/5" :
      hasPending ? "border-yellow-500/20 bg-yellow-500/5" :
      "border-gray-800 bg-gray-900/40"
    }`}>
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${
          conn.is_active ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "bg-gray-800 text-gray-500"
        }`}>
          {(conn.profiles?.full_name ?? conn.profiles?.email ?? "?").charAt(0).toUpperCase()}
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white truncate text-sm">
              {conn.profiles?.full_name || conn.profiles?.username || conn.profiles?.email || conn.user_id.slice(0, 8)}
            </span>
            <span className="text-xs text-gray-500">{conn.profiles?.email}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Send className="w-3 h-3 text-[#D2A63C]" />
              {conn.telegram_channel ?? "—"}
            </span>
            <span className="text-xs text-gray-400">
              MT5: {conn.mt5_server ?? "—"}{conn.mt5_login_last4 ? ` ····${conn.mt5_login_last4}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[conn.telegram_status]}`}>
              TG: {STATUS_LABELS[conn.telegram_status]}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[conn.mt5_status]}`}>
              MT5: {STATUS_LABELS[conn.mt5_status]}
            </span>
            {conn.last_signal_at && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Último sinal: {formatRelative(conn.last_signal_at)}
              </span>
            )}
          </div>
          {conn.last_error && (
            <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {conn.last_error}
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Toggle ativo */}
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            title={conn.is_active ? "Pausar cópia" : "Ativar cópia"}
            className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border transition-colors ${
              conn.is_active
                ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "border-gray-700 bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {togglingActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             conn.is_active ? <><Power className="w-3.5 h-3.5" /> Ativo</> :
             <><PowerOff className="w-3.5 h-3.5" /> Pausado</>}
          </button>

          {/* Expandir */}
          <button onClick={() => setExpanded(e => !e)}
            className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800/60 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="bg-gray-800/40 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Modo lote</p>
              <p className="text-sm font-medium text-white">
                {conn.lot_mode === "fixed" ? "Fixo" : conn.lot_mode === "risk_percent" ? "% Risco" : "Multiplicador"}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Valor lote</p>
              <p className="text-sm font-medium text-white">{conn.lot_value}</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Risco máx./dia</p>
              <p className="text-sm font-medium text-white">{conn.max_risk_percent ?? "—"}%</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">SL/TP/Reverse</p>
              <p className="text-sm font-medium text-white">
                {conn.copy_sl ? "SL✓" : "SL✗"} {conn.copy_tp ? "TP✓" : "TP✗"} {conn.reverse_signals ? "↕Rev" : ""}
              </p>
            </div>
          </div>

          {conn.symbols_whitelist && conn.symbols_whitelist.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {conn.symbols_whitelist.map(s => (
                <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-mono">{s}</span>
              ))}
            </div>
          )}

          {conn.metaapi_account_id && (
            <p className="text-xs text-gray-500 mb-3">
              MetaAPI ID: <span className="font-mono text-gray-300">{conn.metaapi_account_id}</span>
            </p>
          )}

          <p className="text-xs text-gray-600">Criado em {formatDate(conn.created_at)} · Atualizado em {formatDate(conn.updated_at)}</p>

          <StatusEditor connection={conn} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  )
}

// ── componente principal ─────────────────────────────────────────────────────

export default function MTMcopierManager() {
  const [connections, setConnections] = useState<MTMcopierConnection[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const fetchConnections = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (statusFilter) params.set("status", statusFilter)
      params.set("limit", "100")

      const res = await adminApiCall<{ connections: MTMcopierConnection[]; total: number }>(
        `/api/admin/copygram?${params.toString()}`
      )
      if (res.success && res.data) {
        setConnections(res.data.connections ?? [])
        setTotal(res.data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => { fetchConnections() }, [fetchConnections])

  const handleUpdate = useCallback(async (id: string, changes: Record<string, any>) => {
    const res = await adminApiCall<{ connection: MTMcopierConnection }>("/api/admin/copygram", {
      method: "PATCH",
      body: JSON.stringify({ id, ...changes }),
    })
    if (res.success && res.data?.connection) {
      setConnections(prev => prev.map(c => c.id === id ? { ...c, ...res.data!.connection } : c))
    }
  }, [])

  // Contadores de estado
  const pendingCount = connections.filter(c =>
    c.telegram_status === "pending" || c.mt5_status === "pending"
  ).length
  const errorCount = connections.filter(c =>
    c.telegram_status === "error" || c.mt5_status === "error"
  ).length
  const activeCount = connections.filter(c => c.is_active).length

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total ligações", value: total, color: "text-white" },
          { label: "Ativas", value: activeCount, color: "text-green-400" },
          { label: "Pendentes", value: pendingCount, color: "text-yellow-400" },
          { label: "Com erro", value: errorCount, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Email, canal, servidor MT5..."
            className="pl-9 bg-gray-900 border-gray-700 text-white text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { id: "", label: "Todos" },
            { id: "active", label: "Ativos" },
            { id: "pending", label: "Pendentes" },
            { id: "error", label: "Erros" },
          ].map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                statusFilter === id
                  ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                  : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={fetchConnections}
          disabled={loading}
          className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-gray-800 p-10 text-center text-gray-500">
          <Activity className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-sm">Nenhuma ligação MTMcopier encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(conn => (
            <ConnectionRow key={conn.id} conn={conn} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
