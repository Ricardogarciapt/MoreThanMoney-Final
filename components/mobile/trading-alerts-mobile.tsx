"use client"

import { aquecerWebtrader } from "@/components/funded/pre-carga"
import { SinalPremiumBloqueado } from "@/components/sinal-premium-bloqueado"
import { linkWebtrader } from "@/lib/mtmfunded/link-webtrader"
import { useSearchParams } from "next/navigation"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { montarVista, naSubscricao } from "@/lib/mtm-alerts/vista"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
// O catálogo (estratégias, grupos de activos, timeframes) vive em lib/alertas/catalogo — era
// mantido à mão aqui e no desktop, e já não batiam certo. A guarda catalogo.check.ts falha se voltar.
import {
  ESTRATEGIAS,
  GRUPOS_DE_ACTIVOS,
  TIMEFRAMES,
  TOTAL_DE_ACTIVOS,
  cabecalhoDoSelector,
  normalizarEstrategiasSubscricao,
} from "@/lib/alertas/catalogo"
import { semCripto, ehSimboloCripto } from "@/lib/ios-sem-cripto"
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
import { scannerLabel } from "@/lib/mtm-alerts/scanners"
// Dentro das apps nativas a sessão NÃO viaja em cookie — vai no cabeçalho. Sem isto, o
// servidor respondia 401 e o ecrã mostrava zeros com o nome da pessoa no topo.
import { authHeaders } from "@/lib/auth-token"
import { DEFAULT_ALERT_SYMBOLS } from "@/lib/mtm-alerts/defaults"
import { scannerStudies } from "@/lib/scanners/estudos"

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

/**
 * Os estudos publicados de cada scanner — para sobrepor no gráfico o MESMO study que gerou o alerta.
 *
 * DERIVA da tabela canónica (`lib/scanners/estudos.ts`) em vez de a repetir. A lista estava aqui
 * copiada à mão e divergiu: a Aurum Flow ficou com o id antigo e o Sensei com dois ids diferentes
 * conforme o ficheiro. Uma cópia de uma lista de ids acaba sempre assim — é o que o próprio
 * ficheiro canónico avisa no cabeçalho.
 *
 * A ÚNICA diferença deliberada é o Sensei: aqui usa-se a variante «sem painéis» (só plots, sem as
 * tabelas laterais), porque no telemóvel as tabelas tapam o gráfico. É por isso que se sobrepõe
 * uma entrada em vez de se copiar a tabela toda.
 */
const SCANNER_STUDIES: Record<string, string[]> = {
  ...scannerStudies,
  Sensei: ["PUB;25c2231a331e413b8e7498364c5b94ab"],
}

type StudySpec = string | { id: string; inputs?: Record<string, unknown> }

/** Resolve o study do scanner a partir do nome que vem no alerta (strategy/alert_name). */
function resolveStudies(strategy: string | null): StudySpec[] | undefined {
  const s = (strategy ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (!s) return undefined
  if (s.includes("aurum")) return SCANNER_STUDIES.AurumFlow // estudo próprio (não é o do Sensei)
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
  closed: { label: "Fechada", cls: "border-gray-500/40 bg-gray-500/10 text-gray-300" },
}
interface Subscription {
  enabled: boolean
  push_enabled: boolean
  symbols: string[]
  strategies: string[]
  timeframes: string[]
}

// A lista vive em lib/mtm-alerts/defaults.ts — era mantida a dobrar.
/**
 * App iOS: a subscrição por defeito não nasce com BTCUSD. Os alertas cripto já eram escondidos da
 * lista, mas o símbolo ficava na subscrição guardada — e voltava pelo push. O mesmo que a watchlist
 * faz aos favoritos (components/funded/funded-watchlist.tsx::lerFavoritos).
 */
const simbolosIniciais = () => (semCripto() ? DEFAULT_ALERT_SYMBOLS.filter((s) => !ehSimboloCripto(s)) : DEFAULT_ALERT_SYMBOLS)

/**
 * App iOS: os MTM Alerts não mostram alertas cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
 * Filtra-se aqui, na interface; a rota /api/mtm-alerts fica igual para o site e o Android.
 */
const alertaCripto = (a: { ticker?: string | null; tvSymbol?: string | null; crypto?: unknown }) =>
  a.crypto != null || ehSimboloCripto(a.ticker) || ehSimboloCripto(a.tvSymbol)
const semAlertasCripto = <T extends { ticker?: string | null; tvSymbol?: string | null; crypto?: unknown }>(lista: T[]): T[] =>
  semCripto() ? lista.filter((a) => !alertaCripto(a)) : lista

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
          headers: await authHeaders(),
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
          headers: await authHeaders({ "Content-Type": "application/json" }),
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
          {alert.outcomePips != null && (
            <Badge
              className={`border text-[10px] font-bold font-mono ${
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
        </div>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock className="h-3 w-3" />
          {timeAgo(alert.createdAt)}
        </span>
      </div>
      {alert.strategy && (
        <p className="mt-0.5 text-[11px] text-blue-300">{scannerLabel(alert.strategy)}</p>
      )}

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

      {alert.bloqueado ? (
        <SinalPremiumBloqueado compacto />
      ) : (
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
      )}

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

      {/* Ações: Gestão IA + Seguir sinal (não num sinal pago sem direito — não há o que gerir) */}
      {!alert.bloqueado && (
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
      )}
      {/* Negociar numa conta simulada MTM Funded: abre o WebTrader com o ticket pré-preenchido.
          Não envia nada — o trader escolhe a conta, o volume e confirma. */}
      {alert.direction !== "neutral" && (alert.ticker || alert.tvSymbol) && (
        <a
          href={linkWebtrader({
            symbol: String(alert.tvSymbol || alert.ticker), dir: alert.direction,
            sl: alert.stopLoss, tp: alert.takeProfits[0], origem: "scanner", ref: alert.id,
          }, true)}
          onPointerEnter={() => aquecerWebtrader(String(alert.tvSymbol || alert.ticker))}
          onTouchStart={() => aquecerWebtrader(String(alert.tvSymbol || alert.ticker))}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-300"
        >
          <TrendingUp className="h-3 w-3" />
          Negociar no Web trader
        </a>
      )}
      {alert.tvSymbol && (
        <button
          onClick={() => setShowChart((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2 py-1.5 text-[11px] font-medium text-[#D2A63C]"
        >
          <LineChart className="h-3 w-3" />
          {showChart ? "Ver imagem do sinal" : "Gráfico ao vivo"}
        </button>
      )}
      {following && !alert.bloqueado && <MobileSignalTracker alert={alert} />}
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
  const searchParams = useSearchParams()
  const { toast } = useToast()
  /**
   * «Só o que sigo» — DESLIGADO por omissão.
   *
   * A subscrição nasce com sete símbolos e a casa sinaliza em dezenas. Usada como filtro da lista,
   * escondia quase tudo: a 01/10 entraram 470 alertas em 24 h e o ecrã dizia «não há alertas».
   * Ela existe para decidir o que te é ENVIADO, não o que te é mostrado quando abres a lista de
   * propósito. Ver lib/mtm-alerts/vista.ts.
   */
  const [soOQueSigo, setSoOQueSigo] = useState(false)
  const [sub, setSub] = useState<Subscription>({
    enabled: true, push_enabled: true, symbols: simbolosIniciais(), strategies: [], timeframes: [],
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
      const res = await fetch("/api/mtm-alerts/follow", { credentials: "include", cache: "no-store", headers: await authHeaders() })
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
        headers: await authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ signalId: id, follow }),
      })
    } catch {
      /* otimista */
    }
  }, [])

  const loadSub = useCallback(async () => {
    try {
      const res = await fetch("/api/mtm-alerts/subscriptions", { credentials: "include", cache: "no-store", headers: await authHeaders() })
      const data = await res.json()
      if (data.success && data.subscription)
        setSub((prev) => ({
          ...prev,
          ...data.subscription,
          // Chaves canónicas: a base tem linhas antigas em maiúsculas e com estratégias que nunca
          // existiram nos alertas (GOLDENZONE, KILLSHOT) — era o «ESTRATÉGIAS (6)» com 4 chips.
          strategies: normalizarEstrategiasSubscricao(data.subscription.strategies),
        }))
    } catch {
      /* usa defaults */
    }
  }, [])

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mtm-alerts?limit=40", { credentials: "include", cache: "no-store", headers: await authHeaders() })
      const data = await res.json()
      setAlerts(semAlertasCripto(data.alerts || []))
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
  // Depende do searchParams, não de [] : dentro das apps o cliente já está nesta página quando
  // toca na notificação, e um efeito que só corre à montagem nunca voltava a ver o ?signal novo.
  const alertaParam = searchParams?.get("signal") ?? null
  useEffect(() => {
    const sigId = alertaParam
    if (!sigId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/mtm-alerts?id=${encodeURIComponent(sigId)}`, { credentials: "include", cache: "no-store", headers: await authHeaders() })
        const data = await res.json()
        if (!cancelled && data.alerts?.[0] && semAlertasCripto([data.alerts[0] as MtmAlert]).length) setFocusAlert(data.alerts[0] as MtmAlert)
      } catch {
        /* ignora */
      }
    })()
    return () => { cancelled = true }
  }, [alertaParam])

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
        headers: await authHeaders({ "Content-Type": "application/json" }),
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

  // Feed filtrado às preferências — a MESMA regra que a vista usa (lib/mtm-alerts/vista), não
  // uma cópia dela: duas cópias davam contagens e lista a discordar.
  const subFiltered = useMemo(() => alerts.filter((a) => naSubscricao(a, sub)), [alerts, sub])

  // Desempenho dos alertas subscritos + feed final (com filtro de estado)
  const perf = useMemo(() => {
    const acc = { pending: 0, active: 0, win: 0, loss: 0 } as Record<StateCat, number>
    // As contagens dos separadores seguem a MESMA base que a lista: com os números a contar uma
    // coisa e a lista a mostrar outra, o ecrã parece partido mesmo quando está certo.
    const base = soOQueSigo ? subFiltered : alerts
    base.forEach((a) => acc[stateCategory(a.tradeStatus)]++)
    return acc
  }, [subFiltered, alerts, soOQueSigo])
  const winRate = perf.win + perf.loss > 0 ? Math.round((perf.win / (perf.win + perf.loss)) * 100) : null
  // Pedido Ricardo 2026-08-20: a vista "Todos" mostra só sinais VIVOS (pendentes+ativos);
  // os terminados ficam nos separadores Wins/Loss com pips/% do desfecho (e nas métricas).
  const vista = useMemo(
    () => montarVista(alerts, { sub, soOQueSigo, estado: stateFilter }),
    [alerts, sub, soOQueSigo, stateFilter],
  )
  const visible = vista.visiveis
  const STATE_TABS: { key: "all" | StateCat; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Ativos", count: perf.pending + perf.active, cls: "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" },
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
              {/* «ATIVOS (7)» lia-se como 7 categorias; eram 7 símbolos seleccionados. Agora diz de quantos. */}
              {cabecalhoDoSelector("Ativos", sub.symbols.length, TOTAL_DE_ACTIVOS)}
            </p>
            <div className="space-y-1.5">
              {GRUPOS_DE_ACTIVOS.filter((g) => !(g.chave === "crypto" && semCripto())).map((g) => {
                const simbolos = g.simbolos.filter((s) => !(semCripto() && ehSimboloCripto(s)))
                if (simbolos.length === 0) return null
                const selected = simbolos.filter((s) => sub.symbols.includes(s)).length
                return (
                  <details key={g.chave} className="rounded-lg border border-[#D2A63C]/15 bg-black/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-gray-300">
                      <span>{g.rotulo}</span>
                      <span className="text-[10px] text-gray-500">{selected ? `${selected}/${simbolos.length}` : `${simbolos.length} ativos`}</span>
                    </summary>
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                      {simbolos.map((s) => (
                        <Chip key={s} label={s} active={sub.symbols.includes(s)} onClick={() => toggle("symbols", s)} />
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {cabecalhoDoSelector("Estratégias", sub.strategies.length, ESTRATEGIAS.length)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ESTRATEGIAS.map((s) => (
                <Chip
                  key={s.chave}
                  label={s.rotulo}
                  active={sub.strategies.includes(s.valorSubscricao)}
                  onClick={() => toggle("strategies", s.valorSubscricao)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {cabecalhoDoSelector("Timeframes", sub.timeframes.length, TIMEFRAMES.length)}
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

      {/*
        O INTERRUPTOR DO FILTRO — visível, e a dizer quanto está a esconder.
        Um filtro que esconde sem se ver não é um filtro: é um ecrã partido. Era isso que fazia
        parecer que não havia alertas quando tinham entrado 470 em 24 horas.
      */}
      {!loading && (
        <button
          type="button"
          onClick={() => setSoOQueSigo((v) => !v)}
          className={cn(
            "mb-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors",
            soOQueSigo ? "border-[#D2A63C] bg-[#D2A63C]/10 text-[#E9C46A]" : "border-gray-700 text-gray-400",
          )}
        >
          <span>{soOQueSigo ? "Só o que sigo" : "Todos os alertas"}</span>
          <span className="text-gray-500">
            {soOQueSigo
              ? vista.escondidosPelaSubscricao > 0
                ? `+${vista.escondidosPelaSubscricao} escondidos · toca para ver todos`
                : "toca para ver todos"
              : "toca para filtrar pelos teus"}
          </span>
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A carregar alertas...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-black/40 py-12 text-center text-gray-500">
          <Bell className="mx-auto mb-3 h-10 w-10 opacity-40" />
          {/*
            O vazio diz PORQUÊ. «Sem alertas para os teus ativos» era mentira quando havia 470 a
            chegar — e um vazio que não se explica manda a pessoa recarregar a página para sempre.
          */}
          <p className="px-6 text-sm">
            {vista.motivoDoVazio === "nada_chegou" && "Ainda não chegou nenhum alerta."}
            {vista.motivoDoVazio === "subscricao" && (
              <>
                Há alertas, mas nenhum nos teus ativos.{" "}
                <button type="button" onClick={() => setSoOQueSigo(false)} className="text-[#D2A63C] underline">
                  Ver todos
                </button>
              </>
            )}
            {vista.motivoDoVazio === "estado" && (
              <>
                Nenhum alerta neste estado agora.
                {vista.escondidosPeloEstado > 0 && ` Há ${vista.escondidosPeloEstado} noutros separadores.`}
              </>
            )}
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
