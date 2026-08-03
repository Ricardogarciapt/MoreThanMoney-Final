"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import EducatorDvrPanel from "@/components/live/educator-dvr-panel"
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Coins,
  Eye,
  EyeOff,
  LayoutGrid,
  PlusCircle,
  Radio,
  Settings2,
  Users,
  Youtube,
  MessageSquare,
  Mic2,
} from "lucide-react"
import EducatorFeedbacksList from "@/components/live/educator-feedbacks-list"
import StreamKeyCard from "@/components/live/stream-key-card"
import EducatorStudioLivePanel from "@/components/live/educator-studio-live-panel"
import EducatorLiveViewerBadge from "@/components/live/educator-live-viewer-badge"
import { LmsImageUploadField } from "@/components/admin/lms-image-upload-field"
import { ScheduleEditor } from "@/components/live/schedule-editor"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { LMS_CATEGORY_OPTIONS } from "@/lib/lms-categories"
import { DEFAULT_RESTREAM_INGEST_URL } from "@/lib/lms-restream"

type Academy = { id: string; name: string }
type StreamRow = {
  id: string
  title: string
  stream_key?: string | null
  rtmps_url?: string | null
  playback_url?: string | null
  restream_embed_url?: string | null
  is_live: boolean
  youtube_key?: string | null
  youtube_enabled?: boolean
  category?: string | null
  playback_mode?: "youtube_first" | "hls_first" | "auto" | null
  ingest_provider?: "restream" | "mtm_direct" | null
  scheduled_start_at?: string | null
  viewer_count?: number | null
  access_tier?: "all" | "app_member" | "premium" | "vip" | null
  thumbnail_url?: string | null
  square_image_url?: string | null
  playlist_url?: string | null
  playlist_title?: string | null
  playlist_access_tier?: "all" | "app_member" | "premium" | "vip" | null
}

const CATEGORIES = [{ value: "", label: "— Categoria —" }, ...LMS_CATEGORY_OPTIONS]

export default function EducatorStudio() {
  const [me, setMe] = useState<any>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [academies, setAcademies] = useState<Academy[]>([])
  const [error, setError] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newCategory, setNewCategory] = useState("")
  const [newScheduledAt, setNewScheduledAt] = useState("")
  const [recurrenceType, setRecurrenceType] = useState<"none" | "weekly" | "fortnightly" | "monthly">("none")
  const [recurrenceUntilAt, setRecurrenceUntilAt] = useState("")
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([])
  const [recurrenceMonthlyDays, setRecurrenceMonthlyDays] = useState("")
  const [creating, setCreating] = useState(false)
  const [keyOpStreamId, setKeyOpStreamId] = useState<string | null>(null)
  const [restreamSaving, setRestreamSaving] = useState(false)
  const [restreamKeyVisible, setRestreamKeyVisible] = useState(false)
  const [tiktokSaving, setTiktokSaving] = useState(false)
  const [tiktokKeyVisible, setTiktokKeyVisible] = useState(false)
  const [tiktokForm, setTiktokForm] = useState({ enabled: false, server: "", key: "" })
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceId, setVoiceId] = useState("")
  const DEFAULT_VOICE_ID = "1e0fa8b490c744acba94da72710e6db2" // clone Fish "Ricardo Garcia"
  const [restreamForm, setRestreamForm] = useState({
    enabled: false,
    ingest: DEFAULT_RESTREAM_INGEST_URL,
    key: "",
    embed: "",
  })

  const loadMe = async () => {
    const res = await fetch("/api/live-sessions/educator-auth/me", { credentials: "same-origin" }).then((r) => r.json())
    if (res.authenticated) setMe(res.educator)
  }

  const loadStreams = async (educatorId: string) => {
    const res = await fetch(`/api/live-sessions/streams?educatorId=${encodeURIComponent(educatorId)}`, {
      credentials: "same-origin",
    }).then((r) => r.json())
    setStreams(res.data || [])
  }

  useEffect(() => {
    fetch("/api/live-sessions/academies")
      .then((r) => r.json())
      .then((j) => setAcademies(j.data || []))
      .catch(() => setAcademies([]))
  }, [])

  useEffect(() => {
    loadMe()
  }, [])

  useEffect(() => {
    if (me?.educatorId) loadStreams(me.educatorId)
  }, [me])

  useEffect(() => {
    if (!me) return
    setRestreamForm({
      enabled: Boolean((me as any).restream_enabled),
      ingest: ((me as any).restream_ingest_url as string)?.trim() || DEFAULT_RESTREAM_INGEST_URL,
      key: ((me as any).restream_stream_key as string) || "",
      embed: ((me as any).restream_embed_url as string) || "",
    })
    setTiktokForm({
      enabled: Boolean((me as any).tiktok_enabled),
      server: ((me as any).tiktok_server as string) || "",
      key: ((me as any).tiktok_stream_key as string) || "",
    })
    setVoiceId(((me as any).fish_voice_id as string) || "")
  }, [me])

  const academyName = useMemo(() => {
    if (!me?.academy_id) return null
    return academies.find((a) => a.id === me.academy_id)?.name || "Academia"
  }, [me, academies])

  const liveCount = useMemo(() => streams.filter((s) => s.is_live).length, [streams])
  const liveStreams = useMemo(() => streams.filter((s) => s.is_live), [streams])
  const [studioPreviewStreamId, setStudioPreviewStreamId] = useState<string | null>(null)

  useEffect(() => {
    if (!me?.educatorId) return
    const ms = liveCount > 0 ? 3000 : 20000
    const t = setInterval(() => loadStreams(me.educatorId), ms)
    return () => clearInterval(t)
  }, [me?.educatorId, liveCount])

  useEffect(() => {
    if (liveStreams.length === 0) {
      setStudioPreviewStreamId(null)
      return
    }
    setStudioPreviewStreamId((prev) => {
      if (prev && liveStreams.some((s) => s.id === prev)) return prev
      return liveStreams[0].id
    })
  }, [liveStreams])
  const recurrenceWeekdayLabels: { value: number; label: string }[] = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
  ]

  const parseMonthlyDays = (raw: string, fallbackDay: number) => {
    const parts = raw
      .split(",")
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => Number.isFinite(n))

    const unique = Array.from(new Set(parts))
    const valid = unique.filter((n) => n >= 1 && n <= 31)
    return valid.length ? valid : [fallbackDay]
  }

  const generateRecurrenceStarts = (): string[] => {
    const start = new Date(newScheduledAt)
    const until = recurrenceUntilAt ? new Date(recurrenceUntilAt) : null

    if (!newScheduledAt || Number.isNaN(start.getTime())) return []
    if (!until || Number.isNaN(until.getTime()) || until.getTime() < start.getTime()) return []

    const MAX = 30
    const starts: string[] = []

    const startHours = start.getHours()
    const startMinutes = start.getMinutes()

    const pushIfValid = (d: Date) => {
      if (d.getTime() < start.getTime()) return
      if (d.getTime() > until.getTime()) return
      starts.push(d.toISOString())
    }

    if (recurrenceType === "monthly") {
      const days = parseMonthlyDays(recurrenceMonthlyDays, start.getDate())
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1, startHours, startMinutes, 0, 0)

      while (cursor.getTime() <= until.getTime() && starts.length < MAX) {
        const y = cursor.getFullYear()
        const m = cursor.getMonth()
        const dim = new Date(y, m + 1, 0).getDate()

        for (const dn of days) {
          const day = Math.min(dn, dim)
          const candidate = new Date(y, m, day, startHours, startMinutes, 0, 0)
          pushIfValid(candidate)
          if (starts.length >= MAX) break
        }

        cursor = new Date(y, m + 1, 1, startHours, startMinutes, 0, 0)
      }
    } else {
      const weekdays =
        recurrenceWeekdays.length > 0 ? recurrenceWeekdays : [start.getDay()] // 0=Dom, 1=Seg...

      let current = new Date(start)
      current.setSeconds(0, 0)

      const startMidnightUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())

      while (current.getTime() <= until.getTime() && starts.length < MAX) {
        const wd = current.getDay()
        if (weekdays.includes(wd)) {
          if (recurrenceType === "fortnightly") {
            const curMidnightUtc = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate())
            const weekIndex = Math.floor((curMidnightUtc - startMidnightUtc) / (7 * 86400000))
            if (weekIndex % 2 === 0) pushIfValid(new Date(current))
          } else {
            pushIfValid(new Date(current))
          }
        }

        current = new Date(current)
        current.setDate(current.getDate() + 1)
      }
    }

    // Ordena e remove duplicados (p.ex. se alguém escolher dias repetidos)
    return Array.from(new Set(starts)).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  }

  const login = async () => {
    setError("")
    const res = await fetch("/api/live-sessions/educator-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || "Erro ao entrar")
      return
    }
    await loadMe()
  }

  const logout = async () => {
    await fetch("/api/live-sessions/educator-auth/logout", { method: "POST", credentials: "same-origin" })
    setMe(null)
    setStreams([])
    setNewTitle("")
    setNewCategory("")
    setNewScheduledAt("")
    setRecurrenceType("none")
    setRecurrenceUntilAt("")
    setRecurrenceWeekdays([])
    setRecurrenceMonthlyDays("")
  }

  const createChannel = async () => {
    const title = newTitle.trim()
    const firstStart = newScheduledAt ? new Date(newScheduledAt) : null

    if (!title) return setError("Indica o título do canal.")
    if (!firstStart || Number.isNaN(firstStart.getTime())) return setError("Indica a data e hora da primeira sessão.")

    setCreating(true)
    setError("")
    try {
      const starts =
        recurrenceType === "none" ? [new Date(newScheduledAt).toISOString()] : generateRecurrenceStarts()

      if (recurrenceType !== "none" && starts.length === 0) {
        setError("Verifica a recorrência e o campo “até quando”.")
        return
      }

      // Cria as ocorrências (pode ser 1 ou várias)
      for (const scheduledStartAtIso of starts) {
        const res = await fetch("/api/live-sessions/educator-auth/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            title,
            category: newCategory || undefined,
            scheduled_start_at: scheduledStartAtIso || null,
          }),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json.error || "Erro ao criar sessão")
          return
        }
      }

      setNewTitle("")
      setNewCategory("")
      setNewScheduledAt("")
      setRecurrenceType("none")
      setRecurrenceUntilAt("")
      setRecurrenceWeekdays([])
      setRecurrenceMonthlyDays("")

      if (me?.educatorId) loadStreams(me.educatorId)
    } finally {
      setCreating(false)
    }
  }

  const patchStream = async (streamId: string, payload: Record<string, unknown>) => {
    const res = await fetch("/api/live-sessions/educator-auth/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ streamId, ...payload }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || "Erro ao guardar")
      return
    }
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  const deleteChannel = async (streamId: string, title: string) => {
    const ok = window.confirm(`Apagar o canal "${title}"? Esta ação não pode ser desfeita.`)
    if (!ok) return
    const res = await fetch("/api/live-sessions/educator-auth/streams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ streamId }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || "Erro ao apagar canal")
      return
    }
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  const clearChat = async (streamId: string) => {
    const ok = window.confirm("Apagar todas as mensagens deste chat agora?")
    if (!ok) return
    const res = await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
      method: "DELETE",
      credentials: "same-origin",
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || "Erro ao limpar chat")
    }
  }

  const setPresence = async (streamId: string, isLive: boolean) => {
    setError("")
    try {
      const res = await fetch("/api/live-sessions/educator-auth/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId, action: isLive ? "start" : "pause" }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || "Erro ao iniciar/desligar transmissão")
        return
      }
    } catch (e: any) {
      setError(e?.message || "Erro interno ao iniciar/desligar transmissão")
      return
    }

    if (me?.educatorId) await loadStreams(me.educatorId)
  }

  const saveYoutube = async (streamId: string, youtubeKey: string, youtubeEnabled: boolean) => {
    await fetch("/api/educator/update-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        streamId,
        youtube_key: youtubeKey,
        youtube_enabled: youtubeEnabled,
      }),
    })
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  const saveRestreamProfile = async () => {
    setRestreamSaving(true)
    setError("")
    try {
      const res = await fetch("/api/live-sessions/educator-auth/restream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          restream_enabled: restreamForm.enabled,
          restream_ingest_url: restreamForm.ingest.trim() || null,
          restream_stream_key: restreamForm.key.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || "Erro ao guardar Restream")
        return
      }
      await loadMe()
    } finally {
      setRestreamSaving(false)
    }
  }

  const saveTiktokProfile = async () => {
    setTiktokSaving(true)
    setError("")
    try {
      const res = await fetch("/api/educator/update-tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          tiktok_enabled: tiktokForm.enabled,
          tiktok_server: tiktokForm.server.trim() || null,
          tiktok_key: tiktokForm.key.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || "Erro ao guardar TikTok")
        return
      }
      await loadMe()
    } finally {
      setTiktokSaving(false)
    }
  }

  /** Define a voz Fish do educador para as traduções dobradas (vazio = Ricardo Garcia). */
  const saveVoiceProfile = async () => {
    setVoiceSaving(true)
    setError("")
    try {
      const res = await fetch("/api/live-sessions/educator-auth/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ fish_voice_id: voiceId.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || "Erro ao guardar a voz")
        return
      }
      await loadMe()
    } finally {
      setVoiceSaving(false)
    }
  }

  /** Sincroniza URL RTMP MTM e aplica a chave fixa ao canal (não gera chave nova). */
  const syncMtmIngest = async (streamId: string) => {
    setKeyOpStreamId(streamId)
    try {
      await fetch("/api/live-sessions/educator-auth/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId, action: "generate", regenerate: false }),
      })
      if (me?.educatorId) await loadStreams(me.educatorId)
    } finally {
      setKeyOpStreamId(null)
    }
  }

  /** Nova chave no formato mtm_… no servidor HLS MTM (não altera a chave Restream). */
  const regenerateMtmIngestKey = async (streamId: string) => {
    const ok = window.confirm(
      "Será gerada uma nova chave para o servidor More Than Money (formato mtm_…). Atualiza o OBS se enviares para esse servidor. A chave do Restream (cartão acima) não muda."
    )
    if (!ok) return
    setKeyOpStreamId(streamId)
    setError("")
    try {
      const res = await fetch("/api/live-sessions/educator-auth/regenerate-ingest-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || "Erro ao regenerar chave MTM")
        return
      }
      if (me?.educatorId) await loadStreams(me.educatorId)
    } finally {
      setKeyOpStreamId(null)
    }
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/live-sessions"
          className="inline-flex items-center text-sm text-gray-400 hover:text-[#D2A63C]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao lobby
        </Link>
        <Card className="border-[#D2A63C]/30 bg-gradient-to-br from-gray-950 to-black">
          <CardHeader>
            <CardTitle className="text-[#D2A63C]">Dashboard do educador</CardTitle>
            <p className="text-xs font-normal text-gray-400">
              Acesso separado dos alunos. Só vês os <strong>teus</strong> canais, chaves OBS e definições.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email do educador"
              className="border-gray-700 bg-black/50"
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="border-gray-700 bg-black/50"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button onClick={login} className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525]">
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Cabeçalho do studio — sempre no topo (identidade + estado + sair) */}
      <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-gray-800/80 bg-zinc-950/90 px-3 py-3 shadow-lg shadow-black/25 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/75 sm:-mx-0 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link
              href="/live-sessions"
              className="inline-flex shrink-0 items-center text-sm text-gray-400 hover:text-[#D2A63C]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Lobby
            </Link>
            <div className="hidden h-8 w-px shrink-0 bg-gray-800 sm:block" aria-hidden />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-white sm:text-xl">Olá, {me.displayName}</h2>
              <p className="truncate text-xs text-gray-500">{me.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline" className="max-w-full truncate border-gray-600 text-gray-300">
                  {academyName || "Academia — admin LMS"}
                </Badge>
                <Badge className={liveCount > 0 ? "bg-red-600 text-white" : "bg-gray-700 text-gray-200"}>
                  {liveCount} ao vivo · {streams.length} canal(is)
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="border-red-900/50 text-red-300" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      </div>

      {liveStreams.length > 0 && studioPreviewStreamId && (
        <Card className="overflow-hidden border-red-900/40 bg-gradient-to-br from-gray-950 via-black to-gray-950 shadow-[0_0_40px_rgba(220,38,38,0.12)]">
          <CardHeader className="border-b border-red-900/20 bg-red-950/20 pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base text-white">
              <Radio className="h-5 w-5 shrink-0 animate-pulse text-red-500" />
              Pré-visualização ao vivo + chat
            </CardTitle>
            <p className="text-xs font-normal text-gray-400">
              O mesmo sinal e chat que os alunos veem no lobby — gere a sessão sem mudar de página.
            </p>
            {liveStreams.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {liveStreams.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={studioPreviewStreamId === s.id ? "default" : "outline"}
                    className={
                      studioPreviewStreamId === s.id
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "border-gray-600 text-gray-300"
                    }
                    onClick={() => setStudioPreviewStreamId(s.id)}
                  >
                    {s.title}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <EducatorStudioLivePanel
              streamId={studioPreviewStreamId}
              title={liveStreams.find((s) => s.id === studioPreviewStreamId)?.title}
            />
          </CardContent>
        </Card>
      )}

      {streams.length > 0 && liveStreams.length === 0 && (
        <Card className="border border-dashed border-gray-700 bg-black/40">
          <CardContent className="flex items-start gap-3 py-4 text-sm text-gray-400">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
            <p>
              Quando <strong className="text-gray-300">iniciares a transmissão</strong> num canal abaixo, aparece aqui a
              pré-visualização do vídeo e o chat — para moderares e falares com a sala sem sair do studio.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <section className="min-w-0 space-y-4" aria-labelledby="studio-sessions-heading">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-800/60 pb-2">
            <div>
              <h3 id="studio-sessions-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Sessões e canais
              </h3>
              <p className="text-xs text-gray-500">Agenda, ingestão e arranque da live por sala.</p>
            </div>
          </div>

          <Tabs defaultValue="channels" className="w-full space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl border border-gray-800 bg-black/40 p-1 sm:inline-flex sm:w-auto sm:justify-start">
              <TabsTrigger
                value="channels"
                className="gap-2 rounded-lg px-4 py-2.5 text-sm data-[state=active]:border data-[state=active]:border-[#D2A63C]/35 data-[state=active]:bg-[#D2A63C]/12 data-[state=active]:text-[#D2A63C] data-[state=active]:shadow-none"
              >
                <LayoutGrid className="h-4 w-4 shrink-0" />
                Os meus canais
                {streams.length > 0 ? (
                  <span className="ml-1 rounded-full bg-gray-800/90 px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-300">
                    {streams.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="create"
                className="gap-2 rounded-lg px-4 py-2.5 text-sm data-[state=active]:border data-[state=active]:border-[#D2A63C]/35 data-[state=active]:bg-[#D2A63C]/12 data-[state=active]:text-[#D2A63C] data-[state=active]:shadow-none"
              >
                <PlusCircle className="h-4 w-4 shrink-0" />
                Nova sala
              </TabsTrigger>
              <TabsTrigger
                value="feedbacks"
                className="gap-2 rounded-lg px-4 py-2.5 text-sm data-[state=active]:border data-[state=active]:border-[#D2A63C]/35 data-[state=active]:bg-[#D2A63C]/12 data-[state=active]:text-[#D2A63C] data-[state=active]:shadow-none"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                Feedbacks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="mt-0 space-y-4 outline-none">
              {streams.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">
                  Ainda não tens canais. Usa o separador <strong className="text-gray-400">Nova sala</strong> ou pede ao
                  admin para te associar uma academia.
                </p>
              )}

              {streams.map((stream) => (
            <Card key={stream.id} className="overflow-hidden border-gray-800 bg-gradient-to-br from-gray-950 to-black">
              <CardHeader className="space-y-3 border-b border-gray-800/80 bg-black/30 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Nome da sessão editável pelo educador (commit no blur/Enter) */}
                      <input
                        type="text"
                        defaultValue={stream.title}
                        aria-label="Nome da sessão"
                        title="Editar o nome da sessão"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold text-white hover:border-gray-700 focus:border-[#D2A63C] focus:bg-black/40 focus:outline-none"
                        onBlur={(e) => {
                          const t = e.target.value.trim()
                          if (t && t !== stream.title) patchStream(stream.id, { title: t })
                          else e.target.value = stream.title
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        }}
                      />
                      <Badge className={stream.is_live ? "bg-red-600" : "bg-gray-700"}>
                        {stream.is_live ? "LIVE" : "OFFLINE"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">ID: {stream.id.slice(0, 8)}…</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      style={{ backgroundColor: stream.is_live ? "#b91c1c" : "#16a34a" }}
                      className={
                        stream.is_live
                          ? "text-white hover:brightness-110 animate-pulse shadow-[0_0_0_1px_rgba(248,113,113,0.25),0_0_24px_rgba(248,113,113,0.35)] transition-all"
                          : "text-white hover:brightness-110 hover:scale-[1.02] transition-all"
                      }
                      onClick={() => setPresence(stream.id, !stream.is_live)}
                    >
                      <Radio className="mr-1 h-3 w-3 text-white" />
                      {stream.is_live ? "Parar" : "Iniciar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-800 text-orange-200"
                      onClick={() => clearChat(stream.id)}
                    >
                      Limpar chat
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteChannel(stream.id, stream.title)}>
                      Apagar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Agenda (próxima live)</p>
                    <Input
                      type="datetime-local"
                      defaultValue={
                        stream.scheduled_start_at
                          ? new Date(stream.scheduled_start_at).toISOString().slice(0, 16)
                          : ""
                      }
                      className="border-gray-700 bg-black/50 text-sm"
                      onBlur={(e) =>
                        patchStream(stream.id, {
                          scheduled_start_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Categoria (lobby)</p>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-sm text-white"
                      defaultValue={stream.category || ""}
                      onChange={(e) => patchStream(stream.id, { category: e.target.value || null })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value || "none"} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Modo do player</p>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-sm text-white"
                      defaultValue={stream.playback_mode || "hls_first"}
                      onChange={(e) => patchStream(stream.id, { playback_mode: e.target.value })}
                    >
                      <option value="youtube_first">YouTube primeiro (seguro)</option>
                      <option value="hls_first">HLS primeiro (baixa latência)</option>
                      <option value="auto">Auto (prefere HLS em live)</option>
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Ingest OBS</p>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-sm text-white"
                      defaultValue={stream.ingest_provider || "restream"}
                      onChange={(e) => patchStream(stream.id, { ingest_provider: e.target.value })}
                    >
                      <option value="restream">Restream</option>
                      <option value="mtm_direct">MTM direto (OBS - menor latência)</option>
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Plano de acesso</p>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-sm text-white"
                      defaultValue={stream.access_tier || "all"}
                      onChange={(e) => patchStream(stream.id, { access_tier: e.target.value || null })}
                    >
                      <option value="free">Gratuito — público (/FreeSession)</option>
                      <option value="all">Todos os membros</option>
                      <option value="app_member">Pack Membro ($35/mês)</option>
                      <option value="premium">Pack Premium ($65/mês)</option>
                      <option value="vip">VIP apenas</option>
                    </select>
                  </div>
                </div>

                {/* Imagens da sala + playlist de aulas */}
                <div className="grid gap-3 md:grid-cols-2">
                  <LmsImageUploadField
                    label="Thumbnail da sala"
                    description="Cartão da live no lobby; se vazio, usa a tua foto."
                    scope="stream_thumbnail"
                    refId={stream.id}
                    value={stream.thumbnail_url || ""}
                    commit="blur"
                    uploadUrl="/api/live-sessions/educator-auth/upload-image"
                    onUrlChange={(url) => patchStream(stream.id, { thumbnail_url: url.trim() || null })}
                  />
                  <LmsImageUploadField
                    label="Imagem quadrada da sala"
                    description="Versão quadrada (grelhas/avatar da sala)."
                    scope="stream_square"
                    refId={stream.id}
                    value={stream.square_image_url || ""}
                    commit="blur"
                    uploadUrl="/api/live-sessions/educator-auth/upload-image"
                    onUrlChange={(url) => patchStream(stream.id, { square_image_url: url.trim() || null })}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Playlist YouTube (rever aulas)</p>
                    <Input
                      defaultValue={stream.playlist_title || ""}
                      className="mb-1 border-gray-700 bg-black/50 text-xs"
                      placeholder="Nome da playlist (ex: Aulas de Sensei)"
                      onBlur={(e) => patchStream(stream.id, { playlist_title: e.target.value.trim() || null })}
                    />
                    <Input
                      defaultValue={stream.playlist_url || ""}
                      className="border-gray-700 bg-black/50 text-xs"
                      placeholder="https://youtube.com/playlist?list=…"
                      onBlur={(e) => patchStream(stream.id, { playlist_url: e.target.value.trim() || null })}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Quem vê a playlist</p>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-sm text-white"
                      defaultValue={stream.playlist_access_tier || ""}
                      onChange={(e) => patchStream(stream.id, { playlist_access_tier: e.target.value || null })}
                    >
                      <option value="">Todos</option>
                      <option value="app_member">Membro ($35) e superiores</option>
                      <option value="premium">Premium ($65) apenas</option>
                      <option value="vip">VIP apenas</option>
                    </select>
                  </div>
                </div>

                {/* Horário semanal recorrente desta sala */}
                <ScheduleEditor streamId={stream.id} apiBase="/api/live-sessions/educator-auth/schedules" title="Horário semanal desta sala" />

                <Collapsible defaultOpen={false} className="rounded-lg border border-gray-800/90 bg-black/25">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/[0.04]">
                    <span className="font-medium text-gray-200">Chaves RTMP, playback e YouTube</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 border-t border-gray-800/60 px-3 pb-3 pt-3">
                    <StreamKeyCard
                      title="Servidor RTMP MTM (OBS)"
                      intro={
                        <>
                          No OBS: define <strong className="text-gray-400">Serviço personalizado</strong> e cola o
                          servidor + a chave (campos separados). A chave é <strong className="text-gray-400">fixa e única por educador</strong> —
                          usa <strong className="text-gray-400">Copiar</strong>. Se precisares, gera uma{" "}
                          <strong className="text-gray-400">nova chave</strong> (aplica-se a todas as tuas salas).
                        </>
                      }
                      hideDeployHint
                      rtmpUrl={stream.rtmps_url}
                      streamKey={stream.stream_key}
                      onRegenerate={() => regenerateMtmIngestKey(stream.id)}
                      loading={keyOpStreamId === stream.id}
                    />
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">Playback URL manual (YouTube, etc.)</p>
                      <Input
                        defaultValue={stream.playback_url || ""}
                        className="border-gray-700 bg-black/50 text-xs"
                        placeholder="https://… (opcional; sobrepõe Restream/HLS)"
                        onBlur={(e) =>
                          patchStream(stream.id, { playback_url: e.target.value.trim() || null })
                        }
                      />
                    </div>
                    <div className="space-y-2 rounded-lg border border-red-900/30 bg-red-950/20 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-white">
                        <Youtube className="h-4 w-4 text-red-500" />
                        YouTube Multistream
                      </p>
                      <Input
                        key={stream.id + "-yt"}
                        defaultValue={stream.youtube_key || ""}
                        placeholder="YouTube Stream Key"
                        className="border-gray-700 bg-black/50"
                        onBlur={(e) => saveYoutube(stream.id, e.target.value, Boolean(stream.youtube_enabled))}
                      />
                      <label className="flex items-center gap-2 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          defaultChecked={Boolean(stream.youtube_enabled)}
                          onChange={(e) => saveYoutube(stream.id, String(stream.youtube_key || ""), e.target.checked)}
                        />
                        Ativar YouTube
                      </label>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
            </TabsContent>

            <TabsContent value="feedbacks" className="mt-0 outline-none">
              {me?.educatorId ? (
                <EducatorFeedbacksList educatorId={me.educatorId} variant="studio" />
              ) : (
                <p className="text-sm text-gray-500">Inicia sessão no studio para ver os teus feedbacks.</p>
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-0 outline-none">
              <Card className="border-[#D2A63C]/20 bg-gray-950/80">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-[#D2A63C]">
                    <Settings2 className="h-4 w-4" />
                    Criar novo canal
                  </CardTitle>
                  <p className="text-xs font-normal text-gray-500">
                    Cada canal nasce já com <strong className="text-gray-400">servidor e chave <code className="text-gray-500">mtm_…</code></strong>{" "}
                    atribuídos (servidor RTMP More Than Money). No OBS usa o cartão{" "}
                    <strong className="text-gray-400">Servidor RTMP MTM</strong> de cada sala — não precisas de gerar chaves.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Título da sessão / sala"
                    className="border-gray-700 bg-black/50"
                  />
                  <select
                    className="w-full rounded-md border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value || "none"} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="datetime-local"
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    className="border-gray-700 bg-black/50 text-sm"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Repetir</p>
                      <select
                        className="w-full rounded-md border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
                        value={recurrenceType}
                        onChange={(e) => setRecurrenceType(e.target.value as any)}
                      >
                        <option value="none">Sem repetição</option>
                        <option value="weekly">Semanal</option>
                        <option value="fortnightly">Quinzenal</option>
                        <option value="monthly">Mensal</option>
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Até quando</p>
                      <Input
                        type="datetime-local"
                        value={recurrenceUntilAt}
                        onChange={(e) => setRecurrenceUntilAt(e.target.value)}
                        className="border-gray-700 bg-black/50 text-sm"
                      />
                    </div>
                  </div>

                  {recurrenceType === "weekly" || recurrenceType === "fortnightly" ? (
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Dias da semana</p>
                      <div className="flex flex-wrap gap-2">
                        {recurrenceWeekdayLabels.map((d) => (
                          <label
                            key={d.value}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-300"
                          >
                            <input
                              type="checkbox"
                              checked={recurrenceWeekdays.includes(d.value)}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setRecurrenceWeekdays((prev) => {
                                  if (checked) return Array.from(new Set([...prev, d.value])).sort()
                                  return prev.filter((x) => x !== d.value)
                                })
                              }}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {recurrenceType === "monthly" ? (
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Dias do mês</p>
                      <Input
                        value={recurrenceMonthlyDays}
                        onChange={(e) => setRecurrenceMonthlyDays(e.target.value)}
                        placeholder={`Ex: ${newScheduledAt ? new Date(newScheduledAt).getDate() : 1}`}
                        className="border-gray-700 bg-black/50 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        Formato: números separados por vírgula (ex.: <code className="text-gray-400">1,15,30</code>)
                      </p>
                    </div>
                  ) : null}

                  <Button
                    onClick={createChannel}
                    disabled={creating || !newTitle.trim() || !newScheduledAt}
                    className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                  >
                    {creating ? "A criar…" : recurrenceType === "none" ? "Criar sala" : "Criar recorrência"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          {/* Foto de educador — editável pelo próprio (auto-guarda) */}
          <div className="rounded-xl border border-gray-800/80 bg-zinc-950/60 p-3">
            <LmsImageUploadField
              label="A tua foto (educador)"
              description="Aparece na tua sala e no lobby. Quadrada fica melhor."
              scope="educator_avatar"
              value={me.avatar_url || ""}
              commit="blur"
              uploadUrl="/api/live-sessions/educator-auth/upload-image"
              onUrlChange={() => {
                loadMe()
              }}
            />
          </div>

          <div className="hidden rounded-lg border border-gray-800/60 bg-black/25 px-3 py-2 xl:block">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Integração e métricas</p>
            <p className="mt-0.5 text-xs text-gray-600">Restream ao nível do teu perfil; contadores por canal.</p>
          </div>

          <Card className="border border-fuchsia-900/40 bg-gradient-to-br from-gray-950 to-black">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-fuchsia-300">
                <Radio className="h-4 w-4" />
                TikTok LIVE (multistream)
              </CardTitle>
              <p className="text-xs font-normal text-gray-500">
                Transmites <strong className="text-gray-400">1×</strong> para o servidor MTM e o site
                replica a stream para o teu <strong className="text-gray-400">TikTok</strong> ao mesmo tempo.
                Cola o <strong className="text-gray-400">Server</strong> + a <strong className="text-gray-400">Stream Key</strong>{" "}
                que o TikTok LIVE te dá (app → LIVE → transmitir com software de terceiros).
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={tiktokForm.enabled}
                  onChange={(e) => setTiktokForm((p) => ({ ...p, enabled: e.target.checked }))}
                />
                Ativar multistream para o TikTok
              </label>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Server TikTok (rtmp://…)</p>
                <Input
                  value={tiktokForm.server}
                  onChange={(e) => setTiktokForm((p) => ({ ...p, server: e.target.value }))}
                  className="border-gray-700 bg-black/50 font-mono text-xs"
                  placeholder="rtmp://…tiktokcdn.com/live/"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Stream Key TikTok</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <Input
                    type={tiktokKeyVisible ? "text" : "password"}
                    value={tiktokForm.key}
                    onChange={(e) => setTiktokForm((p) => ({ ...p, key: e.target.value }))}
                    className="border-gray-700 bg-black/50 font-mono text-xs sm:flex-1"
                    placeholder="Cola a Stream Key do TikTok LIVE"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-gray-600 text-gray-200"
                    onClick={() => setTiktokKeyVisible((v) => !v)}
                  >
                    {tiktokKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="ml-2">{tiktokKeyVisible ? "Ocultar" : "Mostrar"}</span>
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                disabled={tiktokSaving}
                className="bg-fuchsia-700 text-white hover:bg-fuchsia-600"
                onClick={saveTiktokProfile}
              >
                {tiktokSaving ? "A guardar…" : "Guardar TikTok"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-emerald-900/40 bg-gradient-to-br from-gray-950 to-black">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-emerald-300">
                <Mic2 className="h-4 w-4" />
                Voz da dobragem (Fish AI)
              </CardTitle>
              <p className="text-xs font-normal text-gray-500">
                As sessões são traduzidas ao vivo (EN/ES/DE…) e faladas na tua{" "}
                <strong className="text-gray-400">voz clonada</strong>. Cola o{" "}
                <strong className="text-gray-400">Voice ID</strong> do teu modelo Fish Audio.
                Se deixares vazio, usamos a voz <strong className="text-gray-400">Ricardo Garcia</strong> (default).
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Fish Voice ID</p>
                <Input
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="border-gray-700 bg-black/50 font-mono text-xs"
                  placeholder={`${DEFAULT_VOICE_ID} (Ricardo Garcia)`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  {voiceId.trim()
                    ? "A dobragem das tuas sessões usa esta voz."
                    : "Sem ID definido → dobragem na voz Ricardo Garcia."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={voiceSaving}
                  className="bg-emerald-700 text-white hover:bg-emerald-600"
                  onClick={saveVoiceProfile}
                >
                  {voiceSaving ? "A guardar…" : "Guardar voz"}
                </Button>
                {voiceId.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-gray-600 text-gray-300"
                    onClick={() => setVoiceId("")}
                  >
                    Repor Ricardo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <EducatorDvrPanel />

          <Card className="border-gray-800 bg-gray-950/90">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <BarChart3 className="h-4 w-4 text-[#D2A63C]" />
                Analytics (tempo real)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-400">
              <div className="flex items-center justify-between rounded border border-gray-800 p-2">
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Salas ao vivo
                </span>
                <span className="font-mono text-white">{liveCount}</span>
              </div>
              {streams.map((s) => (
                <div key={s.id} className="rounded border border-gray-800/80 p-2">
                  <p className="truncate font-medium text-gray-300">{s.title}</p>
                  <p className="mt-1 flex justify-between">
                    <span>{s.is_live ? "A assistir agora" : "Última audiência"}</span>
                    <span className="font-mono text-[#D2A63C]">{s.viewer_count ?? 0}</span>
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#D2A63C]/15 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-[#D2A63C]">
                <Coins className="h-4 w-4" />
                Monetização
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-500">
              Gorjetas e pagamentos por sessão podem ser ligados aqui numa fase seguinte (Stripe / Skool).
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
