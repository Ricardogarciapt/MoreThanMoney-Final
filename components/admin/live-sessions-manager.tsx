"use client"

import { useEffect, useMemo, useState } from "react"
import { LMS_OFFICIAL_ACADEMIES_COPY } from "@/lib/lms-academies"
import { LMS_CATEGORY_OPTIONS } from "@/lib/lms-categories"
import { DEFAULT_RESTREAM_INGEST_URL } from "@/lib/lms-restream"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

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
  is_live: boolean
  educator_id: string
  category?: string | null
  scheduled_start_at?: string | null
  viewer_count?: number | null
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
    scheduled_start_at: "",
    viewer_count: "",
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
    const [a, e, s] = await Promise.all([
      fetch("/api/admin/live-sessions/academies").then((r) => r.json()),
      fetch("/api/admin/live-sessions/educators").then((r) => r.json()),
      fetch("/api/admin/live-sessions/streams").then((r) => r.json()),
    ])
    setAcademies(a.data || [])
    setEducators(e.data || [])
    setStreams(s.data || [])
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

  const createStream = async () => {
    const payload = {
      ...streamForm,
      category: streamForm.category || null,
      scheduled_start_at: streamForm.scheduled_start_at || null,
      viewer_count:
        streamForm.viewer_count === "" || streamForm.viewer_count === undefined
          ? 0
          : Number(streamForm.viewer_count),
    }
    await fetch("/api/admin/live-sessions/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
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
      scheduled_start_at: "",
      viewer_count: "",
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
    <div className="space-y-6">
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
        <Input
          value={educatorForm.avatar_url}
          onChange={(e) => setEducatorForm((p: any) => ({ ...p, avatar_url: e.target.value }))}
          placeholder="URL foto / flyer (Educadores ao vivo + cartões)"
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
                <div>
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

                {isEditing && (
                  <div className="grid md:grid-cols-2 gap-2">
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
                    <Input
                      value={editingEducatorForm.avatar_url}
                      onChange={(event) => setEditingEducatorForm((prev: any) => ({ ...prev, avatar_url: event.target.value }))}
                      placeholder="URL foto / flyer"
                    />
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
                    Regenerar chave fixa
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
          <Input
            value={streamForm.thumbnail_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, thumbnail_url: e.target.value }))}
            placeholder="Thumbnail URL"
          />
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
              <div>
                <p className="font-semibold text-white">{s.title}</p>
                <p>{s.educator?.display_name} • {s.academy?.name}</p>
                {(s.category || s.scheduled_start_at) && (
                  <p className="text-gray-400">
                    {s.category && <>Categoria: {s.category} · </>}
                    {s.scheduled_start_at && <>Agendada: {new Date(s.scheduled_start_at).toLocaleString("pt-PT")}</>}
                  </p>
                )}
                <p className="text-gray-300">Stream key MTM: {s.stream_key || "não definida"}</p>
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
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => toggleLive(s)}>
                  {s.is_live ? "Passar Offline" : "Passar Online"}
                </Button>
                <Button size="sm" className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={() => resetKey(s.id)}>
                  Gerar chave OBS
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteStream(s.id, s.title)}>
                  Apagar canal
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

