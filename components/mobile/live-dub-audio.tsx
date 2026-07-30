"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, ChevronDown, Check } from "lucide-react"

// Dobragem ao vivo: seletor de canal de ÁUDIO. Ao escolher um idioma dobrado, silencia
// o vídeo e toca a voz clonada (TTS por frase, servido em /captions?audio=1&lang=). O PT
// original mantém o áudio real do stream. v1: reprodução em fila (quase ao vivo).

const DUB_LANGS: [string, string][] = [
  ["", "Português (original)"],
  ["en", "English"],
  ["es", "Español"],
  ["de", "Deutsch"],
]

export default function LiveDubAudio({
  streamId,
  videoRef,
}: {
  streamId: string
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const [lang, setLang] = useState("") // "" = original (áudio do vídeo)
  const [menu, setMenu] = useState(false)
  const [active, setActive] = useState(false) // a tocar dobragem
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const sinceRef = useRef(0)

  useEffect(() => {
    const v = videoRef.current
    if (!audioRef.current && typeof Audio !== "undefined") {
      audioRef.current = new Audio()
      audioRef.current.onended = playNext
    }
    const a = audioRef.current

    if (!lang) {
      if (v) v.muted = false
      if (a) { a.pause(); a.src = "" }
      queueRef.current = []
      setActive(false)
      return
    }

    if (v) v.muted = true // silencia o áudio original; ouve-se a dobragem
    setActive(true)
    let running = true
    sinceRef.current = 0
    queueRef.current = []

    const poll = async () => {
      try {
        const r = await fetch(
          `/api/live-sessions/streams/${streamId}/captions?since=${sinceRef.current}&limit=8&audio=1&lang=${lang}`,
        )
        if (!r.ok || !running) return
        const d = await r.json()
        for (const c of d?.captions ?? []) {
          if (c.audioUrl) queueRef.current.push(c.audioUrl)
          sinceRef.current = c.seq
        }
        if (a && a.paused) playNext()
      } catch {}
    }
    poll()
    const t = setInterval(poll, 1500)
    return () => {
      running = false
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, streamId])

  function playNext() {
    const a = audioRef.current
    const url = queueRef.current.shift()
    if (a && url) {
      a.src = url
      a.play().catch(() => {})
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
          active
            ? "border-[#D2A63C]/60 bg-[#D2A63C]/20 text-[#D2A63C]"
            : "border-gray-700 bg-black/60 text-gray-200"
        }`}
        aria-label="Idioma do áudio"
      >
        <Volume2 className="h-3.5 w-3.5" />
        {(DUB_LANGS.find((l) => l[0] === lang)?.[1] || "Áudio").slice(0, 3)}
        <ChevronDown className="h-3 w-3" />
      </button>
      {menu && (
        <div className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
          {DUB_LANGS.map(([code, name]) => (
            <button
              key={code || "orig"}
              type="button"
              onClick={() => {
                setLang(code)
                setMenu(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-800 ${
                code === lang ? "text-[#D2A63C]" : "text-gray-200"
              }`}
            >
              <span>{name}</span>
              {code === lang && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
