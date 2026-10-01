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
import { podeAcederAoTier } from "@/lib/perfil-ui"
import {
  PARAM_ACADEMIA,
  porAcademia,
  resolverAcademia,
  type AcademiaComSalas,
  type AcademiaDoCatalogo,
  type SalaDeAula,
} from "@/lib/lms/aulas"
import { useI18n, useT } from "@/components/i18n-provider"
import { Radio, Users, GraduationCap, Bell, ArrowRight, Circle, Lock, Compass, CalendarClock, ChevronLeft, FolderOpen } from "lucide-react"

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
  /** O `slug` vem da rota (`academy:lms_academies(id, slug, name)`) e é a chave que casa a sala
      com a pasta do catálogo. Sem ele, a mesma academia abria duas pastas: uma por slug, outra
      por nome. */
  academy?: { id: string; name: string; slug?: string | null } | null
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

/**
 * A regra do nível vive em `lib/perfil-ui.ts`, partilhada com a app e com a ficha do educador.
 * A versão que estava aqui negava ao VIP as salas Premium — que ele já via pela app.
 */
function canAccessStream(
  userPlan: "app_member" | "premium" | null | undefined,
  userType: string | undefined,
  streamTier: "free" | "all" | "app_member" | "premium" | "vip" | null | undefined,
  memberCategory?: string | null
): boolean {
  return podeAcederAoTier(
    { user_type: userType, member_category: memberCategory, subscription_plan: userPlan },
    streamTier,
  )
}

export default function LiveSessionsLobby() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const configIntro = useConfigIntro()
  const [streams, setStreams] = useState<Stream[]>([])
  const [educators, setEducators] = useState<EducatorPublic[]>([])
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([])
  const [loading, setLoading] = useState(true)
  /**
   * O CATÁLOGO DE ACADEMIAS, pedido à parte das salas.
   *
   * É o que dá capa e lugar às academias que ainda não têm educador. Sem ele, agrupar pelas salas
   * fazia a pasta do Imobiliário (e da IA, e do Network Marketing) desaparecer da grelha — uma
   * área que a casa deixou de vender sem ninguém decidir isso.
   */
  const [catalogo, setCatalogo] = useState<AcademiaDoCatalogo[]>([])
  /**
   * A PASTA ABERTA VIVE NA URL (`?academia=<slug>`), não num estado qualquer.
   *
   * Assim um link de notificação («nova aula na Academia Forex») abre já dentro da pasta, e o
   * «voltar» do browser devolve a grelha sem código nenhum à mistura. Lê-se depois de montar,
   * para o primeiro fotograma do servidor e do cliente serem o mesmo.
   */
  const [paramAcademia, setParamAcademia] = useState<string | null>(null)

  const [educatorDialogOpen, setEducatorDialogOpen] = useState(false)
  const [selectedEducator, setSelectedEducator] = useState<EducatorPublic | null>(null)
  const [selectedEducatorStreams, setSelectedEducatorStreams] = useState<Stream[]>([])
  const [selectedEducatorStreamsLoading, setSelectedEducatorStreamsLoading] = useState(false)

  // As academias VOLTARAM a ser pedidas à parte: deixaram de ser um chip de filtro e passaram a
  // ser as pastas da montra, e uma pasta tem de existir mesmo sem salas dentro.
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, eRes, schedRes, acRes] = await Promise.all([
        fetch("/api/live-sessions/streams").then((r) => r.json()),
        fetch("/api/live-sessions/educators-public").then((r) => r.json()),
        fetch("/api/live-sessions/schedule?days=21&limit=12").then((r) => r.json()).catch(() => ({ data: [] })),
        fetch("/api/live-sessions/academies").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
      setStreams(Array.isArray(sRes?.data) ? sRes.data : [])
      setEducators(Array.isArray(eRes?.data) ? eRes.data : [])
      setScheduledSessions(Array.isArray(schedRes?.data) ? schedRes.data : [])
      setCatalogo(Array.isArray(acRes?.data) ? acRes.data : [])
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

  /**
   * AS ACADEMIAS, COMO PASTAS.
   *
   * Antes eram chips de filtro com TODAS as salas abertas por baixo: dezoito salas seguidas sem
   * se perceber onde acaba uma academia e começa a outra. O dono pediu o contrário — primeiro só
   * as pastas (a grelha de capas), clicar numa, e só então as salas DELA.
   *
   * O catálogo entra antes das salas de propósito: é isso que dá pasta e capa a uma academia sem
   * educador, em vez de a fazer desaparecer. A arrumação vem de `lib/lms/aulas.ts`, com guarda, e
   * é o mesmo módulo que serve o separador Aulas da app — uma regra e dois ecrãs.
   */
  const seccoes = useMemo(
    () => porAcademia(salas as unknown as SalaDeAula[], catalogo),
    [salas, catalogo],
  )

  /**
   * O que a URL pede, resolvido contra o que existe. Um slug que não resolve (link antigo,
   * academia renomeada) dá `null` e volta à grelha — nunca uma pasta em branco.
   */
  const aberta = useMemo(() => resolverAcademia(paramAcademia, seccoes), [paramAcademia, seccoes])
  // `porAcademia` devolve a sala no formato partilhado; o cartão precisa do stream inteiro.
  const porId = useMemo(() => new Map(salas.map((x) => [x.id, x])), [salas])

  // Ler a URL depois de montar, e seguir o «voltar» do browser: é ele que fecha a pasta.
  useEffect(() => {
    const ler = () => setParamAcademia(new URLSearchParams(window.location.search).get(PARAM_ACADEMIA))
    ler()
    window.addEventListener("popstate", ler)
    return () => window.removeEventListener("popstate", ler)
  }, [])

  /**
   * Abrir/fechar escreve na URL com a API nativa do histórico, e não com `router.push`: o `push`
   * do App Router remontava a lista e as salas voltavam a ser pedidas só para abrir uma pasta.
   * `pushState` ao abrir (para o «voltar» dar a grelha) e `replaceState` ao fechar (para não
   * encher o histórico de idas e voltas).
   */
  const abrirPasta = useCallback((chave: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM_ACADEMIA, chave)
    window.history.pushState(null, "", url)
    setParamAcademia(chave)
  }, [])
  const fecharPasta = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete(PARAM_ACADEMIA)
    window.history.replaceState(null, "", url)
    setParamAcademia(null)
  }, [])
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

  // A contagem diz-se sempre, zero incluído. Uma academia sem salas mostra «0 salas» — nunca «a
  // abrir»: as áreas estão prontas, e o que falta é o horário, não a área.
  const etiquetaSalas = (n: number) =>
    n === 1 ? t("live.lobby.roomsCountOne") : t("live.lobby.roomsCountMany").replace("{n}", String(n))

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
        3 · AS ACADEMIAS, COMO PASTAS.
        Fechado vê-se só a grelha de capas — uma pasta por academia, com o nome e a contagem de
        salas. Clicar abre as salas DESSA academia, e o estado vai na URL (`?academia=<slug>`)
        para um link de notificação cair já dentro da pasta. Antes eram chips de filtro com TODAS
        as academias abertas ao mesmo tempo: dezoito salas seguidas e nenhuma forma de escolher.
      */}
      <section id="salas" aria-labelledby="salas-titulo" className="scroll-mt-6 space-y-6">
        <div className="space-y-3">
          <h2 id="salas-titulo" className="text-xl font-bold tracking-tight text-white md:text-2xl">
            {aberta ? aberta.nome : t("live.lobby.academiesHeading")}
          </h2>
          <p className="text-sm text-gray-400">
            {aberta ? etiquetaSalas(aberta.salas.length) : t("live.lobby.academiesIntro")}
          </p>
        </div>

        {/* Os especialistas já aparecem no cartão de cada sala (e o perfil abre a partir dele): o
            carrossel à parte repetia a mesma informação duas vezes. */}

        {/*
          FECHADO: só as pastas. Uma grelha de capas, uma por academia, com o nome e a contagem.
          Nada de listas abertas por baixo — era isso que tornava a página num rolo sem fim.
        */}
        {!aberta ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Sem academias nenhumas (catálogo em baixo e zero salas) não se deixa um buraco. */}
            {seccoes.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-800 bg-black/30 p-6 text-center text-sm text-gray-500 sm:col-span-2 xl:col-span-3">
                {t("live.lobby.noRooms")}
              </p>
            )}
            {seccoes.map((seccao) => (
              <CartaoPasta
                key={seccao.chave}
                academia={seccao}
                etiqueta={etiquetaSalas(seccao.salas.length)}
                rotuloAbrir={t("live.lobby.openAcademy")}
                onAbrir={() => abrirPasta(seccao.chave)}
              />
            ))}
          </div>
        ) : (
          /*
            ABERTO: as salas desta academia, e um caminho de volta à vista.
            O botão de voltar é TAMBÉM o controlo da pasta (`aria-expanded`/`aria-controls`): quem
            usa leitor de ecrã ouve que a pasta está expandida e qual é o painel que ela comanda.
          */
          <div className="space-y-4">
            <button
              type="button"
              onClick={fecharPasta}
              aria-expanded
              aria-controls="pasta-academia"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#D2A63C]/40 bg-black/40 px-4 text-sm font-semibold text-[#E9C46A] transition hover:border-[#D2A63C] hover:bg-[#D2A63C]/10"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              {t("live.lobby.backToAcademies")}
            </button>

            <div id="pasta-academia">
              {aberta.salas.length === 0 ? (
                /* Pasta vazia diz-se pelo que é: ainda não há salas. Não se promete abertura
                   nenhuma — a academia está pronta, o que falta é o horário. */
                <p className="rounded-xl border border-dashed border-gray-800 bg-black/30 p-6 text-center text-sm text-gray-500">
                  {t("live.lobby.noRooms")}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {aberta.salas.map((sala) => {
                    const stream = porId.get(sala.id)
                    if (!stream) return null
                    return (
                      <StreamMarketCard
                        key={stream.id}
                        stream={stream}
                        featured={stream.is_live}
                        userPlan={user?.subscription_plan}
                        userType={user?.user_type}
                        memberCategory={user?.member_category}
                        onEducatorProfile={() => openEducatorFromStream(stream)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
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

/**
 * UMA PASTA DE ACADEMIA: a capa, o nome e a contagem.
 *
 * É um `<button>` e não um `<div>` com `onClick` porque tem de chegar por teclado e dizer o que é:
 * nome acessível («Abrir a academia · Forex») e estado (`aria-expanded={false}`, com o painel que
 * comanda). A capa é decorativa — o nome está no texto, e repeti-lo no `alt` fazia o leitor de
 * ecrã dizer a academia duas vezes.
 *
 * Sem capa não fica um buraco: fica a moldura em ouro com a inicial. Uma academia sem imagem não
 * é uma academia a menos.
 */
function CartaoPasta({
  academia,
  etiqueta,
  rotuloAbrir,
  onAbrir,
}: {
  academia: AcademiaComSalas
  etiqueta: string
  rotuloAbrir: string
  onAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-expanded={false}
      aria-controls="pasta-academia"
      aria-label={`${rotuloAbrir} · ${academia.nome} · ${etiqueta}`}
      className="group flex min-h-[44px] flex-col overflow-hidden rounded-2xl border border-[#D2A63C]/15 bg-gray-950/90 text-left transition hover:border-[#D2A63C]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]"
    >
      <div className="relative aspect-video w-full bg-gray-900">
        {academia.capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={academia.capa}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#D2A63C]/20 to-black">
            <span className="text-3xl font-black text-[#D2A63C]/70">{academia.nome.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {academia.aoVivo > 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {academia.aoVivo}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 p-4">
        <FolderOpen className="h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-snug text-white">{academia.nome}</p>
          <p className="text-xs text-gray-500">{etiqueta}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-600 transition group-hover:text-[#D2A63C]" aria-hidden />
      </div>
    </button>
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
