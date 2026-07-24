"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ProviderKey = "premium" | "trade-ideas" | "sensei" | "goldkiller" | "booster" | "bybit-perps"

interface ProviderStrategyMetrics {
  key: ProviderKey
  strategyId: string
  accountId: string
  label: string
  description: string
  region: string | null
  state: string | null
  connectionStatus: string | null
  online: boolean
  balance: number | null
  equity: number | null
  profit: number | null
  gainPct: number | null
  maxDrawdownPct: number | null
  profitFactor: number | null
  trades: number | null
  wonTrades: number | null
  lostTrades: number | null
  winRatePct: number | null
  subscribers: number
  hasMetaStats: boolean
  error?: string
}

interface Payload {
  configured: boolean
  providers: ProviderStrategyMetrics[]
  fetchedAt?: string
  error?: string
}

const DEFAULT_ACCENT = { ring: "border-zinc-700/40", text: "text-zinc-200", dot: "bg-zinc-400" }

const ACCENT: Partial<Record<ProviderKey, { ring: string; text: string; dot: string }>> = {
  premium: { ring: "border-[#D2A63C]/30", text: "text-[#D2A63C]", dot: "bg-[#D2A63C]" },
  "trade-ideas": { ring: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400" },
  sensei: { ring: "border-violet-500/30", text: "text-violet-300", dot: "bg-violet-400" },
  goldkiller: { ring: "border-amber-500/30", text: "text-amber-300", dot: "bg-amber-400" },
  "bybit-perps": { ring: "border-orange-500/30", text: "text-orange-300", dot: "bg-orange-400" },
}

function fmtMoney(v: number | null): string {
  if (v == null) return "—"
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(v)
}

function fmtPct(v: number | null): string {
  if (v == null) return "—"
  return `${v >= 0 ? "" : ""}${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(v)}%`
}

function fmtNum(v: number | null, digits = 0): string {
  if (v == null) return "—"
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(v)
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "muted" }) {
  const color =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-white"
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={cn("text-sm font-semibold mt-0.5", color)}>{value}</p>
    </div>
  )
}

function ProviderCard({ p }: { p: ProviderStrategyMetrics }) {
  const accent = ACCENT[p.key] ?? DEFAULT_ACCENT
  const profitTone = p.profit == null ? "muted" : p.profit >= 0 ? "pos" : "neg"
  const gainTone = p.gainPct == null ? "muted" : p.gainPct >= 0 ? "pos" : "neg"

  return (
    <div className={cn("rounded-2xl border bg-zinc-950/70 overflow-hidden", accent.ring)}>
      <div className="px-4 py-3 border-b border-zinc-800/80 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={cn("text-sm font-bold flex items-center gap-2", accent.text)}>
            <span className={cn("h-2 w-2 rounded-full shrink-0", p.online ? accent.dot : "bg-zinc-600")} />
            {p.label}
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug line-clamp-2">{p.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600">{p.region || "—"}</p>
          <p className={cn("text-[10px] font-medium", p.online ? "text-emerald-400" : "text-amber-400")}>
            {p.online ? "Online" : p.connectionStatus || p.state || "Offline"}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Saldo</p>
            <p className="text-xl font-black text-white leading-tight">{fmtMoney(p.balance)}</p>
            <p className="text-[11px] text-zinc-500">Equity {fmtMoney(p.equity)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-1 justify-end">
              {profitTone === "neg" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              Lucro
            </p>
            <p
              className={cn(
                "text-lg font-black leading-tight",
                profitTone === "pos" ? "text-emerald-400" : profitTone === "neg" ? "text-rose-400" : "text-zinc-400",
              )}
            >
              {fmtMoney(p.profit)}
            </p>
            <p className={cn("text-[11px]", gainTone === "pos" ? "text-emerald-400/80" : gainTone === "neg" ? "text-rose-400/80" : "text-zinc-500")}>
              {fmtPct(p.gainPct)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Win rate" value={fmtPct(p.winRatePct)} tone={p.winRatePct != null && p.winRatePct >= 50 ? "pos" : undefined} />
          <Stat label="Drawdown" value={fmtPct(p.maxDrawdownPct)} tone={p.maxDrawdownPct != null ? "neg" : "muted"} />
          <Stat label="Profit factor" value={fmtNum(p.profitFactor, 2)} tone={p.profitFactor != null && p.profitFactor >= 1 ? "pos" : p.profitFactor != null ? "neg" : "muted"} />
          <Stat label="Trades" value={fmtNum(p.trades)} />
          <Stat label="Ganhas / Perdidas" value={p.trades == null ? "—" : `${fmtNum(p.wonTrades)} / ${fmtNum(p.lostTrades)}`} />
          <Stat label="Subscritores" value={fmtNum(p.subscribers)} />
        </div>

        {p.error && (
          <p className="mt-3 text-[11px] text-amber-400/90 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" /> {p.error}
          </p>
        )}
        {!p.error && !p.hasMetaStats && (
          <p className="mt-3 text-[11px] text-zinc-600">
            Métricas históricas indisponíveis (MetaStats) — a mostrar só saldo/equity.
          </p>
        )}
      </div>
    </div>
  )
}

export default function MtmcopyProviderPerformance({ className }: { className?: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/mtmcopy/provider-performance", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || body.message || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro a carregar desempenho")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fetchedLabel = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Activity className="w-3.5 h-3.5 text-[#D2A63C]" />
          {fetchedLabel ? `Atualizado às ${fetchedLabel}` : "Desempenho das estratégias Provider"}
        </div>
        <Button variant="outline" size="sm" className="border-zinc-700 h-8 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">Atualizar</span>
        </Button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-10 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {data && !data.configured && !error && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> MetaAPI não configurada (METAAPI_TOKEN em falta).
        </div>
      )}

      {data?.configured && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.providers.map((p) => (
            <ProviderCard key={p.key} p={p} />
          ))}
        </div>
      )}

      {data?.configured && (
        <p className="text-[11px] text-zinc-600 flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Saldo, lucro, win rate e drawdown vêm do MetaStats das contas mestre; subscritores
          contados via CopyFactory.
        </p>
      )}
    </div>
  )
}
