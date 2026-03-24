"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  BarChart3,
  Coins,
  Radio,
  Settings2,
  Users,
  Youtube,
} from "lucide-react"
import StreamKeyCard from "@/components/live/stream-key-card"
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
  scheduled_start_at?: string | null
  viewer_count?: number | null
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
  const [creating, setCreating] = useState(false)
  const [keyOpStreamId, setKeyOpStreamId] = useState<string | null>(null)
  const [restreamSaving, setRestreamSaving] = useState(false)
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
  }, [me])

  const academyName = useMemo(() => {
    if (!me?.academy_id) return null
    return academies.find((a) => a.id === me.academy_id)?.name || "Academia"
  }, [me, academies])

  const liveCount = useMemo(() => streams.filter((s) => s.is_live).length, [streams])
  const hasPrimaryRoom = streams.length > 0

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
  }

  const createChannel = async () => {
    const title = newTitle.trim()
    if (!title) {
      setError("Indica o título do canal.")
      return
    }
    setCreating(true)
    setError("")
    try {
      const res = await fetch("/api/live-sessions/educator-auth/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title,
          category: newCategory || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Erro ao criar canal")
        return
      }
      setNewTitle("")
      setNewCategory("")
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
    await fetch("/api/live-sessions/educator-auth/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ streamId, action: isLive ? "start" : "pause" }),
    })
    if (me?.educatorId) loadStreams(me.educatorId)
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
          restream_embed_url: restreamForm.embed.trim() || null,
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

  const generateRtmps = async (streamId: string, regenerate = false) => {
    setKeyOpStreamId(streamId)
    try {
      await fetch("/api/live-sessions/educator-auth/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId, action: "generate", regenerate }),
      })
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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-gray-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/live-sessions" className="mb-2 inline-flex items-center text-sm text-gray-400 hover:text-[#D2A63C]">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Lobby Live Sessions
          </Link>
          <h2 className="text-xl font-bold text-white md:text-2xl">Olá, {me.displayName}</h2>
          <p className="text-xs text-gray-500">{me.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-gray-600 text-gray-300">
              Academia: {academyName || "— define no admin —"}
            </Badge>
            <Badge className={liveCount > 0 ? "bg-red-600 text-white" : "bg-gray-700 text-gray-200"}>
              {liveCount} sala(s) em direto
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-gray-600 max-w-[200px] hidden sm:block">
            Bio, foto e academia: administrador MTM em Admin → Educação (LMS).
          </p>
          <Button variant="outline" size="sm" className="border-red-900/50 text-red-300" onClick={logout}>
            Sair
          </Button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Card className="border border-cyan-900/40 bg-gradient-to-br from-gray-950 to-black">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-cyan-300">
            <Radio className="h-4 w-4" />
            Restream.io (OBS → Restream → site)
          </CardTitle>
          <p className="text-xs font-normal text-gray-500">
            No Restream, copia a <strong className="text-gray-400">Stream URL</strong> e a <strong className="text-gray-400">Stream key</strong> para o OBS.
            Em &quot;Embed / Player&quot;, cola a URL do iframe aqui para os alunos verem no MTM. Cada educador tem o seu canal.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={restreamForm.enabled}
              onChange={(e) => setRestreamForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            Usar player Restream no site (quando ativo, tem prioridade sobre HLS do servidor MTM, salvo URL manual no canal)
          </label>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Servidor RTMP Restream</p>
            <Input
              value={restreamForm.ingest}
              onChange={(e) => setRestreamForm((p) => ({ ...p, ingest: e.target.value }))}
              className="border-gray-700 bg-black/50 font-mono text-xs"
              placeholder={DEFAULT_RESTREAM_INGEST_URL}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Chave de stream (Restream)</p>
            <Input
              type="password"
              value={restreamForm.key}
              onChange={(e) => setRestreamForm((p) => ({ ...p, key: e.target.value }))}
              className="border-gray-700 bg-black/50 font-mono text-xs"
              placeholder="Cola a Stream key do painel Restream"
              autoComplete="off"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">URL do player / embed (público)</p>
            <Input
              value={restreamForm.embed}
              onChange={(e) => setRestreamForm((p) => ({ ...p, embed: e.target.value }))}
              className="border-gray-700 bg-black/50 font-mono text-xs"
              placeholder="https://embed.restream.io/..."
            />
          </div>
          <Button
            type="button"
            disabled={restreamSaving}
            className="bg-cyan-700 text-white hover:bg-cyan-600"
            onClick={saveRestreamProfile}
          >
            {restreamSaving ? "A guardar…" : "Guardar definições Restream"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card className="border-[#D2A63C]/20 bg-gray-950/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-[#D2A63C]">
                <Settings2 className="h-4 w-4" />
                Criar novo canal
              </CardTitle>
              <p className="text-xs font-normal text-gray-500">
                A tua chave OBS é fixa por educador. Só vês os teus dados de transmissão e não tens acesso a chaves de outros.
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
              <Button
                onClick={createChannel}
                disabled={creating || hasPrimaryRoom}
                className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
              >
                {hasPrimaryRoom ? "Sala principal já criada" : creating ? "A criar…" : "Criar sala principal"}
              </Button>
            </CardContent>
          </Card>

          {streams.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">
              Ainda não tens canais. Cria um acima ou pede ao admin para te associar uma academia.
            </p>
          )}

          {streams.map((stream) => (
            <Card key={stream.id} className="overflow-hidden border-gray-800 bg-gradient-to-br from-gray-950 to-black">
              <CardHeader className="border-b border-gray-800/80 bg-black/30 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg text-white">{stream.title}</CardTitle>
                    <p className="mt-1 text-xs text-gray-500">ID: {stream.id.slice(0, 8)}…</p>
                  </div>
                  <Badge className={stream.is_live ? "bg-red-600" : "bg-gray-700"}>
                    {stream.is_live ? "LIVE" : "OFFLINE"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
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
                </div>

                <StreamKeyCard
                  rtmpUrl={stream.rtmps_url}
                  streamKey={stream.stream_key}
                  loading={keyOpStreamId === stream.id}
                  onGenerateOrRefresh={() => generateRtmps(stream.id, false)}
                  onRegenerate={undefined}
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
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                    Embed Restream só deste canal (opcional)
                  </p>
                  <Input
                    key={`re-${stream.id}-${stream.restream_embed_url || ""}`}
                    defaultValue={stream.restream_embed_url || ""}
                    className="border-gray-700 bg-black/50 font-mono text-xs"
                    placeholder="Vazio = usa o embed do teu perfil"
                    onBlur={(e) =>
                      patchStream(stream.id, { restream_embed_url: e.target.value.trim() || null })
                    }
                  />
                </div>

                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 space-y-2">
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

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setPresence(stream.id, true)}>
                    <Radio className="mr-1 h-3 w-3" />
                    Iniciar transmissão
                  </Button>
                  <Button size="sm" variant="secondary" className="bg-gray-700" onClick={() => setPresence(stream.id, false)}>
                    Pausar live
                  </Button>
                  <Button size="sm" variant="outline" className="border-orange-800 text-orange-200" onClick={() => clearChat(stream.id)}>
                    Limpar chat
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteChannel(stream.id, stream.title)}>
                    Apagar canal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
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
                    <span>Espectadores (registo)</span>
                    <span className="text-[#D2A63C]">{s.viewer_count ?? 0}</span>
                  </p>
                  <p className="mt-1 text-gray-600">Retenção: integração futura</p>
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
        </div>
      </div>
    </div>
  )
}
