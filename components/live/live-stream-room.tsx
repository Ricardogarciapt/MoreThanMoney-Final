"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Volume2, MessageCircle, MessageCircleOff, ArrowLeft, Maximize2, PictureInPicture2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import LiveFinancialDisclaimer from "@/components/live/live-financial-disclaimer"
import EmojiChatPicker from "@/components/live/emoji-chat-picker"

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
  const [educatorId, setEducatorId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)

  const load = async () => {
    const [streamRes, msgRes, meRes] = await Promise.all([
      fetch(`/api/live-sessions/streams/${streamId}`).then((r) => r.json()),
      fetch(`/api/live-sessions/streams/${streamId}/messages`).then((r) => r.json()),
      fetch("/api/live-sessions/educator-auth/me", { credentials: "same-origin" }).then((r) => r.json()),
    ])
    setStream(streamRes.data || null)
    setMessages(msgRes.data || [])
    if (meRes.authenticated && meRes.educator?.educatorId) {
      setEducatorId(meRes.educator.educatorId)
    } else {
      setEducatorId(null)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId])

  useEffect(() => {
    const el = videoRef.current
    if (el) el.volume = volume
  }, [volume, stream?.hls_manifest_url, stream?.playback_url])

  const canSend = useMemo(() => text.trim().length > 0, [text])
  const canClearChat = Boolean(educatorId && stream?.educator_id && educatorId === stream.educator_id)
  const hlsUrl = useMemo(() => {
    if (stream?.hls_manifest_url) return String(stream.hls_manifest_url)
    return ""
  }, [stream?.hls_manifest_url])

  const useHls = Boolean(hlsUrl && !stream?.playback_url)
  const isLive = Boolean(stream?.is_live)

  const send = async () => {
    if (!canSend) return
    setSending(true)
    await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message: text }),
    })
    setText("")
    setSending(false)
    load()
  }

  const clearChat = async () => {
    if (!canClearChat) return
    const ok = window.confirm("Apagar todas as mensagens deste chat?")
    if (!ok) return
    setClearing(true)
    try {
      const res = await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        window.alert(j.error || "Não foi possível limpar o chat.")
      }
      await load()
    } finally {
      setClearing(false)
    }
  }

  const appendEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`)
  }

  const openFullscreen = async () => {
    const target = playerWrapRef.current
    if (!target) return
    try {
      await target.requestFullscreen()
    } catch (error) {
      console.warn("[live-stream-room] fullscreen indisponível:", error)
    }
  }

  const openPiP = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      // PiP é suportado apenas com elemento <video> (não iframe)
      await video.requestPictureInPicture()
    } catch (error) {
      console.warn("[live-stream-room] PiP indisponível:", error)
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href="/live-sessions"
        className="inline-flex items-center text-sm text-gray-400 transition hover:text-[#D2A63C]"
      >
        <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
        Voltar ao lobby
      </Link>
      <div className={`grid gap-4 ${showChat ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
      <Card className={`border border-[#D2A63C]/20 bg-gray-950/90 ${showChat ? "lg:col-span-2" : ""}`}>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-[#D2A63C]">{stream?.title || "Canal ao vivo"}</CardTitle>
              <p className="text-xs text-gray-400">
                {stream?.educator?.display_name || "Educador"} • {stream?.academy?.name || "Academia"} •{" "}
                {stream?.is_live ? "ONLINE" : "OFFLINE"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-200 shrink-0"
              onClick={() => setShowChat((v) => !v)}
            >
              {showChat ? (
                <>
                  <MessageCircleOff className="mr-2 h-4 w-4" />
                  Esconder chat
                </>
              ) : (
                <>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mostrar chat
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {stream?.is_live && <LiveFinancialDisclaimer />}
          <div ref={playerWrapRef}>
            {stream?.playback_url ? (
              <iframe
                src={stream.playback_url}
                title={stream.title || "Live stream"}
                className="w-full h-[420px] rounded-lg border border-gray-700 bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : hlsUrl ? (
              <video
                ref={videoRef}
                className="w-full h-[420px] rounded-lg border border-gray-700 bg-black"
                controls
                autoPlay
                playsInline
                src={hlsUrl}
              />
            ) : (
              <div className="h-[420px] rounded-lg border border-gray-700 bg-black flex items-center justify-center text-gray-400">
                Nenhum playback definido. Configura playback no admin ou HLS no servidor de stream.
              </div>
            )}
          </div>

          {(stream?.playback_url || hlsUrl) && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="border-gray-700 text-gray-200" onClick={openFullscreen}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Ecrã inteiro
              </Button>
              {useHls && (
                <Button type="button" variant="outline" size="sm" className="border-gray-700 text-gray-200" onClick={openPiP}>
                  <PictureInPicture2 className="mr-2 h-4 w-4" />
                  PiP
                </Button>
              )}
            </div>
          )}

          {/* Volume no player HLS (live-sessions) — liga ao elemento video */}
          {useHls && (
            <div
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                isLive ? "border-[#D2A63C]/25 bg-black/40" : "border-gray-800 bg-black/30"
              }`}
            >
              <Volume2 className={`h-4 w-4 shrink-0 ${isLive ? "text-[#D2A63C]" : "text-gray-400"}`} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-2 flex-1 accent-[#D2A63C]"
                aria-label="Volume do streaming"
              />
              <span className="w-10 text-right text-xs text-gray-400">{Math.round(volume * 100)}%</span>
            </div>
          )}

          {/* Embed (YouTube, etc.): volume só nos controlos do player — durante a live */}
          {isLive && stream?.playback_url && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-gray-400">
              <Volume2 className="h-4 w-4 shrink-0 text-gray-500" />
              <span>
                <strong className="text-gray-300">Volume:</strong> usa os controlos do vídeo embebido (player do YouTube / live).
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {showChat && (
        <Card className="border border-[#D2A63C]/20 bg-gray-950/90">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-white text-base">Chat da sessão</CardTitle>
              {canClearChat && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-900/60 text-red-300 shrink-0"
                  disabled={clearing}
                  onClick={clearChat}
                >
                  {clearing ? "…" : "Limpar chat"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-[min(40vh,320px)] sm:h-[320px] overflow-y-auto rounded-md border border-gray-700 bg-black/30 p-2 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="text-xs">
                  <p className={msg.sender_type === "educator" ? "text-[#D2A63C]" : "text-blue-300"}>{msg.sender_name}</p>
                  <p className="text-gray-200">{msg.message}</p>
                </div>
              ))}
              {messages.length === 0 && <p className="text-gray-500 text-xs">Ainda sem mensagens.</p>}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <textarea
                className="min-h-[88px] w-full flex-1 rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Mensagem no chat da live…"
              />
              <div className="flex flex-row gap-2 sm:flex-col sm:justify-end sm:w-[100px] shrink-0">
                <EmojiChatPicker
                  onPick={appendEmoji}
                  className="h-11 flex-1 border-gray-600 text-gray-200 sm:flex-none sm:h-11 sm:w-full"
                />
                <Button
                  disabled={!canSend || sending}
                  onClick={send}
                  className="h-11 flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525] sm:h-11 sm:w-full"
                >
                  Enviar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
