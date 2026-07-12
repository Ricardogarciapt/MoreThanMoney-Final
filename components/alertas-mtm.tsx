"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import MarkdownRenderer from "@/components/dashboard-gestao/markdown-renderer"
import TvChartEmbed from "@/components/tv-chart-embed"
import { supabase } from "@/lib/supabase"
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  LineChart,
  Search,
  Check,
  X as XIcon,
  Copy,
  CheckCheck,
  Pin,
  Ban,
  Crosshair,
} from "lucide-react"

interface AlertConfirmation {
  name: string
  passed: boolean
}

interface MtmAlert {
  id: string
  ticker: string | null
  tvSymbol: string | null
  exchange: string | null
  timeframe: string | null
  action: string | null
  direction: "buy" | "sell" | "neutral"
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  alertName: string | null
  strategy: string | null
  session: string | null
  confirmations: AlertConfirmation[]
  message: string | null
  aiAnalysis: string | null
  chartImageUrl: string | null
  createdAt: string
  status: string | null
  tradeStatus: string | null
  assetClass: "gold_btc" | "forex" | "index" | "crypto_perp" | "other"
  slDistance: number | null
  slPercent: number | null
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

/** Categoria de desempenho para filtro e estatísticas dos alertas. */
type StateCat = "pending" | "active" | "win" | "loss"
function stateCategory(tradeStatus: string | null): StateCat {
  if (tradeStatus === "pending") return "pending"
  if (tradeStatus === "loss") return "loss"
  if (tradeStatus && (tradeStatus.startsWith("exit_") || tradeStatus === "closed")) return "win"
  return "active"
}

function fmt(n: number | null): string {
  if (n == null) return "—"
  return n.toLocaleString("pt-PT", { maximumFractionDigits: 6 })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

const DIR_META = {
  buy: { label: "COMPRA", cls: "border-green-500/40 bg-green-500/15 text-green-400", Icon: TrendingUp },
  sell: { label: "VENDA", cls: "border-red-500/40 bg-red-500/15 text-red-400", Icon: TrendingDown },
  neutral: { label: "NEUTRO", cls: "border-gray-500/40 bg-gray-500/15 text-gray-300", Icon: Minus },
} as const

/** Scanner Momentum MTM — mostra os plots da estratégia no gráfico do alerta. */
/**
 * Estratégias dos Alertas MTM — apenas as 3 que geram alarmes via webhook para
 * o site: MTM Scanner, GoldKiller e Sensei. Cada uma com o seu study (Pine público).
 */
const STRATEGY_STUDIES: Record<string, string[]> = {
  Goldkiller: ["PUB;a3eaa6af54de4202a2c2f807fd8baa08"],
  MTMScanner: ["PUB;134fd950920e435694c40be33e3aa98f"],
  Sensei: ["PUB;73e1daff8be44976998dade66c6a11d7"],
}
const DEFAULT_STUDIES = STRATEGY_STUDIES.MTMScanner

/** Resolve o study certo a partir do nome da estratégia do alerta (só 3 estratégias). */
function studiesForStrategy(strategy: string | null): string[] {
  if (!strategy) return DEFAULT_STUDIES
  const norm = strategy.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (norm.includes("sensei")) return STRATEGY_STUDIES.Sensei
  if (norm.includes("goldkiller") || (norm.includes("gold") && norm.includes("kill"))) return STRATEGY_STUDIES.Goldkiller
  if (norm.includes("scanner") || norm.includes("mtmscanner")) return STRATEGY_STUDIES.MTMScanner
  return DEFAULT_STUDIES
}

type AssetClass = "gold_btc" | "forex" | "index" | "crypto_perp" | "other"
const CLASS_LABELS: Record<AssetClass, string> = {
  gold_btc: "Ouro & BTC",
  forex: "Forex",
  index: "Índices",
  crypto_perp: "Cripto Perp",
  other: "Outros",
}
const FX_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SGD", "SEK", "NOK", "MXN", "ZAR"])
const IDX_SET = new Set(["UK100", "US30", "US100", "US500", "SPX500", "SPX", "NAS100", "NAS", "NDX", "DJI", "GER40", "DE40", "DE30", "DAX", "JP225", "JPN225", "FRA40", "EU50", "US2000", "HK50", "AUS200", "ESP35", "IT40"])
function classifyAssetClient(ticker: string | null): AssetClass {
  if (!ticker) return "other"
  const norm = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "").replace(/^[A-Z]+:/, "")
  if (/XAUUSD/.test(norm) || /^BTCUSD$/.test(norm)) return "gold_btc"
  if (/\.P$/.test(norm) || /USDT/.test(norm) || /PERP/.test(norm)) return "crypto_perp"
  const letters = norm.replace(/[^A-Z]/g, "")
  if (letters.length === 6 && FX_CODES.has(letters.slice(0, 3)) && FX_CODES.has(letters.slice(3, 6))) return "forex"
  if (IDX_SET.has(norm) || IDX_SET.has(letters)) return "index"
  return "other"
}

function CopyBtn({ value }: { value: number | null }) {
  const [copied, setCopied] = useState(false)
  if (value == null) return null
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(String(value)).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="text-gray-500 transition-colors hover:text-[#D2A63C]"
      title="Copiar"
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function LevelRow({
  label, value, icon, valueClass = "text-white",
}: { label: string; value: number | null; icon: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="flex items-center gap-2">
        {icon}
        <span className={`font-mono text-sm font-semibold ${valueClass}`}>{fmt(value)}</span>
        <CopyBtn value={value} />
      </span>
    </div>
  )
}

function AlertCard({ alert }: { alert: MtmAlert }) {
  const [showChart, setShowChart] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(alert.aiAnalysis)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const dir = DIR_META[alert.direction]
  const passed = alert.confirmations.filter((c) => c.passed).length

  // Gestão da trade (IA) — sempre disponível; gera na hora se ainda não existir.
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
    <Card className="border-[#D2A63C]/20 bg-gradient-to-br from-[#141414] to-black">
      <CardContent className="p-4">
        {/* Strategy badge */}
        {alert.strategy && (
          <Badge className="mb-2 border-blue-500/30 bg-blue-500/10 text-blue-300">
            <LineChart className="mr-1 h-3 w-3" />
            {alert.strategy}
          </Badge>
        )}

        {/* Symbol · direção · timeframe */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-white">{alert.ticker || "—"}</span>
          <Badge className={`border font-semibold ${dir.cls}`}>
            <dir.Icon className="mr-1 h-3 w-3" />
            {dir.label}
          </Badge>
          {alert.timeframe && (
            <Badge variant="outline" className="border-gray-600 text-gray-400">
              <Clock className="mr-1 h-3 w-3" />
              {alert.timeframe}
            </Badge>
          )}
          {alert.tradeStatus && TRADE_STATE_META[alert.tradeStatus] && (
            <Badge className={`border font-semibold ${TRADE_STATE_META[alert.tradeStatus].cls}`}>
              {TRADE_STATE_META[alert.tradeStatus].label}
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            {timeAgo(alert.createdAt)}
          </span>
        </div>

        {alert.session && <p className="mt-1 text-xs text-gray-500">🌍 {alert.session}</p>}

        {/* Imagem do gráfico no momento do sinal (chart_url / snapshot TradingView) */}
        {alert.chartImageUrl ? (
          <a
            href={alert.chartImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block overflow-hidden rounded-lg border border-gray-600/40"
          >
            <div className="flex items-center justify-between bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">
              <span>Gráfico no momento do alerta</span>
              <span className="text-[#D2A63C]">Abrir ↗</span>
            </div>
            <img
              src={alert.chartImageUrl}
              alt={`Gráfico ${alert.ticker}`}
              className="max-h-72 w-full bg-gray-900 object-cover"
              loading="lazy"
            />
          </a>
        ) : (
          showChart && alert.tvSymbol && (
            <div className="mt-3">
              <TvChartEmbed
                tvSymbol={alert.tvSymbol}
                interval={alert.timeframe && /^\d+$/.test(alert.timeframe) ? alert.timeframe : "60"}
                height={280}
                compact
                studies={studiesForStrategy(alert.strategy)}
              />
            </div>
          )
        )}

        {/* Níveis */}
        <div className="mt-3 rounded-lg bg-black/30 px-3">
          <LevelRow label="Entrada" value={alert.entry} icon={<Pin className="h-3.5 w-3.5 text-[#D2A63C]" />} />
          <LevelRow
            label="Invalidação (Stop Loss)"
            value={alert.stopLoss}
            icon={<Ban className="h-3.5 w-3.5 text-red-400" />}
            valueClass="text-red-300"
          />
          {alert.takeProfits.map((tp, i) => (
            <LevelRow
              key={i}
              label={`Exit ${i + 1} (Take Profit)`}
              value={tp}
              icon={<Crosshair className="h-3.5 w-3.5 text-green-400" />}
              valueClass="text-green-300"
            />
          ))}
        </div>

        {/* SL em pips/pontos + alavancagem/tamanho (cripto perp) */}
        {(alert.slPips != null || alert.crypto) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {alert.slPips != null && (
              <span className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-red-300">
                🛑 SL: {alert.slPips} {alert.slUnit}
                {alert.slPercent != null ? ` · ${alert.slPercent.toFixed(2)}%` : ""}
              </span>
            )}
            {alert.crypto && (
              <>
                <span className="rounded-md border border-purple-500/20 bg-purple-500/5 px-2 py-1 text-purple-300">
                  ⚡ Alav: {alert.crypto.leverage}x
                </span>
                <span className="rounded-md border border-[#D2A63C]/20 bg-[#D2A63C]/5 px-2 py-1 text-[#D2A63C]">
                  💵 Margem ${alert.crypto.margin} · Posição ${alert.crypto.notionalUsd}
                  {alert.crypto.quantity != null
                    ? ` (${alert.crypto.quantity.toLocaleString("pt-PT", { maximumFractionDigits: 4 })} un)`
                    : ""}
                </span>
              </>
            )}
          </div>
        )}

        {/* Confirmações */}
        {alert.confirmations.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Confirmações</span>
              <span className="text-[10px] text-gray-500">{passed}/{alert.confirmations.length} ok</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {alert.confirmations.map((c) => (
                <div
                  key={c.name}
                  className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs ${
                    c.passed ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <span className="capitalize text-gray-300">{c.name}</span>
                  {c.passed ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <XIcon className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="mt-3 flex flex-wrap gap-2">
          {!alert.chartImageUrl && alert.tvSymbol && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowChart((v) => !v)}
              className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10"
            >
              <LineChart className="mr-1 h-3 w-3" />
              {showChart ? "Esconder gráfico" : "Gráfico ao vivo"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAnalysis}
            className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
          >
            {loadingAnalysis ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : showAnalysis ? (
              <ChevronUp className="mr-1 h-3 w-3" />
            ) : (
              <ChevronDown className="mr-1 h-3 w-3" />
            )}
            Gestão da trade (IA)
          </Button>
        </div>

        {showAnalysis && (
          <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            {loadingAnalysis ? (
              <p className="flex items-center gap-2 text-sm text-purple-300">
                <Loader2 className="h-4 w-4 animate-spin" /> A analisar a gestão da trade...
              </p>
            ) : analysisError ? (
              <p className="text-sm text-red-300">{analysisError}</p>
            ) : analysis ? (
              <MarkdownRenderer content={analysis} />
            ) : (
              <p className="text-sm text-gray-400">Sem análise disponível.</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-gray-500">
          <span>{alert.strategy || "Scanner MTM"}</span>
          <span>{fmtDate(alert.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AlertasMtm() {
  const [alerts, setAlerts] = useState<MtmAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dirFilter, setDirFilter] = useState<"all" | "buy" | "sell">("all")
  const [classFilter, setClassFilter] = useState<"all" | AssetClass>("all")
  const [tfFilter, setTfFilter] = useState<string>("all")
  const [stratFilter, setStratFilter] = useState<string>("all")
  const [stateFilter, setStateFilter] = useState<"all" | StateCat>("all")
  const searchRef = useRef("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = searchRef.current ? `?symbol=${encodeURIComponent(searchRef.current)}` : ""
      const res = await fetch(`/api/mtm-alerts${q}`, { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao carregar alertas")
      setAlerts(data.alerts || [])
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar alertas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel("mtm-alerts-signals")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tradingview_signals" },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const tfOptions = [...new Set(alerts.map((a) => a.timeframe).filter(Boolean))] as string[]
  const stratOptions = [...new Set(alerts.map((a) => a.strategy).filter(Boolean))] as string[]

  const visible = alerts.filter((a) => {
    if (dirFilter !== "all" && a.direction !== dirFilter) return false
    if (classFilter !== "all" && classifyAssetClient(a.ticker) !== classFilter) return false
    if (tfFilter !== "all" && a.timeframe !== tfFilter) return false
    if (stratFilter !== "all" && a.strategy !== stratFilter) return false
    if (stateFilter !== "all" && stateCategory(a.tradeStatus) !== stateFilter) return false
    return true
  })

  // Desempenho (respeita ativo/classe/timeframe/estratégia/direção, ignora o filtro de estado
  // para os contadores refletirem sempre o universo filtrado)
  const perfBase = alerts.filter((a) => {
    if (dirFilter !== "all" && a.direction !== dirFilter) return false
    if (classFilter !== "all" && classifyAssetClient(a.ticker) !== classFilter) return false
    if (tfFilter !== "all" && a.timeframe !== tfFilter) return false
    if (stratFilter !== "all" && a.strategy !== stratFilter) return false
    return true
  })
  const perf = perfBase.reduce(
    (acc, a) => {
      acc[stateCategory(a.tradeStatus)]++
      return acc
    },
    { pending: 0, active: 0, win: 0, loss: 0 } as Record<StateCat, number>
  )
  const closed = perf.win + perf.loss
  const winRate = closed > 0 ? Math.round((perf.win / closed) * 100) : null

  const STATE_TABS: { key: "all" | StateCat; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Todos", count: perfBase.length, cls: "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" },
    { key: "pending", label: "Pendentes", count: perf.pending, cls: "border-amber-500 bg-amber-500/15 text-amber-300" },
    { key: "active", label: "Ativas", count: perf.active, cls: "border-blue-500 bg-blue-500/15 text-blue-300" },
    { key: "win", label: "Wins", count: perf.win, cls: "border-green-500 bg-green-500/15 text-green-300" },
    { key: "loss", label: "Loss", count: perf.loss, cls: "border-red-500 bg-red-500/15 text-red-300" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#D2A63C]" />
          <h3 className="text-lg font-semibold text-white">Alertas MTM ao Vivo</h3>
          <Badge className="border-green-500/30 bg-green-500/10 text-green-400">{visible.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "buy", "sell"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirFilter(d)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                dirFilter === d
                  ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
                  : "border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {d === "all" ? "Todos" : d === "buy" ? "Compras" : "Vendas"}
            </button>
          ))}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  searchRef.current = search.trim().toUpperCase()
                  load()
                }
              }}
              placeholder="Filtrar ativo"
              className="h-9 w-36 border-gray-700 bg-black/60 pl-8 text-sm text-white"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              searchRef.current = search.trim().toUpperCase()
              load()
            }}
            className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filtros: classe · timeframe · estratégia */}
      <div className="flex flex-wrap gap-2">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as "all" | AssetClass)}
          className="rounded-md border border-gray-700 bg-black/60 px-2.5 py-1.5 text-xs text-gray-200"
        >
          <option value="all">Todas as classes</option>
          {(Object.keys(CLASS_LABELS) as AssetClass[]).map((c) => (
            <option key={c} value={c}>{CLASS_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={tfFilter}
          onChange={(e) => setTfFilter(e.target.value)}
          className="rounded-md border border-gray-700 bg-black/60 px-2.5 py-1.5 text-xs text-gray-200"
        >
          <option value="all">Todos os timeframes</option>
          {tfOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={stratFilter}
          onChange={(e) => setStratFilter(e.target.value)}
          className="rounded-md border border-gray-700 bg-black/60 px-2.5 py-1.5 text-xs text-gray-200"
        >
          <option value="all">Todas as estratégias</option>
          {stratOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(classFilter !== "all" || tfFilter !== "all" || stratFilter !== "all" || dirFilter !== "all" || stateFilter !== "all") && (
          <button
            onClick={() => {
              setClassFilter("all")
              setTfFilter("all")
              setStratFilter("all")
              setDirFilter("all")
              setStateFilter("all")
            }}
            className="rounded-md border border-gray-700 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Estado / desempenho: Pendentes · Ativas · Wins · Loss + win rate */}
      <div className="flex flex-col gap-2 rounded-lg border border-[#D2A63C]/20 bg-black/40 p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStateFilter(t.key)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                stateFilter === t.key ? t.cls : "border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
              <span className="rounded bg-black/40 px-1 text-[10px]">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Win rate</span>
          <span
            className={`font-mono font-bold ${
              winRate == null ? "text-gray-500" : winRate >= 50 ? "text-green-400" : "text-red-400"
            }`}
          >
            {winRate == null ? "—" : `${winRate}%`}
          </span>
          <span className="text-gray-600">({perf.win}W · {perf.loss}L)</span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A carregar alertas...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-lg border border-gray-700 bg-black/40 py-12 text-center text-gray-500">
          <Bell className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>Ainda não há sinais. Os alertas dos scanners aparecem aqui em tempo real.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-gray-600">
        ⚠️ Sinais educativos gerados pelos scanners MTM. Não constituem aconselhamento financeiro.
      </p>
    </div>
  )
}
