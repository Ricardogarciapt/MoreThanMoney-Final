"use client"

import Link from "next/link"
import {
  Bot, MessageSquare, Server, ArrowRight, TrendingUp, TrendingDown,
  Clock, Check, Activity,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const MTM_GOLD = "#D2A63C"

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  connected: { label: "Ligado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35" },
  pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-400 border-amber-500/35" },
  error: { label: "Erro", className: "bg-red-500/15 text-red-400 border-red-500/35" },
  disconnected: { label: "Desligado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/35" },
}

export const SIGNAL_STYLES: Record<string, { label: string; className: string }> = {
  executed: { label: "Executado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35" },
  received: { label: "Recebido", className: "bg-sky-500/15 text-sky-400 border-sky-500/35" },
  skipped: { label: "Ignorado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/35" },
  error: { label: "Erro", className: "bg-red-500/15 text-red-400 border-red-500/35" },
}

export function formatMt5Money(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `há ${diff}s`
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)}d`
}

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", s.className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-current opacity-60")} />
      {s.label}
    </span>
  )
}

export function SignalStatusPill({ status }: { status: string }) {
  const s = SIGNAL_STYLES[status] ?? { label: status, className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/35" }
  return <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", s.className)}>{s.label}</span>
}

export function PipelineFlow({ botUsername = "MoreThanMoney_aibot" }: { botUsername?: string }) {
  const steps = [
    { icon: MessageSquare, label: "Grupos MTM", sub: "Sinais no Telegram" },
    { icon: Bot, label: `@${botUsername.replace(/^@/, "")}`, sub: "Bot API" },
    { icon: Server, label: "Vercel", sub: "Webhook" },
    { icon: TrendingUp, label: "MT5", sub: "Execução" },
  ]
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-0 py-6 px-2">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center min-w-[72px] sm:min-w-[88px]">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/25 flex items-center justify-center mb-2 shadow-[0_0_24px_-4px_rgba(210,166,60,0.35)]">
              <step.icon className="w-5 h-5 text-[#D2A63C]" />
            </div>
            <span className="text-xs font-semibold text-white text-center leading-tight">{step.label}</span>
            <span className="text-[10px] text-zinc-500 text-center mt-0.5">{step.sub}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="w-4 h-4 text-zinc-600 mx-1 sm:mx-3 hidden sm:block shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

export function DirectionBadge({ direction }: { direction: string | null }) {
  if (!direction) return <span className="text-zinc-600 text-xs">—</span>
  const isBuy = direction.toLowerCase() === "buy"
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md",
      isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
    )}>
      {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {direction.toUpperCase()}
    </span>
  )
}

export interface SignalItem {
  id: string
  symbol: string | null
  direction: string | null
  entry?: number | null
  sl?: number | null
  tp?: number | null
  lot?: number | null
  status: string
  detail?: string | null
  created_at: string
}

export function SignalCard({ signal, compact }: { signal: SignalItem; compact?: boolean }) {
  return (
    <div className="group rounded-xl border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-900/80 hover:border-[#D2A63C]/20 transition-all p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white font-mono tracking-tight">{signal.symbol ?? "—"}</span>
            <DirectionBadge direction={signal.direction} />
            <SignalStatusPill status={signal.status} />
          </div>
          {!compact && signal.detail && (
            <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{signal.detail}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs text-zinc-500 flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3" />
            {formatRelative(signal.created_at)}
          </span>
        </div>
      </div>
      {!compact && (signal.entry != null || signal.sl != null || signal.tp != null || signal.lot != null) && (
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-zinc-800/60">
          {[
            { k: "Entrada", v: signal.entry, c: "text-zinc-300" },
            { k: "SL", v: signal.sl, c: "text-red-400/90" },
            { k: "TP", v: signal.tp, c: "text-emerald-400/90" },
            { k: "Lote", v: signal.lot, c: "text-zinc-300" },
          ].map(({ k, v, c }) => (
            <div key={k} className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">{k}</p>
              <p className={cn("text-sm font-mono font-medium", c)}>{v ?? "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EmptySignals() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
      <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
      <p className="text-zinc-400 font-medium">Ainda sem sinais</p>
      <p className="text-zinc-600 text-sm mt-1 max-w-xs mx-auto">
        Quando o bot receber um sinal nos grupos MTM, aparece aqui em tempo real.
      </p>
    </div>
  )
}

export function CopyTraderBanner({ strategyId }: { strategyId?: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
      <Check className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-300">Copy trader · Conta MTM</p>
        <p className="text-sm text-zinc-400 mt-0.5">
          As operações da Conta MTM são replicadas para as tuas contas slave via MetaAPI CopyFactory.
        </p>
      </div>
    </div>
  )
}

export function StrategyMtmBanner({ strategyPick }: { strategyPick?: string | null }) {
  const label =
    strategyPick === '9gsL'
      ? 'Premium · Ouro (9gsL)'
      : strategyPick === '5IHE'
        ? 'Ideias de Forex (5IHE)'
        : strategyPick
          ? `Estratégia ${strategyPick}`
          : 'Estratégia MTM'
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4">
      <Check className="w-5 h-5 text-[#D2A63C] shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-[#D2A63C]">Estratégia MTM · CopyFactory</p>
        <p className="text-sm text-zinc-400 mt-0.5">
          Copias a conta provider <strong className="text-white">{label}</strong> — sem canal Telegram
          nem bot administrador. A replicação é automática via MetaAPI CopyFactory.
        </p>
      </div>
    </div>
  )
}

export function ModeBanner({ customChannel }: { customChannel: string | null }) {
  const channel = customChannel?.trim()
  if (channel && channel.toLowerCase() !== 'null') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
        <MessageSquare className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-sky-300">Canal externo</p>
          <p className="text-sm text-zinc-400 mt-0.5">
            A copiar apenas de <strong className="text-white">{channel}</strong>. O bot tem de ser administrador.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
      <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-emerald-300">Modo predefinição MTM</p>
        <p className="text-sm text-zinc-400 mt-0.5">
          Sinais dos grupos oficiais onde o <Link href="https://t.me/MoreThanMoney_aibot" className="text-[#D2A63C] hover:underline" target="_blank">@MoreThanMoney_aibot</Link> está activo.
        </p>
      </div>
    </div>
  )
}
