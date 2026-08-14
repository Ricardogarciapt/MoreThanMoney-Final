"use client"

/**
 * Modal GRANDE do Studio no browser: compositor InternalStudio + nome da sessão editável + chat
 * ao vivo + painel DVR (guardar/traduzir/YouTube). Aberto a partir do botão por sessão no
 * EducatorStudio. Ver `internal-streaming-studio`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { X, Send, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import InternalStudio from "@/components/live/internal-studio"
import EducatorDvrPanel from "@/components/live/educator-dvr-panel"

type Msg = { id: string; sender_name?: string | null; sender_type?: string | null; message: string; created_at?: string }

export default function InternalStudioModal({
  streamId,
  title,
  onClose,
  onTitleChange,
}: {
  streamId: string
  title: string
  onClose: () => void
  onTitleChange?: (t: string) => void
}) {
  const [name, setName] = useState(title)
  const [savingName, setSavingName] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [chatInput, setChatInput] = useState("")
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // O modal só fecha no X (não em ESC nem em clique fora) — evita sair sem querer a meio de um live.

  // chat: poll
  const loadMessages = useCallback(async () => {
    try {
      const r = await fetch(`/api/live-sessions/streams/${streamId}/messages`, { credentials: "same-origin" })
      const j = await r.json()
      if (Array.isArray(j)) setMessages(j)
      else if (Array.isArray(j?.messages)) setMessages(j.messages)
    } catch {
      /* ignora */
    }
  }, [streamId])

  useEffect(() => {
    loadMessages()
    const t = setInterval(loadMessages, 4000)
    return () => clearInterval(t)
  }, [loadMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const sendMessage = useCallback(async () => {
    const m = chatInput.trim()
    if (!m) return
    setChatInput("")
    try {
      await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message: m }),
      })
      loadMessages()
    } catch {
      /* ignora */
    }
  }, [chatInput, streamId, loadMessages])

  const saveName = useCallback(async () => {
    const t = name.trim()
    if (!t || t === title) return
    setSavingName(true)
    try {
      const res = await fetch("/api/live-sessions/educator-auth/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId, title: t }),
      })
      if (res.ok) onTitleChange?.(t)
    } finally {
      setSavingName(false)
    }
  }, [name, title, streamId, onTitleChange])

  const chat = useMemo(
    () => (
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400">Chat da sessão</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
          {messages.length === 0 && <p className="text-[11px] text-zinc-600">Sem mensagens ainda.</p>}
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className={`font-semibold ${m.sender_type === "educator" ? "text-[#D2A63C]" : "text-zinc-300"}`}>
                {m.sender_name || "Aluno"}
              </span>
              <span className="text-zinc-400">: {m.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-1.5 border-t border-zinc-800 p-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage()
            }}
            placeholder="Mensagem para a sala…"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
          />
          <Button size="sm" onClick={sendMessage} className="bg-[#D2A63C] text-black hover:bg-[#c0972f]">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ),
    [messages, chatInput, sendMessage],
  )

  return (
    <div className="fixed inset-x-0 bottom-0 top-[84px] z-[100] flex items-start justify-center bg-black/85 p-1 sm:p-2">
      <div className="flex h-full w-[99vw] max-w-[1900px] flex-col overflow-hidden rounded-2xl border border-[#D2A63C]/40 bg-zinc-950 shadow-2xl">
        {/* Header: nome editável */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
          <Pencil className="h-4 w-4 shrink-0 text-[#D2A63C]" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            }}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-white hover:border-zinc-700 focus:border-[#D2A63C] focus:outline-none"
            placeholder="Nome da sessão"
          />
          {savingName && <span className="text-xs text-zinc-500">a guardar…</span>}
          <Button size="sm" variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Corpo: compositor + chat */}
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_320px]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <InternalStudio presetStreamId={streamId} presetStreamTitle={name} />
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <p className="mb-2 text-xs font-semibold text-[#D2A63C]">Gravação (DVR do VPS) · guardar · traduzir · YouTube</p>
              <p className="mb-2 text-[11px] text-zinc-500">
                Ao transmitir do browser, o VPS grava automaticamente pela chave da sala — descarrega o MP4 multi-áudio,
                gera legendas/dobragens e envia para o YouTube (mesmo pipeline do OBS).
              </p>
              <EducatorDvrPanel />
            </div>
          </div>
          <div className="hidden min-h-0 lg:block">{chat}</div>
        </div>
      </div>
    </div>
  )
}
