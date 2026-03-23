"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function EducatorStudio() {
  const [me, setMe] = useState<any>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [streams, setStreams] = useState<any[]>([])
  const [error, setError] = useState("")

  const loadMe = async () => {
    const res = await fetch("/api/live-sessions/educator-auth/me").then((r) => r.json())
    if (res.authenticated) setMe(res.educator)
  }

  const loadStreams = async (educatorId: string) => {
    const res = await fetch(`/api/live-sessions/streams?educatorId=${educatorId}`).then((r) => r.json())
    setStreams(res.data || [])
  }

  useEffect(() => {
    loadMe()
  }, [])

  useEffect(() => {
    if (me?.educatorId) loadStreams(me.educatorId)
  }, [me])

  const login = async () => {
    setError("")
    const res = await fetch("/api/live-sessions/educator-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    await fetch("/api/live-sessions/educator-auth/logout", { method: "POST" })
    setMe(null)
    setStreams([])
  }

  const setPresence = async (streamId: string, isLive: boolean) => {
    await fetch("/api/live-sessions/educator-auth/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, action: isLive ? "start" : "pause" }),
    })
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  const saveYoutube = async (streamId: string, youtubeKey: string, youtubeEnabled: boolean) => {
    await fetch("/api/educator/update-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId,
        youtube_key: youtubeKey,
        youtube_enabled: youtubeEnabled,
      }),
    })
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  const generateRtmps = async (streamId: string, regenerate = false) => {
    await fetch("/api/live-sessions/educator-auth/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, action: "generate", regenerate }),
    })
    if (me?.educatorId) loadStreams(me.educatorId)
  }

  if (!me) {
    return (
      <Card className="max-w-md mx-auto bg-gray-900/80 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">Login do Educador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email do educador" />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <Button onClick={login} className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525]">
            Entrar no Studio
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold">{me.displayName}</p>
          <p className="text-xs text-gray-400">{me.email}</p>
        </div>
        <Button variant="outline" className="border-gray-700 text-gray-200" onClick={logout}>
          Sair
        </Button>
      </div>

      <div className="grid gap-3">
        {streams.map((stream) => (
          <Card key={stream.id} className="bg-gray-900/80 border-gray-700">
            <CardContent className="p-4 space-y-2">
              <p className="text-white font-semibold">{stream.title}</p>
              <p className="text-xs text-gray-300">
                Status:{" "}
                <span className={stream.is_live ? "text-red-400 font-semibold" : "text-gray-400"}>
                  {stream.is_live ? "LIVE" : "OFFLINE"}
                </span>
              </p>
              <p className="text-xs text-gray-300">{stream.rtmps_url || "rtmps://stream.morethanmoney.pt/live"}</p>
              <p className="text-xs text-gray-300">Chave OBS: {stream.stream_key || "não definida"}</p>
              <p className="text-xs text-gray-300">Playback: {stream.playback_url || "não definido"}</p>

              <div className="rounded-md border border-gray-700 p-3 space-y-2">
                <p className="text-sm text-white font-medium">YouTube Multistream</p>
                <Input
                  defaultValue={stream.youtube_key || ""}
                  placeholder="Colar YouTube Stream Key"
                  onBlur={(e) => saveYoutube(stream.id, e.target.value, Boolean(stream.youtube_enabled))}
                />
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    defaultChecked={Boolean(stream.youtube_enabled)}
                    onChange={(e) => saveYoutube(stream.id, String(stream.youtube_key || ""), e.target.checked)}
                  />
                  Ativar transmissão para YouTube
                </label>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                  onClick={() => setPresence(stream.id, true)}
                >
                  Iniciar Live
                </Button>
                <Button
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                  size="sm"
                  onClick={() => setPresence(stream.id, false)}
                >
                  Pausar Live
                </Button>
                <Button
                  className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                  size="sm"
                  onClick={() => generateRtmps(stream.id, false)}
                >
                  Gerar RTMPS
                </Button>
                <Button
                  variant="outline"
                  className="border-[#D2A63C]/40 text-[#D2A63C]"
                  size="sm"
                  onClick={() => generateRtmps(stream.id, true)}
                >
                  Regenerar Chave
                </Button>
              </div>
              <p className="text-[11px] text-gray-400">
                Ao clicar em <strong>Iniciar Live</strong>, o sistema gera RTMPS/chave automaticamente por canal caso ainda não exista.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

