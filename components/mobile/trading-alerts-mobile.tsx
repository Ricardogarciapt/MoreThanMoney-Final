"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { TERMINAL_ASSETS } from "@/lib/mtm-terminal-assets"
import {
  Bell,
  BellRing,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Loader2,
  Settings2,
  ArrowLeft,
  Save,
  Pin,
  Ban,
  Crosshair,
  Check,
  X as XIcon,
  SlidersHorizontal,
} from "lucide-react"

interface AlertConfirmation {
  name: string
  passed: boolean
}
interface MtmAlert {
  id: string
  ticker: string | null
  tvSymbol: string | null
  timeframe: string | null
  direction: "buy" | "sell" | "neutral"
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  strategy: string | null
  session: string | null
  confirmations: AlertConfirmation[]
  chartImageUrl: string | null
  createdAt: string
}
interface Subscription {
  enabled: boolean
  push_enabled: boolean
  symbols: string[]
  strategies: string[]
  timeframes: string[]
}

const DEFAULT_ALERT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "USDJPY", "BTCUSD", "US30"]
const STRATEGIES = ["GoldenZone", "Momentum", "KillShot", "Supernova", "Winzone", "Sinergy", "Goldkiller", "Sensei", "MTMScanner"]
const TIMEFRAMES = ["5", "15", "30", "60", "240", "D"]
const SYMBOLS = TERMINAL_ASSETS.map((a) => a.symbol)

const DIR = {
  buy: { label: "COMPRA", cls: "border-green-500/40 bg-green-500/15 text-green-400", Icon: TrendingUp },
  sell: { label: "VENDA", cls: "border-red-500/40 bg-red-500/15 text-red-400", Icon: TrendingDown },
  neutral: { label: "NEUTRO", cls: "border-gray-500/40 bg-gray-500/15 text-gray-300", Icon: Minus },
} as const

function fmt(n: number | null) {
  return n == null ? "—" : n.toLocaleString("pt-PT", { maximumFractionDigits: 6 })
}
function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-[#D2A63C] bg-[#D2A63C]/20 text-[#D2A63C]"
          : "border-gray-700 bg-white/5 text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  )
}

function MobileAlertCard({ alert }: { alert: MtmAlert }) {
  const d = DIR[alert.direction]
  const passed = alert.confirmations.filter((c) => c.passed).length
  return (
    <div className="rounded-xl border border-[#D2A63C]/20 bg-gradient-to-br from-[#141414] to-black p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{alert.ticker || "—"}</span>
          <Badge className={`border text-[10px] font-semibold ${d.cls}`}>
            <d.Icon className="mr-1 h-3 w-3" />
            {d.label}
          </Badge>
          {alert.timeframe && (
            <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
              {alert.timeframe}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock className="h-3 w-3" />
          {timeAgo(alert.createdAt)}
        </span>
      </div>
      {alert.strategy && <p className="mt-0.5 text-[11px] text-blue-300">{alert.strategy}</p>}

      {alert.chartImageUrl && (
        <img
          src={alert.chartImageUrl}
          alt={alert.ticker || "chart"}
          className="mt-2 max-h-40 w-full rounded-lg border border-gray-700 object-cover"
          loading="lazy"
        />
      )}

      <div className="mt-2 space-y-1 rounded-lg bg-black/30 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-gray-400"><Pin className="h-3 w-3 text-[#D2A63C]" /> Entrada</span>
          <span className="font-mono text-white">{fmt(alert.entry)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-gray-400"><Ban className="h-3 w-3 text-red-400" /> Stop</span>
          <span className="font-mono text-red-300">{fmt(alert.stopLoss)}</span>
        </div>
        {alert.takeProfits.map((tp, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-gray-400"><Crosshair className="h-3 w-3 text-green-400" /> Exit {i + 1}</span>
            <span className="font-mono text-green-300">{fmt(tp)}</span>
          </div>
        ))}
      </div>

      {alert.confirmations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {alert.confirmations.map((c) => (
            <span
              key={c.name}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                c.passed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
              }`}
            >
              {c.passed ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
              {c.name}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-gray-500">{passed}/{alert.confirmations.length}</span>
        </div>
      )}
    </div>
  )
}

export default function TradingAlertsMobile() {
  const { toast } = useToast()
  const [sub, setSub] = useState<Subscription>({
    enabled: true, push_enabled: true, symbols: DEFAULT_ALERT_SYMBOLS, strategies: [], timeframes: [],
  })
  const [alerts, setAlerts] = useState<MtmAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showManager, setShowManager] = useState(false)

  const loadSub = useCallback(async () => {
    try {
      const res = await fetch("/api/mtm-alerts/subscriptions", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (data.success && data.subscription) setSub((prev) => ({ ...prev, ...data.subscription }))
    } catch {
      /* usa defaults */
    }
  }, [])

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mtm-alerts?limit=40", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      setAlerts(data.alerts || [])
    } catch {
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSub()
    loadAlerts()
  }, [loadSub, loadAlerts])

  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel("trading-alerts-mobile")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tradingview_signals" }, () => loadAlerts())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [loadAlerts])

  const toggle = (key: keyof Pick<Subscription, "symbols" | "strategies" | "timeframes">, val: string) => {
    setSub((prev) => {
      const set = new Set(prev[key])
      set.has(val) ? set.delete(val) : set.add(val)
      return { ...prev, [key]: [...set] }
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/mtm-alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sub),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao guardar")
      toast({ title: "✅ Preferências guardadas", description: "Vais receber alertas dos ativos escolhidos." })
      setShowManager(false)
    } catch (err: any) {
      toast({ title: "❌ Erro", description: err?.message || "Falha ao guardar", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Feed filtrado às preferências (símbolos escolhidos; vazio = todos)
  const visible = useMemo(() => {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")
    return alerts.filter((a) => {
      if (sub.symbols.length > 0) {
        const t = norm(a.ticker || "")
        if (!sub.symbols.some((s) => t.includes(norm(s)))) return false
      }
      if (sub.timeframes.length > 0 && a.timeframe && !sub.timeframes.includes(a.timeframe)) return false
      if (sub.strategies.length > 0) {
        const st = norm(a.strategy || "")
        if (!st || !sub.strategies.some((s) => st.includes(norm(s)))) return false
      }
      return true
    })
  }, [alerts, sub])

  return (
    <div className="space-y-3 px-3 pb-24 pt-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-[#D2A63C]" />
          <h2 className="text-lg font-bold text-white">Trading Alerts</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (typeof window !== "undefined") {
                if (window.history.length > 1) window.history.back()
                else window.location.href = "/app-mobile?tab=scanner"
              }
            }}
            className="border-gray-600 text-gray-300"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManager((v) => !v)}
            className="border-[#D2A63C]/40 text-[#D2A63C]"
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" />
            Gerir
          </Button>
        </div>
      </div>

      {/* Gestor de preferências */}
      {showManager && (
        <div className="space-y-4 rounded-xl border border-[#D2A63C]/20 bg-black/50 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-white">
              <Bell className="h-4 w-4 text-[#D2A63C]" /> Receber alertas
            </span>
            <Switch checked={sub.enabled} onCheckedChange={(v) => setSub({ ...sub, enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-white">
              <BellRing className="h-4 w-4 text-[#D2A63C]" /> Notificações push
            </span>
            <Switch checked={sub.push_enabled} onCheckedChange={(v) => setSub({ ...sub, push_enabled: v })} />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Ativos ({sub.symbols.length || "todos"})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SYMBOLS.map((s) => (
                <Chip key={s} label={s} active={sub.symbols.includes(s)} onClick={() => toggle("symbols", s)} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Estratégias ({sub.strategies.length || "todas"})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGIES.map((s) => (
                <Chip key={s} label={s} active={sub.strategies.includes(s)} onClick={() => toggle("strategies", s)} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Timeframes ({sub.timeframes.length || "todos"})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIMEFRAMES.map((t) => (
                <Chip key={t} label={t} active={sub.timeframes.includes(t)} onClick={() => toggle("timeframes", t)} />
              ))}
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar preferências
          </Button>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A carregar alertas...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-black/40 py-12 text-center text-gray-500">
          <Bell className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="px-6 text-sm">
            Sem alertas para os teus ativos. Toca em <span className="text-[#D2A63C]">Gerir</span> para escolher o que queres receber.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <MobileAlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      <p className="px-4 text-center text-[10px] text-gray-600">
        ⚠️ Sinais educativos dos scanners MTM. Não constituem aconselhamento financeiro.
      </p>
    </div>
  )
}
