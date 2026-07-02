"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity, BarChart3, BookOpen, CheckCircle2, ClipboardList, Loader2, RefreshCw,
  Target, TrendingDown, TrendingUp, Wallet, Zap, XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MTM_GOLD } from "@/components/mtmcopy/mtmcopy-shared"
import PerformanceMetrics, { type PerformanceData } from "@/components/mtmcopy/performance-metrics"

type MetricsTab = "copy" | "journal" | "plan"

interface MetricsResponse {
  summary: {
    totalSignals: number
    executed: number
    errors: number
    skipped: number
    received: number
    successRate: number | null
    todayCount: number
    weekCount: number
    buys: number
    sells: number
    activeConnections: number
    connectedMt5: number
    lastSignalAt: string | null
    totalBalance: number | null
  }
  topSymbols: { symbol: string; count: number }[]
  dailyActivity: { date: string; executed: number; total: number }[]
  accountBalances: { connectionId: string; label: string; balance: number | null; isAudited?: boolean }[]
  connectionCount: number
  journal?: {
    metrics: {
      total_trades?: number
      win_rate?: number
      net_pnl?: number
      profit_factor?: number
      avg_rr?: number
    } | null
    executedCount: number
    analysisCount: number
    bySource: { manual: number; copy: number; audited: number }
  }
  tradingPlan?: {
    id: string
    plan_name: string
    trader_name?: string | null
    max_risk_per_trade?: number | null
    max_daily_loss?: number | null
    daily_profit_target?: number | null
    monthly_profit_target?: number | null
    is_trading?: boolean | null
  } | null
  auditedAccounts?: { id: string; label: string; mt5_status: string }[]
  performance?: PerformanceData | null
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "gold",
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  accent?: "gold" | "green" | "red" | "blue"
}) {
  const accents = {
    gold: "border-[#D2A63C]/25 bg-[#D2A63C]/5 text-[#D2A63C]",
    green: "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
    red: "border-red-500/25 bg-red-500/5 text-red-400",
    blue: "border-sky-500/25 bg-sky-500/5 text-sky-400",
  }
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center", accents[accent])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  )
}

function MiniBarChart({ data }: { data: MetricsResponse["dailyActivity"] }) {
  const max = Math.max(...data.map((d) => d.total), 1)
  const dayLabel = (iso: string) => {
    const d = new Date(iso + "T12:00:00")
    return d.toLocaleDateString("pt-PT", { weekday: "short" })
  }

  return (
    <div className="flex items-end justify-between gap-2 h-32">
      {data.map((d) => {
        const totalH = Math.max(12, Math.round((d.total / max) * 88))
        const execH = d.executed > 0 ? Math.max(8, Math.round((d.executed / max) * 88)) : 0
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full h-24 flex flex-col justify-end relative">
              <div
                className="w-full rounded-t-md bg-zinc-700/50"
                style={{ height: totalH }}
                title={`${d.total} sinais`}
              />
              {execH > 0 && (
                <div
                  className="w-full rounded-t-md bg-emerald-500/75 absolute bottom-0 left-0 right-0"
                  style={{ height: execH }}
                  title={`${d.executed} executados`}
                />
              )}
            </div>
            <span className="text-[9px] text-zinc-600 uppercase truncate w-full text-center">{dayLabel(d.date)}</span>
            <span className="text-[10px] text-zinc-500 font-mono">{d.executed}/{d.total}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function TradingDashboard({
  accessToken,
  variant = "default",
}: {
  accessToken: string
  variant?: "default" | "broker"
}) {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<MetricsTab>("copy")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mtmcopy/metrics", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (res.ok) setMetrics(data)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  if (loading && !metrics) {
    return (
      <div className="flex justify-center py-16 mb-14">
        <Loader2 className="w-8 h-8 text-[#D2A63C] animate-spin" />
      </div>
    )
  }

  if (!metrics) return null

  const { summary, topSymbols, dailyActivity, accountBalances, journal, tradingPlan, auditedAccounts, performance } = metrics
  const buyPct = summary.buys + summary.sells > 0
    ? Math.round((summary.buys / (summary.buys + summary.sells)) * 100)
    : 50

  const tabs: { id: MetricsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "copy", label: "Cópia MTMcopier", icon: Zap },
    { id: "journal", label: "Trading Journal", icon: BookOpen },
    { id: "plan", label: "Plano de trading", icon: ClipboardList },
  ]

  return (
    <div className={variant === "broker" ? "" : "mb-14"}>
      <div className={`flex flex-wrap items-center justify-between gap-3 ${variant === "broker" ? "mb-4" : "mb-5"}`}>
        {variant !== "broker" ? (
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" style={{ color: MTM_GOLD }} />
              Dashboard de trading
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">Cópia automática · journal · plano (scanner-access)</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Terminal de performance</p>
        )}
        <div className="flex items-center gap-2">
          <Link
            href="/scanner-access"
            className="text-xs text-zinc-500 hover:text-[#D2A63C] transition-colors hidden sm:inline"
          >
            Abrir scanner-access →
          </Link>
          <button
            onClick={load}
            className="text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800"
            title="Atualizar métricas"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {performance && (
        <div className="mb-6 rounded-2xl border border-[#D2A63C]/20 bg-zinc-950/40 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4 text-xs uppercase tracking-widest text-[#D2A63C]">
            <BarChart3 className="w-3.5 h-3.5" /> Performance real · trades fechadas
          </div>
          <PerformanceMetrics performance={performance} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
              tab === id
                ? "border-[#D2A63C]/40 bg-[#D2A63C]/10 text-[#D2A63C]"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "journal" && (
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Executadas"
              value={journal?.executedCount ?? 0}
              sub="Trades reais no journal"
              icon={CheckCircle2}
              accent="green"
            />
            <KpiCard
              label="Análise"
              value={journal?.analysisCount ?? 0}
              sub="Forward testing"
              icon={BookOpen}
              accent="blue"
            />
            <KpiCard
              label="Win rate"
              value={journal?.metrics?.win_rate != null ? `${journal.metrics.win_rate}%` : "—"}
              sub={`${journal?.metrics?.total_trades ?? 0} trades fechadas (mês)`}
              icon={Target}
              accent="gold"
            />
            <KpiCard
              label="P&L líquido"
              value={
                journal?.metrics?.net_pnl != null
                  ? `${Number(journal.metrics.net_pnl).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
                  : "—"
              }
              sub={`PF ${journal?.metrics?.profit_factor ?? "—"} · RR ${journal?.metrics?.avg_rr ?? "—"}`}
              icon={TrendingUp}
              accent={Number(journal?.metrics?.net_pnl) >= 0 ? "green" : "red"}
            />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-sm font-semibold text-white mb-3">Origem das trades</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-zinc-800 p-3">
                <p className="text-[10px] uppercase text-zinc-600">Manual</p>
                <p className="text-xl font-bold text-white">{journal?.bySource.manual ?? 0}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 p-3">
                <p className="text-[10px] uppercase text-zinc-600">Cópia</p>
                <p className="text-xl font-bold text-[#D2A63C]">{journal?.bySource.copy ?? 0}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 p-3">
                <p className="text-[10px] uppercase text-zinc-600">Auditada</p>
                <p className="text-xl font-bold text-emerald-400">{journal?.bySource.audited ?? 0}</p>
              </div>
            </div>
            {(auditedAccounts?.length ?? 0) > 0 && (
              <p className="text-xs text-zinc-500 mt-4">
                Contas auditadas: {auditedAccounts!.map((a) => a.label).join(", ")}
              </p>
            )}
            <p className="text-xs text-zinc-600 mt-3">
              Regista trades em{" "}
              <Link href="/scanner-access" className="text-[#D2A63C] hover:underline">
                scanner-access
              </Link>
              . Executadas = reais; Análise = forward testing.
            </p>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 mb-4">
          {tradingPlan ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold text-white">{tradingPlan.plan_name}</p>
                {tradingPlan.trader_name && (
                  <p className="text-sm text-zinc-500">{tradingPlan.trader_name}</p>
                )}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-zinc-800 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">Risco / trade</p>
                  <p className="text-lg font-bold text-white">{tradingPlan.max_risk_per_trade ?? "—"}%</p>
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">Perda máx. dia</p>
                  <p className="text-lg font-bold text-white">{tradingPlan.max_daily_loss ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">Alvo dia</p>
                  <p className="text-lg font-bold text-emerald-400">{tradingPlan.daily_profit_target ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">Alvo mês</p>
                  <p className="text-lg font-bold text-[#D2A63C]">{tradingPlan.monthly_profit_target ?? "—"}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <ClipboardList className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400">Ainda não tens plano de trading activo.</p>
              <Link href="/scanner-access" className="text-sm text-[#D2A63C] hover:underline mt-2 inline-block">
                Criar plano em scanner-access →
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === "copy" && (
      <>
      {/* KPIs copy */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Executados"
          value={summary.executed}
          sub={`${summary.totalSignals} sinais no total`}
          icon={CheckCircle2}
          accent="green"
        />
        <KpiCard
          label="Taxa de execução"
          value={summary.successRate != null ? `${summary.successRate}%` : "—"}
          sub={summary.errors > 0 ? `${summary.errors} erros` : "Sem erros registados"}
          icon={Zap}
          accent="gold"
        />
        <KpiCard
          label="Hoje"
          value={summary.todayCount}
          sub={`${summary.weekCount} esta semana`}
          icon={Activity}
          accent="blue"
        />
        <KpiCard
          label="Saldo (slaves)"
          value={
            summary.totalBalance != null
              ? `${summary.totalBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"
          }
          sub={`${summary.activeConnections} conta(s) activa(s)`}
          icon={Wallet}
          accent="gold"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Actividade 7 dias */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-white mb-1">Actividade · últimos 7 dias</p>
          <p className="text-xs text-zinc-500 mb-4">Barras = sinais recebidos · verde = executados</p>
          <MiniBarChart data={dailyActivity} />
        </div>

        {/* Buy / Sell */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-white mb-4">Direcção</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-emerald-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Buy</span>
                <span className="text-zinc-400">{summary.buys}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-emerald-500/80 rounded-full transition-all" style={{ width: `${buyPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Sell</span>
                <span className="text-zinc-400">{summary.sells}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-red-500/80 rounded-full transition-all" style={{ width: `${100 - buyPct}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase text-zinc-600">Ignorados</p>
              <p className="text-lg font-bold text-zinc-400">{summary.skipped}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-zinc-600">MT5 ligadas</p>
              <p className="text-lg font-bold text-emerald-400">{summary.connectedMt5}/{metrics.connectionCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top símbolos + saldos */}
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-white mb-3">Pares mais copiados</p>
          {topSymbols.length === 0 ? (
            <p className="text-sm text-zinc-600">Ainda sem dados</p>
          ) : (
            <ul className="space-y-2">
              {topSymbols.map(({ symbol, count }, i) => (
                <li key={symbol} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-4">{i + 1}</span>
                  <span className="font-mono font-bold text-white flex-1">{symbol}</span>
                  <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / topSymbols[0].count) * 100}%`,
                        backgroundColor: MTM_GOLD,
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 w-6 text-right">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-white mb-3">Estado das contas</p>
          {accountBalances.length === 0 ? (
            <p className="text-sm text-zinc-600">Liga uma conta MT5 para ver saldo em tempo real</p>
          ) : (
            <ul className="space-y-3">
              {accountBalances.map((a) => (
                <li key={a.connectionId} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-400 truncate">
                    {a.label}
                    {a.isAudited && (
                      <span className="ml-1.5 text-[10px] uppercase text-emerald-500/80">auditada</span>
                    )}
                  </span>
                  <span className="text-sm font-mono font-semibold text-white">
                    {a.balance != null
                      ? `${a.balance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {summary.errors > 0 && (
            <div className="mt-4 flex items-center gap-2 text-xs text-red-400/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              {summary.errors} execução(ões) com erro — revê o histórico abaixo
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
