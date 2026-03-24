"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Volume2, MessageCircle, MessageCircleOff, X, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import LiveFinancialDisclaimer from "@/components/live/live-financial-disclaimer"
import EmojiChatPicker from "@/components/live/emoji-chat-picker"

type StreamListItem = {
  id: string
  title: string
  thumbnail_url?: string | null
  is_live: boolean
  playback_url?: string | null
  educator?: { id: string; display_name: string; avatar_url?: string | null } | null
  academy?: { name: string } | null
}

type StreamDetail = StreamListItem & {
  stream_key?: string | null
  hls_manifest_url?: string | null
  educator_id?: string
}

function streamVisualUrl(s: StreamListItem): string | null {
  const a = s.educator?.avatar_url?.trim()
  if (a) return a
  const t = s.thumbnail_url?.trim()
  return t || null
}

export default function LiveSessionsMobile() {
  const [liveStreams, setLiveStreams] = useState<StreamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stream, setStream] = useState<StreamDetail | null>(null)
  const [messages, setMessages] = useState<
    { id: string; sender_name: string; sender_type: string; message: string; created_at: string }[]
  >([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const loadLive = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/live-sessions/streams?live=true").then((r) => r.json())
      setLiveStreams(res.data || [])
    } catch {
      setLiveStreams([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLive()
    const t = setInterval(loadLive, 15000)
    return () => clearInterval(t)
  }, [loadLive])

  const openModal = async (id: string) => {
    setSelectedId(id)
    setOpen(true)
    setShowChat(true)
    setText("")
    const res = await fetch(`/api/live-sessions/streams/${id}`).then((r) => r.json())
    setStream(res.data || null)
    const msgRes = await fetch(`/api/live-sessions/streams/${id}/messages`).then((r) => r.json())
    setMessages(msgRes.data || [])
  }

  const refreshModal = useCallback(async () => {
    if (!selectedId) return
    const [streamRes, msgRes] = await Promise.all([
      fetch(`/api/live-sessions/streams/${selectedId}`).then((r) => r.json()),
      fetch(`/api/live-sessions/streams/${selectedId}/messages`).then((r) => r.json()),
    ])
    setStream(streamRes.data || null)
    setMessages(msgRes.data || [])
  }, [selectedId])

  useEffect(() => {
    if (!open || !selectedId) return
    const id = setInterval(refreshModal, 5000)
    return () => clearInterval(id)
  }, [open, selectedId, refreshModal])

  const hlsUrl = useMemo(() => {
    if (stream?.hls_manifest_url) return String(stream.hls_manifest_url)
    return ""
  }, [stream?.hls_manifest_url])

  useEffect(() => {
    const el = videoRef.current
    if (el) el.volume = volume
  }, [volume, hlsUrl, stream?.playback_url])

  const send = async () => {
    const m = text.trim()
    if (!m || !selectedId) return
    setSending(true)
    await fetch(`/api/live-sessions/streams/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message: m }),
    })
    setText("")
    setSending(false)
    refreshModal()
  }

  const appendEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`)
  }

  return (
    <div className="min-h-[50vh] px-3 pb-28 pt-2">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#D2A63C]">Live Sessions</h2>
          <p className="text-xs text-gray-500">Sessões em direto dentro da app-mobile</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#D2A63C]/30 text-gray-200"
            onClick={() => loadLive()}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
        </div>
      )}

      {!loading && liveStreams.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D2A63C]/25 bg-black/40 p-8 text-center text-sm text-gray-400">
          <Radio className="mx-auto mb-2 h-8 w-8 text-[#D2A63C]/50" />
          Nenhuma sessão em direto neste momento.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {!loading &&
          liveStreams.map((s) => {
            const img = streamVisualUrl(s)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openModal(s.id)}
                className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/90 text-left shadow-md transition active:scale-[0.98] hover:border-[#D2A63C]/40"
              >
                <div className="relative aspect-[4/5] w-full bg-gray-900">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">Sem imagem</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
                    Live
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold text-white">{s.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-gray-500">{s.educator?.display_name}</p>
                  {s.academy?.name && (
                    <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-gray-600">{s.academy.name}</p>
                  )}
                </div>
              </button>
            )
          })}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) {
            setSelectedId(null)
            setStream(null)
            setMessages([])
          }
        }}
      >
        <DialogContent className="flex h-[min(92dvh,820px)] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden border border-[#D2A63C]/25 bg-[#08080a] p-0 sm:max-w-lg [&>button]:hidden">
          <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-2 border-b border-[#D2A63C]/15 bg-black/40 px-3 py-2 pr-2">
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="line-clamp-2 text-left text-sm font-semibold text-white">
                {stream?.title || "Live"}
              </DialogTitle>
              <p className="text-[10px] text-gray-500">
                {stream?.educator?.display_name}
                {stream?.academy?.name ? ` · ${stream.academy.name}` : ""}
                {stream?.is_live ? " · ONLINE" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-gray-400 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 overflow-y-auto border-b border-gray-800/80 px-3 py-2">
              {stream?.is_live && <LiveFinancialDisclaimer />}
              <div className="relative w-full overflow-hidden rounded-xl border border-[#D2A63C]/15 bg-black">
                {stream?.playback_url ? (
                  <iframe
                    src={stream.playback_url}
                    title={stream.title || "Live"}
                    className="aspect-video w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : hlsUrl ? (
                  <video
                    ref={videoRef}
                    className="aspect-video w-full bg-black"
                    controls
                    playsInline
                    src={hlsUrl}
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center px-4 text-center text-xs text-gray-500">
                    Stream sem playback configurado.
                  </div>
                )}
              </div>

              {hlsUrl && stream?.playback_url == null && (
                <div className="flex items-center gap-2 rounded-xl border border-[#D2A63C]/15 bg-black/50 px-2 py-2">
                  <Volume2 className="h-4 w-4 shrink-0 text-[#D2A63C]/70" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-2 flex-1 accent-[#D2A63C]"
                    aria-label="Volume"
                  />
                  <span className="w-8 text-right text-[10px] text-gray-500">{Math.round(volume * 100)}%</span>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-gray-700 text-gray-200"
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

            {showChat && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-[120px] flex-1 overflow-y-auto px-3 py-2">
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div key={msg.id} className="text-xs">
                        <p className={msg.sender_type === "educator" ? "text-[#D2A63C]" : "text-blue-300"}>
                          {msg.sender_name}
                        </p>
                        <p className="text-gray-200">{msg.message}</p>
                      </div>
                    ))}
                    {messages.length === 0 && <p className="text-xs text-gray-500">Sem mensagens ainda.</p>}
                  </div>
                </div>
                <div className="shrink-0 border-t border-gray-800 p-2">
                  <div className="flex gap-2">
                    <textarea
                      className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-700 bg-black/60 px-2 py-2 text-sm text-white"
                      rows={2}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Mensagem…"
                    />
                    <div className="flex flex-col gap-1">
                      <EmojiChatPicker onPick={appendEmoji} />
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        disabled={!text.trim() || sending}
                        onClick={send}
                      >
                        OK
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
