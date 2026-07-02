"use client"

// Métricas de performance REAIS (a partir das trades fechadas) — curva de equity,
// drawdown, profit factor, expectancy, P&L por conta/símbolo/mês e red-flags.
// Presentacional: recebe o objecto `performance` de /api/mtmcopy/metrics (calculado
// server-side em app/api/mtmcopy/metrics/route.ts). Sem fetch próprio → 0 chamadas extra.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react"
import { MTM_GOLD } from "@/components/mtmcopy/mtmcopy-shared"

export interface PerformanceData {
  totalPnl: number
  tradeCount: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number | null
  avgWin: number
  avgLoss: number
  expectancy: number
  maxDrawdown: number
  maxDrawdownPct: number
  returnOverMaxDD: number | null
  bestTrade: number
  worstTrade: number
  equityCurve: { date: string; pnl: number; cumulative: number }[]
  byAccount: { label: string; pnl: number; trades: number; winRate: number }[]
  bySymbol: { symbol: string; pnl: number; trades: number }[]
  monthly: { month: string; pnl: number; trades: number }[]
  redFlags: string[]
}

const fmtEur = (n: number) =>
  `${n >= 0 ? "+" : "−"}€${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: string
  sub?: string
  tone?: "neutral" | "good" | "bad" | "gold"
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-red-400"
        : tone === "gold"
          ? "text-[#D2A63C]"
          : "text-white"
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">{label}</p>
      <p className={`text-xl font-black ${toneCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function PerformanceMetrics({ performance }: { performance: PerformanceData }) {
  const p = performance
  if (!p || p.tradeCount === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
        Sem trades fechadas ainda para calcular a performance. Assim que houver histórico real
        (copiado, manual ou auditado), as métricas aparecem aqui.
      </div>
    )
  }

  const pnlTone = p.totalPnl >= 0 ? "good" : "bad"
  const pfTone = p.profitFactor == null ? "good" : p.profitFactor >= 1.5 ? "good" : p.profitFactor >= 1 ? "gold" : "bad"
  const ddTone = p.maxDrawdownPct <= 20 ? "good" : p.maxDrawdownPct <= 50 ? "gold" : "bad"

  return (
    <div className="space-y-5">
      {/* Red flags */}
      {p.redFlags.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" /> Alertas de risco
          </div>
          {p.redFlags.map((f, i) => (
            <p key={i} className="text-sm text-red-200/90">{f}</p>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="P&L Total" value={fmtEur(p.totalPnl)} sub={`${p.tradeCount} trades`} tone={pnlTone} />
        <Kpi label="Win Rate" value={`${p.winRate}%`} sub={`${p.wins}G / ${p.losses}P`} tone={p.winRate >= 50 ? "good" : "neutral"} />
        <Kpi label="Profit Factor" value={p.profitFactor == null ? "∞" : p.profitFactor.toFixed(2)} sub="ganhos ÷ perdas" tone={pfTone} />
        <Kpi label="Max Drawdown" value={`${p.maxDrawdownPct.toFixed(1)}%`} sub={fmtEur(-Math.abs(p.maxDrawdown))} tone={ddTone} />
        <Kpi label="Expectativa" value={fmtEur(p.expectancy)} sub="por trade" tone={p.expectancy >= 0 ? "good" : "bad"} />
        <Kpi label="Retorno / Risco" value={p.returnOverMaxDD == null ? "—" : p.returnOverMaxDD.toFixed(2)} sub="P&L ÷ maxDD" tone={p.returnOverMaxDD != null && p.returnOverMaxDD >= 2 ? "good" : "gold"} />
      </div>

      {/* Equity curve */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-white">
          <TrendingUp className="w-4 h-4" style={{ color: MTM_GOLD }} /> Curva de Equity (P&L acumulado)
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={p.equityCurve} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="eqGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MTM_GOLD} stopOpacity={0.35} />
                <stop offset="100%" stopColor={MTM_GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} minTickGap={40} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} width={54} tickFormatter={(v) => `€${v}`} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={((v: number) => [`€${Number(v).toLocaleString("pt-PT")}`, "Acumulado"]) as never}
            />
            <Area type="monotone" dataKey="cumulative" stroke={MTM_GOLD} strokeWidth={2} fill="url(#eqGold)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Monthly P&L */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold text-white">
            <TrendingDown className="w-4 h-4 text-zinc-500" /> P&L Mensal
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={p.monthly} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} width={54} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }}
                formatter={((v: number) => [`€${Number(v).toLocaleString("pt-PT")}`, "P&L"]) as never}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {p.monthly.map((m, i) => (
                  <Cell key={i} fill={m.pnl >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Por conta */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-bold text-white mb-3">P&L por conta</p>
          <div className="space-y-2">
            {p.byAccount.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-300 truncate flex-1">{a.label}</span>
                <span className="text-[11px] text-zinc-500 shrink-0">{a.trades} · {a.winRate}%</span>
                <span className={`font-bold shrink-0 w-24 text-right ${a.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtEur(a.pnl)}
                </span>
              </div>
            ))}
          </div>
          {p.bySymbol.length > 0 && (
            <>
              <p className="text-sm font-bold text-white mt-4 mb-2">Top símbolos (P&L)</p>
              <div className="flex flex-wrap gap-1.5">
                {p.bySymbol.map((s, i) => (
                  <span
                    key={i}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${s.pnl >= 0 ? "border-emerald-500/25 text-emerald-300 bg-emerald-500/5" : "border-red-500/25 text-red-300 bg-red-500/5"}`}
                  >
                    {s.symbol} {fmtEur(s.pnl)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ganho médio" value={fmtEur(p.avgWin)} tone="good" />
        <Kpi label="Perda média" value={fmtEur(-Math.abs(p.avgLoss))} tone="bad" />
        <Kpi label="Melhor trade" value={fmtEur(p.bestTrade)} tone="good" />
        <Kpi label="Pior trade" value={fmtEur(p.worstTrade)} tone="bad" />
      </div>
    </div>
  )
}
