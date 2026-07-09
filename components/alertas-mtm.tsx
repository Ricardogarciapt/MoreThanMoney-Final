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
const MOMENTUM_STUDIES = ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"]

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
  const dir = DIR_META[alert.direction]
  const passed = alert.confirmations.filter((c) => c.passed).length

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
                studies={MOMENTUM_STUDIES}
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
          {alert.aiAnalysis && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAnalysis((v) => !v)}
              className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
            >
              {showAnalysis ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              Gestão da trade (IA)
            </Button>
          )}
        </div>

        {showAnalysis && alert.aiAnalysis && (
          <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <MarkdownRenderer content={alert.aiAnalysis} />
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
    return true
  })

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
        {(classFilter !== "all" || tfFilter !== "all" || stratFilter !== "all" || dirFilter !== "all") && (
          <button
            onClick={() => {
              setClassFilter("all")
              setTfFilter("all")
              setStratFilter("all")
              setDirFilter("all")
            }}
            className="rounded-md border border-gray-700 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white"
          >
            Limpar filtros
          </button>
        )}
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
