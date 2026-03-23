"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Academy = { id: string; name: string; slug: string }
type Educator = { id: string; display_name: string; email: string; academy_id?: string | null; is_active: boolean }
type Stream = {
  id: string
  title: string
  stream_key?: string | null
  is_live: boolean
  educator_id: string
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
    avatar_url: "",
  })

  const [streamForm, setStreamForm] = useState<any>({
    title: "",
    academy_id: "",
    educator_id: "",
    description: "",
    thumbnail_url: "",
    playback_url: "",
    rtmps_url: "",
    stream_key: "",
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
    await fetch("/api/admin/create-educator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: educatorForm.display_name,
        email: educatorForm.email,
        password: educatorForm.password,
        academy_id: educatorForm.academy_id || null,
        stream_title: `${educatorForm.display_name || "Educador"} - Live Session`,
      }),
    })
    setEducatorForm({ email: "", display_name: "", password: "", academy_id: "", bio: "", avatar_url: "" })
    load()
  }

  const createStream = async () => {
    await fetch("/api/admin/live-sessions/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(streamForm),
    })
    setStreamForm({ title: "", academy_id: "", educator_id: "", description: "", thumbnail_url: "", playback_url: "", rtmps_url: "", stream_key: "" })
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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 p-4 space-y-3">
        <h3 className="text-[#D2A63C] font-semibold">Academias</h3>
        <Input value={academyName} onChange={(e) => setAcademyName(e.target.value)} placeholder="Nome da academia" />
        <Textarea value={academyDesc} onChange={(e) => setAcademyDesc(e.target.value)} placeholder="Descrição" />
        <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createAcademy}>
          Criar academia
        </Button>
        <div className="text-xs text-gray-300 space-y-1">
          {academies.map((a) => (
            <p key={a.id}>• {a.name} ({a.slug})</p>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 p-4 space-y-3">
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
          value={educatorForm.avatar_url}
          onChange={(e) => setEducatorForm((p: any) => ({ ...p, avatar_url: e.target.value }))}
          placeholder="URL da foto"
        />
        <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createEducator}>
          Criar educador
        </Button>
        <div className="text-xs text-gray-300 space-y-1 pt-2">
          {educators.map((e) => (
            <p key={e.id}>• {e.display_name} — {e.email} {e.is_active ? "(ativo)" : "(inativo)"}</p>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-900/80 p-4 space-y-3">
        <h3 className="text-[#D2A63C] font-semibold">Streams / Canais</h3>
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
          <Input
            value={streamForm.rtmps_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, rtmps_url: e.target.value }))}
            placeholder="RTMPS URL"
          />
          <Input
            value={streamForm.stream_key}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, stream_key: e.target.value }))}
            placeholder="OBS Stream Key"
          />
          <Input
            value={streamForm.playback_url}
            onChange={(e) => setStreamForm((p: any) => ({ ...p, playback_url: e.target.value }))}
            placeholder="Playback URL (embed)"
          />
        </div>
        <Button className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={createStream}>
          Criar stream
        </Button>
        <div className="space-y-2">
          {streams.map((s) => (
            <div key={s.id} className="rounded border border-gray-700 p-3 text-xs text-gray-200 space-y-2">
              <div>
                <p className="font-semibold text-white">{s.title}</p>
                <p>{s.educator?.display_name} • {s.academy?.name}</p>
                <p className="text-gray-300">Stream key: {s.stream_key || "não definida"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => toggleLive(s)}>
                  {s.is_live ? "Passar Offline" : "Passar Online"}
                </Button>
                <Button size="sm" className="bg-[#D2A63C] hover:bg-[#BB8525] text-black" onClick={() => resetKey(s.id)}>
                  Reset Key
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

