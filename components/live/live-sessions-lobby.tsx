"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import {
  Radio,
  Search,
  Users,
  Sparkles,
  GraduationCap,
  Bell,
  ArrowRight,
  Circle,
  Calendar,
} from "lucide-react"
import { LMS_CATEGORY_OPTIONS } from "@/lib/lms-categories"

type Academy = { id: string; name: string; slug: string }
type EducatorPublic = {
  id: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  specialty?: string | null
  academy?: { id: string; name: string; slug: string } | null
  is_live: boolean
}
type Stream = {
  id: string
  title: string
  description?: string | null
  thumbnail_url?: string | null
  is_live: boolean
  category?: string | null
  scheduled_start_at?: string | null
  viewer_count?: number | null
  academy?: { id: string; name: string } | null
  educator?: {
    id: string
    display_name: string
    bio?: string | null
    avatar_url?: string | null
    specialty?: string | null
  } | null
}

const QUICK_FILTERS = LMS_CATEGORY_OPTIONS.map((c) => ({ id: c.value, label: c.label }))

function streamVisual(stream: Stream): string | null {
  const thumb = stream.thumbnail_url?.trim()
  if (thumb) return thumb
  const avatar = stream.educator?.avatar_url?.trim()
  return avatar || null
}

export default function LiveSessionsLobby() {
  const { toast } = useToast()
  const [academies, setAcademies] = useState<Academy[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [educators, setEducators] = useState<EducatorPublic[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [academyFilter, setAcademyFilter] = useState("")

  const [educatorDialogOpen, setEducatorDialogOpen] = useState(false)
  const [selectedEducator, setSelectedEducator] = useState<EducatorPublic | null>(null)
  const [selectedEducatorStreams, setSelectedEducatorStreams] = useState<Stream[]>([])
  const [selectedEducatorStreamsLoading, setSelectedEducatorStreamsLoading] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, sRes, eRes] = await Promise.all([
        fetch("/api/live-sessions/academies").then((r) => r.json()),
        fetch("/api/live-sessions/streams").then((r) => r.json()),
        fetch("/api/live-sessions/educators-public").then((r) => r.json()),
      ])
      setAcademies(Array.isArray(aRes?.data) ? aRes.data : [])
      setStreams(Array.isArray(sRes?.data) ? sRes.data : [])
      setEducators(Array.isArray(eRes?.data) ? eRes.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 25000)
    return () => clearInterval(t)
  }, [loadAll])

  const liveStreams = useMemo(() => streams.filter((s) => s.is_live), [streams])
  const liveCount = liveStreams.length

  const upcoming = useMemo(() => {
    const now = Date.now()
    return streams
      .filter((s) => !s.is_live && s.scheduled_start_at && new Date(s.scheduled_start_at).getTime() > now)
      .sort((a, b) => new Date(a.scheduled_start_at!).getTime() - new Date(b.scheduled_start_at!).getTime())
      .slice(0, 8)
  }, [streams])

  const filteredGrid = useMemo(() => {
    const q = search.trim().toLowerCase()
    return streams.filter((s) => {
      if (academyFilter && s.academy?.id !== academyFilter) return false
      if (categoryFilter && (s.category || "").toLowerCase() !== categoryFilter) return false
      if (!q) return true
      const blob = [
        s.title,
        s.description,
        s.educator?.display_name,
        s.educator?.specialty,
        s.educator?.bio,
        s.academy?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return blob.includes(q)
    })
  }, [streams, search, categoryFilter, academyFilter])

  const notifySoon = () => {
    toast({
      title: "Brevemente",
      description: "Alertas por email e push para próximas lives estarão disponíveis em breve.",
    })
  }

  const openEducatorDialog = async (ed: EducatorPublic) => {
    setSelectedEducator(ed)
    setSelectedEducatorStreams([])
    setEducatorDialogOpen(true)

    setSelectedEducatorStreamsLoading(true)
    try {
      const res = await fetch(`/api/live-sessions/streams?educatorId=${encodeURIComponent(ed.id)}`, {
        credentials: "same-origin",
      }).then((r) => r.json())

      setSelectedEducatorStreams((res.data || []) as Stream[])
    } catch {
      setSelectedEducatorStreams([])
    } finally {
      setSelectedEducatorStreamsLoading(false)
    }
  }

  if (loading && streams.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-400">
        <div className="text-center space-y-2">
          <Radio className="h-10 w-10 mx-auto text-[#D2A63C] animate-pulse" />
          <p>A carregar salas e especialistas…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-16">
      {/* Hero — marketplace */}
      <section className="relative overflow-hidden rounded-2xl border border-[#D2A63C]/25 bg-gradient-to-br from-[#0a0a0c] via-[#121018] to-black px-5 py-8 md:px-10 md:py-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#D2A63C]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-amber-600/5 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge className="border-[#D2A63C]/40 bg-black/50 text-[#D2A63C]">
              <Sparkles className="mr-1 h-3 w-3" />
              Shopping de conhecimento
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl lg:text-4xl">
              Escolhe a tua <span className="text-[#D2A63C]">sala</span>. Aprende em direto com quem domina o tema.
            </h2>
            <p className="text-sm text-gray-400 md:text-base leading-relaxed">
              Especialistas MTM ao vivo. Entra na sessão que faz sentido para ti — fiscalidade, mercados, poupança e muito mais.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <span className="font-semibold text-white">Agora:</span>
                <span className="text-red-200">
                  {liveCount === 0
                    ? "Nenhuma sessão em direto"
                    : `${liveCount} ${liveCount === 1 ? "sessão em direto" : "sessões em direto"}`}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden self-start lg:block">
            <Link href="/live-sessions/studio" className="shrink-0">
              <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                Abrir studio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative mt-8 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por tema (IRS, cripto, crédito…) ou nome do educador…"
              className="border-gray-700 bg-black/50 pl-10 text-white placeholder:text-gray-500"
            />
          </div>
          <select
            className="rounded-md border border-gray-700 bg-black/50 px-3 py-2 text-sm text-gray-200 md:min-w-[180px]"
            value={academyFilter}
            onChange={(e) => setAcademyFilter(e.target.value)}
          >
            <option value="">Todas as academias MTM</option>
            {academies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="w-full text-xs font-medium text-gray-500 sm:w-auto sm:mr-2 sm:self-center">Filtros rápidos</span>
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategoryFilter((c) => (c === f.id ? "" : f.id))}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                categoryFilter === f.id
                  ? "border-[#D2A63C] bg-[#D2A63C]/20 text-[#D2A63C]"
                  : "border-gray-700 bg-black/40 text-gray-300 hover:border-gray-500"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* CTA educador (aparece no mobile; no desktop o botão está no hero) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#D2A63C]/20 bg-black/40 px-4 py-4 lg:hidden">
        <Link href="/live-sessions/studio" className="shrink-0">
          <Button className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525]">
            Abrir studio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Dialog open={educatorDialogOpen} onOpenChange={setEducatorDialogOpen}>
        <DialogContent className="max-w-lg border border-[#D2A63C]/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C] text-lg">
              {selectedEducator?.display_name || "Educador"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedEducator && (
              <>
                {selectedEducator.specialty && (
                  <div className="inline-flex items-center rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-1 text-xs text-[#D2A63C]">
                    {selectedEducator.specialty}
                  </div>
                )}

                {selectedEducator.bio && (
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedEducator.bio}</div>
                )}

                <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-[#D2A63C]" />
                    <p className="font-semibold text-sm">Schedule</p>
                  </div>

                  {selectedEducatorStreamsLoading ? (
                    <p className="text-xs text-gray-500">A carregar horários…</p>
                  ) : (
                    <>
                      {(() => {
                        const now = Date.now()
                        const onlineNow = selectedEducatorStreams
                          .filter((s) => s.is_live)
                          .slice(0, 3)

                        const upcoming = selectedEducatorStreams
                          .filter((s) => !s.is_live && s.scheduled_start_at && new Date(s.scheduled_start_at).getTime() > now)
                          .sort((a, b) => new Date(a.scheduled_start_at as string).getTime() - new Date(b.scheduled_start_at as string).getTime())
                          .slice(0, 5)

                        return (
                          <div className="space-y-3">
                            {onlineNow.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-gray-400 uppercase">Online agora</p>
                                <div className="space-y-2">
                                  {onlineNow.map((s) => (
                                    <div key={s.id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                                      <p className="text-sm font-semibold">{s.title}</p>
                                      <p className="text-[11px] text-gray-500">
                                        {s.academy?.name ? `${s.academy.name} · ` : ""}
                                        Agora
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {upcoming.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-gray-400 uppercase">Próximas lives</p>
                                <div className="space-y-2">
                                  {upcoming.map((s) => (
                                    <div key={s.id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                                      <p className="text-sm font-semibold">{s.title}</p>
                                      <p className="text-[11px] text-gray-500">
                                        {s.academy?.name ? `${s.academy.name} · ` : ""}
                                        {s.scheduled_start_at ? new Date(s.scheduled_start_at).toLocaleString("pt-PT") : ""}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500">Sem lives agendadas agora.</p>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-12">
          {/* Slideshow educadores */}
          <section>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">Especialistas MTM</h3>
              <span className="text-xs text-gray-500">Desliza para ver todos</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-[#D2A63C]/30">
              {educators.length === 0 && <p className="text-sm text-gray-500">Ainda não há educadores públicos ativos.</p>}
              {educators.map((ed) => (
                <button
                  key={ed.id}
                  type="button"
                  onClick={() => openEducatorDialog(ed)}
                  className="w-[280px] shrink-0 snap-start text-left"
                  aria-label={`Ver perfil do educador ${ed.display_name}`}
                >
                  <Card className="w-full overflow-hidden border-[#D2A63C]/20 bg-gradient-to-b from-gray-900/90 to-black/90 backdrop-blur">
                    <div className="relative h-40 w-full bg-gradient-to-br from-gray-800 to-black">
                      {ed.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ed.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-600">
                          <GraduationCap className="h-16 w-16 opacity-40" />
                        </div>
                      )}
                      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                        <Circle
                          className={`h-2 w-2 ${ed.is_live ? "fill-emerald-400 text-emerald-400" : "fill-gray-500 text-gray-500"}`}
                        />
                        {ed.is_live ? "Online" : "Offline"}
                      </div>
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <p className="font-bold text-white leading-tight">{ed.display_name}</p>
                      {ed.specialty && (
                        <Badge variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] text-[10px]">
                          {ed.specialty}
                        </Badge>
                      )}
                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                        {ed.bio || "Bio disponível no perfil — contacta o admin para completar."}
                      </p>
                      {ed.academy?.name && (
                        <p className="text-[10px] uppercase tracking-wider text-gray-600">{ed.academy.name}</p>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </section>

          {/* Online agora */}
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-white md:text-xl">
              <Radio className="h-5 w-5 text-red-500" />
              Online agora
            </h3>
            {liveStreams.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-800 bg-black/30 p-8 text-center text-sm text-gray-500">
                Nenhuma sala em direto. Volta mais tarde ou agenda uma notificação abaixo.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {liveStreams.map((stream) => (
                  <StreamMarketCard key={stream.id} stream={stream} featured />
                ))}
              </div>
            )}
          </section>

          {/* Próximas lives */}
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-white md:text-xl">
              <Bell className="h-5 w-5 text-[#D2A63C]" />
              Próximas lives
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">Sem horários agendados. Os educadores podem definir data no studio ou no admin.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-800 bg-gray-950/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-white">{s.title}</p>
                      <p className="text-xs text-gray-400">
                        {s.educator?.display_name} · {s.scheduled_start_at && new Date(s.scheduled_start_at).toLocaleString("pt-PT")}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] shrink-0" onClick={notifySoon}>
                      Notificar-me
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
      </div>
    </div>
  )
}

function StreamMarketCard({ stream, featured }: { stream: Stream; featured?: boolean }) {
  const img = streamVisual(stream)
  const viewers = typeof stream.viewer_count === "number" ? stream.viewer_count : null

  return (
    <Card
      className={`group overflow-hidden border border-[#D2A63C]/15 bg-gray-950/90 transition hover:border-[#D2A63C]/40 ${
        featured ? "ring-1 ring-red-500/25 shadow-lg shadow-red-950/20" : ""
      }`}
    >
      <div className="relative h-44 w-full bg-gray-900">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600 text-sm">Sem imagem</div>
        )}
        {stream.is_live && (
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Live
            </span>
          </div>
        )}
        {!stream.is_live && (
          <div className="absolute left-3 top-3">
            <Badge className="bg-gray-900/90 text-gray-300 border-gray-700">Offline</Badge>
          </div>
        )}
      </div>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-bold text-white leading-snug line-clamp-2">{stream.title}</p>
          {stream.description && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{stream.description}</p>}
        </div>
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-[#D2A63C]/30 bg-gray-800">
            {stream.educator?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stream.educator.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-gray-500">MTM</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{stream.educator?.display_name || "Educador"}</p>
            {stream.educator?.specialty && (
              <p className="text-[11px] text-[#D2A63C]/90 truncate">{stream.educator.specialty}</p>
            )}
            <p className="text-[10px] text-gray-600 truncate">{stream.academy?.name}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {viewers != null && viewers > 0 ? `${viewers} a assistir` : "Junta-te à sala"}
          </span>
          {stream.category && (
            <Badge variant="outline" className="border-gray-700 text-[10px] text-gray-400">
              {stream.category}
            </Badge>
          )}
        </div>
        <Link href={`/live-sessions/${stream.id}`} className="block">
          <Button className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]">Entrar na sala</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
