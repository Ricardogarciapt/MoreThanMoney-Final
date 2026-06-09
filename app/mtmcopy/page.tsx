"use client"

import { useCallback, useEffect, useState } from "react"
import Breadcrumbs from "@/components/breadcrumbs"
import ParticleBackground from "@/components/particle-background"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight, Send, LineChart, ShieldCheck, Zap, Loader2, X, Check,
  AlertTriangle, RefreshCw, Power, Settings2, TrendingUp, TrendingDown,
  Clock, Activity, ToggleLeft, ToggleRight, History, ChevronDown, ChevronUp,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface MTMcopierConnection {
  id: string
  telegram_channel: string | null
  telegram_status: "pending" | "connected" | "error" | "disconnected"
  mt5_login_last4: string | null
  mt5_server: string | null
  mt5_status: "pending" | "connected" | "error" | "disconnected"
  lot_mode: "fixed" | "risk_percent" | "multiplier"
  lot_value: number
  max_risk_percent: number | null
  symbols_whitelist: string[] | null
  copy_sl: boolean
  copy_tp: boolean
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
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

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  connected:    { label: "Ligado",      className: "bg-green-500/15 text-green-400 border-green-500/30" },
  pending:      { label: "Pendente",    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  error:        { label: "Erro",        className: "bg-red-500/15 text-red-400 border-red-500/30" },
  disconnected: { label: "Desligado",   className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
}

const SIGNAL_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  executed: { label: "Executado",  className: "bg-green-500/15 text-green-400 border-green-500/30" },
  received: { label: "Recebido",   className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  skipped:  { label: "Ignorado",   className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  error:    { label: "Erro",       className: "bg-red-500/15 text-red-400 border-red-500/30" },
}

function formatRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `há ${diff}s`
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)}d`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ---------------------------------------------------------------------------
// Modal de configuração
// ---------------------------------------------------------------------------

function SetupModal({
  initial, onClose, onSaved,
}: {
  initial: MTMcopierConnection | null
  onClose: () => void
  onSaved: (c: MTMcopierConnection) => void
}) {
  const [telegramChannel, setTelegramChannel] = useState(initial?.telegram_channel ?? "")
  const [mt5Server, setMt5Server] = useState(initial?.mt5_server ?? "")
  const [mt5Last4, setMt5Last4] = useState(initial?.mt5_login_last4 ?? "")
  const [lotMode, setLotMode] = useState<MTMcopierConnection["lot_mode"]>(initial?.lot_mode ?? "fixed")
  const [lotValue, setLotValue] = useState(String(initial?.lot_value ?? "0.01"))
  const [maxRisk, setMaxRisk] = useState(String(initial?.max_risk_percent ?? "1"))
  const [symbolsInput, setSymbolsInput] = useState((initial?.symbols_whitelist ?? []).join(", "))
  const [copySl, setCopySl] = useState(initial?.copy_sl ?? true)
  const [copyTp, setCopyTp] = useState(initial?.copy_tp ?? true)
  const [reverse, setReverse] = useState(initial?.reverse_signals ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    setError("")
    if (!telegramChannel.trim()) {
      setError("Indica o canal/grupo do Telegram de onde vamos ler os sinais.")
      return
    }
    if (!mt5Server.trim() || !/^\d{1,4}$/.test(mt5Last4.trim())) {
      setError("Indica o servidor MT5 e os últimos 4 dígitos da tua conta (apenas para identificação — nunca pedimos a password aqui).")
      return
    }

    const symbols_whitelist = symbolsInput
      .split(/[,\s]+/)
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean)

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }

      const res = await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          telegram_channel: telegramChannel.trim(),
          mt5_server: mt5Server.trim(),
          mt5_login_last4: mt5Last4.trim(),
          lot_mode: lotMode,
          lot_value: parseFloat(lotValue) || 0.01,
          max_risk_percent: parseFloat(maxRisk) || 1,
          symbols_whitelist: symbols_whitelist.length ? symbols_whitelist : null,
          copy_sl: copySl,
          copy_tp: copyTp,
          reverse_signals: reverse,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Não foi possível guardar a configuração.")
        setSaving(false)
        return
      }
      onSaved(data.connection)
    } catch {
      setError("Erro de rede. Tenta novamente.")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 overflow-y-auto py-8">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-1">Configurar o MTMcopier</h3>
        <p className="text-sm text-gray-400 mb-5">
          Estes dados ficam associados à tua ligação. As credenciais completas da tua conta MT5
          <strong className="text-white"> nunca</strong> são pedidas aqui — a equipa contacta-te
          para finalizar a ligação em segurança após o pagamento do addon.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Canal/Grupo do Telegram *</label>
            <Input value={telegramChannel} onChange={e => setTelegramChannel(e.target.value)}
              placeholder="@nome_do_canal ou link de convite" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Servidor MT5 *</label>
              <Input value={mt5Server} onChange={e => setMt5Server(e.target.value)}
                placeholder="ex: ICMarkets-Live05" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Últimos 4 dígitos da conta *</label>
              <Input value={mt5Last4} onChange={e => setMt5Last4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Modo de cálculo do lote</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "fixed", label: "Lote fixo" },
                { id: "risk_percent", label: "% de risco" },
                { id: "multiplier", label: "Multiplicador" },
              ] as const).map(opt => (
                <button key={opt.id} type="button" onClick={() => setLotMode(opt.id)} disabled={saving}
                  className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                    lotMode === opt.id ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]" : "border-gray-700 text-gray-400 hover:bg-gray-800"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lotMode === "fixed" ? "Lote (ex: 0.01)" : lotMode === "risk_percent" ? "% por operação" : "Multiplicador"}
              </label>
              <Input value={lotValue} onChange={e => setLotValue(e.target.value)} inputMode="decimal"
                className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Risco máx. diário (%)</label>
              <Input value={maxRisk} onChange={e => setMaxRisk(e.target.value)} inputMode="decimal"
                className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Filtro de símbolos <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <Input
              value={symbolsInput}
              onChange={e => setSymbolsInput(e.target.value)}
              placeholder="ex: XAUUSD, EURUSD, BTCUSD — vazio = aceita todos"
              className="bg-gray-800 border-gray-700 text-white"
              disabled={saving}
            />
            <p className="text-xs text-gray-500 mt-1">Separa por vírgula. Apenas sinais destes pares serão copiados.</p>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            {[
              { label: "Copiar Stop Loss", value: copySl, set: setCopySl },
              { label: "Copiar Take Profit", value: copyTp, set: setCopyTp },
              { label: "Inverter sinais", value: reverse, set: setReverse },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} disabled={saving}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-[#D2A63C] focus:ring-[#D2A63C]/40" />
                {label}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full mt-5 bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold">
          {saving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A guardar...</> : <>Guardar configuração <ArrowRight className="ml-2 h-5 w-5" /></>}
        </Button>
      </div>
    </div>
  )
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
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <Activity className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Ainda não há sinais registados.</p>
          <p className="text-gray-500 text-xs mt-1">Assim que o MTMcopier começar a copiar operações, aparecerão aqui.</p>
        </div>
      ) : (
        <>
          {/* Tabela — scroll horizontal em mobile */}
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-800/60 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2.5 text-left font-medium">Símbolo</th>
                  <th className="px-4 py-2.5 text-center font-medium">Dir.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Entrada</th>
                  <th className="px-4 py-2.5 text-right font-medium">SL</th>
                  <th className="px-4 py-2.5 text-right font-medium">TP</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lote</th>
                  <th className="px-4 py-2.5 text-right font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Hora</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(sig => (
                  <tr key={sig.id} className="border-t border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">{sig.symbol ?? "—"}</span>
                      {sig.detail && (
                        <p className="text-xs text-gray-500 mt-0.5 max-w-[160px] truncate" title={sig.detail}>{sig.detail}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sig.direction?.toUpperCase() === "BUY" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-400">
                          <TrendingUp className="w-3.5 h-3.5" /> BUY
                        </span>
                      ) : sig.direction?.toUpperCase() === "SELL" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
                          <TrendingDown className="w-3.5 h-3.5" /> SELL
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{sig.entry ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-red-400/80">{sig.sl ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-green-400/80">{sig.tp ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{sig.lot ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${SIGNAL_STATUS_LABEL[sig.status]?.className}`}>
                        {SIGNAL_STATUS_LABEL[sig.status]?.label ?? sig.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-500 flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelative(sig.created_at)}
                      </span>
                      <span className="text-xs text-gray-600 hidden sm:block text-right mt-0.5">
                        {formatDate(sig.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  { icon: Send, title: "1. Lemos o teu canal de sinais", text: "O MTMcopier liga-se ao canal/grupo do Telegram que escolheres e identifica os sinais de entrada (símbolo, direção, SL e TP)." },
  { icon: Settings2, title: "2. Aplicamos as tuas regras", text: "Lote fixo, percentagem de risco ou multiplicador — tu decides como cada sinal é dimensionado antes de chegar à tua conta." },
  { icon: LineChart, title: "3. Executamos no teu MT5", text: "As ordens são enviadas diretamente para a tua conta MetaTrader 5, com Stop Loss e Take Profit replicados automaticamente." },
  { icon: ShieldCheck, title: "4. Tu manténs o controlo", text: "Ativa, pausa ou desliga a cópia a qualquer momento. Define limites de risco diário para proteger a tua conta." },
]

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function MtmCopyPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<MTMcopierConnection | null | undefined>(undefined)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setConnection(null); return }
      setAccessToken(session.access_token)
      try {
        const res = await fetch("/api/mtmcopy/connection", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (!cancelled) setConnection(data.connection ?? null)
      } catch {
        if (!cancelled) setConnection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const handleAddonCheckout = async () => {
    setError("")
    setCheckingOut(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
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

  const handleToggleActive = async () => {
    if (!connection || !accessToken) return
    setTogglingActive(true)
    setError("")
    try {
      const res = await fetch("/api/mtmcopy/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ is_active: !connection.is_active }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erro ao atualizar estado.")
      } else {
        setConnection(data.connection)
      }
    } catch {
      setError("Erro de rede. Tenta novamente.")
    } finally {
      setTogglingActive(false)
    }
  }

  const handleDisconnect = async () => {
    if (!accessToken) return
    if (!confirm("Tens a certeza que queres desligar o MTMcopier? A cópia será pausada.")) return
    try {
      const res = await fetch("/api/mtmcopy/connection", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        setConnection(prev => prev
          ? { ...prev, is_active: false, telegram_status: "disconnected", mt5_status: "disconnected" }
          : prev
        )
      }
    } catch {
      setError("Erro de rede. Tenta novamente.")
    }
  }

  return (
    <>
      {showSetup && (
        <SetupModal
          initial={connection ?? null}
          onClose={() => setShowSetup(false)}
          onSaved={(c) => { setConnection(c); setShowSetup(false) }}
        />
      )}

      <div className="relative min-h-screen bg-black overflow-hidden">
        <ParticleBackground />
        <Breadcrumbs />

        <main className="relative z-10 container mx-auto px-4 py-16 max-w-5xl">

          {/* Hero */}
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">🔗 Addon · Copy Trading</Badge>
            <h1 className="text-3xl md:text-5xl font-black mb-4 text-white">
              <span className="text-[#D2A63C]">MTMcopier</span> — do Telegram direto para o teu MT5
            </h1>
            <p className="text-gray-400 text-lg">
              Liga o canal de sinais que segues à tua conta MetaTrader 5. Sem copiar e colar,
              sem ficar agarrado ao telemóvel — as tuas operações seguem o ritmo do mercado, em tempo real.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <span className="text-3xl font-black text-white">+20€</span>
              <span className="text-gray-400">/mês · addon sobre o teu Pack MTM</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button
                onClick={() => connection ? setShowSetup(true) : handleAddonCheckout()}
                disabled={checkingOut}
                size="lg"
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
              >
                {checkingOut ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
                ) : connection ? (
                  <><Settings2 className="mr-2 h-5 w-5" />Editar configuração</>
                ) : (
                  <>Ativar o MTMcopier <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </Button>
              {!connection && (
                <Button onClick={() => setShowSetup(true)} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  Pré-configurar antes de pagar
                </Button>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400 mt-4 max-w-md mx-auto">{error}</p>
            )}
          </div>

          {/* Estado da ligação */}
          {connection && (
            <Card className="mb-14 bg-gray-900/60 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Power className="w-5 h-5 text-[#D2A63C]" /> A tua ligação MTMcopier
                  </CardTitle>

                  {/* Toggle ativo / pausado */}
                  <button
                    onClick={handleToggleActive}
                    disabled={togglingActive}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      connection.is_active
                        ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        : "border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {togglingActive ? (
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
                {/* Telegram + MT5 status */}
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Telegram</p>
                    <p className="text-white font-medium mb-2">{connection.telegram_channel || "—"}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABEL[connection.telegram_status]?.className}`}>
                      {STATUS_LABEL[connection.telegram_status]?.label}
                    </span>
                  </div>
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">MetaTrader 5</p>
                    <p className="text-white font-medium mb-2">
                      {connection.mt5_server || "—"}
                      {connection.mt5_login_last4 ? ` · ····${connection.mt5_login_last4}` : ""}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABEL[connection.mt5_status]?.className}`}>
                      {STATUS_LABEL[connection.mt5_status]?.label}
                    </span>
                  </div>
                </div>

                {/* Configuração resumida */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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

                {/* Filtro de símbolos */}
                {connection.symbols_whitelist && connection.symbols_whitelist.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className="text-xs text-gray-500">Filtro de pares:</span>
                    {connection.symbols_whitelist.map(sym => (
                      <span key={sym} className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-mono">
                        {sym}
                      </span>
                    ))}
                  </div>
                )}

                {/* Avisos */}
                {(connection.telegram_status === "pending" || connection.mt5_status === "pending") && (
                  <div className="flex items-start gap-2.5 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>A nossa equipa vai contactar-te para finalizar a ligação em segurança. Isto demora normalmente até 24h úteis.</p>
                  </div>
                )}
                {connection.last_error && (
                  <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>{connection.last_error}</p>
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => setShowSetup(true)} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                    <Settings2 className="mr-2 h-4 w-4" /> Editar regras de cópia
                  </Button>
                  <Button variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-800" onClick={() => window.location.reload()}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-500/70 hover:text-red-400 hover:bg-red-500/10 ml-auto"
                    onClick={handleDisconnect}
                  >
                    Desligar MTMcopier
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Histórico de sinais — apenas se tiver ligação */}
          {connection && accessToken && (
            <SignalHistory accessToken={accessToken} />
          )}

          {/* Como funciona */}
          <div className="mb-14">
            <h2 className="text-2xl font-bold text-white text-center mb-8">Como funciona</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {HOW_IT_WORKS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
                  <div className="w-10 h-10 rounded-lg bg-[#D2A63C]/10 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-[#D2A63C]" />
                  </div>
                  <h3 className="text-white font-bold mb-1.5">{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{text}</p>
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
                "Nunca pedimos a password da tua conta MT5 por formulário — a ligação é feita pela equipa, em canal seguro",
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
              onClick={() => connection ? setShowSetup(true) : handleAddonCheckout()}
              disabled={checkingOut}
              size="lg"
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
            >
              {checkingOut ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
              ) : connection ? (
                <>Editar configuração <Settings2 className="ml-2 h-5 w-5" /></>
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
