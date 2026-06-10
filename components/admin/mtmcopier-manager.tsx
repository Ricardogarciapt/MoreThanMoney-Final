"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  RefreshCw, Search, Send, AlertTriangle, Check, Loader2,
  Activity, Power, PowerOff, ChevronDown, ChevronUp,
  Clock, UserPlus, ExternalLink, Users, History,
} from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"

// ── tipos ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  username: string | null
  user_type: string
  member_category: string | null
  is_active: boolean
  subscription_plan: string | null
  subscription_platform: string | null
  subscription_expires_at: string | null
  created_at: string
}

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
  auto_trailing_stop: boolean
  trailing_stop_points: number
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  metaapi_account_id: string | null
}

interface ConnectionStats {
  executed_total: number
  executed_today: number
  last_status: string | null
}

interface UserRow {
  profile: UserProfile
  connection: MTMcopierConnection | null
  stats: ConnectionStats | null
}

interface SignalLog {
  id: string
  symbol: string | null
  direction: string | null
  lot: number | null
  status: string
  detail: string | null
  created_at: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-green-500/15 text-green-400 border-green-500/30",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  disconnected: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  executed: "text-green-400",
  received: "text-blue-400",
  skipped: "text-yellow-400",
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

function userTypeBadge(type: string, category: string | null) {
  if (type === "admin") return <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">Admin</Badge>
  if (category === "premium") return <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30 text-[10px]">Premium</Badge>
  if (category === "iq") return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">IQ</Badge>
  if (category === "skool") return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">Skool</Badge>
  return <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">{type}</Badge>
}

// ── editor completo ───────────────────────────────────────────────────────────

function ConnectionEditor({
  connection,
  onUpdate,
}: {
  connection: MTMcopierConnection
  onUpdate: (id: string, changes: Record<string, unknown>) => Promise<void>
}) {
  const [form, setForm] = useState({
    telegram_channel: connection.telegram_channel ?? "",
    mt5_server: connection.mt5_server ?? "",
    mt5_login_last4: connection.mt5_login_last4 ?? "",
    lot_mode: connection.lot_mode,
    lot_value: String(connection.lot_value),
    max_risk_percent: connection.max_risk_percent != null ? String(connection.max_risk_percent) : "",
    symbols_whitelist: (connection.symbols_whitelist ?? []).join(", "),
    copy_sl: connection.copy_sl,
    copy_tp: connection.copy_tp,
    auto_trailing_stop: connection.auto_trailing_stop ?? false,
    trailing_stop_points: String(connection.trailing_stop_points ?? 200),
    reverse_signals: connection.reverse_signals,
    metaapi_account_id: connection.metaapi_account_id ?? "",
    telegram_status: connection.telegram_status,
    mt5_status: connection.mt5_status,
    last_error: connection.last_error ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [signals, setSignals] = useState<SignalLog[]>([])
  const [loadingSignals, setLoadingSignals] = useState(false)

  const STATUSES = ["pending", "connected", "error", "disconnected"] as const

  const loadSignals = useCallback(async () => {
    setLoadingSignals(true)
    const res = await adminApiCall<{ signals: SignalLog[] }>(
      `/api/admin/mtmcopy/signals?connection_id=${connection.id}&limit=15`,
    )
    if (res.success && res.data) setSignals(res.data.signals ?? [])
    setLoadingSignals(false)
  }, [connection.id])

  useEffect(() => { loadSignals() }, [loadSignals])

  const handleSave = async () => {
    setSaving(true)
    const whitelist = form.symbols_whitelist
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    await onUpdate(connection.id, {
      telegram_channel: form.telegram_channel || null,
      mt5_server: form.mt5_server || null,
      mt5_login_last4: form.mt5_login_last4 || null,
      lot_mode: form.lot_mode,
      lot_value: parseFloat(form.lot_value) || 0.01,
      max_risk_percent: form.max_risk_percent ? parseFloat(form.max_risk_percent) : null,
      symbols_whitelist: whitelist.length ? whitelist : null,
      copy_sl: form.copy_sl,
      copy_tp: form.copy_tp,
      auto_trailing_stop: form.auto_trailing_stop,
      trailing_stop_points: parseInt(form.trailing_stop_points, 10) || 200,
      reverse_signals: form.reverse_signals,
      metaapi_account_id: form.metaapi_account_id || null,
      telegram_status: form.telegram_status,
      mt5_status: form.mt5_status,
      last_error: form.last_error || null,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    loadSignals()
  }

  const handleVerifyMetaApi = async () => {
    if (!form.metaapi_account_id.trim()) return
    setVerifying(true)
    setVerifyMsg(null)
    const res = await adminApiCall<{ ok: boolean; balance?: number; error?: string; message?: string }>(
      "/api/admin/mtmcopy/verify-metaapi",
      {
        method: "POST",
        body: JSON.stringify({
          connection_id: connection.id,
          metaapi_account_id: form.metaapi_account_id.trim(),
        }),
      },
    )
    if (res.success && res.data?.ok) {
      setForm((f) => ({ ...f, mt5_status: "connected", last_error: "" }))
      setVerifyMsg(
        res.data.balance != null
          ? `MT5 OK · saldo ${Number(res.data.balance).toFixed(2)}`
          : "MT5 ligado via MetaAPI",
      )
    } else {
      setVerifyMsg(res.data?.error ?? res.error ?? "Falha na verificação")
    }
    setVerifying(false)
  }

  return (
    <div className="space-y-4 mt-3 pt-3 border-t border-gray-800">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Canal Telegram (vazio = grupos MTM)</label>
          <Input value={form.telegram_channel} onChange={(e) => setForm({ ...form, telegram_channel: e.target.value })}
            placeholder="@canal ou vazio" className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Servidor MT5</label>
          <Input value={form.mt5_server} onChange={(e) => setForm({ ...form, mt5_server: e.target.value })}
            placeholder="Ex: ICMarkets-Demo" className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Login MT5 (últimos 4 dígitos)</label>
          <Input value={form.mt5_login_last4} onChange={(e) => setForm({ ...form, mt5_login_last4: e.target.value })}
            placeholder="1234" maxLength={4} className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Modo lote / valor</label>
          <div className="flex gap-2">
            <select value={form.lot_mode} onChange={(e) => setForm({ ...form, lot_mode: e.target.value })}
              className="h-8 rounded-md bg-gray-800 border border-gray-700 text-white text-xs px-2 flex-1">
              <option value="fixed">Fixo</option>
              <option value="risk_percent">% Risco</option>
              <option value="multiplier">Multiplicador</option>
            </select>
            <Input value={form.lot_value} onChange={(e) => setForm({ ...form, lot_value: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white text-xs h-8 w-20" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Whitelist símbolos (vazio = todos)</label>
          <Input value={form.symbols_whitelist} onChange={(e) => setForm({ ...form, symbols_whitelist: e.target.value })}
            placeholder="XAUUSD, EURUSD" className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">MetaAPI Account ID</label>
          <div className="flex gap-2">
            <Input value={form.metaapi_account_id}
              onChange={(e) => setForm({ ...form, metaapi_account_id: e.target.value })}
              placeholder="ID MetaAPI" className="bg-gray-800 border-gray-700 text-white text-xs h-8 flex-1" />
            <Button type="button" size="sm" variant="outline" onClick={handleVerifyMetaApi}
              disabled={verifying || !form.metaapi_account_id.trim()}
              className="h-8 text-xs border-gray-700 shrink-0">
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Testar MT5"}
            </Button>
          </div>
          {verifyMsg && (
            <p className={`text-xs mt-1 ${verifyMsg.includes("OK") || verifyMsg.includes("ligado") ? "text-green-400" : "text-red-400"}`}>
              {verifyMsg}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2 text-gray-400">
          <Switch checked={form.copy_sl} onCheckedChange={(v) => setForm({ ...form, copy_sl: v })} /> Copiar SL
        </label>
        <label className="flex items-center gap-2 text-gray-400">
          <Switch checked={form.copy_tp} onCheckedChange={(v) => setForm({ ...form, copy_tp: v })} /> Copiar TP
        </label>
        <label className="flex items-center gap-2 text-gray-400">
          <Switch checked={form.reverse_signals} onCheckedChange={(v) => setForm({ ...form, reverse_signals: v })} /> Inverter sinais
        </label>
        <label className="flex items-center gap-2 text-gray-400">
          <Switch checked={form.auto_trailing_stop} onCheckedChange={(v) => setForm({ ...form, auto_trailing_stop: v })} /> Auto trailing
        </label>
      </div>
      {form.auto_trailing_stop && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Distância trailing (RELATIVE_POINTS)</label>
          <Input value={form.trailing_stop_points}
            onChange={(e) => setForm({ ...form, trailing_stop_points: e.target.value.replace(/\D/g, "") })}
            className="bg-gray-800 border-gray-700 text-white text-xs h-8 max-w-[140px]" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status Telegram</label>
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setForm({ ...form, telegram_status: s })}
                className={`text-xs px-2 py-0.5 rounded border ${form.telegram_status === s ? STATUS_COLORS[s] : "border-gray-700 text-gray-500"}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status MT5</label>
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setForm({ ...form, mt5_status: s })}
                className={`text-xs px-2 py-0.5 rounded border ${form.mt5_status === s ? STATUS_COLORS[s] : "border-gray-700 text-gray-500"}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nota / erro visível ao cliente</label>
          <Input value={form.last_error} onChange={(e) => setForm({ ...form, last_error: e.target.value })}
            className="bg-gray-800 border-gray-700 text-white text-xs h-8" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}
          className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold text-xs h-8">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
           saved ? <><Check className="w-3.5 h-3.5 mr-1" /> Guardado</> : "Guardar configuração"}
        </Button>
      </div>

      <div className="border-t border-gray-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Últimos sinais
          </h4>
          <button type="button" onClick={loadSignals} className="text-xs text-gray-500 hover:text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSignals ? "animate-spin" : ""}`} />
          </button>
        </div>
        {loadingSignals ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-600 mx-auto my-3" />
        ) : signals.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-2">Sem sinais registados</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {signals.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-gray-800/40 rounded px-2 py-1.5">
                <span className="text-gray-300 font-mono">
                  {s.symbol} {s.direction} {s.lot != null ? `· ${s.lot}` : ""}
                </span>
                <span className={STATUS_COLORS[s.status] ?? "text-gray-500"}>{s.status}</span>
                <span className="text-gray-600">{formatRelative(s.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── linha utilizador ──────────────────────────────────────────────────────────

function UserRow({
  row,
  expanded,
  onToggle,
  onUpdate,
  onCreateConnection,
  creating,
}: {
  row: UserRow
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, changes: Record<string, unknown>) => Promise<void>
  onCreateConnection: (userId: string) => Promise<void>
  creating: boolean
}) {
  const { profile, connection, stats } = row
  const [togglingActive, setTogglingActive] = useState(false)
  const name = profile.full_name || profile.username || profile.email

  const hasPending = connection && (connection.telegram_status === "pending" || connection.mt5_status === "pending")
  const hasError = connection && (connection.telegram_status === "error" || connection.mt5_status === "error")

  const handleToggleActive = async () => {
    if (!connection) return
    setTogglingActive(true)
    await onUpdate(connection.id, { is_active: !connection.is_active })
    setTogglingActive(false)
  }

  return (
    <div className={`rounded-xl border transition-colors ${
      !connection ? "border-gray-800/80 bg-gray-900/20" :
      hasError ? "border-red-500/30 bg-red-500/5" :
      hasPending ? "border-yellow-500/20 bg-yellow-500/5" :
      "border-gray-800 bg-gray-900/40"
    } ${expanded ? "ring-1 ring-[#D2A63C]/30" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${
          connection?.is_active ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "bg-gray-800 text-gray-500"
        }`}>
          {name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white text-sm truncate">{name}</span>
            {userTypeBadge(profile.user_type, profile.member_category)}
            {!profile.is_active && (
              <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">Inactivo</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{profile.email}</p>

          {connection ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[connection.telegram_status]}`}>
                TG: {STATUS_LABELS[connection.telegram_status]}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[connection.mt5_status]}`}>
                MT5: {STATUS_LABELS[connection.mt5_status]}
              </span>
              {connection.telegram_channel && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Send className="w-3 h-3" />{connection.telegram_channel}
                </span>
              )}
              {stats && (
                <span className="text-xs text-gray-500">
                  {stats.executed_today} hoje · {stats.executed_total} total
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600 mt-2">Sem ligação MTMcopier</p>
          )}

          {connection?.last_error && (
            <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              {connection.last_error}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-1.5">
          <Link href={`/admin?tab=users&userId=${profile.id}`}
            className="p-1.5 rounded border border-gray-700 text-gray-500 hover:text-[#D2A63C] hover:border-[#D2A63C]/40"
            title="Ver na gestão de utilizadores">
            <Users className="w-3.5 h-3.5" />
          </Link>

          {connection ? (
            <button onClick={handleToggleActive} disabled={togglingActive}
              className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border ${
                connection.is_active
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-gray-700 text-gray-400"
              }`}>
              {togglingActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
               connection.is_active ? <><Power className="w-3.5 h-3.5" /> Ativo</> :
               <><PowerOff className="w-3.5 h-3.5" /> Pausado</>}
            </button>
          ) : (
            <Button size="sm" variant="outline" disabled={creating}
              onClick={() => onCreateConnection(profile.id)}
              className="h-8 text-xs border-[#D2A63C]/40 text-[#D2A63C]">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
               <><UserPlus className="w-3.5 h-3.5 mr-1" /> Criar</>}
            </Button>
          )}

          <button onClick={onToggle} className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-800">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && connection && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-600 mb-2">
            Registo: {formatDate(profile.created_at)} · Ligação: {formatDate(connection.created_at)}
          </p>
          <ConnectionEditor connection={connection} onUpdate={onUpdate} />
        </div>
      )}

      {expanded && !connection && (
        <div className="px-4 pb-4 text-center">
          <p className="text-sm text-gray-500 mb-3">Este utilizador ainda não tem MTMcopier configurado.</p>
          <Button size="sm" onClick={() => onCreateConnection(profile.id)} disabled={creating}
            className="bg-[#D2A63C] hover:bg-[#BB8525] text-black">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar ligação MTMcopier"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── componente principal ─────────────────────────────────────────────────────

interface MTMcopierManagerProps {
  highlightUserId?: string | null
}

export default function MTMcopierManager({ highlightUserId }: MTMcopierManagerProps) {
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(highlightUserId ?? null)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      if (filter) params.set("filter", filter)
      params.set("limit", "100")

      const res = await adminApiCall<{ users: UserRow[]; total: number }>(
        `/api/admin/mtmcopy/users?${params.toString()}`,
      )
      if (res.success && res.data) {
        setRows(res.data.users ?? [])
        setTotal(res.data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [search, filter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    if (!highlightUserId) return
    setExpandedId(highlightUserId)
    adminApiCall<{ users: UserRow[] }>(`/api/admin/mtmcopy/users?user_id=${highlightUserId}`).then((res) => {
      if (!res.success || !res.data?.users?.[0]) return
      const row = res.data.users[0]
      setRows((prev) => {
        if (prev.some((r) => r.profile.id === row.profile.id)) {
          return prev.map((r) => (r.profile.id === row.profile.id ? row : r))
        }
        return [row, ...prev]
      })
    })
  }, [highlightUserId])

  const handleUpdate = useCallback(async (id: string, changes: Record<string, unknown>) => {
    const res = await adminApiCall<{ connection: MTMcopierConnection }>("/api/admin/copygram", {
      method: "PATCH",
      body: JSON.stringify({ id, ...changes }),
    })
    if (res.success && res.data?.connection) {
      const updated = res.data.connection
      setRows((prev) =>
        prev.map((r) =>
          r.connection?.id === id
            ? { ...r, connection: { ...r.connection!, ...updated } }
            : r,
        ),
      )
    }
    await fetchUsers()
  }, [fetchUsers])

  const handleCreateConnection = useCallback(async (userId: string) => {
    setCreatingId(userId)
    const res = await adminApiCall<{ connection: MTMcopierConnection }>("/api/admin/mtmcopy/users", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.success) {
      setExpandedId(userId)
      await fetchUsers()
    }
    setCreatingId(null)
  }, [fetchUsers])

  const withConnection = rows.filter((r) => r.connection).length
  const activeCopy = rows.filter((r) => r.connection?.is_active).length
  const pendingCount = rows.filter(
    (r) => r.connection && (r.connection.telegram_status === "pending" || r.connection.mt5_status === "pending"),
  ).length
  const errorCount = rows.filter(
    (r) => r.connection && (r.connection.telegram_status === "error" || r.connection.mt5_status === "error"),
  ).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {[
            { label: "Utilizadores", value: total, color: "text-white" },
            { label: "Com MTMcopier", value: withConnection, color: "text-[#D2A63C]" },
            { label: "Cópia activa", value: activeCopy, color: "text-green-400" },
            { label: "Pendentes / Erros", value: `${pendingCount} / ${errorCount}`, color: "text-yellow-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <Link href="/admin?tab=users">
          <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 shrink-0">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Gestão utilizadores
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Email, nome, username..."
            className="pl-9 bg-gray-900 border-gray-700 text-white text-sm" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "all", label: "Todos" },
            { id: "with_connection", label: "Com ligação" },
            { id: "without_connection", label: "Sem ligação" },
            { id: "active_copy", label: "Activos" },
            { id: "pending", label: "Pendentes" },
            { id: "error", label: "Erros" },
          ].map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setFilter(id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                filter === id
                  ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                  : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={fetchUsers} disabled={loading}
          className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-800 p-10 text-center text-gray-500">
          <Activity className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-sm">Nenhum utilizador encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <UserRow
              key={row.profile.id}
              row={row}
              expanded={expandedId === row.profile.id}
              onToggle={() => setExpandedId((id) => (id === row.profile.id ? null : row.profile.id))}
              onUpdate={handleUpdate}
              onCreateConnection={handleCreateConnection}
              creating={creatingId === row.profile.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
