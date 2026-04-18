"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MessageCircle, MessageCircleOff, Volume2, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import EmojiChatPicker from "@/components/live/emoji-chat-picker"
import { enterLiveFullscreen } from "@/lib/live-player-viewport"
import { useLmsHlsVideo } from "@/hooks/use-lms-hls-video"

type Msg = {
  id: string
  sender_name: string
  sender_type: "student" | "educator"
  message: string
  created_at: string
}

interface EducatorStudioLivePanelProps {
  streamId: string
  /** Título mostrado no cabeçalho do player */
  title?: string
}

/**
 * Pré-visualização do mesmo playback dos alunos + chat da sessão,
 * para o educador gerir a live sem sair do studio.
 */
export default function EducatorStudioLivePanel({ streamId, title }: EducatorStudioLivePanelProps) {
  const [stream, setStream] = useState<Record<string, unknown> | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const load = async () => {
    const [streamRes, msgRes] = await Promise.all([
      fetch(`/api/live-sessions/streams/${streamId}`, { credentials: "same-origin" }).then((r) => r.json()),
      fetch(`/api/live-sessions/streams/${streamId}/messages`, { credentials: "same-origin" }).then((r) =>
        r.json()
      ),
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    const el = videoRef.current
    if (el) el.volume = volume
  }, [volume, stream?.hls_manifest_url, stream?.playback_url])

  const canSend = useMemo(() => text.trim().length > 0, [text])
  const canClearChat = Boolean(stream?.viewer_can_clear_chat)

  const hlsUrl = useMemo(() => {
    if (stream?.hls_manifest_url) return String(stream.hls_manifest_url)
    return ""
  }, [stream?.hls_manifest_url])

  const useHls = Boolean(hlsUrl && (stream?.is_live || !stream?.playback_url))
  const isLive = Boolean(stream?.is_live)

  const iframePlaybackUrl = useMemo(() => {
    const raw = String(stream?.playback_url || "").trim()
    if (!raw) return ""
    try {
      const u = new URL(raw)
      u.searchParams.set("autoplay", "1")
      u.searchParams.set("mute", "1")
      return u.toString()
    } catch {
      return raw
    }
  }, [stream?.playback_url])

  useLmsHlsVideo(videoRef, useHls ? hlsUrl : null)

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
    await enterLiveFullscreen({
      video: useHls ? videoRef.current : null,
      iframe: stream?.playback_url ? iframeRef.current : null,
      fallbackContainer: playerWrapRef.current,
    })
  }

  const playerClass =
    "h-[min(42vh,320px)] w-full rounded-lg border border-gray-700 bg-black object-contain sm:h-[300px] md:h-[340px]"

  return (
    <div className={`grid gap-4 ${showChat ? "lg:grid-cols-5" : ""}`}>
      <Card className={`border border-[#D2A63C]/25 bg-gray-950/90 ${showChat ? "lg:col-span-3" : ""}`}>
        <CardHeader className="space-y-1 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base text-[#D2A63C]">
                {String(stream?.title || title || "Canal")}
              </CardTitle>
              <p className="text-[11px] text-gray-500">
                Pré-visualização (igual ao player público) • {isLive ? "ONLINE" : "OFFLINE"}
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
                  <MessageCircleOff className="mr-1.5 h-3.5 w-3.5" />
                  Ocultar chat
                </>
              ) : (
                <>
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                  Mostrar chat
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div
            ref={playerWrapRef}
            className="relative [&:fullscreen]:fixed [&:fullscreen]:inset-0 [&:fullscreen]:z-[2147483646] [&:fullscreen]:flex [&:fullscreen]:h-[100dvh] [&:fullscreen]:w-screen [&:fullscreen]:items-stretch [&:fullscreen]:justify-stretch [&:fullscreen]:bg-black [&:fullscreen]:rounded-none [&:fullscreen>iframe]:!h-full [&:fullscreen>iframe]:!w-full [&:fullscreen>iframe]:min-h-0 [&:fullscreen>iframe]:flex-1 [&:fullscreen>iframe]:rounded-none [&:fullscreen>iframe]:border-0 [&:fullscreen>video]:!h-full [&:fullscreen>video]:!w-full [&:fullscreen>video]:!max-h-none [&:fullscreen>video]:flex-1 [&:fullscreen>video]:rounded-none [&:fullscreen>video]:border-0"
          >
            {isLive && hlsUrl ? (
              <video
                key={hlsUrl}
                ref={videoRef}
                className={playerClass}
                controls
                autoPlay
                playsInline
              />
            ) : iframePlaybackUrl ? (
              <iframe
                ref={iframeRef}
                src={iframePlaybackUrl}
                title={String(stream?.title || "Live")}
                className={playerClass}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : hlsUrl ? (
              <video key={hlsUrl} ref={videoRef} className={playerClass} controls autoPlay playsInline />
            ) : (
              <div className={`${playerClass} flex items-center justify-center text-xs text-gray-500`}>
                Sem HLS nem URL de playback. Configura o canal ou aguarda o ingest.
              </div>
            )}
          </div>

          {(stream?.playback_url || hlsUrl) && (
            <Button type="button" variant="outline" size="sm" className="border-gray-700 text-gray-200" onClick={openFullscreen}>
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Ecrã inteiro
            </Button>
          )}

          {useHls && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-black/30 px-2 py-1.5">
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-[#D2A63C]" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1.5 flex-1 accent-[#D2A63C]"
                aria-label="Volume"
              />
              <span className="w-8 text-right text-[10px] text-gray-500">{Math.round(volume * 100)}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {showChat && (
        <Card className="border border-[#D2A63C]/25 bg-gray-950/90 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm text-white">Chat da sessão</CardTitle>
              {canClearChat && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-red-900/60 px-2 text-[10px] text-red-300"
                  disabled={clearing}
                  onClick={clearChat}
                >
                  {clearing ? "…" : "Limpar"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="h-[min(36vh,260px)] overflow-y-auto rounded-md border border-gray-800 bg-black/40 p-2 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="text-[11px]">
                  <p className={msg.sender_type === "educator" ? "text-[#D2A63C]" : "text-blue-300"}>{msg.sender_name}</p>
                  <p className="text-gray-200">{msg.message}</p>
                </div>
              ))}
              {messages.length === 0 && <p className="text-gray-500 text-[11px]">Sem mensagens ainda.</p>}
              <div ref={chatEndRef} />
            </div>

            <div className="flex flex-col gap-2">
              <textarea
                className="min-h-[72px] w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escreve no chat como educador…"
              />
              <div className="flex gap-2">
                <EmojiChatPicker onPick={appendEmoji} className="h-9 flex-1 border-gray-600 text-gray-200" />
                <Button
                  disabled={!canSend || sending}
                  onClick={send}
                  size="sm"
                  className="h-9 shrink-0 bg-[#D2A63C] px-4 text-black hover:bg-[#BB8525]"
                >
                  Enviar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
