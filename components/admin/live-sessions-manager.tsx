"use client"

import { useEffect, useMemo, useState } from "react"
import { LMS_OFFICIAL_ACADEMIES_COPY } from "@/lib/lms-academies"
import { LMS_CATEGORY_OPTIONS } from "@/lib/lms-categories"
import { DEFAULT_RESTREAM_INGEST_URL } from "@/lib/lms-restream"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LmsImageUploadField } from "@/components/admin/lms-image-upload-field"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SessionsTimetable } from "@/components/live/sessions-timetable"
import { ScheduleEditor } from "@/components/live/schedule-editor"
import { ptWallTimeToUtcIso, toNaiveLocalWall } from "@/lib/pt-time"
import { toast } from "sonner"

type Academy = { id: string; name: string; slug: string }
type Educator = {
  id: string
  display_name: string
  email: string
  bio?: string | null
  specialty?: string | null
  avatar_url?: string | null
  academy_id?: string | null
  is_active: boolean
  stream_key_fixed?: string | null
  restream_enabled?: boolean
  restream_ingest_url?: string | null
  restream_stream_key?: string | null
  restream_embed_url?: string | null
}
type Stream = {
  id: string
  title: string
  stream_key?: string | null
  rtmps_url?: string | null
  playback_url?: string | null
  restream_embed_url?: string | null
  thumbnail_url?: string | null
  is_live: boolean
  educator_id: string
  category?: string | null
  playback_mode?: "youtube_first" | "hls_first" | "auto" | null
  ingest_provider?: "restream" | "mtm_direct" | null
  scheduled_start_at?: string | null
  viewer_count?: number | null
  access_tier?: "all" | "app_member" | "premium" | "vip" | null
  square_image_url?: string | null
  playlist_url?: string | null
  playlist_title?: string | null
  playlist_access_tier?: "all" | "app_member" | "premium" | "vip" | null
  academy?: { name: string }
  educator?: { display_name: string }
}

export default function LiveSessionsManager() {
  const [academies, setAcademies] = useState<Academy[]>([])
  const [educators, setEducators] = useState<Educator[]>([])
  const [streams, setStreams] = useState<Stream[]>([])

  const [academyName, setAcademyName] = useState("")
  const [academyDesc, setAcademyDesc] = useState("")

  const [educatorForm, setEducatorForm] = useState<any>({
    email: "",
    display_name: "",
    password: "",
    academy_id: "",
    bio: "",
    specialty: "",
    avatar_url: "",
  })

  const [streamForm, setStreamForm] = useState<any>({
    title: "",
    academy_id: "",
    educator_id: "",
    description: "",
    thumbnail_url: "",
    playback_url: "",
    restream_embed_url: "",
    rtmps_url: "",
    stream_key: "",
    category: "",
    playback_mode: "youtube_first",
    ingest_provider: "restream",
    scheduled_start_at: "",
    viewer_count: "",
    recurrence_type: "none", // none | weekly | fortnightly | monthly
    recurrence_until_at: "",
    recurrence_weekdays: [] as number[], // 0=Dom ... 6=Sáb
    recurrence_monthly_days: "", // ex: "1,15,30"
    access_tier: "all", // all | app_member | premium
  })
  const [editingEducatorId, setEditingEducatorId] = useState<string | null>(null)
  const [editingEducatorForm, setEditingEducatorForm] = useState<any>({
    display_name: "",
    bio: "",
    specialty: "",
    avatar_url: "",
    academy_id: "",
    password: "",
    is_active: true,
    restream_enabled: false,
    restream_ingest_url: DEFAULT_RESTREAM_INGEST_URL,
    restream_stream_key: "",
    restream_embed_url: "",
  })

  const load = async () => {
    const parseJson = async (res: Response) => {
      const text = await res.text()
      if (!text.trim()) return {}
      try {
        return JSON.parse(text) as { data?: unknown }
      } catch {
        return {}
      }
    }
    try {
      const [aRes, eRes, sRes] = await Promise.all([
        fetch("/api/admin/live-sessions/academies", { credentials: "same-origin" }),
        fetch("/api/admin/live-sessions/educators", { credentials: "same-origin" }),
        fetch("/api/admin/live-sessions/streams", { credentials: "same-origin" }),
      ])
      const [a, e, s] = await Promise.all([parseJson(aRes), parseJson(eRes), parseJson(sRes)])
      setAcademies(Array.isArray(a.data) ? (a.data as Academy[]) : [])
      setEducators(Array.isArray(e.data) ? (e.data as Educator[]) : [])
      setStreams(Array.isArray(s.data) ? (s.data as Stream[]) : [])
    } catch {
      toast.error("Não foi possível carregar o LMS. Recarrega a página ou tenta noutro navegador.")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createAcademy = async () => {
    await fetch("/api/admin/live-sessions/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: academyName, description: academyDesc }),
    })
    setAcademyName("")
    setAcademyDesc("")
    load()
  }

  const createEducator = async () => {
    await fetch("/api/admin/live-sessions/educators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: educatorForm.display_name,
        email: educatorForm.email,
        password: educatorForm.password,
        academy_id: educatorForm.academy_id || null,
        bio: educatorForm.bio || null,
        specialty: educatorForm.specialty || null,
        avatar_url: educatorForm.avatar_url || null,
      }),
    })
    setEducatorForm({ email: "", display_name: "", password: "", academy_id: "", bio: "", specialty: "", avatar_url: "" })
    load()
  }

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
    const startStr = streamForm.scheduled_start_at
    const untilStr = streamForm.recurrence_until_at
    const type = streamForm.recurrence_type as string

    if (!startStr || !untilStr) return []

    const start = new Date(startStr)
    const until = new Date(untilStr)

    if (Number.isNaN(start.getTime()) || Number.isNaN(until.getTime()) || until.getTime() < start.getTime()) return []

    const MAX = 30
    const starts: string[] = []

    const startHours = start.getHours()
    const startMinutes = start.getMinutes()

    const pushIfValid = (d: Date) => {
      if (d.getTime() < start.getTime()) return
      if (d.getTime() > until.getTime()) return
      // A hora de parede (ex.: 21:00) é sempre hora de Portugal, independentemente do
      // fuso do browser do admin → convertida para o instante UTC correto (DST-aware).
      starts.push(ptWallTimeToUtcIso(toNaiveLocalWall(d)))
    }

    if (type === "monthly") {
      const days = parseMonthlyDays(String(streamForm.recurrence_monthly_days || ""), start.getDate())
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
      const weekdays: number[] =
        Array.isArray(streamForm.recurrence_weekdays) && streamForm.recurrence_weekdays.length > 0
          ? streamForm.recurrence_weekdays
          : [start.getDay()]

      const startMidnightUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
      let current = new Date(start)
      current.setSeconds(0, 0)

      while (current.getTime() <= until.getTime() && starts.length < MAX) {
        const wd = current.getDay()
        if (weekdays.includes(wd)) {
          if (type === "fortnightly") {
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

    return Array.from(new Set(starts)).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  }

  const createStream = async () => {
    const type = streamForm.recurrence_type as string

    const commonPayload = {
      ...streamForm,
      category: streamForm.category || null,
      playback_mode: streamForm.playback_mode || "youtube_first",
      ingest_provider: streamForm.ingest_provider || "restream",
      viewer_count:
        streamForm.viewer_count === "" || streamForm.viewer_count === undefined ? 0 : Number(streamForm.viewer_count),
    }

    if (!streamForm.scheduled_start_at) {
      toast.error("Indica a data/hora da sessão.")
      return
    }

    if (type === "none") {
      const payload = {
        ...commonPayload,
        // "21:00" = 21:00 de Portugal → instante UTC correto (DST-aware), para não
        // aparecer 1h à frente no site/apps.
        scheduled_start_at: streamForm.scheduled_start_at
          ? ptWallTimeToUtcIso(streamForm.scheduled_start_at)
          : null,
      }
      await fetch("/api/admin/live-sessions/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } else {
      const starts = generateRecurrenceStarts()
      if (starts.length === 0) {
        toast.error("Verifica a recorrência e o campo “até quando”.")
        return
      }

      for (const scheduledStartAtIso of starts) {
        const payload = {
          ...commonPayload,
          scheduled_start_at: scheduledStartAtIso,
        }
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch("/api/admin/live-sessions/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(json.error || "Erro ao criar sessão recorrente")
          return
        }
      }
    }

    setStreamForm({
      title: "",
      academy_id: "",
      educator_id: "",
      description: "",
      thumbnail_url: "",
      playback_url: "",
      restream_embed_url: "",
      rtmps_url: "",
      stream_key: "",
      category: "",
      playback_mode: "youtube_first",
      ingest_provider: "restream",
      scheduled_start_at: "",
      viewer_count: "",
      recurrence_type: "none",
      recurrence_until_at: "",
      recurrence_weekdays: [],
      recurrence_monthly_days: "",
      access_tier: "all",
    })
    load()
  }

  const patchStreamAdmin = async (streamId: string, payload: Record<string, unknown>) => {
    await fetch("/api/admin/live-sessions/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: streamId, ...payload }),
    })
    load()
  }

  const toggleLive = async (stream: any) => {
    await fetch("/api/admin/live-sessions/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stream.id, is_live: !stream.is_live }),
    })
    load()
  }

  const resetKey = async (streamId: string) => {
    await fetch("/api/admin/live-sessions/streams/reset-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId }),
    })
    load()
  }

  const deleteStream = async (streamId: string, title: string) => {
    const ok = window.confirm(`Apagar o canal "${title}"? O chat associado também será removido.`)
    if (!ok) return
    await fetch("/api/admin/live-sessions/streams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: streamId }),
    })
    load()
  }

  const streamsByEducator = useMemo(() => {
    const map = new Map<string, Stream[]>()
    for (const stream of streams) {
      const list = map.get(stream.educator_id) || []
      list.push(stream)
      map.set(stream.educator_id, list)
    }
    return map
  }, [streams])

  const beginEditEducator = (educator: Educator) => {
    setEditingEducatorId(educator.id)
    setEditingEducatorForm({
      email: (educator as any).email || "",
      display_name: educator.display_name || "",
      bio: educator.bio || "",
      specialty: educator.specialty || "",
      avatar_url: educator.avatar_url || "",
      academy_id: educator.academy_id || "",
      password: "",
      is_active: educator.is_active,
      restream_enabled: Boolean(educator.restream_enabled),
      restream_ingest_url: (educator.restream_ingest_url || "").trim() || DEFAULT_RESTREAM_INGEST_URL,
      restream_stream_key: educator.restream_stream_key || "",
      restream_embed_url: educator.restream_embed_url || "",
    })
  }

  const saveEducator = async () => {
    if (!editingEducatorId) return
    await fetch("/api/admin/live-sessions/educators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingEducatorId,
        email: editingEducatorForm.email,
        display_name: editingEducatorForm.display_name,
        bio: editingEducatorForm.bio,
        specialty: editingEducatorForm.specialty,
        avatar_url: editingEducatorForm.avatar_url,
        academy_id: editingEducatorForm.academy_id || null,
        is_active: Boolean(editingEducatorForm.is_active),
        password: editingEducatorForm.password || undefined,
        restream_enabled: Boolean(editingEducatorForm.restream_enabled),
        restream_ingest_url: String(editingEducatorForm.restream_ingest_url || "").trim() || null,
        restream_stream_key: String(editingEducatorForm.restream_stream_key || "").trim() || null,
        restream_embed_url: String(editingEducatorForm.restream_embed_url || "").trim() || null,
      }),
    })
    setEditingEducatorId(null)
    setEditingEducatorForm({
      display_name: "",
      bio: "",
      specialty: "",
      avatar_url: "",
      academy_id: "",
      password: "",
      is_active: true,
      restream_enabled: false,
      restream_ingest_url: DEFAULT_RESTREAM_INGEST_URL,
      restream_stream_key: "",
      restream_embed_url: "",
    })
    load()
  }

  const removeEducator = async (educator: Educator) => {
    const ok = window.confirm(`Apagar o educador ${educator.display_name}? Esta ação remove também os streams associados.`)
    if (!ok) return

    await fetch("/api/admin/live-sessions/educators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: educator.id }),
    })
    if (editingEducatorId === educator.id) {
      setEditingEducatorId(null)
    }
    load()
  }

  const generateObsKeyForEducator = async (educator: Educator) => {
    const educatorStreams = streamsByEducator.get(educator.id) || []
    if (educatorStreams.length === 0) {
      window.alert("Este educador ainda não tem stream criado. Crie um stream primeiro.")
      return
    }

    const stream = educatorStreams[0]
    await resetKey(stream.id)
  }

  return (
    <Tabs defaultValue="educacao" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-gray-900/60">
        <TabsTrigger value="educacao">Educação</TabsTrigger>
        <TabsTrigger value="educadores">Educadores</TabsTrigger>
        <TabsTrigger value="salas">Salas e canais</TabsTrigger>
        <TabsTrigger value="horario">Horário</TabsTrigger>
      </TabsList>

      <TabsContent value="educacao" className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 backdrop-blur-sm">
        <h3 className="font-semibold tracking-tight text-[#D2A63C]">Academias</h3>
        <p className="text-xs leading-relaxed text-gray-400">
          Academias oficiais MTM (seed / lobby):{" "}
          {LMS_OFFICIAL_ACADEMIES_COPY.map((a) => a.name).join(" · ")}. Usa slugs alinhados à migração quando criares novas entradas.
        </p>
        <Input value={academyName} onChange={(e) => setAcademyName(e.target.value)} placeholder="Nome da academia" />
        <Textarea value={academyDesc} onChange={(e) => setAcademyDesc(e.target.value)} placeholder="Descrição" />
        <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]" onClick={createAcademy}>
          Criar academia
        </Button>
        <div className="space-y-1 text-xs text-gray-300">
          {academies.map((a) => (
            <p key={a.id}>
              • {a.name} <span className="text-gray-500">({a.slug})</span>
            </p>
          ))}
        </div>
      </div>
      </TabsContent>

      <TabsContent value="educadores" className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 backdrop-blur-sm">
        <h3 className="text-[#D2A63C] font-semibold">Educadores (login separado)</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <Input
            value={educatorForm.display_name}
            onChange={(e) => setEducatorForm((p: any) => ({ ...p, display_name: e.target.value }))}
            placeholder="Nome do educador"
          />
          <Input
            value={educatorForm.email}
            onChange={(e) => setEducatorForm((p: any) => ({ ...p, email: e.target.value }))}
            placeholder="Email do educador"
          />
          <Input
            type="password"
            value={educatorForm.password}
            onChange={(e) => setEducatorForm((p: any) => ({ ...p, password: e.target.value }))}
            placeholder="Password"
          />
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={educatorForm.academy_id}
            onChange={(e) => setEducatorForm((p: any) => ({ ...p, academy_id: e.target.value }))}
          >
            <option value="">Academia</option>
            {academies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Textarea
          value={educatorForm.bio}
          onChange={(e) => setEducatorForm((p: any) => ({ ...p, bio: e.target.value }))}
          placeholder="Biografia"
        />
        <Input
          value={educatorForm.specialty}
          onChange={(e) => setEducatorForm((p: any) => ({ ...p, specialty: e.target.value }))}
          placeholder="Especialidade (ex: Fiscalidade, Cripto) — aparece no lobby"
        />
        <LmsImageUploadField
          label="Foto / avatar do educador"
          description="Aparece no lobby, cartões «Educadores ao vivo» e na app mobile."
          scope="educator_avatar"
          value={educatorForm.avatar_url || ""}
          onUrlChange={(url) => setEducatorForm((p: any) => ({ ...p, avatar_url: url }))}
        />
        <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createEducator}>
          Criar educador
        </Button>
        <div className="space-y-2 pt-2">
          {educators.map((e) => {
            const educatorStreams = streamsByEducator.get(e.id) || []
            const firstStream = educatorStreams[0]
            const isEditing = editingEducatorId === e.id

            return (
              <div key={e.id} className="space-y-2 rounded-lg border border-[#D2A63C]/15 bg-black/30 p-3 text-xs text-gray-200">
                <div className="flex gap-3">
                  {e.avatar_url?.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.avatar_url.trim()}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg border border-gray-600 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-500">
                      sem foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{e.display_name}</p>
                  <p>{e.email} {e.is_active ? "(ativo)" : "(inativo)"}</p>
                  <p className="text-gray-400">Streams: {educatorStreams.length}</p>
                  {e.restream_enabled && (
                    <p className="text-cyan-400">Restream ativo no site (player por embed)</p>
                  )}
                  {firstStream && (
                    <>
                      <p className="text-gray-300">RTMPS: {firstStream.rtmps_url || "não definida"}</p>
                      <p className="text-gray-300">Chave OBS fixa: {e.stream_key_fixed || firstStream.stream_key || "não definida"}</p>
                    </>
                  )}
                  </div>
                </div>

                {isEditing && (
                  <div className="grid md:grid-cols-2 gap-2">
                    <Input
                      value={editingEducatorForm.email}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, email: event.target.value }))}
                      placeholder="Email de login"
                    />
                    <Input
                      value={editingEducatorForm.display_name}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, display_name: event.target.value }))}
                      placeholder="Nome"
                    />
                    <select
                      className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
                      value={editingEducatorForm.academy_id}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, academy_id: event.target.value }))}
                    >
                      <option value="">Academia</option>
                      {academies.map((academy) => (
                        <option key={academy.id} value={academy.id}>
                          {academy.name}
                        </option>
                      ))}
                    </select>
                    <div className="md:col-span-2">
                      <LmsImageUploadField
                        label="Foto / avatar do educador"
                        description="Lobby e listagens públicas."
                        scope="educator_avatar"
                        refId={e.id}
                        value={editingEducatorForm.avatar_url || ""}
                        onUrlChange={(url) => setEditingEducatorForm((prev: any) => ({ ...prev, avatar_url: url }))}
                      />
                    </div>
                    <Input
                      type="password"
                      value={editingEducatorForm.password}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, password: event.target.value }))}
                      placeholder="Nova password (opcional)"
                    />
                    <Textarea
                      className="md:col-span-2"
                      value={editingEducatorForm.bio}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, bio: event.target.value }))}
                      placeholder="Biografia"
                    />
                    <Input
                      className="md:col-span-2"
                      value={editingEducatorForm.specialty}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, specialty: event.target.value }))}
                      placeholder="Especialidade (lobby)"
                    />
                    <label className="md:col-span-2 inline-flex items-center gap-2 text-gray-300">
                      <input
                        type="checkbox"
                        checked={Boolean(editingEducatorForm.is_active)}
                        onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, is_active: event.target.checked }))}
                      />
                      Educador ativo
                    </label>
                    <p className="md:col-span-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-600/90">
                      Restream.io (OBS → Restream → MTM)
                    </p>
                    <label className="md:col-span-2 inline-flex items-center gap-2 text-gray-300">
                      <input
                        type="checkbox"
                        checked={Boolean(editingEducatorForm.restream_enabled)}
                        onChange={(event) =>
                          setEditingEducatorForm((prev: any) => ({ ...prev, restream_enabled: event.target.checked }))
                        }
                      />
                      Usar player Restream no site para este educador
                    </label>
                    <Input
                      className="md:col-span-2 font-mono text-[11px]"
                      value={editingEducatorForm.restream_ingest_url}
                      onChange={(event) =>
                        setEditingEducatorForm((prev: any) => ({ ...prev, restream_ingest_url: event.target.value }))
                      }
                      placeholder={`RTMP Restream (${DEFAULT_RESTREAM_INGEST_URL})`}
                    />
                    <Input
                      type="password"
                      className="md:col-span-2 font-mono text-[11px]"
                      value={editingEducatorForm.restream_stream_key}
                      onChange={(event) =>
                        setEditingEducatorForm((prev: any) => ({ ...prev, restream_stream_key: event.target.value }))
                      }
                      placeholder="Stream key Restream (painel Restream)"
                      autoComplete="off"
                    />
                    <Input
                      className="md:col-span-2 font-mono text-[11px]"
                      value={editingEducatorForm.restream_embed_url}
                      onChange={(event) =>
                        setEditingEducatorForm((prev: any) => ({ ...prev, restream_embed_url: event.target.value }))
                      }
                      placeholder="URL embed do player (https://embed.restream.io/…)"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!isEditing ? (
                    <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => beginEditEducator(e)}>
                      Editar
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={saveEducator}>
                        Guardar alterações
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => setEditingEducatorId(null)}>
                        Cancelar
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => generateObsKeyForEducator(e)}>
                    Regenerar chave MTM (mtm_…)
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeEducator(e)}>
                    Apagar educador
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </TabsContent>

      <TabsContent value="salas" className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 backdrop-blur-sm">
        <h3 className="font-semibold tracking-tight text-[#D2A63C]">Streams / Canais</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <Input
            value={streamForm.title}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, title: e.target.value }))}
            placeholder="Título da sessão"
          />
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.academy_id}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, academy_id: e.target.value }))}
          >
            <option value="">Academia</option>
            {academies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.educator_id}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, educator_id: e.target.value }))}
          >
            <option value="">Educador</option>
            {educators.map((e) => (
              <option key={e.id} value={e.id}>
                {e.display_name}
              </option>
            ))}
          </select>
          <div className="md:col-span-2">
            <LmsImageUploadField
              label="Thumbnail da sala (canal)"
              description="Imagem do cartão da live no lobby; se vazio, usa o avatar do educador."
              scope="stream_thumbnail"
              value={streamForm.thumbnail_url || ""}
              onUrlChange={(url) => setStreamForm((p: any) => ({ ...p, thumbnail_url: url }))}
            />
          </div>
        </div>
        <Textarea
          value={streamForm.description}
          onChange={(e) => setStreamForm((p: any) => ({ ...p, description: e.target.value }))}
          placeholder="Descrição da sessão"
        />
        <div className="grid md:grid-cols-3 gap-2">
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.category}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, category: e.target.value }))}
          >
            <option value="">Categoria LMS</option>
            {LMS_CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={streamForm.scheduled_start_at}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, scheduled_start_at: e.target.value }))}
            placeholder="Próxima live"
          />
          <Input
            value={streamForm.viewer_count}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, viewer_count: e.target.value }))}
            placeholder="Viewer count (opcional)"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.playback_mode}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, playback_mode: e.target.value }))}
          >
            <option value="youtube_first">Player: YouTube primeiro (seguro)</option>
            <option value="hls_first">Player: HLS primeiro (baixa latência)</option>
            <option value="auto">Player: Auto (prefere HLS em live)</option>
          </select>
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.ingest_provider}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, ingest_provider: e.target.value }))}
          >
            <option value="restream">Ingest: Restream</option>
            <option value="mtm_direct">Ingest: MTM direto (OBS - menor latência)</option>
          </select>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Acesso por Plano</p>
          <select
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
            value={streamForm.access_tier}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, access_tier: e.target.value }))}
          >
            <option value="all">Todos os membros</option>
            <option value="app_member">Pack Membro ($35/mês) e superiores</option>
            <option value="premium">Pack Premium ($65/mês) apenas</option>
            <option value="vip">VIP e Admin apenas</option>
          </select>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Recorrência</p>
          <div className="grid md:grid-cols-2 gap-2">
            <select
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
              value={streamForm.recurrence_type}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_type: e.target.value }))}
            >
              <option value="none">Sem repetição</option>
              <option value="weekly">Semanal</option>
              <option value="fortnightly">Quinzenal</option>
              <option value="monthly">Mensal</option>
            </select>
            <Input
              type="datetime-local"
              value={streamForm.recurrence_until_at}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_until_at: e.target.value }))}
              placeholder="Até quando"
              className="border-gray-700 bg-gray-950/60 text-white"
            />
          </div>

          {(streamForm.recurrence_type === "weekly" || streamForm.recurrence_type === "fortnightly") && (
            <div className="flex flex-wrap gap-2">
              {[
                { value: 1, label: "Seg" },
                { value: 2, label: "Ter" },
                { value: 3, label: "Qua" },
                { value: 4, label: "Qui" },
                { value: 5, label: "Sex" },
                { value: 6, label: "Sáb" },
                { value: 0, label: "Dom" },
              ].map((d) => (
                <label
                  key={d.value}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={Array.isArray(streamForm.recurrence_weekdays) && streamForm.recurrence_weekdays.includes(d.value)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setStreamForm((p: any) => {
                        const prev = Array.isArray(p.recurrence_weekdays) ? p.recurrence_weekdays : []
                        if (checked) return { ...p, recurrence_weekdays: Array.from(new Set([...prev, d.value])).sort() }
                        return { ...p, recurrence_weekdays: prev.filter((x: number) => x !== d.value) }
                      })
                    }}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          )}

          {streamForm.recurrence_type === "monthly" && (
            <div>
              <Input
                value={streamForm.recurrence_monthly_days}
                onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_monthly_days: e.target.value }))}
                placeholder="Ex: 1,15,30"
                className="border-gray-700 bg-gray-950/60 text-white"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Dias do mês (números separados por vírgula).
              </p>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          <Input
            value={streamForm.rtmps_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, rtmps_url: e.target.value }))}
            placeholder="RTMPS URL (servidor MTM)"
          />
          <Input
            value={streamForm.stream_key}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, stream_key: e.target.value }))}
            placeholder="OBS Stream Key (MTM)"
          />
          <Input
            value={streamForm.playback_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, playback_url: e.target.value }))}
            placeholder="Playback manual (YouTube, etc.) — sobrepõe Restream/HLS"
          />
          <Input
            className="font-mono text-[11px]"
            value={streamForm.restream_embed_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, restream_embed_url: e.target.value }))}
            placeholder="Embed Restream só deste canal (opcional)"
          />
        </div>
        <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createStream}>
          Criar stream
        </Button>
        <div className="space-y-2">
          {streams.map((s) => (
            <div key={s.id} className="space-y-2 rounded-lg border border-[#D2A63C]/15 bg-black/30 p-3 text-xs text-gray-200">
              {(() => {
                const edu = educators.find((e) => e.id === s.educator_id)
                const restreamMisconfigured =
                  s.ingest_provider === "restream" && (!edu?.restream_enabled || !edu?.restream_stream_key)
                if (!restreamMisconfigured) return null
                return (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-red-300">
                    Ingest Restream sem configuração válida no educador (ativar Restream + stream key).
                  </div>
                )
              })()}
              <div className="flex flex-wrap gap-3">
                {s.thumbnail_url?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.thumbnail_url.trim()}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded-md border border-gray-600 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-600 text-[10px] text-gray-500">
                    sem thumb
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{s.title}</p>
                  <p>{s.educator?.display_name} • {s.academy?.name}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <LmsImageUploadField
                  label="Thumbnail desta sala"
                  scope="stream_thumbnail"
                  refId={s.id}
                  value={s.thumbnail_url || ""}
                  commit="blur"
                  onUrlChange={(url) => patchStreamAdmin(s.id, { thumbnail_url: url.trim() || null })}
                />
                <LmsImageUploadField
                  label="Imagem quadrada da sala"
                  description="Usada em grelhas/avatares quadrados da sala do educador."
                  scope="stream_square"
                  refId={s.id}
                  value={s.square_image_url || ""}
                  commit="blur"
                  onUrlChange={(url) => patchStreamAdmin(s.id, { square_image_url: url.trim() || null })}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Acesso por plano</p>
                  <select
                    className="w-full rounded border border-gray-700 bg-black/50 px-2 py-2 text-white text-xs"
                    value={s.access_tier || "all"}
                    onChange={(ev) => patchStreamAdmin(s.id, { access_tier: ev.target.value })}
                  >
                    <option value="all">Todos os membros</option>
                    <option value="app_member">Pack Membro ($35/mês) e superiores</option>
                    <option value="premium">Pack Premium ($65/mês) apenas</option>
                    <option value="vip">VIP e Admin apenas</option>
                  </select>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Playlist YouTube (rever aulas)</p>
                  <Input
                    key={`pln-${s.id}-${s.playlist_title || ""}`}
                    defaultValue={s.playlist_title || ""}
                    className="mb-1 border-gray-700 bg-black/50 text-[11px]"
                    placeholder="Nome da playlist (ex: Aulas de Sensei)"
                    onBlur={(ev) => patchStreamAdmin(s.id, { playlist_title: ev.target.value.trim() || null })}
                  />
                  <Input
                    key={`pl-${s.id}-${s.playlist_url || ""}`}
                    defaultValue={s.playlist_url || ""}
                    className="border-gray-700 bg-black/50 font-mono text-[11px]"
                    placeholder="https://youtube.com/playlist?list=…"
                    onBlur={(ev) => patchStreamAdmin(s.id, { playlist_url: ev.target.value.trim() || null })}
                  />
                  <select
                    className="mt-1 w-full rounded border border-gray-700 bg-black/50 px-2 py-1.5 text-white text-[11px]"
                    value={s.playlist_access_tier || ""}
                    onChange={(ev) => patchStreamAdmin(s.id, { playlist_access_tier: ev.target.value || null })}
                  >
                    <option value="">Playlist: visível para todos</option>
                    <option value="app_member">Playlist: Membro ($35) e superiores</option>
                    <option value="premium">Playlist: Premium ($65) apenas</option>
                  </select>
                </div>
              </div>

              <ScheduleEditor streamId={s.id} apiBase="/api/admin/live-sessions/schedules" title="Horário semanal desta sala" />
              {(s.category || s.scheduled_start_at) && (
                <p className="text-gray-400">
                  {s.category && <>Categoria: {s.category} · </>}
                  {s.scheduled_start_at && <>Agendada: {new Date(s.scheduled_start_at).toLocaleString("pt-PT")}</>}
                </p>
              )}
              <p className="text-gray-400">
                Player: {s.playback_mode || "youtube_first"} · Ingest: {s.ingest_provider || "restream"}
              </p>
              <p className="text-gray-300">Stream key MTM: {s.stream_key || "não definida"}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="w-full rounded border border-gray-700 bg-black/50 px-2 py-2 text-white text-xs"
                  value={s.playback_mode || "youtube_first"}
                  onChange={(ev) => patchStreamAdmin(s.id, { playback_mode: ev.target.value })}
                >
                  <option value="youtube_first">Player: YouTube primeiro</option>
                  <option value="hls_first">Player: HLS primeiro</option>
                  <option value="auto">Player: Auto</option>
                </select>
                <select
                  className="w-full rounded border border-gray-700 bg-black/50 px-2 py-2 text-white text-xs"
                  value={s.ingest_provider || "restream"}
                  onChange={(ev) => patchStreamAdmin(s.id, { ingest_provider: ev.target.value })}
                >
                  <option value="restream">Ingest: Restream</option>
                  <option value="mtm_direct">Ingest: MTM direto</option>
                </select>
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Playback manual</p>
                <Input
                  key={`pb-${s.id}-${s.playback_url || ""}`}
                  defaultValue={s.playback_url || ""}
                  className="border-gray-700 bg-black/50 font-mono text-[11px]"
                  placeholder="https://…"
                  onBlur={(ev) =>
                    patchStreamAdmin(s.id, { playback_url: ev.target.value.trim() || null })
                  }
                />
              </div>
              <div className="mt-1 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Embed Restream (canal)</p>
                <Input
                  key={`re-${s.id}-${s.restream_embed_url || ""}`}
                  defaultValue={s.restream_embed_url || ""}
                  className="border-gray-700 bg-black/50 font-mono text-[11px]"
                  placeholder="Vazio = embed do perfil do educador"
                  onBlur={(ev) =>
                    patchStreamAdmin(s.id, { restream_embed_url: ev.target.value.trim() || null })
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  style={{ backgroundColor: s.is_live ? "#b91c1c" : "#16a34a" }}
                  className="text-white hover:brightness-110"
                  onClick={() => toggleLive(s)}
                >
                  {s.is_live ? "Parar transmissão" : "Iniciar transmissão"}
                </Button>
                <Button size="sm" className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={() => resetKey(s.id)}>
                  Nova chave MTM (HLS)
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteStream(s.id, s.title)}>
                  Apagar canal
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </TabsContent>

      <TabsContent value="horario" className="space-y-3">
        {/* Agendar sessão — academia, educador, data/hora, recorrência (reusa createStream) */}
        <div className="space-y-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 backdrop-blur-sm">
          <h3 className="font-semibold tracking-tight text-[#D2A63C]">Agendar sessão</h3>
          <p className="text-xs text-gray-400">
            Define academia, educador, data/hora e recorrência. Aparece logo no horário da app, no /live e abaixo.
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            <Input
              value={streamForm.title}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, title: e.target.value }))}
              placeholder="Título da sessão"
            />
            <Input
              type="datetime-local"
              value={streamForm.scheduled_start_at}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, scheduled_start_at: e.target.value }))}
              placeholder="Data e hora"
            />
            <select
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
              value={streamForm.academy_id}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, academy_id: e.target.value }))}
            >
              <option value="">Academia</option>
              {academies.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
              value={streamForm.educator_id}
              onChange={(e) => setStreamForm((p: any) => ({ ...p, educator_id: e.target.value }))}
            >
              <option value="">Educador</option>
              {educators.map((e) => (
                <option key={e.id} value={e.id}>{e.display_name}</option>
              ))}
            </select>
          </div>

          {/* Recorrência (mesmas bindings de Salas e canais) */}
          <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Recorrência</p>
            <div className="grid md:grid-cols-2 gap-2">
              <select
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-white text-sm"
                value={streamForm.recurrence_type}
                onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_type: e.target.value }))}
              >
                <option value="none">Sem repetição</option>
                <option value="weekly">Semanal</option>
                <option value="fortnightly">Quinzenal</option>
                <option value="monthly">Mensal</option>
              </select>
              <Input
                type="datetime-local"
                value={streamForm.recurrence_until_at}
                onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_until_at: e.target.value }))}
                placeholder="Até quando"
                className="border-gray-700 bg-gray-950/60 text-white"
              />
            </div>
            {(streamForm.recurrence_type === "weekly" || streamForm.recurrence_type === "fortnightly") && (
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 1, label: "Seg" }, { value: 2, label: "Ter" }, { value: 3, label: "Qua" },
                  { value: 4, label: "Qui" }, { value: 5, label: "Sex" }, { value: 6, label: "Sáb" }, { value: 0, label: "Dom" },
                ].map((d) => (
                  <label key={d.value} className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={Array.isArray(streamForm.recurrence_weekdays) && streamForm.recurrence_weekdays.includes(d.value)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setStreamForm((p: any) => {
                          const prev = Array.isArray(p.recurrence_weekdays) ? p.recurrence_weekdays : []
                          if (checked) return { ...p, recurrence_weekdays: Array.from(new Set([...prev, d.value])).sort() }
                          return { ...p, recurrence_weekdays: prev.filter((x: number) => x !== d.value) }
                        })
                      }}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            )}
            {streamForm.recurrence_type === "monthly" && (
              <Input
                value={streamForm.recurrence_monthly_days}
                onChange={(e) => setStreamForm((p: any) => ({ ...p, recurrence_monthly_days: e.target.value }))}
                placeholder="Dias do mês (ex: 1,15,30)"
                className="border-gray-700 bg-gray-950/60 text-white"
              />
            )}
          </div>
          <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createStream}>
            Agendar sessão
          </Button>
          <p className="text-[11px] text-gray-500">
            Para configuração técnica (RTMPS, chave OBS, player, thumbnail) usa a aba «Salas e canais».
          </p>
        </div>

        {/* Sessões agendadas (timetable) */}
        <div className="space-y-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 backdrop-blur-sm">
          <h3 className="font-semibold tracking-tight text-[#D2A63C]">Sessões agendadas</h3>
          <p className="text-xs text-gray-400">
            Interligado com a app mobile e o /live (mesma fonte). Edita/apaga canais na aba «Salas e canais».
          </p>
          <SessionsTimetable
            sessions={streams
              .filter((s) => s.scheduled_start_at)
              .map((s) => ({
                id: s.id,
                title: s.title,
                educatorName: educators.find((e) => e.id === s.educator_id)?.display_name ?? null,
                scheduledAt: s.scheduled_start_at as string,
                tier: s.access_tier ?? null,
              }))}
            emptyText="Sem sessões agendadas. Usa o formulário acima para agendar."
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}

