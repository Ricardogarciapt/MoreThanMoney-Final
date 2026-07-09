"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ProtectedPage from "@/components/protected-page"
import MarkdownRenderer from "@/components/dashboard-gestao/markdown-renderer"
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
  Search,
  Sparkles,
  ShieldAlert,
  Radio,
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

const TIMEFRAMES = [
  { value: "intradiário (1-3 dias)", label: "Intradiário (1-3 dias)", tvInterval: "60" },
  { value: "1-4 semanas", label: "Swing (1-4 semanas)", tvInterval: "240" },
  { value: "1-3 meses", label: "Posição (1-3 meses)", tvInterval: "D" },
]

interface LiveQuote {
  price: number | null
  changePercent: number | null
  currency: string
  source: string
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

function TerminalContent() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<TerminalAsset>(TERMINAL_ASSETS[0])
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[1].value)
  const [analysis, setAnalysis] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<LiveQuote | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const tvInterval = useMemo(
    () => TIMEFRAMES.find((t) => t.value === timeframe)?.tvInterval || "240",
    [timeframe]
  )

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? TERMINAL_ASSETS.filter(
          (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
        )
      : TERMINAL_ASSETS
    const map = new Map<TerminalAssetType, TerminalAsset[]>()
    for (const a of filtered) {
      if (!map.has(a.type)) map.set(a.type, [])
      map.get(a.type)!.push(a)
    }
    return map
  }, [search])

  const runAnalysis = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    setAnalysis("")
    setQuote(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/mtm-terminal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ symbol: selected.symbol, timeframe }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Falha ao gerar análise")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6)
          try {
            const evt = JSON.parse(payload)
            if (evt.type === "quote") setQuote(evt.quote as LiveQuote)
            else if (evt.type === "text") setAnalysis((prev) => prev + evt.text)
            else if (evt.type === "error") setError(evt.message)
          } catch {
            /* ignore parse noise */
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message || "Erro ao gerar análise")
    } finally {
      setLoading(false)
    }
  }

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
              Terminal sentimental de mercado com IA institucional — análise macro, geopolítica e de
              posicionamento antes de negociares qualquer ativo.
            </p>
          </div>
          <Badge className="border-[#D2A63C]/30 bg-[#D2A63C]/10 text-[#D2A63C]">
            <Sparkles className="mr-1 h-3 w-3" /> Premium · VIP · Admin
          </Badge>
        </div>
      </div>

      <div className="container mx-auto grid gap-4 px-4 pb-16 lg:grid-cols-[320px_1fr]">
        {/* Painel esquerdo — seleção */}
        <div className="space-y-4">
          <Card className="border-[#D2A63C]/20 bg-gradient-to-br from-[#BB8525]/10 to-black">
            <CardContent className="space-y-4 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar ativo (BTC, Ouro, EURUSD...)"
                  className="border-gray-700 bg-black/60 pl-9 text-white"
                />
              </div>

              <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
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
                {grouped.size === 0 && (
                  <p className="py-6 text-center text-sm text-gray-500">Nenhum ativo encontrado.</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">Horizonte temporal</label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="border-gray-700 bg-black/60 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900 text-white">
                    {TIMEFRAMES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={runAnalysis}
                disabled={loading}
                className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A analisar {selected.symbol}...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="mr-2 h-4 w-4" /> Analisar {selected.symbol}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Painel direito — gráfico + análise */}
        <div className="space-y-4">
          {/* Cabeçalho de cotação ao vivo */}
          <Card className="border-[#D2A63C]/20 bg-black/60">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{selected.name}</p>
                  <p className="text-xs text-gray-500">{selected.tvSymbol}</p>
                </div>
              </div>
              {quote?.price != null ? (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold text-white">
                      {quote.price.toLocaleString("pt-PT", { maximumFractionDigits: 6 })} {quote.currency}
                    </p>
                    {quote.changePercent != null && (
                      <p
                        className={`flex items-center justify-end gap-1 text-sm ${
                          quote.changePercent >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {quote.changePercent >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}% (24h)
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="border-green-500/30 text-green-400">
                    <Radio className="mr-1 h-3 w-3 animate-pulse" /> {quote.source}
                  </Badge>
                </div>
              ) : (
                <span className="text-xs text-gray-500">
                  Preço ao vivo aparece ao gerar a análise
                </span>
              )}
            </CardContent>
          </Card>

          {/* Gráfico TradingView ao vivo */}
          <TvChartEmbed tvSymbol={selected.tvSymbol} interval={tvInterval} height={380} />

          {/* Análise IA */}
          <Card className="border-[#D2A63C]/20 bg-gradient-to-br from-[#1a1a1a] to-black">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
                <BrainCircuit className="h-5 w-5 text-[#D2A63C]" />
                <h2 className="font-semibold text-white">Relatório de Análise Institucional</h2>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {error}
                </div>
              )}

              {!analysis && !error && !loading && (
                <div className="py-12 text-center text-gray-500">
                  <BrainCircuit className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p>Escolhe um ativo e clica em <span className="text-[#D2A63C]">Analisar</span>.</p>
                  <p className="mt-1 text-xs">A IA produz veredicto, sentimento, macro, cenários e níveis.</p>
                </div>
              )}

              {loading && !analysis && (
                <div className="flex items-center gap-2 py-8 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />
                  A consultar mercados, macro e posicionamento institucional...
                </div>
              )}

              {analysis && <MarkdownRenderer content={analysis} />}
            </CardContent>
          </Card>

          <p className="text-center text-[11px] text-gray-600">
            ⚠️ Análise educacional gerada por IA. Não constitui aconselhamento financeiro.
          </p>
        </div>
      </div>
    </main>
  )
}
