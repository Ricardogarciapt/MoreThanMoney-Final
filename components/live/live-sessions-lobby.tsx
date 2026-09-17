"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import EducatorProfileDialog, { type EducatorProfilePublic } from "@/components/live/educator-profile-dialog"
import CursoIntroducao from "@/components/intro/curso-introducao"
import { useConfigIntro } from "@/components/intro/usar-intro"
import { SessionsTimetable } from "@/components/live/sessions-timetable"
import { useAuth } from "@/contexts/auth-context"
import { useI18n, useT } from "@/components/i18n-provider"
import { Radio, Users, GraduationCap, Bell, ArrowRight, Circle, Lock, Compass, CalendarClock } from "lucide-react"

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
  /** Salas de gravação (a «Introdução»): nunca entram na grelha de salas — o lugar delas é «Por onde começar». */
  nunca_ao_vivo?: boolean | null
  category?: string | null
  scheduled_start_at?: string | null
  viewer_count?: number | null
  access_tier?: "free" | "all" | "app_member" | "premium" | "vip" | null
  academy?: { id: string; name: string } | null
  educator?: {
    id: string
    display_name: string
    bio?: string | null
    avatar_url?: string | null
    specialty?: string | null
  } | null
}
type ScheduledSession = {
  id: string
  streamId: string
  title: string
  educatorName?: string | null
  language?: string | null
  scheduledAt: string
  tier?: string | null
}

function streamVisual(stream: Stream): string | null {
  const thumb = stream.thumbnail_url?.trim()
  if (thumb) return thumb
  const avatar = stream.educator?.avatar_url?.trim()
  return avatar || null
}

function canAccessStream(
  userPlan: "app_member" | "premium" | null | undefined,
  userType: string | undefined,
  streamTier: "free" | "all" | "app_member" | "premium" | "vip" | null | undefined,
  memberCategory?: string | null
): boolean {
  if (userType === "admin") return true
  const tier = streamTier ?? "all"
  if (tier === "free" || tier === "all") return true
  // Tier VIP: exclusivo a membros VIP (e admin, já tratado acima).
  if (tier === "vip") return userType === "vip" || memberCategory === "vip"
  if (tier === "app_member") return userPlan === "app_member" || userPlan === "premium"
  if (tier === "premium") return userPlan === "premium"
  return false
}

export default function LiveSessionsLobby() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const configIntro = useConfigIntro()
  const [streams, setStreams] = useState<Stream[]>([])
  const [educators, setEducators] = useState<EducatorPublic[]>([])
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([])
  const [loading, setLoading] = useState(true)
  /** Nome da academia escolhida nos chips ("" = todas). Filtra salas E especialistas — um só filtro. */
  const [academia, setAcademia] = useState("")

  const [educatorDialogOpen, setEducatorDialogOpen] = useState(false)
  const [selectedEducator, setSelectedEducator] = useState<EducatorPublic | null>(null)
  const [selectedEducatorStreams, setSelectedEducatorStreams] = useState<Stream[]>([])
  const [selectedEducatorStreamsLoading, setSelectedEducatorStreamsLoading] = useState(false)

  // A lista de academias deixou de ser pedida à parte: a tabela tem academias sem salas
  // («Introdução», «Network Marketing»…) e um chip que não filtra nada é ruído. Os chips saem
  // das salas que existem de facto.
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, eRes, schedRes] = await Promise.all([
        fetch("/api/live-sessions/streams").then((r) => r.json()),
        fetch("/api/live-sessions/educators-public").then((r) => r.json()),
        fetch("/api/live-sessions/schedule?days=21&limit=12").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
      setStreams(Array.isArray(sRes?.data) ? sRes.data : [])
      setEducators(Array.isArray(eRes?.data) ? eRes.data : [])
      setScheduledSessions(Array.isArray(schedRes?.data) ? schedRes.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 25000)
    return () => clearInterval(t)
  }, [loadAll])

  // Salas públicas: tudo menos as de gravação. Em direto primeiro — é a razão de estar no lobby.
  const salas = useMemo(
    () =>
      streams
        .filter((s) => !s.nunca_ao_vivo)
        .sort((a, b) => Number(b.is_live) - Number(a.is_live)),
    [streams]
  )
  const liveStreams = useMemo(() => salas.filter((s) => s.is_live), [salas])
  const liveCount = liveStreams.length

  // Fallback do horário quando a rota de horários não devolve nada: salas com data marcada.
  const upcoming = useMemo<ScheduledSession[]>(() => {
    const now = Date.now()
    return salas
      .filter((s) => !s.is_live && s.scheduled_start_at && new Date(s.scheduled_start_at).getTime() > now)
      .sort((a, b) => new Date(a.scheduled_start_at!).getTime() - new Date(b.scheduled_start_at!).getTime())
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        streamId: s.id,
        title: s.title,
        educatorName: s.educator?.display_name ?? null,
        language: (s.educator as { language?: string | null } | null)?.language ?? null,
        scheduledAt: s.scheduled_start_at!,
        tier: s.access_tier ?? null,
      }))
  }, [salas])
  const agenda = scheduledSessions.length > 0 ? scheduledSessions : upcoming

  const proxima = useMemo(() => {
    const now = Date.now()
    return (
      [...agenda]
        .filter((s) => new Date(s.scheduledAt).getTime() > now)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null
    )
  }, [agenda])

  const academias = useMemo(() => {
    const nomes = new Set<string>()
    for (const s of salas) if (s.academy?.name) nomes.add(s.academy.name)
    // Ordem alfabética: se viesse da ordem das salas, os chips trocavam de lugar sempre que uma
    // sala entrasse em direto (as em direto sobem para o topo).
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt"))
  }, [salas])

  const salasFiltradas = useMemo(
    () => (academia ? salas.filter((s) => s.academy?.name === academia) : salas),
    [salas, academia]
  )
  const openEducatorDialog = async (ed: EducatorProfilePublic) => {
    setSelectedEducator(ed as EducatorPublic)
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

  const openEducatorFromStream = (stream: Stream) => {
    if (!stream.educator?.id) return
    const fromList = educators.find((e) => e.id === stream.educator!.id)
    void openEducatorDialog(
      fromList ?? {
        id: stream.educator.id,
        display_name: stream.educator.display_name,
        bio: stream.educator.bio,
        avatar_url: stream.educator.avatar_url,
        specialty: stream.educator.specialty,
        academy: stream.academy ? { name: stream.academy.name } : null,
        is_live: stream.is_live,
      }
    )
  }

  if (loading && streams.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-400">
        <div className="text-center space-y-2">
          <Radio className="h-10 w-10 mx-auto text-[#D2A63C] animate-pulse" />
          <p>{t("live.loadingRooms")}</p>
        </div>
      </div>
    )
  }

  const locale = lang === "pt" ? "pt-PT" : lang
  const quando = (iso: string) => {
    const txt = new Date(iso).toLocaleString(locale, { weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    // Só a primeira letra: `capitalize` do CSS dava «Quarta-Feira».
    return txt.charAt(0).toUpperCase() + txt.slice(1)
  }

  // O curso existe (a sala «Introdução» está semeada) mas ainda não tem playlist: é o estado
  // «em preparação». Sem sala nenhuma não se promete nada — ficam só os dois caminhos.
  const curso = configIntro?.curso ?? null
  const cursoPronto = Boolean(curso?.playlistUrl)
  const cursoAChegar = Boolean(curso && !curso.playlistUrl)

  return (
    <div className="space-y-12 pb-16">
      {/*
        1 · AGORA. Um só estado: em direto › próxima sessão › nada marcado.
        Antes havia um «Agora: nenhuma sessão» no topo e um «Nenhuma sala em direto» mais abaixo —
        a mesma notícia dada duas vezes.
      */}
      <section
        aria-live="polite"
        className={`flex flex-col gap-4 rounded-2xl border px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6 ${
          liveCount > 0 ? "border-red-500/40 bg-red-950/25" : "border-[#D2A63C]/20 bg-black/40"
        }`}
      >
        {liveCount > 0 ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">{t("live.lobby.statusLive")}</p>
                <p className="truncate text-lg font-bold text-white">
                  {liveCount === 1
                    ? liveStreams[0].title
                    : t("live.lobby.liveCount").replace("{n}", String(liveCount))}
                </p>
              </div>
            </div>
            <a href="#salas" className="shrink-0">
              <Button className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525] sm:w-auto">
                {t("live.lobby.seeLiveRooms")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </>
        ) : proxima ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#D2A63C]/15 text-[#D2A63C]">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D2A63C]/80">
                  {t("live.lobby.nothingLiveNext")}
                </p>
                <p className="truncate text-lg font-bold text-white">{proxima.title}</p>
                <p className="truncate text-xs text-gray-400">
                  {quando(proxima.scheduledAt)}
                  {proxima.educatorName ? ` · ${proxima.educatorName}` : ""}
                </p>
              </div>
            </div>
            <a
              href="#agenda"
              className="shrink-0 text-sm font-semibold text-[#D2A63C] hover:text-[#e8c46a]"
            >
              {t("live.lobby.seeSchedule")} →
            </a>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Circle className="h-2.5 w-2.5 shrink-0 fill-gray-500 text-gray-500" />
            <p className="text-sm text-gray-300">{t("live.lobby.nothingScheduled")}</p>
          </div>
        )}
      </section>

      {/*
        2 · POR ONDE COMEÇAR — antes das salas, porque quem chega pela primeira vez escolhe uma
        sala sem saber o que é uma sala. A «Introdução» vive aqui e não na lista de academias.

        Dois estados, ambos sem botões mortos:
        • curso pronto → o cartão com capa, que abre o leitor;
        • curso por gravar → um aviso discreto (sem botão) e os dois caminhos do onboarding, que já
          funcionam hoje. O cartão do curso desaparece sozinho enquanto não houver playlist.
      */}
      {/* Só o curso. Os dois caminhos do onboarding saíram daqui (16/09, pedido do dono): repetiam o
          /onboarding e empurravam as salas para baixo. Sem curso, a secção não aparece. */}
      {(cursoPronto || cursoAChegar) && (
      <section aria-labelledby="por-onde-comecar">
        <div className="mb-4">
          <h2 id="por-onde-comecar" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white md:text-2xl">
            <Compass className="h-5 w-5 shrink-0 text-[#D2A63C]" />
            {t("live.lobby.startHeading")}
          </h2>
          <p className="mt-1 text-sm text-gray-400">{t("live.lobby.startIntro")}</p>
        </div>

        <div className="grid gap-4">
          {cursoPronto && <CursoIntroducao feitio="cartao" />}
          {cursoAChegar && curso && (
            <div className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-[#D2A63C]/25 bg-gray-950/70 sm:flex-row sm:items-center">
              {/* Mesma moldura do cartão pronto, apagada: o lugar do curso já se vê, sem nada para carregar. */}
              <div className="relative hidden aspect-video w-[45%] shrink-0 bg-gray-900 sm:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={curso.capa} alt="" className="h-full w-full object-cover opacity-40 grayscale" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-700 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <GraduationCap className="h-3 w-3" />
                  {t("live.lobby.courseSoonBadge")}
                </span>
                <p className="text-base font-semibold leading-snug text-white">{curso.titulo}</p>
                <p className="text-[13px] leading-relaxed text-gray-400">{t("live.lobby.courseSoonText")}</p>
              </div>
            </div>
          )}

        </div>
      </section>
      )}

      <EducatorProfileDialog
        open={educatorDialogOpen}
        onOpenChange={setEducatorDialogOpen}
        educator={selectedEducator}
        streams={selectedEducatorStreams}
        streamsLoading={selectedEducatorStreamsLoading}
      />

      {/*
        3 · SALAS E ESPECIALISTAS, com um filtro só.
        Antes havia uma caixa de pesquisa, um seletor de academias e uma fila de «filtros rápidos»
        — e nenhum dos três mexia em nada visível: filtravam uma grelha que já não era desenhada.
        Ficam chips por academia, tirados das salas que existem, e aplicam-se às duas listas.
      */}
      <section id="salas" aria-labelledby="salas-titulo" className="scroll-mt-6 space-y-6">
        <div className="space-y-3">
          <h2 id="salas-titulo" className="text-xl font-bold tracking-tight text-white md:text-2xl">
            {t("live.lobby.roomsHeading")}
          </h2>
          {academias.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t("live.lobby.roomsHeading")}>
              {["", ...academias].map((nome) => (
                <button
                  key={nome || "todas"}
                  type="button"
                  aria-pressed={academia === nome}
                  onClick={() => setAcademia(nome)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    academia === nome
                      ? "border-[#D2A63C] bg-[#D2A63C]/20 text-[#D2A63C]"
                      : "border-gray-700 bg-black/40 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {nome || t("live.lobby.filterAll")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Os especialistas já aparecem no cartão de cada sala (e o perfil abre a partir dele): o
            carrossel à parte repetia a mesma informação duas vezes. */}
        {/* Salas */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-gray-400">{t("live.lobby.roomsSub")}</h3>
          {salasFiltradas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-800 bg-black/30 p-6 text-center text-sm text-gray-500">
              {t("live.lobby.noRooms")}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {salasFiltradas.map((stream) => (
                <StreamMarketCard
                  key={stream.id}
                  stream={stream}
                  featured={stream.is_live}
                  userPlan={user?.subscription_plan}
                  userType={user?.user_type}
                  memberCategory={user?.member_category}
                  onEducatorProfile={() => openEducatorFromStream(stream)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4 · AGENDA */}
      <section id="agenda" className="scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-white md:text-2xl">
          <Bell className="h-5 w-5 text-[#D2A63C]" />
          {t("live.scheduleUpcomingLives")}
        </h2>
        <SessionsTimetable
          sessions={agenda.map((s) => ({
            id: s.id,
            title: s.title,
            educatorName: s.educatorName ?? null,
            language: s.language ?? null,
            scheduledAt: s.scheduledAt,
            tier: s.tier ?? null,
          }))}
          emptyText={t("live.scheduleEmpty")}
        />
      </section>
    </div>
  )
}

function StreamMarketCard({
  stream,
  featured,
  userPlan,
  userType,
  memberCategory,
  onEducatorProfile,
}: {
  stream: Stream
  featured?: boolean
  userPlan?: "app_member" | "premium" | null
  userType?: string
  memberCategory?: string | null
  onEducatorProfile?: () => void
}) {
  const t = useT()
  const img = streamVisual(stream)
  const viewers = typeof stream.viewer_count === "number" ? stream.viewer_count : null
  const enterHref = stream.educator?.id ? `/live/${stream.educator.id}` : `/live-sessions/${stream.id}`
  const showEducatorProfile = Boolean(stream.educator?.id && onEducatorProfile)
  const hasAccess = canAccessStream(userPlan, userType, stream.access_tier, memberCategory)

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
          <div className="flex h-full items-center justify-center text-gray-600 text-sm">{t("live.noImage")}</div>
        )}
        {stream.is_live && (
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              {t("live.badgeLive")}
            </span>
          </div>
        )}
        {!stream.is_live && (
          <div className="absolute left-3 top-3">
            <Badge className="bg-gray-900/90 text-gray-300 border-gray-700">{t("live.offline")}</Badge>
          </div>
        )}
        {stream.access_tier === "premium" && (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
              Premium
            </span>
          </div>
        )}
        {stream.access_tier === "app_member" && (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-600/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-black shadow">
              {t("live.badgeMember")}
            </span>
          </div>
        )}
        {!hasAccess && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-white/70" />
            <p className="text-xs font-semibold text-white/90 text-center px-4">
              {stream.access_tier === "vip" ? t("live.packVipAccess") : stream.access_tier === "premium" ? t("live.packPremiumPrice") : t("live.packMemberPrice")}
            </p>
            <Link
              href="/register"
              className="mt-1 rounded-full bg-[#D2A63C] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#BB8525]"
              onClick={(e) => e.stopPropagation()}
            >
              {t("live.viewPlans")}
            </Link>
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
            {showEducatorProfile ? (
              <button
                type="button"
                className="h-full w-full"
                aria-label={`${t("live.viewProfileOf")} ${stream.educator?.display_name || t("live.educatorFallback")}`}
                onClick={onEducatorProfile}
              >
                {stream.educator?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stream.educator.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">MTM</div>
                )}
              </button>
            ) : stream.educator?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stream.educator.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-gray-500">MTM</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {showEducatorProfile ? (
              <button
                type="button"
                className="block w-full truncate text-left text-sm font-semibold text-white hover:text-[#D2A63C]"
                aria-label={`${t("live.viewProfileOf")} ${stream.educator?.display_name || t("live.educatorFallback")}`}
                onClick={onEducatorProfile}
              >
                {stream.educator?.display_name || t("live.educatorFallback")}
              </button>
            ) : (
              <p className="text-sm font-semibold text-white truncate">{stream.educator?.display_name || t("live.educatorFallback")}</p>
            )}
            {stream.educator?.specialty && (
              <p className="text-[11px] text-[#D2A63C]/90 truncate">{stream.educator.specialty}</p>
            )}
            <p className="text-[10px] text-gray-600 truncate">{stream.academy?.name}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {viewers != null && viewers > 0 ? `${viewers} ${t("live.watching")}` : t("live.joinRoom")}
          </span>
          {stream.category && (
            <Badge variant="outline" className="border-gray-700 text-[10px] text-gray-400">
              {stream.category}
            </Badge>
          )}
        </div>
        {hasAccess ? (
          <Link href={enterHref} className="block">
            <Button className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]">{t("live.enterRoom")}</Button>
          </Link>
        ) : (
          <Link href="/register" className="block">
            <Button variant="outline" className="w-full border-[#D2A63C]/40 text-[#D2A63C]">
              <Lock className="mr-2 h-3.5 w-3.5" />
              {t("live.viewAccessPlans")}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
