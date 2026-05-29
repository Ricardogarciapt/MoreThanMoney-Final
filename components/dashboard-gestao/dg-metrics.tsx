"use client"

import { useState, useEffect, useCallback } from "react"
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts"
import { RefreshCw, Users, Calendar, Bot, TrendingUp, Wifi, WifiOff, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────
interface PieSlice { name: string; value: number; color?: string }

interface MetricsData {
  generatedAt: string
  users: {
    total: number; active: number; inactive: number
    newLast30d: number; newLast7d: number; prevWeek: number
    byType: PieSlice[]
    activitySplit: PieSlice[]
  }
  bookings: {
    total: number; last30d: number; upcoming: number; cancelRate: number
    byStatus: PieSlice[]
    byType: PieSlice[]
  }
  manychat: {
    followers: number; totalFlows: number; activeFlows: number
    draftFlows: number; totalTags: number
    flowsSplit: PieSlice[]
    topFlows: { name: string }[]
    topTags: { name: string }[]
  }
  funnel: { stage: string; value: number; color: string }[]
  ecosystem: { supabase: string; manychat: string; calendly: string }
}

// ── Palette ──────────────────────────────────────────────────────────────────
const GOLD = "#D2A63C"
const PALETTE = [
  "#D2A63C", "#60a5fa", "#4ade80", "#a78bfa",
  "#f59e0b", "#f87171", "#2dd4bf", "#e879f9",
  "#fb923c", "#38bdf8", "#34d399", "#818cf8",
]

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: PieSlice }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400">{d.name}</p>
      <p className="text-sm font-bold" style={{ color: d.payload?.color || GOLD }}>
        {d.value.toLocaleString("pt-PT")}
      </p>
    </div>
  )
}

// ── Bar Tooltip ───────────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-bold text-[#D2A63C]">{payload[0].value.toLocaleString("pt-PT")}</p>
    </div>
  )
}

// ── Donut Card ─────────────────────────────────────────────────────────────────
function DonutCard({
  title, icon: Icon, iconColor, data, centerLabel, centerValue, isEmpty,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  data: PieSlice[]
  centerLabel?: string
  centerValue?: string | number
  isEmpty?: boolean
}) {
  const filled = data.filter((d) => d.value > 0)

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>

      {isEmpty || filled.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-44 gap-2">
          <AlertCircle className="h-8 w-8 text-gray-700" />
          <p className="text-xs text-gray-600">Sem dados disponíveis</p>
        </div>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie
                data={filled}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {filled.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color || PALETTE[i % PALETTE.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          {centerValue !== undefined && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-bold text-white leading-none">
                {typeof centerValue === "number" ? centerValue.toLocaleString("pt-PT") : centerValue}
              </p>
              {centerLabel && <p className="text-[10px] text-gray-500 mt-0.5">{centerLabel}</p>}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      {filled.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {filled.map((d, i) => {
            const total = filled.reduce((s, x) => s + x.value, 0)
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
            const color = d.color || PALETTE[i % PALETTE.length]
            return (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] text-gray-400 truncate">{d.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-medium text-white">{d.value.toLocaleString("pt-PT")}</span>
                  <span className="text-[10px] text-gray-600 w-7 text-right">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Stat Badge ──────────────────────────────────────────────────────────────────
function StatBadge({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color: color || GOLD }}>
        {typeof value === "number" ? value.toLocaleString("pt-PT") : value}
      </p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function EcoStatus({ label, status }: { label: string; status: string }) {
  const ok = status === "ok"
  const noKey = status === "sem_key"
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <Wifi className="h-3 w-3 text-green-400" />
      ) : noKey ? (
        <WifiOff className="h-3 w-3 text-yellow-400" />
      ) : (
        <AlertCircle className="h-3 w-3 text-gray-600" />
      )}
      <span className="text-xs text-gray-400">{label}</span>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", ok ? "bg-green-500/10 text-green-400" : noKey ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-700 text-gray-500")}>
        {ok ? "online" : noKey ? "sem key" : "sem dados"}
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DGMetrics() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard-gestao/metrics")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Métricas do Ecossistema</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {lastRefresh ? `Atualizado às ${lastRefresh.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : "A carregar…"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/30 p-4 text-sm text-red-400">
          Erro ao carregar métricas: {error}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-zinc-900/40 animate-pulse border border-white/5" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ── KPI strip ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatBadge label="Total Membros" value={data.users.total} sub={`+${data.users.newLast30d} este mês`} color="#4ade80" />
            <StatBadge label="Ativos" value={data.users.active} sub={`${data.users.total > 0 ? Math.round((data.users.active / data.users.total) * 100) : 0}% do total`} color="#D2A63C" />
            <StatBadge label="Marcações" value={data.bookings.total} sub={`${data.bookings.last30d} últimos 30d`} color="#60a5fa" />
            <StatBadge label="Agendadas" value={data.bookings.upcoming} sub="próximas marcações" color="#a78bfa" />
            <StatBadge label="Flows ManyChat" value={data.manychat.totalFlows} sub={`${data.manychat.activeFlows} ativos`} color="#f59e0b" />
            <StatBadge label="Tags ManyChat" value={data.manychat.totalTags} sub="criadas" color="#2dd4bf" />
          </div>

          {/* ── Ecosystem status ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 px-5 py-4">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">Integrações</p>
            <div className="flex flex-wrap gap-5">
              <EcoStatus label="Supabase" status={data.ecosystem.supabase} />
              <EcoStatus label="ManyChat" status={data.ecosystem.manychat} />
              <EcoStatus label="Calendly" status={data.ecosystem.calendly} />
            </div>
          </div>

          {/* ── Pie Charts grid ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 1. Membros por tipo */}
            <DonutCard
              title="Membros por Tipo"
              icon={Users}
              iconColor="#4ade80"
              data={data.users.byType.map((d, i) => ({ ...d, color: PALETTE[i] }))}
              centerValue={data.users.total}
              centerLabel="total"
            />

            {/* 2. Atividade de membros */}
            <DonutCard
              title="Atividade de Membros"
              icon={Users}
              iconColor="#D2A63C"
              data={data.users.activitySplit}
              centerValue={`${data.users.total > 0 ? Math.round((data.users.active / data.users.total) * 100) : 0}%`}
              centerLabel="ativos"
            />

            {/* 3. Marcações por estado */}
            <DonutCard
              title="Marcações por Estado"
              icon={Calendar}
              iconColor="#60a5fa"
              data={data.bookings.byStatus}
              centerValue={data.bookings.total}
              centerLabel="total"
            />

            {/* 4. Marcações por tipo */}
            <DonutCard
              title="Tipo de Marcação"
              icon={Calendar}
              iconColor="#a78bfa"
              data={data.bookings.byType}
              centerValue={data.bookings.cancelRate + "%"}
              centerLabel="canc."
              isEmpty={data.bookings.total === 0}
            />
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 5. Flows ManyChat */}
            <DonutCard
              title="Flows ManyChat"
              icon={Bot}
              iconColor="#f59e0b"
              data={data.manychat.flowsSplit.filter((d) => d.value > 0)}
              centerValue={data.manychat.totalFlows}
              centerLabel="flows"
              isEmpty={data.manychat.totalFlows === 0}
            />

            {/* 6. Crescimento (esta semana vs anterior) */}
            <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                  <TrendingUp className="h-4 w-4 text-[#4ade80]" />
                </div>
                <p className="text-sm font-semibold text-white">Novos Membros</p>
              </div>
              <ResponsiveContainer width="100%" height={176}>
                <BarChart
                  data={[
                    { period: "Semana anterior", value: data.users.prevWeek },
                    { period: "Esta semana", value: data.users.newLast7d },
                  ]}
                  margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {[data.users.prevWeek, data.users.newLast7d].map((_, i) => (
                      <Cell key={i} fill={i === 1 ? GOLD : "#3f3f46"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-2">
                {data.users.newLast7d > data.users.prevWeek ? (
                  <span className="text-xs text-green-400">▲ {data.users.newLast7d - data.users.prevWeek} novos vs semana anterior</span>
                ) : data.users.newLast7d < data.users.prevWeek ? (
                  <span className="text-xs text-red-400">▼ {data.users.prevWeek - data.users.newLast7d} menos que semana anterior</span>
                ) : (
                  <span className="text-xs text-gray-500">Igual à semana anterior</span>
                )}
              </div>
            </div>

            {/* 7. Funil MTM */}
            <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5 xl:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                  <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
                </div>
                <p className="text-sm font-semibold text-white">Funil de Conversão MTM</p>
              </div>

              {data.funnel.every((f) => f.value === 0) ? (
                <div className="flex flex-col items-center justify-center h-44 gap-2">
                  <AlertCircle className="h-8 w-8 text-gray-700" />
                  <p className="text-xs text-gray-600">Dados de followers não disponíveis</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={176}>
                  <BarChart
                    data={data.funnel}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="stage" type="category" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
                    <Tooltip content={<BarTooltip />} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {data.funnel.map((f, i) => (
                        <Cell key={i} fill={f.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Conversion rates */}
              {data.funnel.some((f) => f.value > 0) && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {data.funnel.slice(1).map((stage, i) => {
                    const prev = data.funnel[i].value
                    const rate = prev > 0 ? Math.round((stage.value / prev) * 100) : 0
                    return (
                      <div key={i} className="text-center p-2 bg-white/5 rounded-lg">
                        <p className="text-lg font-bold" style={{ color: stage.color }}>{rate}%</p>
                        <p className="text-[9px] text-gray-600 leading-tight">
                          {data.funnel[i].stage.split(" ")[0]} → {stage.stage.split(" ")[0]}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── ManyChat quick lists ───────────────────────────────────────── */}
          {(data.manychat.topFlows.length > 0 || data.manychat.topTags.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.manychat.topFlows.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="h-4 w-4 text-[#f59e0b]" />
                    <p className="text-sm font-semibold text-white">Flows Ativos</p>
                    <span className="ml-auto text-xs text-gray-500">{data.manychat.totalFlows} total</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.manychat.topFlows.map((f, i) => (
                      <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.manychat.topTags.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="h-4 w-4 text-[#2dd4bf]" />
                    <p className="text-sm font-semibold text-white">Tags ManyChat</p>
                    <span className="ml-auto text-xs text-gray-500">{data.manychat.totalTags} total</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.manychat.topTags.map((t, i) => (
                      <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-[#2dd4bf]/10 text-[#2dd4bf] border border-[#2dd4bf]/20">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
