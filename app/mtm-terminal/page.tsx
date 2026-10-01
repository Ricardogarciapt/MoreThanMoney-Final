"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import ProtectedPage from "@/components/protected-page"
import TvChartEmbed from "@/components/tv-chart-embed"
import { useAuth } from "@/contexts/auth-context"
import type { User } from "@/contexts/auth-context"
import { podeAcederPremiumUi, type PerfilUi } from "@/lib/perfil-ui"
import {
  TERMINAL_ASSETS,
  TERMINAL_TYPE_LABELS,
  type TerminalAsset,
  type TerminalAssetType,
  type ReferenceInstrument,
} from "@/lib/mtm-terminal-assets"
import {
  analysisAgeState,
  BROKER_FRESH_MS,
  formatAge,
  liveBlockState,
  type LiveBlockState,
  type LiveQuote,
} from "@/lib/mtm-terminal-live"
import {
  basisAdjust,
  computeTechnicals,
  computeTerminalLevels,
  type Candle,
  type TerminalTechnicals,
} from "@/lib/mtm-terminal-technicals"
import {
  House,
  ChevronRight,
  BrainCircuit,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Sparkles,
  ShieldAlert,
  Radio,
  RefreshCw,
  Globe,
  Newspaper,
  Target,
  AlertTriangle,
  GraduationCap,
  Activity,
  Gauge,
  Waves,
  Clock,
} from "lucide-react"

/** Acesso: admin, VIP ou Premium — a MESMA regra das Apps MTM, e agora o mesmo código. */
function canAccessTerminal(user: User | null): boolean {
  return podeAcederPremiumUi(user as PerfilUi | null)
}

interface Dashboard {
  verdict: { direction: "BULLISH" | "BEARISH" | "NEUTRO"; conviction: string; rationale: string }
  macro?: string[]
  news?: { headline: string; impact: "alto" | "medio" | "baixo"; source?: string }[]
  scenarios?: { kind: "bull" | "base" | "bear"; movePct: number; triggers: string }[]
  levels?: { supports: number[]; resistances: number[] }
  risks?: string[]
  recommendation?: { bias: string; timing: string; risk: string }
  grounding?: { asOf: string; price: number | null; priceSource: string; webSearch: boolean; signals: number }
}

interface StoredAnalysis {
  dashboard: Dashboard
  generatedAt: string | null
  model: string | null
  quote: Partial<LiveQuote> | null
}

export default function MtmTerminalPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/mtm-terminal" loadingMessage="A verificar acesso ao Terminal MTM...">
      <TerminalGate />
    </ProtectedPage>
  )
}

function TerminalGate() {
  const { user } = useAuth()
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    if (user && !canAccessTerminal(user)) {
      router.replace("/upgrade")
      return
    }
    setChecked(true)
  }, [user, router])

  if (!checked || !user || !canAccessTerminal(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-[#D2A63C]" />
          <p className="text-gray-400">Terminal exclusivo para membros Premium, VIP e Admin.</p>
        </div>
      </div>
    )
  }
  return <TerminalContent />
}

/** Scanner Momentum MTM — dá ao cliente a perspetiva do ativo (4H por defeito). */
const MOMENTUM_STUDIES = ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"]

const DIR_META = {
  BULLISH: { cls: "border-green-500/40 bg-green-500/15 text-green-400", Icon: TrendingUp },
  BEARISH: { cls: "border-red-500/40 bg-red-500/15 text-red-400", Icon: TrendingDown },
  NEUTRO: { cls: "border-gray-500/40 bg-gray-500/15 text-gray-300", Icon: Minus },
} as const

const LIVE_POLL_MS = 3_000
const CANDLES_POLL_MS = 60_000
const GENERATE_TIMEOUT_MS = 130_000

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const a = Math.abs(v)
  const dp = a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 5 : 6
  return v.toLocaleString("pt-PT", { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** Corre `fn` a cada `ms` enquanto o separador está visível; pára quando fica escondido. */
function useVisibleInterval(fn: () => void, ms: number, deps: unknown[]) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      fnRef.current()
      timer = setInterval(() => fnRef.current(), ms)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVis = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}

function useNow(ms = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useVisibleInterval(() => setNow(Date.now()), ms, [])
  return now
}

function useLiveQuote(symbol: string) {
  const [quote, setQuote] = useState<LiveQuote | null>(null)
  const [error, setError] = useState(false)
  const current = useRef(symbol)
  const busy = useRef(false)
  useEffect(() => {
    current.current = symbol
    setQuote(null)
    setError(false)
  }, [symbol])
  useVisibleInterval(
    async () => {
      if (busy.current) return
      busy.current = true
      const sym = symbol
      try {
        const res = await fetch(`/api/mtm-terminal/live?symbol=${sym}`, { signal: AbortSignal.timeout(8_000) })
        const data = await res.json()
        if (current.current !== sym) return
        if (res.ok && data.quote) {
          setQuote(data.quote)
          setError(false)
        } else setError(true)
      } catch {
        if (current.current === sym) setError(true)
      } finally {
        busy.current = false
      }
    },
    LIVE_POLL_MS,
    [symbol],
  )
  return { quote, error }
}

/** Velas + a referência que as deu (o sameLevel é o DELA: as de reserva são reescaladas) + se já respondeu. */
function useCandles(symbol: string) {
  const [candles, setCandles] = useState<Candle[]>([])
  const [ref, setRef] = useState<ReferenceInstrument | null>(null)
  const [loaded, setLoaded] = useState(false)
  const current = useRef(symbol)
  useEffect(() => {
    current.current = symbol
    setCandles([])
    setRef(null)
    setLoaded(false)
  }, [symbol])
  useVisibleInterval(
    async () => {
      const sym = symbol
      try {
        const res = await fetch(`/api/mtm-terminal/candles?symbol=${sym}`, { signal: AbortSignal.timeout(10_000) })
        const data = await res.json()
        if (current.current !== sym) return
        setLoaded(true)
        if (!Array.isArray(data.velas) || !data.velas.length) return
        setCandles((data.velas as number[][]).map(([t, o, h, l, c]) => ({ t, o, h, l, c })))
        if (data.ref && typeof data.ref.sameLevel === "boolean") setRef(data.ref as ReferenceInstrument)
      } catch {
        /* mantém as últimas */
        if (current.current === sym) setLoaded(true)
      }
    },
    CANDLES_POLL_MS,
    [symbol],
  )
  return { candles, ref, loaded }
}

function TerminalContent() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<TerminalAsset>(TERMINAL_ASSETS[0])
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genSeconds, setGenSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const activeSymbolRef = useRef<string>(selected.symbol)

  const now = useNow()
  const { quote, error: quoteError } = useLiveQuote(selected.symbol)
  const { candles, ref: candlesRef, loaded: candlesLoaded } = useCandles(selected.symbol)
  const candlesSameLevel = (candlesRef ?? selected.ref).sameLevel

  // Números ao vivo: níveis e técnicos recalculados com o preço que está a chegar.
  const live = useMemo(() => {
    const price = quote?.price ?? null
    if (price == null || !candles.length) return { levels: null, technicals: null as TerminalTechnicals | null }
    const { candles: adj } = basisAdjust(candles, price, candlesSameLevel)
    return { levels: computeTerminalLevels(adj, price), technicals: computeTechnicals(adj, price) }
  }, [quote?.price, candles, candlesSameLevel])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? TERMINAL_ASSETS.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      : TERMINAL_ASSETS
    const map = new Map<TerminalAssetType, TerminalAsset[]>()
    for (const a of filtered) {
      if (!map.has(a.type)) map.set(a.type, [])
      map.get(a.type)!.push(a)
    }
    return map
  }, [search])

  const generate = useCallback(async (asset: TerminalAsset) => {
    activeSymbolRef.current = asset.symbol
    setGenerating(true)
    setGenSeconds(0)
    setError(null)
    setNotice(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS)
    const stillActive = () => activeSymbolRef.current === asset.symbol
    try {
      const res = await fetch("/api/mtm-terminal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol: asset.symbol }),
        signal: ctrl.signal,
      })
      const type = res.headers.get("content-type") || ""
      if (!type.includes("ndjson")) {
        const data = await res.json().catch(() => ({}))
        if (!stillActive()) return
        if (data.dashboard) {
          setAnalysis({ dashboard: data.dashboard, generatedAt: data.generatedAt ?? null, model: data.model ?? null, quote: data.quote ?? null })
        }
        if (res.status === 429) setNotice(data.error || "Aguarda uns minutos antes de pedir outra análise.")
        else setError(data.error || `Falha ao gerar análise (HTTP ${res.status})`)
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let done = false
      let finished = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          let msg: Record<string, any>
          try {
            msg = JSON.parse(line)
          } catch {
            continue
          }
          if (!stillActive()) continue
          if (msg.estado === "a_gerar") setGenSeconds(Number(msg.segundos) || 0)
          else if (msg.ok === true) {
            finished = true
            setAnalysis({ dashboard: msg.dashboard, generatedAt: msg.generatedAt ?? null, model: msg.model ?? null, quote: msg.quote ?? null })
          } else if (msg.ok === false) {
            finished = true
            setError(msg.error || "Falha ao gerar a análise")
          }
        }
      }
      if (!finished && stillActive()) {
        setError("A ligação terminou sem resposta (tempo limite do servidor). Tenta novamente daqui a pouco.")
      }
    } catch (err: any) {
      if (!stillActive()) return
      setError(
        err?.name === "AbortError"
          ? "A análise demorou mais de 2 minutos e foi cancelada. Tenta novamente daqui a pouco."
          : err?.message || "Erro ao gerar análise",
      )
    } finally {
      clearTimeout(timer)
      if (stillActive()) setGenerating(false)
    }
  }, [])

  // Ao abrir / mudar de ativo: mostra a análise guardada; só gera se ainda não existir nenhuma.
  useEffect(() => {
    activeSymbolRef.current = selected.symbol
    let cancelled = false
    setAnalysis(null)
    setError(null)
    setNotice(null)
    setGenerating(false)
    const load = async () => {
      setAnalysisLoading(true)
      try {
        const res = await fetch(`/api/mtm-terminal/analyze?symbol=${selected.symbol}`, {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled || activeSymbolRef.current !== selected.symbol) return
        // Análises do formato antigo (sem `grounding`) podiam trazer factos inventados: não se mostram, gera-se nova.
        if (res.ok && data.cached?.dashboard?.grounding) {
          setAnalysis({
            dashboard: data.cached.dashboard,
            generatedAt: data.cached.generatedAt ?? null,
            model: data.cached.model ?? null,
            quote: data.cached.quote ?? null,
          })
          return
        }
        if (!res.ok) {
          setError(data.error || "Análise guardada indisponível agora. Os preços e níveis continuam ao vivo.")
          return
        }
      } catch {
        if (!cancelled) setError("Não foi possível carregar a análise guardada. Os preços e níveis continuam ao vivo.")
        return
      } finally {
        if (!cancelled) setAnalysisLoading(false)
      }
      if (!cancelled) generate(selected)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.symbol])

  const ageMs = quote?.priceAt ? now - new Date(quote.priceAt).getTime() : null
  const quoteStale = ageMs != null && ageMs > Math.max(BROKER_FRESH_MS, 60_000)

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Breadcrumb */}
      <nav className="border-b border-[#D2A63C]/10 bg-black/50">
        <div className="container mx-auto px-4 py-2">
          <ol className="flex items-center space-x-2 text-sm">
            <li className="flex items-center">
              <Link href="/" className="flex items-center text-gray-400 hover:text-[#D2A63C]">
                <House className="mr-1 h-3 w-3" />
                <span className="sr-only">Início</span>
              </Link>
            </li>
            <li className="flex items-center">
              <ChevronRight className="mx-1 h-4 w-4 text-gray-500" />
            </li>
            <li className="flex items-center">
              <ChevronRight className="mx-1 h-4 w-4 text-gray-500" />
              <span className="text-[#D2A63C]">Terminal MTM</span>
            </li>
          </ol>
        </div>
      </nav>

      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-4">
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold md:text-4xl">
              <BrainCircuit className="h-8 w-8 text-[#D2A63C]" />
              <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                Terminal MTM
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400 md:text-base">
              Preço, níveis e técnicos ao vivo + leitura diária com IA, antes de negociares.
            </p>
          </div>
          <Badge className="border-[#D2A63C]/30 bg-[#D2A63C]/10 text-[#D2A63C]">
            <Sparkles className="mr-1 h-3 w-3" /> Premium · VIP · Admin
          </Badge>
        </div>
      </div>

      <div className="container mx-auto grid gap-4 px-4 pb-16 lg:grid-cols-[300px_1fr]">
        {/* Painel esquerdo — seleção */}
        <div className="space-y-4">
          <Card className="border-[#D2A63C]/20 bg-gradient-to-br from-[#BB8525]/10 to-black">
            <CardContent className="space-y-4 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar ativo..."
                  className="border-gray-700 bg-black/60 pl-9 text-white"
                />
              </div>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {Array.from(grouped.entries()).map(([type, assets]) => (
                  <div key={type}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      {TERMINAL_TYPE_LABELS[type]}
                    </p>
                    <div className="space-y-1">
                      {assets.map((a) => (
                        <button
                          key={a.symbol}
                          onClick={() => setSelected(a)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            selected.symbol === a.symbol
                              ? "border-[#D2A63C] bg-[#D2A63C]/15 text-white"
                              : "border-transparent bg-white/5 text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="font-medium">{a.name}</span>
                          <span className="text-xs text-gray-500">{a.symbol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                onClick={() => generate(selected)}
                disabled={generating || analysisLoading}
                className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]"
              >
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {generating ? `A gerar… ${genSeconds} s` : "Atualizar análise"}
              </Button>
              <p className="text-[11px] leading-snug text-gray-500">
                Preço e níveis atualizam sozinhos. O botão gera uma nova leitura com IA (1 por ativo a cada 5 min).
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Painel direito */}
        <div className="space-y-4">
          {/* Cotação ao vivo */}
          <Card className="border-[#D2A63C]/20 bg-black/60">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-lg font-semibold text-white">{selected.name}</p>
                <p className="text-xs text-gray-500">
                  Gráfico {selected.tvSymbol}
                  {selected.brokerSymbol ? ` · corretora ${selected.brokerSymbol}` : ""}
                </p>
              </div>
              {quote?.price != null ? (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold text-white">{fmtPrice(quote.price)}</p>
                    {quote.changePercent != null && (
                      <p className={`flex items-center justify-end gap-1 text-sm ${quote.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {quote.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}% ({quote.changeBasis === "24h" ? "24h" : "vs fecho anterior"})
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={quoteStale || quoteError ? "border-amber-500/40 text-amber-300" : "border-green-500/30 text-green-400"}
                    >
                      <Radio className={`mr-1 h-3 w-3 ${quoteStale || quoteError ? "" : "animate-pulse"}`} /> {quote.source}
                    </Badge>
                    <span className={`text-[11px] ${quoteStale ? "text-amber-300" : "text-gray-500"}`}>
                      {ageMs != null ? `último tick ${formatAge(ageMs)}` : ""}
                      {quoteStale ? " · mercado fechado ou sem ticks" : ""}
                      {quoteError ? " · a reconectar" : ""}
                    </span>
                    {!quote.sameLevel && (
                      <span className="text-[11px] text-amber-300">aproximação — pode diferir do gráfico</span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {quoteError ? "Preço ao vivo indisponível — a tentar de novo" : <><Loader2 className="h-3 w-3 animate-spin" /> A ligar ao preço ao vivo…</>}
                </span>
              )}
            </CardContent>
          </Card>

          <TvChartEmbed tvSymbol={selected.tvSymbol} interval="240" height={440} studies={MOMENTUM_STUDIES} />

          {/* Técnicos e níveis ao vivo */}
          <LiveNumbers
            technicals={live.technicals}
            levels={live.levels}
            fallbackLevels={analysis?.dashboard.levels ?? null}
            state={liveBlockState({
              hasTechnicals: live.technicals != null,
              candlesLoaded,
              candleCount: candles.length,
              hasPrice: quote?.price != null,
              fallbackLevelCount:
                (analysis?.dashboard.levels?.supports?.length ?? 0) + (analysis?.dashboard.levels?.resistances?.length ?? 0),
            })}
            refNote={
              candlesRef && candlesRef.symbol !== selected.ref.symbol
                ? `velas de ${candlesRef.symbol} (referência de reserva, ajustadas ao preço atual)`
                : null
            }
          />

          {notice && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{notice}</div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
          )}

          {(analysisLoading || generating) && !analysis && (
            <div className="flex items-center gap-2 rounded-xl border border-[#D2A63C]/20 bg-black/40 p-8 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />
              {generating ? `A gerar a leitura com IA… ${genSeconds} s` : "A carregar a análise de hoje…"}
            </div>
          )}

          {analysis && <AnalysisView a={analysis} now={now} livePrice={quote?.price ?? null} />}

          <p className="text-center text-[11px] text-gray-600">
            ⚠️ Conteúdo educacional. Números técnicos calculados automaticamente; leitura gerada por IA. Não constitui aconselhamento
            financeiro nem promessa de resultados.
          </p>
        </div>
      </div>
    </main>
  )
}

// ─── Números ao vivo ──────────────────────────────────────────────────────────
const LIVE_STATE_MSG: Record<Exclude<LiveBlockState, "live">, string> = {
  "levels-only":
    "Sem velas diárias ao vivo neste momento — regime, RSI, ATR e intervalo ficam em pausa. Os níveis abaixo são os da análise diária.",
  "waiting-price": "Velas carregadas; à espera do preço ao vivo para calcular os números.",
  loading: "A carregar velas diárias…",
  "no-candles":
    "Sem velas diárias para este ativo neste momento, por isso não há regime, RSI, ATR nem níveis ao vivo. Tentamos de novo a cada minuto.",
}

function LiveNumbers({
  technicals: t,
  levels,
  fallbackLevels,
  state,
  refNote,
}: {
  technicals: TerminalTechnicals | null
  levels: { supports: number[]; resistances: number[] } | null
  fallbackLevels: { supports: number[]; resistances: number[] } | null
  state: LiveBlockState
  refNote: string | null
}) {
  const lv = levels ?? fallbackLevels
  const regimeColor =
    t?.regime === "tendência de alta" ? "text-green-400" : t?.regime === "tendência de baixa" ? "text-red-400" : "text-gray-200"
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Activity className="h-4 w-4 text-green-400" /> Ao vivo · velas diárias + preço atual
        </p>
        {state === "live" && refNote && <span className="text-[11px] text-gray-500">{refNote}</span>}
      </div>
      {/* Um aviso só, no lugar dos cartões — em vez de seis cartões com «—». */}
      {state !== "live" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {state === "loading" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <Activity className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{LIVE_STATE_MSG[state]}</span>
        </div>
      )}
      {state === "live" && t && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <MetricCard title="Regime" icon={<Waves className="h-4 w-4" />}>
            <p className={`text-sm font-semibold capitalize ${regimeColor}`}>{t.regime ?? "—"}</p>
            <p className="mt-1 text-[11px] text-gray-500">
              EMA20 {fmtPrice(t.ema20)} · EMA50 {fmtPrice(t.ema50)}
            </p>
          </MetricCard>
          <MetricCard title="Momentum (RSI 14)" icon={<Gauge className="h-4 w-4" />}>
            {t.rsi14 != null ? (
              <>
                <Meter value={t.rsi14} leftLabel="Sobrevendido" rightLabel="Sobrecomprado" />
                <p className="mt-1 text-center text-sm font-semibold text-white">
                  {t.rsi14} · {t.momentum}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">—</p>
            )}
          </MetricCard>
          <MetricCard title="Volatilidade (ATR 14)" icon={<Activity className="h-4 w-4" />}>
            <p className="text-sm font-semibold text-white">{t.atr14 != null ? fmtPrice(t.atr14) : "—"}</p>
            <p className="mt-1 text-[11px] text-gray-500">{t.atrPct != null ? `${t.atrPct}% do preço por dia` : ""}</p>
          </MetricCard>
          <MetricCard title="Intervalo 20 sessões" icon={<Target className="h-4 w-4" />}>
            {t.range20Pct != null && t.range20 ? (
              <>
                <Meter value={t.range20Pct} leftLabel={fmtPrice(t.range20.l)} rightLabel={fmtPrice(t.range20.h)} />
                <p className="mt-1 text-center text-sm font-semibold text-white">{t.range20Pct}% do intervalo</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">—</p>
            )}
          </MetricCard>
        </div>
      )}
      {(state === "live" || state === "levels-only") && lv && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard title={state === "live" ? "Suportes" : "Suportes (análise)"} icon={<TrendingDown className="h-4 w-4 text-green-400" />}>
            <LevelChips values={lv.supports ?? []} cls="border-green-500/20 bg-green-500/5 text-green-300" />
          </MetricCard>
          <MetricCard title={state === "live" ? "Resistências" : "Resistências (análise)"} icon={<TrendingUp className="h-4 w-4 text-red-400" />}>
            <LevelChips values={lv.resistances ?? []} cls="border-red-500/20 bg-red-500/5 text-red-300" />
          </MetricCard>
        </div>
      )}
    </div>
  )
}

function LevelChips({ values, cls }: { values: number[]; cls: string }) {
  if (!values.length) return <p className="text-sm text-gray-500">—</p>
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((n, i) => (
        <span key={i} className={`rounded-md border px-2 py-1 font-mono text-sm ${cls}`}>
          {fmtPrice(n)}
        </span>
      ))}
    </div>
  )
}

// ─── Leitura da IA (diária) ───────────────────────────────────────────────────
function AnalysisView({ a, now, livePrice }: { a: StoredAnalysis; now: number; livePrice: number | null }) {
  const d = a.dashboard
  const dir = DIR_META[d.verdict?.direction] ?? DIR_META.NEUTRO
  const age = analysisAgeState(a.generatedAt, now)
  const gen = a.generatedAt ? new Date(a.generatedAt) : null
  const sameDay = gen ? gen.toDateString() === new Date(now).toDateString() : false
  const when = gen
    ? sameDay
      ? `Análise de hoje ${gen.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
      : `Análise de ${gen.toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : "Análise sem data"
  const priceAtAnalysis = d.grounding?.price ?? (typeof a.quote?.price === "number" ? a.quote.price : null)
  const drift = priceAtAnalysis && livePrice ? ((livePrice - priceAtAnalysis) / priceAtAnalysis) * 100 : null
  const sourcedNews = (d.news ?? []).filter((n) => typeof n.source === "string" && /^https?:\/\//.test(n.source))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
        <span className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-300">
          <BrainCircuit className="h-4 w-4 text-[#D2A63C]" /> Leitura com IA
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {when}
        </span>
        {age.state === "stale" && age.ageMs != null && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            Desatualizada · {formatAge(age.ageMs)}
          </Badge>
        )}
        {priceAtAnalysis != null && (
          <span>
            · preço na análise {fmtPrice(priceAtAnalysis)}
            {drift != null && Math.abs(drift) >= 0.05 ? ` (${drift >= 0 ? "+" : ""}${drift.toFixed(2)}% desde então)` : ""}
          </span>
        )}
      </div>

      {/* Veredicto */}
      <Card className="border border-[#D2A63C]/20 bg-gradient-to-br from-[#151316] to-black">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-lg font-bold ${dir.cls}`}>
              <dir.Icon className="h-5 w-5" />
              {d.verdict?.direction ?? "NEUTRO"}
            </span>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Convicção</p>
              <p className="font-semibold text-white">{d.verdict?.conviction ?? "—"}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-300">{d.verdict?.rationale}</p>
        </CardContent>
      </Card>

      {/* Cenários */}
      {!!d.scenarios?.length && (
        <Card className="border-[#D2A63C]/20 bg-black/40">
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Target className="h-4 w-4 text-[#D2A63C]" /> Cenários hipotéticos (próximas 1-4 semanas)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {d.scenarios.map((s) => {
                const up = s.movePct >= 0
                const color = s.kind === "bull" ? "#34d399" : s.kind === "bear" ? "#f87171" : "#D2A63C"
                const label = s.kind === "bull" ? "Bullish" : s.kind === "bear" ? "Bearish" : "Base"
                const w = Math.min(100, Math.abs(s.movePct) * 6)
                return (
                  <div key={s.kind} className="rounded-lg border border-white/10 bg-black/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
                      <span className="font-mono text-sm font-bold" style={{ color }}>{up ? "+" : ""}{s.movePct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{s.triggers}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {!!d.macro?.length && <ListCard title="Fatores macro a vigiar" icon={<Globe className="h-4 w-4 text-blue-400" />} items={d.macro} />}
        {!!d.risks?.length && <ListCard title="Riscos & Alertas" icon={<AlertTriangle className="h-4 w-4 text-red-400" />} items={d.risks} />}
        {!!sourcedNews.length && (
          <Card className="border-[#D2A63C]/20 bg-black/40">
            <CardContent className="p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Newspaper className="h-4 w-4 text-amber-400" /> Notícias (com fonte)
              </p>
              <ul className="space-y-1.5">
                {sourcedNews.map((n, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    {impactDot(n.impact)}{" "}
                    <a href={n.source} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-600 hover:text-[#D2A63C]">
                      {n.headline}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recomendação */}
      {d.recommendation && (
        <Card className="border-[#D2A63C]/30 bg-gradient-to-br from-[#D2A63C]/10 to-black">
          <CardContent className="p-5">
            <p className="mb-3 flex items-center gap-2 font-semibold text-[#D2A63C]">
              <GraduationCap className="h-5 w-5" /> Leitura para Traders
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <RecoItem label="Direção" value={d.recommendation.bias} />
              <RecoItem label="Timing" value={d.recommendation.timing} />
              <RecoItem label="Gestão de risco" value={d.recommendation.risk} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function impactDot(i: "alto" | "medio" | "baixo"): string {
  return i === "alto" ? "🔴" : i === "medio" ? "🟡" : "🟢"
}

function Meter({ value, leftLabel, rightLabel }: { value: number; leftLabel: string; rightLabel: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-red-500/60 via-yellow-500/60 to-green-500/60">
        <div className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${v}% - 3px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}

function MetricCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-[#D2A63C]/20 bg-black/40">
      <CardContent className="p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {icon} {title}
        </p>
        {children}
      </CardContent>
    </Card>
  )
}

function ListCard({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <Card className="border-[#D2A63C]/20 bg-black/40">
      <CardContent className="p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">{icon} {title}</p>
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[#D2A63C]" />
              <span className="leading-relaxed">{it}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RecoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-200">{value}</p>
    </div>
  )
}
