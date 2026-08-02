"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import LiveStreamRoom from "@/components/live/live-stream-room"
import { Loader2, Radio, Users, CalendarClock, ArrowRight } from "lucide-react"

type Stream = {
  id: string
  title: string
  is_live: boolean
  access_tier?: string | null
  viewer_count?: number
  educator?: { display_name?: string | null } | null
  academy?: { name?: string | null } | null
}
type Upcoming = { id: string; streamId?: string; title?: string; scheduledAt: string; tier?: string | null; educator?: string | null }

export default function FreeSessionHub() {
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState<Stream[]>([])
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = async () => {
    try {
      const [sRes, schRes] = await Promise.all([
        fetch("/api/live-sessions/streams?live=true").then((r) => r.json()).catch(() => ({})),
        fetch("/api/live-sessions/schedule?days=14&limit=20").then((r) => r.json()).catch(() => ({})),
      ])
      const streams: Stream[] = (sRes?.data || []).filter((s: Stream) => s.is_live && s.access_tier === "free")
      setLive(streams)
      setSelected((prev) => prev || (streams[0]?.id ?? null))
      const now = Date.now()
      const up: Upcoming[] = (schRes?.sessions || schRes?.data || [])
        .filter((o: any) => (o.tier ?? o.accessTier) === "free" && new Date(o.scheduledAt || o.scheduled_start_at).getTime() > now)
        .slice(0, 6)
        .map((o: any) => ({
          id: o.id,
          streamId: o.streamId,
          title: o.title,
          scheduledAt: o.scheduledAt || o.scheduled_start_at,
          tier: o.tier ?? o.accessTier,
          educator: o.educator?.display_name || o.educatorName || null,
        }))
      setUpcoming(up)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 20000) // re-verifica se entrou/saiu do ar
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedStream = useMemo(() => live.find((s) => s.id === selected) || null, [live, selected])

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="border-b border-[#D2A63C]/15">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
            <Radio className="h-3.5 w-3.5" /> Transmissões abertas a todos
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">Sessões Gratuitas</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300 md:text-lg">
            Sessões ao vivo da MoreThanMoney, abertas a toda a gente — sem necessidade de conta. Com legendas
            traduzidas e dobragem na voz do educador.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : live.length > 0 ? (
          <div className="space-y-5">
            {/* Seletor quando há mais do que uma sessão gratuita ao vivo */}
            {live.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {live.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      s.id === selected
                        ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
                        : "border-gray-700 text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    {s.title}
                    {s.educator?.display_name ? <span className="text-gray-500">· {s.educator.display_name}</span> : null}
                  </button>
                ))}
              </div>
            )}

            {selectedStream && (
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-300">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> AO VIVO
                </span>
                <span className="font-semibold text-white">{selectedStream.title}</span>
                {typeof selectedStream.viewer_count === "number" && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5" /> {selectedStream.viewer_count}
                  </span>
                )}
              </div>
            )}

            {selected && <LiveStreamRoom streamId={selected} />}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D2A63C]/20 bg-gradient-to-br from-gray-950 to-black p-10 text-center">
            <Radio className="mx-auto h-10 w-10 text-gray-600" />
            <h2 className="mt-4 text-xl font-bold">Nenhuma sessão gratuita ao vivo neste momento</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
              As sessões gratuitas aparecem aqui automaticamente quando arrancam. Volta na próxima sessão agendada.
            </p>

            {upcoming.length > 0 && (
              <div className="mx-auto mt-8 max-w-md text-left">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#D2A63C]">
                  <CalendarClock className="h-4 w-4" /> Próximas sessões gratuitas
                </p>
                <ul className="space-y-2">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-sm">
                      <span className="text-gray-200">{u.title || "Sessão ao vivo"}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(u.scheduledAt).toLocaleString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8">
              <Link href="/live-sessions" className="inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/40 px-5 py-2.5 text-sm font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10">
                Ver todas as sessões <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
