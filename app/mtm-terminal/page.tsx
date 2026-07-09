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
import {
  TERMINAL_ASSETS,
  TERMINAL_TYPE_LABELS,
  type TerminalAsset,
  type TerminalAssetType,
} from "@/lib/mtm-terminal-assets"
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
  Building2,
  Newspaper,
  Target,
  AlertTriangle,
  GraduationCap,
  Users,
} from "lucide-react"

/** Acesso: admin, vip ou premium (mesma regra das Apps MTM). */
function canAccessTerminal(user: User | null): boolean {
  if (!user || user.is_active === false) return false
  if (user.user_type === "admin") return true
  if (user.user_type === "vip" || user.member_category === "vip") return true
  if (user.user_type === "member") {
    return (
      user.member_category === "iq" ||
      user.member_category === "premium" ||
      user.subscription_plan === "premium"
    )
  }
  return false
}

interface LiveQuote {
  price: number | null
  changePercent: number | null
  currency: string
  source: string
}

interface Dashboard {
  verdict: { direction: "BULLISH" | "BEARISH" | "NEUTRO"; conviction: string; rationale: string }
  sentiment: {
    retailBias: "bullish" | "bearish" | "neutral"
    retailPct: number
    institutional: string
    fearGreed: number
    fearGreedLabel: string
  }
  macro: string[]
  institutions: { name: string; stance: string }[]
  news: { headline: string; impact: "alto" | "medio" | "baixo" }[]
  scenarios: { kind: "bull" | "base" | "bear"; movePct: number; triggers: string }[]
  levels: { supports: number[]; resistances: number[] }
  risks: string[]
  recommendation: { bias: string; timing: string; risk: string }
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

const DIR_META = {
  BULLISH: { cls: "border-green-500/40 bg-green-500/15 text-green-400", Icon: TrendingUp, bar: "#34d399" },
  BEARISH: { cls: "border-red-500/40 bg-red-500/15 text-red-400", Icon: TrendingDown, bar: "#f87171" },
  NEUTRO: { cls: "border-gray-500/40 bg-gray-500/15 text-gray-300", Icon: Minus, bar: "#9ca3af" },
} as const

function TerminalContent() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<TerminalAsset>(TERMINAL_ASSETS[0])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [quote, setQuote] = useState<LiveQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)

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
    setLoading(true)
    setError(null)
    setFromCache(false)
    try {
      const res = await fetch("/api/mtm-terminal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol: asset.symbol }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao gerar análise")
      setDashboard(data.dashboard)
      setQuote(data.quote)
      setGeneratedAt(new Date().toISOString())
    } catch (err: any) {
      setError(err?.message || "Erro ao gerar análise")
    } finally {
      setLoading(false)
    }
  }, [])

  // Ao abrir / mudar de ativo: mostra o dashboard diário guardado; se não houver, gera
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      setDashboard(null)
      setQuote(null)
      setFromCache(false)
      setGeneratedAt(null)
      try {
        const res = await fetch(`/api/mtm-terminal/analyze?symbol=${selected.symbol}`, {
          credentials: "include",
          cache: "no-store",
        })
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.cached?.dashboard) {
          setDashboard(data.cached.dashboard)
          setQuote(data.cached.quote || null)
          setGeneratedAt(data.cached.generatedAt || null)
          setFromCache(true)
          setLoading(false)
          return
        }
      } catch {
        /* sem cache → gera */
      }
      if (cancelled) return
      await generate(selected)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.symbol])

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
              <Link href="/trading" className="text-gray-400 hover:text-[#D2A63C]">Trading</Link>
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
              Terminal sentimental de mercado com IA institucional — dashboard de sentimento, macro e cenários antes de negociares.
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
                disabled={loading}
                className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar análise
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Painel direito */}
        <div className="space-y-4">
          {/* Cotação */}
          <Card className="border-[#D2A63C]/20 bg-black/60">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-lg font-semibold text-white">{selected.name}</p>
                <p className="text-xs text-gray-500">{selected.tvSymbol}</p>
              </div>
              {quote?.price != null ? (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold text-white">
                      {quote.price.toLocaleString("pt-PT", { maximumFractionDigits: 6 })} {quote.currency}
                    </p>
                    {quote.changePercent != null && (
                      <p className={`flex items-center justify-end gap-1 text-sm ${quote.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {quote.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}% (24h)
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="border-green-500/30 text-green-400">
                    <Radio className="mr-1 h-3 w-3 animate-pulse" /> {quote.source}
                  </Badge>
                </div>
              ) : (
                <span className="text-xs text-gray-500">Preço ao vivo aparece com a análise</span>
              )}
            </CardContent>
          </Card>

          <TvChartEmbed tvSymbol={selected.tvSymbol} interval="240" height={340} />

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
          )}

          {loading && !dashboard && (
            <div className="flex items-center gap-2 rounded-xl border border-[#D2A63C]/20 bg-black/40 p-8 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />
              A consultar mercados, macro e posicionamento institucional...
            </div>
          )}

          {dashboard && <DashboardView d={dashboard} fromCache={fromCache} generatedAt={generatedAt} />}

          <p className="text-center text-[11px] text-gray-600">
            ⚠️ Análise educacional gerada por IA. Não constitui aconselhamento financeiro.
          </p>
        </div>
      </div>
    </main>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ d, fromCache, generatedAt }: { d: Dashboard; fromCache: boolean; generatedAt: string | null }) {
  const dir = DIR_META[d.verdict.direction] ?? DIR_META.NEUTRO
  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <Card className="border border-[#D2A63C]/20 bg-gradient-to-br from-[#151316] to-black">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-lg font-bold ${dir.cls}`}>
                <dir.Icon className="h-5 w-5" />
                {d.verdict.direction}
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">Convicção</p>
                <p className="font-semibold text-white">{d.verdict.conviction}</p>
              </div>
            </div>
            {fromCache && generatedAt && (
              <span className="text-[11px] text-gray-500">
                Atualizado {new Date(generatedAt).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · diário às 9h
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-gray-300">{d.verdict.rationale}</p>
        </CardContent>
      </Card>

      {/* Sentimento */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Sentimento Retail" icon={<Users className="h-4 w-4" />}>
          <Meter value={d.sentiment.retailPct} leftLabel="Bearish" rightLabel="Bullish" pos />
          <p className="mt-1 text-center text-sm font-semibold text-white">{d.sentiment.retailPct}% bullish</p>
        </MetricCard>
        <MetricCard title="Fear & Greed" icon={<Radio className="h-4 w-4" />}>
          <Meter value={d.sentiment.fearGreed} leftLabel="Medo" rightLabel="Ganância" pos />
          <p className="mt-1 text-center text-sm font-semibold text-white">
            {d.sentiment.fearGreed} · {d.sentiment.fearGreedLabel}
          </p>
        </MetricCard>
        <MetricCard title="Institucional" icon={<Building2 className="h-4 w-4" />}>
          <p className="text-sm leading-relaxed text-gray-300">{d.sentiment.institutional}</p>
        </MetricCard>
      </div>

      {/* Cenários */}
      <Card className="border-[#D2A63C]/20 bg-black/40">
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Target className="h-4 w-4 text-[#D2A63C]" /> Cenários (próximas 1-4 semanas)
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

      {/* Níveis */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard title="Suportes" icon={<TrendingDown className="h-4 w-4 text-green-400" />}>
          <div className="flex flex-wrap gap-2">
            {d.levels.supports.map((n, i) => (
              <span key={i} className="rounded-md border border-green-500/20 bg-green-500/5 px-2 py-1 font-mono text-sm text-green-300">
                {n.toLocaleString("pt-PT", { maximumFractionDigits: 6 })}
              </span>
            ))}
          </div>
        </MetricCard>
        <MetricCard title="Resistências" icon={<TrendingUp className="h-4 w-4 text-red-400" />}>
          <div className="flex flex-wrap gap-2">
            {d.levels.resistances.map((n, i) => (
              <span key={i} className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 font-mono text-sm text-red-300">
                {n.toLocaleString("pt-PT", { maximumFractionDigits: 6 })}
              </span>
            ))}
          </div>
        </MetricCard>
      </div>

      {/* Macro / Instituições / Notícias / Riscos */}
      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Macro & Geopolítica" icon={<Globe className="h-4 w-4 text-blue-400" />} items={d.macro} />
        <ListCard
          title="Grandes Instituições"
          icon={<Building2 className="h-4 w-4 text-purple-400" />}
          items={d.institutions.map((i) => `${i.name}: ${i.stance}`)}
        />
        <ListCard
          title="Notícias Recentes"
          icon={<Newspaper className="h-4 w-4 text-amber-400" />}
          items={d.news.map((n) => `${impactDot(n.impact)} ${n.headline}`)}
        />
        <ListCard title="Riscos & Alertas" icon={<AlertTriangle className="h-4 w-4 text-red-400" />} items={d.risks} />
      </div>

      {/* Recomendação */}
      <Card className="border-[#D2A63C]/30 bg-gradient-to-br from-[#D2A63C]/10 to-black">
        <CardContent className="p-5">
          <p className="mb-3 flex items-center gap-2 font-semibold text-[#D2A63C]">
            <GraduationCap className="h-5 w-5" /> Recomendação para Traders
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <RecoItem label="Direção" value={d.recommendation.bias} />
            <RecoItem label="Timing" value={d.recommendation.timing} />
            <RecoItem label="Gestão de risco" value={d.recommendation.risk} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function impactDot(i: "alto" | "medio" | "baixo"): string {
  return i === "alto" ? "🔴" : i === "medio" ? "🟡" : "🟢"
}

function Meter({ value, leftLabel, rightLabel }: { value: number; leftLabel: string; rightLabel: string; pos?: boolean }) {
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
