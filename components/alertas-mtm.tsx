"use client"

import { aquecerWebtrader } from "@/components/funded/pre-carga"
import { SinalPremiumBloqueado } from "@/components/sinal-premium-bloqueado"
import { linkWebtrader, estaNaAppMobile } from "@/lib/mtmfunded/link-webtrader"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import MarkdownRenderer from "@/components/dashboard-gestao/markdown-renderer"
import TvChartEmbed from "@/components/tv-chart-embed"
import { supabase } from "@/lib/supabase"
import { scannerFilterOptions, scannerKeyFromStrategy, scannerLabel } from "@/lib/mtm-alerts/scanners"
import { classifyOutcome, winRate as calcWinRate, fullWinShare, emptyTally, type OutcomeCat } from "@/lib/mtm-alerts/outcome"
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
  Radio,
  CandlestickChart,
} from "lucide-react"
import { scannerStudies } from "@/lib/scanners/estudos"

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
  outcomePips: number | null
  outcomePct: number | null
  outcomeUnit: "pips" | "pontos"
  /** Sinal pago sem direito: a API não mandou o conteúdo (lib/direito-sinais). */
  bloqueado?: boolean
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
  discarded: { label: "Descartado", cls: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
  expired: { label: "Expirado", cls: "border-slate-500/40 bg-slate-500/10 text-slate-400" },
  closed: { label: "Fechada", cls: "border-gray-500/40 bg-gray-500/10 text-gray-300" },
}

/** Categoria de desempenho para filtro e estatísticas dos alertas. */
type StateCat = OutcomeCat
/** Classificação vinda do módulo canónico — inclui GANHO PARCIAL (tocou um alvo mas não o último). */
function stateCategory(tradeStatus: string | null, tpCount?: number): StateCat {
  return classifyOutcome(tradeStatus, tpCount)
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
 * Estratégias dos Alertas MTM — as que geram alarmes por webhook para o site.
 *
 * DERIVA da tabela canónica (`lib/scanners/estudos.ts`) em vez de a repetir: esta lista estava
 * copiada à mão e a Aurum Flow ficou com o id antigo quando o estudo foi republicado. Um id
 * desactualizado aqui é pior do que não ter estudo nenhum — o gráfico abre com os plots de OUTRA
 * estratégia e parece que o sinal veio dali.
 *
 * A única diferença deliberada é o Sensei, na variante «sem painéis» (só plots).
 */
const STRATEGY_STUDIES: Record<string, string[]> = {
  Goldkiller: scannerStudies.Goldkiller,
  MTMScanner: scannerStudies.MTMScanner,
  AurumFlow: scannerStudies.AurumFlow,
  Sensei: ["PUB;25c2231a331e413b8e7498364c5b94ab"],
}
const DEFAULT_STUDIES = STRATEGY_STUDIES.MTMScanner

/** Resolve o study certo a partir do nome da estratégia do alerta (só 3 estratégias). */
function studiesForStrategy(strategy: string | null): string[] {
  if (!strategy) return DEFAULT_STUDIES
  const norm = strategy.toLowerCase().replace(/[^a-z0-9]/g, "")
  // Aurum ANTES do resto: o nome dela contém "MTM" e cairia no scanner genérico.
  if (norm.includes("aurum")) return STRATEGY_STUDIES.AurumFlow
  if (norm.includes("sensei")) return STRATEGY_STUDIES.Sensei
  if (norm.includes("goldkiller") || (norm.includes("gold") && norm.includes("kill"))) return STRATEGY_STUDIES.Goldkiller
  if (norm.includes("scanner") || norm.includes("mtmscanner")) return STRATEGY_STUDIES.MTMScanner
  return DEFAULT_STUDIES
}

/** Estratégia do alerta → chave de scanner do ScannerMobile (para abrir no gráfico). */
export function strategyToScannerKey(strategy: string | null): "Goldkiller" | "MTMScanner" | "Sensei" | "AurumFlow" {
  // Delega no normalizador canónico partilhado (lib/mtm-alerts/scanners) e mapeia para as chaves
  // que o gráfico usa. A Aurum tem estudo próprio: abrir o gráfico de um alerta dela com os plots
  // do MTM Scanner mostrava a leitura errada por baixo do sinal certo.
  const k = scannerKeyFromStrategy(strategy)
  if (k === "sensei") return "Sensei"
  if (k === "goldkiller") return "Goldkiller"
  if (k === "aurum") return "AurumFlow"
  return "MTMScanner"
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

/** Acompanhamento da ação de preço de um sinal seguido (sem execução). */
function SignalTracker({
  ticker,
  entry,
  stopLoss,
  takeProfits,
  direction,
}: {
  ticker: string | null
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  direction: "buy" | "sell" | "neutral"
}) {
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ticker) return
    let active = true
    const run = async () => {
      try {
        const res = await fetch(`/api/mtm-alerts/price?ticker=${encodeURIComponent(ticker)}`, {
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
  }, [ticker])

  const dir = direction === "sell" ? "sell" : "buy"
  const pnlPct =
    price != null && entry != null && entry !== 0
      ? ((dir === "buy" ? price - entry : entry - price) / entry) * 100
      : null
  const reached = (lvl: number) => (price == null ? false : dir === "buy" ? price >= lvl : price <= lvl)
  const slHit = price != null && stopLoss != null && (dir === "buy" ? price <= stopLoss : price >= stopLoss)
  const distPct = (lvl: number) => (price != null && price !== 0 ? ((lvl - price) / price) * 100 : null)

  return (
    <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
          <Radio className="h-3.5 w-3.5 animate-pulse" /> A acompanhar preço
        </span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
        ) : (
          <span className="font-mono text-sm font-bold text-white">{fmt(price)}</span>
        )}
      </div>
      {pnlPct != null && (
        <p className={`mb-2 text-center text-sm font-bold ${pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
          {pnlPct >= 0 ? "+" : ""}
          {pnlPct.toFixed(2)}% desde a entrada
        </p>
      )}
      <div className="space-y-1 text-[11px]">
        {stopLoss != null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">🛑 Stop</span>
            <span className="font-mono text-red-300">
              {fmt(stopLoss)}
              {distPct(stopLoss) != null && <span className="ml-1 text-gray-500">({distPct(stopLoss)!.toFixed(2)}%)</span>}
              {slHit && <span className="ml-1 text-red-400">• atingido</span>}
            </span>
          </div>
        )}
        {takeProfits.map((tp, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-gray-400">🎯 Exit {i + 1}</span>
            <span className="font-mono text-green-300">
              {fmt(tp)}
              {distPct(tp) != null && <span className="ml-1 text-gray-500">({distPct(tp)!.toFixed(2)}%)</span>}
              {reached(tp) && <span className="ml-1 text-green-400">• atingido</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-500">Só acompanhamento — sem execução automática.</p>
    </div>
  )
}

function AlertCard({
  alert,
  following,
  onToggleFollow,
  onSelectAlert,
}: {
  alert: MtmAlert
  following: boolean
  onToggleFollow: (id: string, follow: boolean) => void
  onSelectAlert?: (p: { tvSymbol: string; interval: string; scannerKey: "Goldkiller" | "MTMScanner" | "Sensei" | "AurumFlow" }) => void
}) {
  const pathname = usePathname()
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

  const cardClickable = Boolean(onSelectAlert && alert.tvSymbol)
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardClickable) return
    // Não intercepta cliques em controlos (botões, links, inputs)
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return
    onSelectAlert!({
      tvSymbol: alert.tvSymbol!,
      interval: alert.timeframe && /^\d+$/.test(alert.timeframe) ? alert.timeframe : "60",
      scannerKey: strategyToScannerKey(alert.strategy),
    })
  }

  return (
    <Card
      onClick={handleCardClick}
      title={cardClickable ? "Abrir no gráfico do scanner" : undefined}
      className={`border-[#D2A63C]/20 bg-gradient-to-br from-[#141414] to-black ${
        cardClickable ? "cursor-pointer transition-colors hover:border-[#D2A63C]/60" : ""
      }`}
    >
      <CardContent className="p-4">
        {/* Strategy badge */}
        {alert.strategy && (
          <Badge className="mb-2 border-blue-500/30 bg-blue-500/10 text-blue-300">
            <LineChart className="mr-1 h-3 w-3" />
            {scannerLabel(alert.strategy)}
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
          {alert.outcomePips != null && (
            <Badge
              className={`border font-bold font-mono ${
                alert.outcomePips > 0
                  ? "border-green-500/40 bg-green-500/10 text-green-300"
                  : alert.outcomePips < 0
                    ? "border-red-500/40 bg-red-500/15 text-red-400"
                    : "border-gray-500/40 bg-gray-500/10 text-gray-300"
              }`}
            >
              {alert.outcomePips > 0 ? "▲ +" : alert.outcomePips < 0 ? "▼ " : ""}
              {alert.outcomePips} {alert.outcomeUnit}
              {alert.outcomePct != null ? ` · ${alert.outcomePct > 0 ? "+" : ""}${alert.outcomePct}%` : ""}
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            {timeAgo(alert.createdAt)}
          </span>
        </div>

        {alert.session && <p className="mt-1 text-xs text-gray-500">🌍 {alert.session}</p>}

        {/* Gráfico: imagem do sinal por defeito; o botão "Gráfico ao vivo" alterna para o live. */}
        {showChart && alert.tvSymbol ? (
          <div className="mt-3">
            <TvChartEmbed
              tvSymbol={alert.tvSymbol}
              interval={alert.timeframe && /^\d+$/.test(alert.timeframe) ? alert.timeframe : "60"}
              height={280}
              compact
              studies={studiesForStrategy(alert.strategy)}
            />
          </div>
        ) : alert.chartImageUrl ? (
          <a
            href={alert.chartImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block overflow-hidden rounded-lg border border-gray-600/40"
          >
            <div className="flex items-center justify-between bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">
              <span>Gráfico do sinal</span>
              <span className="text-[#D2A63C]">Abrir ↗</span>
            </div>
            <img
              src={alert.chartImageUrl}
              alt={`Gráfico ${alert.ticker}`}
              className="max-h-96 w-full bg-gray-900 object-contain"
              loading="lazy"
            />
          </a>
        ) : null}

        {/* Níveis — num sinal pago sem direito, o convite em vez de uma fila de «—» */}
        {alert.bloqueado ? (
          <SinalPremiumBloqueado />
        ) : (
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
        )}

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
          {alert.tvSymbol && onSelectAlert && (
            <Button
              size="sm"
              onClick={() =>
                onSelectAlert({
                  tvSymbol: alert.tvSymbol!,
                  interval: alert.timeframe && /^\d+$/.test(alert.timeframe) ? alert.timeframe : "60",
                  scannerKey: strategyToScannerKey(alert.strategy),
                })
              }
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
            >
              <LineChart className="mr-1 h-3 w-3" />
              Abrir no gráfico
            </Button>
          )}
          {alert.tvSymbol && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowChart((v) => !v)}
              className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10"
            >
              <LineChart className="mr-1 h-3 w-3" />
              {showChart ? "Ver imagem do sinal" : "Gráfico ao vivo"}
            </Button>
          )}
          {!alert.bloqueado && (
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
          )}
          {/* Negociar este sinal numa conta simulada MTM Funded: só pré-preenche o ticket. */}
          {alert.direction !== "neutral" && (alert.tvSymbol || alert.ticker) && (
            <Button asChild size="sm" variant="outline" className="border-[#2962FF]/50 text-[#8FA8FF] hover:bg-[#2962FF]/10">
              <a href={linkWebtrader({
                symbol: String(alert.tvSymbol || alert.ticker), dir: alert.direction,
                sl: alert.stopLoss, tp: alert.takeProfits[0], origem: "scanner", ref: alert.id,
              }, estaNaAppMobile(pathname))}
                onPointerEnter={() => aquecerWebtrader(String(alert.tvSymbol || alert.ticker))}
                onTouchStart={() => aquecerWebtrader(String(alert.tvSymbol || alert.ticker))}>
                <CandlestickChart className="mr-1 h-3 w-3" />
                Negociar no Web trader
              </a>
            </Button>
          )}
          {!alert.bloqueado && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleFollow(alert.id, !following)}
            className={
              following
                ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/20"
                : "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            }
          >
            <Radio className="mr-1 h-3 w-3" />
            {following ? "A seguir ✓" : "Seguir sinal"}
          </Button>
          )}
        </div>

        {following && !alert.bloqueado && (
          <SignalTracker
            ticker={alert.ticker}
            entry={alert.entry}
            stopLoss={alert.stopLoss}
            takeProfits={alert.takeProfits}
            direction={alert.direction}
          />
        )}

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

export default function AlertasMtm({
  onSelectAlert,
}: {
  onSelectAlert?: (p: { tvSymbol: string; interval: string; scannerKey: "Goldkiller" | "MTMScanner" | "Sensei" | "AurumFlow" }) => void
} = {}) {
  const [alerts, setAlerts] = useState<MtmAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dirFilter, setDirFilter] = useState<"all" | "buy" | "sell">("all")
  const [classFilter, setClassFilter] = useState<"all" | AssetClass>("all")
  const [tfFilter, setTfFilter] = useState<string>("all")
  const [stratFilter, setStratFilter] = useState<string>("all")
  const [stateFilter, setStateFilter] = useState<"all" | StateCat>("all")
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const searchRef = useRef("")

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
    loadFollowed()
  }, [load, loadFollowed])

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
  // Scanners CANÓNICOS (sem duplicados): as variantes do payload ("MTM Aurum Flow ORB/v8/…",
  // "MTM Sensei X") colapsam no scanner respetivo — antes cada variante virava uma opção.
  const stratOptions = scannerFilterOptions(alerts.map((a) => a.strategy))

  const visible = alerts.filter((a) => {
    if (dirFilter !== "all" && a.direction !== dirFilter) return false
    if (classFilter !== "all" && classifyAssetClient(a.ticker) !== classFilter) return false
    if (tfFilter !== "all" && a.timeframe !== tfFilter) return false
    if (stratFilter !== "all" && scannerKeyFromStrategy(a.strategy) !== stratFilter) return false
    // "Todos" mostra só sinais VIVOS (pendentes+ativas); terminados ficam nos separadores
    // próprios com pips/% do desfecho. O nº de alvos entra na classificação para separar o
    // ganho PARCIAL (tocou um alvo mas não o último) do ganho completo.
    const cat = stateCategory(a.tradeStatus, a.takeProfits?.length)
    if (stateFilter === "all") {
      if (cat !== "pending" && cat !== "active") return false
    } else if (cat !== stateFilter) return false
    return true
  })

  // Desempenho (respeita ativo/classe/timeframe/estratégia/direção, ignora o filtro de estado
  // para os contadores refletirem sempre o universo filtrado)
  const perfBase = alerts.filter((a) => {
    if (dirFilter !== "all" && a.direction !== dirFilter) return false
    if (classFilter !== "all" && classifyAssetClient(a.ticker) !== classFilter) return false
    if (tfFilter !== "all" && a.timeframe !== tfFilter) return false
    if (stratFilter !== "all" && scannerKeyFromStrategy(a.strategy) !== stratFilter) return false
    return true
  })
  const perf = perfBase.reduce((acc, a) => {
    acc[stateCategory(a.tradeStatus, a.takeProfits?.length)]++
    return acc
  }, emptyTally())
  const winRate = calcWinRate(perf)
  const parteCompleta = fullWinShare(perf)

  const STATE_TABS: { key: "all" | StateCat; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Ativos", count: perf.pending + perf.active, cls: "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" },
    { key: "pending", label: "Pendentes", count: perf.pending, cls: "border-amber-500 bg-amber-500/15 text-amber-300" },
    { key: "active", label: "Ativas", count: perf.active, cls: "border-blue-500 bg-blue-500/15 text-blue-300" },
    { key: "win", label: "Ganhos", count: perf.win, cls: "border-green-500 bg-green-500/15 text-green-300" },
    { key: "partial_win", label: "Parciais", count: perf.partial_win, cls: "border-teal-500 bg-teal-500/15 text-teal-300" },
    { key: "loss", label: "Perdas", count: perf.loss, cls: "border-red-500 bg-red-500/15 text-red-300" },
    { key: "discarded", label: "Descartados", count: perf.discarded, cls: "border-slate-500 bg-slate-500/15 text-slate-300" },
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
          {stratOptions.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
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
          <span className="text-gray-600">
            ({perf.win}W · {perf.partial_win}P · {perf.loss}L
            {parteCompleta != null ? ` · ${parteCompleta}% até ao último alvo` : ""})
          </span>
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
            <AlertCard
              key={a.id}
              alert={a}
              following={followed.has(a.id)}
              onToggleFollow={toggleFollow}
              onSelectAlert={onSelectAlert}
            />
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-gray-600">
        ⚠️ Sinais educativos gerados pelos scanners MTM. Não constituem aconselhamento financeiro.
      </p>
    </div>
  )
}
