"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Academy = { id: string; name: string; slug: string }
type Stream = {
  id: string
  title: string
  description?: string | null
  thumbnail_url?: string | null
  is_live: boolean
  academy?: { id: string; name: string } | null
  educator?: { id: string; display_name: string; avatar_url?: string | null } | null
}

export default function LiveSessionsHub() {
  const [academies, setAcademies] = useState<Academy[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [selectedAcademy, setSelectedAcademy] = useState<string>("")
  const [selectedEducator, setSelectedEducator] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [aRes, sRes] = await Promise.all([
        fetch("/api/live-sessions/academies").then((r) => r.json()).catch(() => ({ data: [] })),
        fetch("/api/live-sessions/streams").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
      setAcademies(aRes.data || [])
      setStreams(sRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredStreams = useMemo(() => {
    return streams.filter((s) => {
      if (selectedAcademy && s.academy?.id !== selectedAcademy) return false
      if (selectedEducator && s.educator?.id !== selectedEducator) return false
      return true
    })
  }, [streams, selectedAcademy, selectedEducator])

  const educators = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const s of streams) {
      if (s.educator?.id) map.set(s.educator.id, { id: s.educator.id, name: s.educator.display_name })
    }
    return Array.from(map.values())
  }, [streams])

  const liveNow = useMemo(() => streams.filter((s) => s.is_live), [streams])

  if (loading) {
    return <div className="text-gray-300">A carregar sessões ao vivo...</div>
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gray-900/80 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">Live Sessions • Splash de Entrada</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-gray-700 p-3">
            <p className="text-white font-semibold mb-2">Passo 1 — Escolher academia</p>
            <select
              className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1 text-gray-200"
              value={selectedAcademy}
              onChange={(e) => setSelectedAcademy(e.target.value)}
            >
              <option value="">Todas</option>
              {academies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-gray-700 p-3">
            <p className="text-white font-semibold mb-2">Passo 2 — Escolher educador</p>
            <select
              className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1 text-gray-200"
              value={selectedEducator}
              onChange={(e) => setSelectedEducator(e.target.value)}
            >
              <option value="">Todos</option>
              {educators.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-gray-700 p-3">
            <p className="text-white font-semibold mb-2">Passo 3 — Entrar no canal</p>
            <p className="text-gray-300 text-xs">Clica no thumbnail da sessão para abrir o canal com stream + chat.</p>
            <Link href="/live-sessions/studio" className="inline-block mt-2 text-[#D2A63C] text-xs hover:underline">
              Área do Educador (login separado)
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/80 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-white">Streamers ao vivo (slideshow)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {liveNow.length === 0 && <p className="text-gray-400 text-sm">Nenhum streamer ao vivo neste momento.</p>}
            {liveNow.map((stream) => (
              <Link
                key={stream.id}
                href={`/live-sessions/${stream.id}`}
                className="min-w-[260px] rounded-lg border border-red-500/50 bg-red-500/10 p-3 hover:border-[#D2A63C]/50 transition"
              >
                <p className="text-red-300 text-xs font-semibold">AO VIVO</p>
                <p className="text-white text-sm font-semibold mt-1">{stream.title}</p>
                <p className="text-gray-300 text-xs mt-1">{stream.educator?.display_name || "Educador"}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStreams.map((stream) => (
          <Card key={stream.id} className="bg-gray-900/80 border-gray-700 overflow-hidden">
            <div className="h-36 bg-gray-800 relative">
              {stream.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stream.thumbnail_url} alt={stream.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">Sem thumbnail</div>
              )}
              <div className="absolute top-2 right-2">
                <Badge className={stream.is_live ? "bg-red-600 text-white" : "bg-gray-700 text-gray-200"}>
                  {stream.is_live ? "ONLINE" : "OFFLINE"}
                </Badge>
              </div>
            </div>
            <CardContent className="p-4">
              <p className="text-white font-semibold">{stream.title}</p>
              <p className="text-xs text-gray-400 mt-1">{stream.academy?.name}</p>
              <p className="text-xs text-gray-300 mt-1">{stream.educator?.display_name}</p>
              <div className="mt-3">
                <Link href={`/live-sessions/${stream.id}`}>
                  <Button className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black">Entrar no canal</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

