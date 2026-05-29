"use client"

import { useState, useEffect, useCallback } from "react"
import { Calendar, ExternalLink, RefreshCw, Clock, User, Video, X, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface CalendlyBooking {
  id: string
  event_uuid: string
  event_type_name: string
  event_type_slug: string
  status: "active" | "cancelled"
  invitee_name: string | null
  invitee_email: string | null
  start_time: string | null
  end_time: string | null
  join_url: string | null
  created_at: string
  cancelled_at: string | null
}

interface Stats {
  totalActive: number
  totalCancelled: number
  onboardings: number
  reunioes: number
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isUpcoming(iso: string | null) {
  if (!iso) return false
  return new Date(iso) > new Date()
}

export default function CalendlySection() {
  const [bookings, setBookings] = useState<CalendlyBooking[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"active" | "cancelled" | "all">("active")
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("")

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: filter, limit: "50" })
      if (eventTypeFilter) params.set("event_type", eventTypeFilter)
      const res = await fetch(`/api/dashboard-gestao/bookings?${params}`)
      const data = await res.json()
      setBookings(data.bookings ?? [])
      setStats(data.stats ?? null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filter, eventTypeFilter])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const upcomingBookings = bookings.filter((b) => isUpcoming(b.start_time))
  const pastBookings = bookings.filter((b) => !isUpcoming(b.start_time))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00b4d8]/15 border border-[#00b4d8]/25">
            <Calendar className="h-5 w-5 text-[#00b4d8]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Calendly — Marcações</h2>
            <p className="text-sm text-gray-500">Onboarding + Reuniões pontuais</p>
          </div>
        </div>
        <button
          onClick={fetchBookings}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Marcações ativas", value: stats.totalActive, color: "#4ade80" },
            { label: "Onboardings", value: stats.onboardings, color: "#D2A63C" },
            { label: "Reuniões pontuais", value: stats.reunioes, color: "#60a5fa" },
            { label: "Canceladas", value: stats.totalCancelled, color: "#f87171" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/5 bg-zinc-900/60 p-4"
            >
              <p className="text-2xl font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Calendly links */}
      <div className="flex flex-wrap gap-3">
        <a
          href="https://calendly.com/morethanmoneypt/onboarding-de-novos-membros"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-[#D2A63C] px-3 py-2 rounded-lg border border-white/10 hover:border-[#D2A63C]/30 transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" />
          Onboarding (Calendly)
          <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://calendly.com/morethanmoneypt/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-[#00b4d8] px-3 py-2 rounded-lg border border-white/10 hover:border-[#00b4d8]/30 transition-colors"
        >
          <Clock className="h-3.5 w-3.5" />
          Reunião Pontual (Calendly)
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["active", "cancelled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filter === f
                ? "bg-[#D2A63C] text-black"
                : "bg-zinc-900 text-gray-400 hover:text-white border border-white/10"
            )}
          >
            {f === "active" ? "Ativas" : f === "cancelled" ? "Canceladas" : "Todas"}
          </button>
        ))}
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-zinc-900 text-gray-400 border border-white/10 outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="onboarding-de-novos-membros">Onboarding</option>
          <option value="30min">Reunião Pontual</option>
        </select>
      </div>

      {/* Bookings list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-600">
          <RefreshCw className="h-6 w-6 animate-spin mr-3" />
          A carregar marcações...
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Sem marcações encontradas</p>
          <p className="text-xs mt-1">As novas marcações aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingBookings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#D2A63C] uppercase tracking-wider mb-2">
                Próximas ({upcomingBookings.length})
              </p>
              <div className="space-y-2">
                {upcomingBookings.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            </div>
          )}
          {pastBookings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                Passadas ({pastBookings.length})
              </p>
              <div className="space-y-2">
                {pastBookings.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BookingCard({ booking }: { booking: CalendlyBooking }) {
  const upcoming = isUpcoming(booking.start_time)
  const isCancelled = booking.status === "cancelled"
  const isOnboarding = booking.event_type_slug === "onboarding-de-novos-membros"

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl border p-4 transition-colors",
        isCancelled
          ? "border-white/5 bg-zinc-950/40 opacity-60"
          : upcoming
          ? "border-[#D2A63C]/20 bg-zinc-900/60"
          : "border-white/5 bg-zinc-900/40"
      )}
    >
      {/* Status icon */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg mt-0.5",
          isCancelled
            ? "bg-red-500/10"
            : isOnboarding
            ? "bg-[#D2A63C]/15"
            : "bg-blue-500/15"
        )}
      >
        {isCancelled ? (
          <X className="h-4 w-4 text-red-400" />
        ) : upcoming ? (
          <CheckCircle className="h-4 w-4 text-[#D2A63C]" />
        ) : (
          <Clock className="h-4 w-4 text-gray-500" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full",
              isOnboarding
                ? "bg-[#D2A63C]/15 text-[#D2A63C]"
                : "bg-blue-500/15 text-blue-400"
            )}
          >
            {isOnboarding ? "Onboarding" : "Reunião Pontual"}
          </span>
          {upcoming && !isCancelled && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
              Próxima
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <User className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-sm font-medium text-white">
            {booking.invitee_name || "—"}
          </span>
          <span className="text-xs text-gray-500 truncate">{booking.invitee_email}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Clock className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-400">{formatDate(booking.start_time)}</span>
        </div>
      </div>

      {/* Actions */}
      {booking.join_url && !isCancelled && (
        <a
          href={booking.join_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition-colors flex-shrink-0"
        >
          <Video className="h-3.5 w-3.5" />
          Entrar
        </a>
      )}
    </div>
  )
}
