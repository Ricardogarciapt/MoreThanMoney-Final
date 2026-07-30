"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Subtitles, Check, ChevronDown } from "lucide-react"
import { CAPTION_LANGUAGE_LABELS, captionLanguagesFor } from "@/lib/lms-captions/constants"

// Legendas ao vivo (closed captions) com tradução + seletor de idioma da sessão.
// Overlay sobre o player + botão CC. Recebe cues por Supabase Realtime (INSERT em
// lms_stream_captions); o idioma é escolhido pelo espetador (inicia no idioma do app).

type Cue = {
  seq: number
  source_language: string
  source_text: string
  translations: Record<string, string> | null
  is_final: boolean
}

function initialLang(): string {
  if (typeof document === "undefined") return "pt"
  const m = document.cookie.match(/(?:^|;\s*)mtm_lang=([^;]+)/)
  const raw = m ? decodeURIComponent(m[1]) : ""
  return (raw || "pt").toLowerCase().slice(0, 2)
}

export default function LiveCaptions({
  streamId,
  sourceLanguage = "pt",
}: {
  streamId: string
  sourceLanguage?: string
}) {
  const [enabled, setEnabled] = useState(true)
  const [lang, setLang] = useState<string>(initialLang)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cue, setCue] = useState<Cue | null>(null)
  const seqRef = useRef(0)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const langs = useMemo(() => captionLanguagesFor(sourceLanguage), [sourceLanguage])

  // Subscrição Realtime aos cues de legenda deste stream.
  useEffect(() => {
    if (!streamId || !enabled) return
    let active = true
    seqRef.current = 0

    const applyCue = (c: Cue) => {
      if (!active || !c || c.is_final === false) return
      if (c.seq <= seqRef.current) return
      seqRef.current = c.seq
      setCue(c)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      // Limpa a legenda após 12s de silêncio (não fica "presa" no ecrã).
      clearTimer.current = setTimeout(() => active && setCue(null), 12000)
    }

    // Recupera o último cue para não começar em branco a meio da sessão.
    fetch(`/api/live-sessions/streams/${streamId}/captions?since=0&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const last = d?.captions?.[d.captions.length - 1]
        if (last) applyCue(last as Cue)
      })
      .catch(() => {})

    const channel = supabase
      .channel(`captions:${streamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lms_stream_captions",
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => applyCue(payload.new as Cue),
      )
      .subscribe()

    return () => {
      active = false
      if (clearTimer.current) clearTimeout(clearTimer.current)
      supabase.removeChannel(channel)
    }
  }, [streamId, enabled])

  const text = cue
    ? lang === cue.source_language
      ? cue.source_text
      : cue.translations?.[lang] || cue.source_text
    : ""

  return (
    <>
      {/* Overlay de legenda (sobre o vídeo, acima dos controlos nativos) */}
      {enabled && text && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex justify-center px-3">
          <span className="max-w-[92%] rounded-md bg-black/75 px-3 py-1.5 text-center text-[15px] font-medium leading-snug text-white shadow-lg sm:text-base">
            {text}
          </span>
        </div>
      )}

      {/* Controlo CC + seletor de idioma (canto superior direito do player) */}
      <div className="absolute right-2 top-2 z-50 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setEnabled((v) => !v)
            setMenuOpen(false)
          }}
          aria-label="Legendas"
          className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
            enabled
              ? "border-[#D2A63C]/60 bg-[#D2A63C]/20 text-[#D2A63C]"
              : "border-gray-700 bg-black/60 text-gray-300"
          }`}
        >
          <Subtitles className="mr-1 inline h-3.5 w-3.5" />
          CC
        </button>

        {enabled && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-gray-700 bg-black/60 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-black/80"
            >
              {(CAPTION_LANGUAGE_LABELS[lang] || lang.toUpperCase()).slice(0, 3)}
              <ChevronDown className="h-3 w-3" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                {langs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setLang(l)
                      setMenuOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-800 ${
                      l === lang ? "text-[#D2A63C]" : "text-gray-200"
                    }`}
                  >
                    <span>
                      {CAPTION_LANGUAGE_LABELS[l] || l.toUpperCase()}
                      {l === sourceLanguage.toLowerCase().slice(0, 2) && (
                        <span className="ml-1 text-[10px] text-gray-500">(original)</span>
                      )}
                    </span>
                    {l === lang && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
