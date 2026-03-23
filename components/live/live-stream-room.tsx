"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  streamId: string
}

type Msg = {
  id: string
  sender_name: string
  sender_type: "student" | "educator"
  message: string
  created_at: string
}

export default function LiveStreamRoom({ streamId }: Props) {
  const [stream, setStream] = useState<any>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)

  const load = async () => {
    const [streamRes, msgRes] = await Promise.all([
      fetch(`/api/live-sessions/streams/${streamId}`).then((r) => r.json()),
      fetch(`/api/live-sessions/streams/${streamId}/messages`).then((r) => r.json()),
    ])
    setStream(streamRes.data || null)
    setMessages(msgRes.data || [])
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId])

  const canSend = useMemo(() => text.trim().length > 0, [text])
  const hlsUrl = useMemo(() => {
    if (!stream?.stream_key) return ""
    return `https://stream.morethanmoney.pt/hls/${stream.stream_key}.m3u8`
  }, [stream])

  const send = async () => {
    if (!canSend) return
    setSending(true)
    await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    })
    setText("")
    setSending(false)
    load()
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 bg-gray-900/80 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">{stream?.title || "Canal ao vivo"}</CardTitle>
          <p className="text-xs text-gray-400">
            {stream?.educator?.display_name || "Educador"} • {stream?.academy?.name || "Academia"} •{" "}
            {stream?.is_live ? "ONLINE" : "OFFLINE"}
          </p>
        </CardHeader>
        <CardContent>
          {stream?.playback_url ? (
            <iframe
              src={stream.playback_url}
              title={stream.title || "Live stream"}
              className="w-full h-[420px] rounded-lg border border-gray-700 bg-black"
              allow="autoplay; fullscreen"
            />
          ) : hlsUrl ? (
            <video
              className="w-full h-[420px] rounded-lg border border-gray-700 bg-black"
              controls
              autoPlay
              playsInline
              src={hlsUrl}
            />
          ) : (
            <div className="h-[420px] rounded-lg border border-gray-700 bg-black flex items-center justify-center text-gray-400">
              Nenhum playback definido. Configura `playback_url` ou usa VPS HLS com stream_key.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900/80 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-white text-base">Chat da sessão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-[320px] overflow-y-auto rounded-md border border-gray-700 bg-black/30 p-2 space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className="text-xs">
                <p className={msg.sender_type === "educator" ? "text-[#D2A63C]" : "text-blue-300"}>{msg.sender_name}</p>
                <p className="text-gray-200">{msg.message}</p>
              </div>
            ))}
            {messages.length === 0 && <p className="text-gray-500 text-xs">Ainda sem mensagens.</p>}
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreve no chat..."
            />
            <Button disabled={!canSend || sending} onClick={send} className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525]">
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

