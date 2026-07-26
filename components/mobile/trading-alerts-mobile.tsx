"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { TERMINAL_ASSETS, type TerminalAssetType } from "@/lib/mtm-terminal-assets"
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
  Sparkles,
  LineChart,
} from "lucide-react"
import MarkdownRenderer from "@/components/dashboard-gestao/markdown-renderer"
import TvChartEmbed from "@/components/tv-chart-embed"

/** Normaliza o timeframe do alerta para um intervalo TradingView válido. */
function tvInterval(tf: string | null): string {
  const t = (tf ?? "").trim().toLowerCase()
  const map: Record<string, string> = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "1d": "D", "d": "D", "1w": "W", "w": "W",
  }
  if (map[t]) return map[t]
  if (/^\d+$/.test(t)) return t            // já é "15", "60", "240"…
  return "60"
}

// Indicadores TradingView (PUB;<id>) publicados de cada scanner MTM — para
// sobrepor no gráfico o mesmo study que gerou o alerta.
const SCANNER_STUDIES: Record<string, string[]> = {
  GoldenZone: ["PUB;0b373fb0e6634a73bc8b838cf0690725"],
  Momentum: ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"],
  KillShot: ["PUB;c1f81145e78a49ce92bd1f81f9c103dd"],
  Supernova: ["PUB;c16bafd7d0874182a1415648ec3ed7b8"],
  Winzone: [
    "PUB;6c003d30b2154ef3a31074d5c703954f", "PUB;e6adb5e5246c43f4a8dcffde5c98db4e",
    "PUB;162198dcae874d5da28f7b048feb76e7", "PUB;b6587ba7dc7b4489927cfd94d1fb8a9f",
    "PUB;0bf15eb0edba447f84e19fce69391ccb",
  ],
  Sinergy: ["PUB;3b86bd1192124fd98583490bb7508041"],
  Goldkiller: ["PUB;a3eaa6af54de4202a2c2f807fd8baa08"],
  MTMScanner: ["PUB;134fd950920e435694c40be33e3aa98f"],
  // Variante "sem painéis" do Sensei (publicada) — só plots, sem as tabelas laterais.
  Sensei: ["PUB;25c2231a331e413b8e7498364c5b94ab"],
}

type StudySpec = string | { id: string; inputs?: Record<string, unknown> }

/** Resolve o study do scanner a partir do nome que vem no alerta (strategy/alert_name). */
function resolveStudies(strategy: string | null): StudySpec[] | undefined {
  const s = (strategy ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (!s) return undefined
  if (s.includes("aurum")) return SCANNER_STUDIES.Sensei // Aurum Flow = família Sensei (perpétuos)
  if (s.includes("sensei")) return SCANNER_STUDIES.Sensei
  if (s.includes("goldkiller")) return SCANNER_STUDIES.Goldkiller
  if (s.includes("goldenzone")) return SCANNER_STUDIES.GoldenZone
  if (s.includes("killshot")) return SCANNER_STUDIES.KillShot
  if (s.includes("supernova")) return SCANNER_STUDIES.Supernova
  if (s.includes("momentum")) return SCANNER_STUDIES.Momentum
  if (s.includes("sinergy") || s.includes("quantum")) return SCANNER_STUDIES.Sinergy
  if (s.includes("winzone") || s.includes("sniper")) return SCANNER_STUDIES.Winzone
  if (s.includes("mtm") || s.includes("scanner")) return SCANNER_STUDIES.MTMScanner
  return SCANNER_STUDIES.MTMScanner // fallback: indicador MTM base
}

/**
 * Gráfico TradingView do alerta — montado apenas quando o cartão entra no ecrã
 * (IntersectionObserver), para não carregar dezenas de widgets de uma vez.
 * Sobrepõe o indicador/study do scanner que gerou o alerta.
 * Inline e visível por defeito (site, app-mobile e iOS via webview).
 */
function LazyAlertChart({ tvSymbol, timeframe, strategy }: { tvSymbol: string; timeframe: string | null; strategy: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || show) return
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() } },
      { rootMargin: "300px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [show])
  return (
    <div ref={ref} className="mt-2">
      {show ? (
        <TvChartEmbed
          tvSymbol={tvSymbol}
          interval={tvInterval(timeframe)}
          compact
          height={200}
          studies={resolveStudies(strategy)}
        />
      ) : (
        <div className="h-[200px] w-full rounded-lg border border-[#D2A63C]/20 bg-black/40" />
      )}
    </div>
  )
}

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
  aiAnalysis: string | null
  tradeStatus: string | null
  slPips: number | null
  slUnit: "pips" | "pts"
  crypto: { margin: number; leverage: number; notionalUsd: number; quantity: number | null } | null
}

const TRADE_STATE_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  active: { label: "Ativa", cls: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  be: { label: "BreakEven", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  exit_1: { label: "Exit 1", cls: "border-green-500/40 bg-green-500/10 text-green-300" },
  exit_2: { label: "Exit 2", cls: "border-green-500/40 bg-green-500/10 text-green-300" },
  exit_3: { label: "Exit 3", cls: "border-green-500/40 bg-green-500/10 text-green-300" },
  exit_4: { label: "Exit 4", cls: "border-green-600/50 bg-green-600/15 text-green-300" },
  loss: { label: "Loss", cls: "border-red-500/40 bg-red-500/15 text-red-400" },
  closed: { label: "Fechada", cls: "border-gray-500/40 bg-gray-500/10 text-gray-300" },
}
interface Subscription {
  enabled: boolean
  push_enabled: boolean
  symbols: string[]
  strategies: string[]
  timeframes: string[]
}

const DEFAULT_ALERT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "USDJPY", "BTCUSD", "US30"]
// Estratégias MTM que geram alertas (inclui Aurum Flow — scanner de perpétuos cripto).
const STRATEGIES = ["Sensei", "Goldkiller", "MTMScanner", "Aurum Flow"]
const TIMEFRAMES = ["5", "15", "30", "60", "240", "D"]

// Ativos agrupados por CLASSE (dropdowns no seletor de alertas).
const ASSET_CLASSES: { key: TerminalAssetType; label: string }[] = [
  { key: "commodity", label: "Metais / Commodities" },
  { key: "index", label: "Índices" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Cripto" },
  { key: "stock", label: "Ações" },
]

const DIR = {
  buy: { label: "COMPRA", cls: "border-green-500/40 bg-green-500/15 text-green-400", Icon: TrendingUp },
  sell: { label: "VENDA", cls: "border-red-500/40 bg-red-500/15 text-red-400", Icon: TrendingDown },
  neutral: { label: "NEUTRO", cls: "border-gray-500/40 bg-gray-500/15 text-gray-300", Icon: Minus },
} as const

type StateCat = "pending" | "active" | "win" | "loss"
function stateCategory(tradeStatus: string | null): StateCat {
  if (tradeStatus === "pending") return "pending"
  if (tradeStatus === "loss") return "loss"
  if (tradeStatus && (tradeStatus.startsWith("exit_") || tradeStatus === "closed")) return "win"
  return "active"
}

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

/** Acompanhamento da ação de preço de um sinal seguido (sem execução). */
function MobileSignalTracker({ alert }: { alert: MtmAlert }) {
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!alert.ticker) return
    let active = true
    const run = async () => {
      try {
        const res = await fetch(`/api/mtm-alerts/price?ticker=${encodeURIComponent(alert.ticker!)}`, {
          credentials: "include",
          cache: "no-store",
        })
        const data = await res.json()
        if (active) setPrice(typeof data.price === "number" ? data.price : null)
      } catch {
        /* ignora */
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    const iv = setInterval(run, 30000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [alert.ticker])

  const dir = alert.direction === "sell" ? "sell" : "buy"
  const entry = alert.entry
  const pnlPct =
    price != null && entry != null && entry !== 0
      ? ((dir === "buy" ? price - entry : entry - price) / entry) * 100
      : null
  const reached = (lvl: number) => (price == null ? false : dir === "buy" ? price >= lvl : price <= lvl)
  const slHit = price != null && alert.stopLoss != null && (dir === "buy" ? price <= alert.stopLoss : price >= alert.stopLoss)

  return (
    <div className="mt-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-cyan-300"><BellRing className="h-3 w-3 animate-pulse" /> A acompanhar</span>
        {loading ? <Loader2 className="h-3 w-3 animate-spin text-cyan-300" /> : <span className="font-mono font-bold text-white">{fmt(price)}</span>}
      </div>
      {pnlPct != null && (
        <p className={`text-center font-bold ${pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% desde a entrada
        </p>
      )}
      <div className="mt-1 space-y-0.5">
        {alert.stopLoss != null && (
          <div className="flex justify-between"><span className="text-gray-400">🛑 Stop</span><span className="font-mono text-red-300">{fmt(alert.stopLoss)}{slHit && " • atingido"}</span></div>
        )}
        {alert.takeProfits.map((tp, i) => (
          <div key={i} className="flex justify-between"><span className="text-gray-400">🎯 Exit {i + 1}</span><span className="font-mono text-green-300">{fmt(tp)}{reached(tp) && " • atingido"}</span></div>
        ))}
      </div>
      <p className="mt-1 text-center text-[9px] text-gray-500">Só acompanhamento — sem execução.</p>
    </div>
  )
}

function MobileAlertCard({
  alert,
  following,
  onToggleFollow,
  defaultShowChart,
}: {
  alert: MtmAlert
  following: boolean
  onToggleFollow: (id: string, follow: boolean) => void
  defaultShowChart?: boolean
}) {
  const d = DIR[alert.direction]
  const passed = alert.confirmations.filter((c) => c.passed).length
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(alert.aiAnalysis)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showChart, setShowChart] = useState(!!defaultShowChart)

  const toggleAnalysis = async () => {
    const next = !showAnalysis
    setShowAnalysis(next)
    if (next && !analysis && !loadingAnalysis) {
      setLoadingAnalysis(true)
      setAnalysisError(null)
      try {
        const res = await fetch("/api/mtm-alerts/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: alert.id }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Falha ao gerar gestão IA")
        setAnalysis(data.analysis)
      } catch (err: any) {
        setAnalysisError(err?.message || "Falha ao gerar gestão IA")
      } finally {
        setLoadingAnalysis(false)
      }
    }
  }

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
          {alert.tradeStatus && TRADE_STATE_META[alert.tradeStatus] && (
            <Badge className={`border text-[10px] font-semibold ${TRADE_STATE_META[alert.tradeStatus].cls}`}>
              {TRADE_STATE_META[alert.tradeStatus].label}
            </Badge>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock className="h-3 w-3" />
          {timeAgo(alert.createdAt)}
        </span>
      </div>
      {alert.strategy && <p className="mt-0.5 text-[11px] text-blue-300">{alert.strategy}</p>}

      {showChart && alert.tvSymbol ? (
        <div className="mt-2">
          <LazyAlertChart tvSymbol={alert.tvSymbol} timeframe={alert.timeframe} strategy={alert.strategy} />
        </div>
      ) : alert.chartImageUrl ? (
        <img
          src={alert.chartImageUrl}
          alt={alert.ticker || "chart"}
          className="mt-2 w-full rounded-lg border border-gray-700 object-contain"
          loading="lazy"
        />
      ) : alert.tvSymbol ? (
        <LazyAlertChart tvSymbol={alert.tvSymbol} timeframe={alert.timeframe} strategy={alert.strategy} />
      ) : null}

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

      {/* SL em pips/pontos + alavancagem/tamanho (cripto perp) para $10 */}
      {(alert.slPips != null || alert.crypto) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {alert.slPips != null && (
            <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-300">
              🛑 SL: {alert.slPips} {alert.slUnit}
            </span>
          )}
          {alert.crypto && (
            <>
              <span className="rounded border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-1.5 py-0.5 text-[#D2A63C]">
                ⚡ Alav: {alert.crypto.leverage}x
              </span>
              <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-blue-300">
                💵 Margem ${alert.crypto.margin} · Posição ${alert.crypto.notionalUsd}
                {alert.crypto.quantity != null
                  ? ` (${alert.crypto.quantity.toLocaleString("pt-PT", { maximumFractionDigits: 4 })} un)`
                  : ""}
              </span>
            </>
          )}
        </div>
      )}

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

      {/* Ações: Gestão IA + Seguir sinal */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={toggleAnalysis}
          className="flex items-center justify-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2 py-1.5 text-[11px] font-medium text-purple-300"
        >
          {loadingAnalysis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Gestão IA
        </button>
        <button
          onClick={() => onToggleFollow(alert.id, !following)}
          className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
            following ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300" : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
          }`}
        >
          <BellRing className="h-3 w-3" />
          {following ? "A seguir ✓" : "Seguir sinal"}
        </button>
      </div>
      {alert.tvSymbol && (
        <button
          onClick={() => setShowChart((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2 py-1.5 text-[11px] font-medium text-[#D2A63C]"
        >
          <LineChart className="h-3 w-3" />
          {showChart ? "Ver imagem do sinal" : "Gráfico ao vivo"}
        </button>
      )}
      {following && <MobileSignalTracker alert={alert} />}
      {showAnalysis && (
        <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2 text-xs">
          {loadingAnalysis ? (
            <p className="flex items-center gap-2 text-purple-300"><Loader2 className="h-3 w-3 animate-spin" /> A analisar...</p>
          ) : analysisError ? (
            <p className="text-red-300">{analysisError}</p>
          ) : analysis ? (
            <MarkdownRenderer content={analysis} />
          ) : (
            <p className="text-gray-400">Sem análise disponível.</p>
          )}
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
  const [stateFilter, setStateFilter] = useState<"all" | StateCat>("all")
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [focusAlert, setFocusAlert] = useState<MtmAlert | null>(null)

  const loadFollowed = useCallback(async () => {
    try {
      const res = await fetch("/api/mtm-alerts/follow", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (Array.isArray(data.followed)) setFollowed(new Set(data.followed))
    } catch {
      /* ignora */
    }
  }, [])

  const toggleFollow = useCallback(async (id: string, follow: boolean) => {
    setFollowed((prev) => {
      const next = new Set(prev)
      if (follow) next.add(id)
      else next.delete(id)
      return next
    })
    try {
      await fetch("/api/mtm-alerts/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signalId: id, follow }),
      })
    } catch {
      /* otimista */
    }
  }, [])

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
    loadFollowed()
  }, [loadSub, loadAlerts, loadFollowed])

  // Deep-link da notificação: ?signal=<id> → abre o modal do alerta (com gráfico ao vivo).
  useEffect(() => {
    if (typeof window === "undefined") return
    const sigId = new URLSearchParams(window.location.search).get("signal")
    if (!sigId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/mtm-alerts?id=${encodeURIComponent(sigId)}`, { credentials: "include", cache: "no-store" })
        const data = await res.json()
        if (!cancelled && data.alerts?.[0]) setFocusAlert(data.alerts[0] as MtmAlert)
      } catch {
        /* ignora */
      }
    })()
    return () => { cancelled = true }
  }, [])

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
  const subFiltered = useMemo(() => {
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

  // Desempenho dos alertas subscritos + feed final (com filtro de estado)
  const perf = useMemo(() => {
    const acc = { pending: 0, active: 0, win: 0, loss: 0 } as Record<StateCat, number>
    subFiltered.forEach((a) => acc[stateCategory(a.tradeStatus)]++)
    return acc
  }, [subFiltered])
  const winRate = perf.win + perf.loss > 0 ? Math.round((perf.win / (perf.win + perf.loss)) * 100) : null
  const visible = useMemo(
    () => (stateFilter === "all" ? subFiltered : subFiltered.filter((a) => stateCategory(a.tradeStatus) === stateFilter)),
    [subFiltered, stateFilter]
  )
  const STATE_TABS: { key: "all" | StateCat; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Todos", count: subFiltered.length, cls: "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" },
    { key: "pending", label: "Pendentes", count: perf.pending, cls: "border-amber-500 bg-amber-500/15 text-amber-300" },
    { key: "active", label: "Ativas", count: perf.active, cls: "border-blue-500 bg-blue-500/15 text-blue-300" },
    { key: "win", label: "Wins", count: perf.win, cls: "border-green-500 bg-green-500/15 text-green-300" },
    { key: "loss", label: "Loss", count: perf.loss, cls: "border-red-500 bg-red-500/15 text-red-300" },
  ]

  return (
    <div className="space-y-3 px-3 pb-24 pt-3">
      {/* Modal do sinal (deep-link da notificação): card + gráfico ao vivo + info */}
      {focusAlert && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 pt-8"
          onClick={() => setFocusAlert(null)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#D2A63C]">📍 Sinal seguido</span>
              <button
                onClick={() => setFocusAlert(null)}
                className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white"
              >
                Fechar ✕
              </button>
            </div>
            <MobileAlertCard
              alert={focusAlert}
              following={followed.has(focusAlert.id)}
              onToggleFollow={toggleFollow}
              defaultShowChart
            />
          </div>
        </div>
      )}
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
            <div className="space-y-1.5">
              {ASSET_CLASSES.map((cls) => {
                const assets = TERMINAL_ASSETS.filter((a) => a.type === cls.key)
                if (assets.length === 0) return null
                const selected = assets.filter((a) => sub.symbols.includes(a.symbol)).length
                return (
                  <details key={cls.key} className="rounded-lg border border-[#D2A63C]/15 bg-black/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-gray-300">
                      <span>{cls.label}</span>
                      <span className="text-[10px] text-gray-500">{selected ? `${selected}/${assets.length}` : `${assets.length} ativos`}</span>
                    </summary>
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                      {assets.map((a) => (
                        <Chip key={a.symbol} label={a.symbol} active={sub.symbols.includes(a.symbol)} onClick={() => toggle("symbols", a.symbol)} />
                      ))}
                    </div>
                  </details>
                )
              })}
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

      {/* Estado / desempenho: Pendentes · Ativas · Wins · Loss + win rate */}
      <div className="rounded-xl border border-[#D2A63C]/20 bg-black/40 p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Desempenho</span>
          <span className="text-[11px] text-gray-400">
            Win rate{" "}
            <span className={`font-mono font-bold ${winRate == null ? "text-gray-500" : winRate >= 50 ? "text-green-400" : "text-red-400"}`}>
              {winRate == null ? "—" : `${winRate}%`}
            </span>{" "}
            <span className="text-gray-600">({perf.win}W·{perf.loss}L)</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStateFilter(t.key)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                stateFilter === t.key ? t.cls : "border-gray-700 text-gray-400"
              }`}
            >
              {t.label}
              <span className="rounded bg-black/40 px-1 text-[9px]">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

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
            <MobileAlertCard
              key={a.id}
              alert={a}
              following={followed.has(a.id)}
              onToggleFollow={toggleFollow}
            />
          ))}
        </div>
      )}

      <p className="px-4 text-center text-[10px] text-gray-600">
        ⚠️ Sinais educativos dos scanners MTM. Não constituem aconselhamento financeiro.
      </p>
    </div>
  )
}
