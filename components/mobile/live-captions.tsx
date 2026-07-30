"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Subtitles, Check, ChevronDown } from "lucide-react"
import {
  CAPTION_LANGUAGE_LABELS,
  captionLanguagesFor,
  normalizeCaptionLang,
} from "@/lib/lms-captions/constants"

// Legendas ao vivo (closed captions) com tradução + seletor de idioma da sessão.
// Overlay sobre o player + botão CC. Faz polling ao endpoint /captions?lang=<idioma>,
// que resolve/traduz o idioma escolhido on-demand (suporta os 21 idiomas do site).

type Cue = {
  seq: number
  source_language: string
  source_text: string
  text?: string
  is_final: boolean
}

const CAPTION_LANG_KEY = "mtm_caption_lang"
const CAPTION_ON_KEY = "mtm_captions_on"

function initialEnabled(): boolean {
  if (typeof window === "undefined") return true
  return window.localStorage?.getItem(CAPTION_ON_KEY) !== "0" // default ligado
}

function initialLang(): string {
  if (typeof window === "undefined") return "pt"
  // 1º a escolha de legendas memorizada; senão o idioma do app (cookie); senão PT.
  const saved = window.localStorage?.getItem(CAPTION_LANG_KEY)
  if (saved) return normalizeCaptionLang(saved)
  const m = document.cookie.match(/(?:^|;\s*)mtm_lang=([^;]+)/)
  const raw = m ? decodeURIComponent(m[1]) : ""
  return normalizeCaptionLang(raw || "pt")
}

export default function LiveCaptions({
  streamId,
  sourceLanguage = "pt",
}: {
  streamId: string
  sourceLanguage?: string
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [lang, setLang] = useState<string>(initialLang)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lines, setLines] = useState<string[]>([]) // rolo das últimas ~2 frases (continuidade)
  const seqRef = useRef(0)
  const cueRef = useRef<Cue | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const langs = useMemo(() => captionLanguagesFor(sourceLanguage), [sourceLanguage])

  // Polling ao endpoint (resolve/traduz o idioma pedido on-demand). Ao trocar de idioma,
  // recua o `since` para re-obter o cue atual já no novo idioma.
  useEffect(() => {
    if (!streamId || !enabled) return
    let active = true
    seqRef.current = Math.max(0, (cueRef.current?.seq ?? 1) - 1)

    const apply = (c: Cue) => {
      if (!active || !c || c.is_final === false) return
      seqRef.current = c.seq
      cueRef.current = c
      const t = (c.text ?? c.source_text ?? "").trim()
      if (!t) return
      // Rolo: mantém as últimas 2 frases (a anterior sobe, a nova entra) → continuidade.
      setLines((prev) => (prev[prev.length - 1] === t ? prev : [...prev, t].slice(-2)))
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => active && setLines([]), 10000)
    }

    const poll = async () => {
      try {
        const r = await fetch(
          `/api/live-sessions/streams/${streamId}/captions?since=${seqRef.current}&limit=15&lang=${encodeURIComponent(lang)}`,
        )
        if (!r.ok) return
        const d = await r.json()
        // Processa TODOS os cues novos por ordem (não só o último) → não perde fala.
        for (const c of d?.captions ?? []) apply(c as Cue)
      } catch {}
    }

    poll()
    const t = setInterval(poll, 1300)
    return () => {
      active = false
      clearInterval(t)
      if (clearTimer.current) clearTimeout(clearTimer.current)
    }
  }, [streamId, enabled, lang])

  const text = lines.join(" ")

  return (
    <>
      {/* Overlay de legenda (sobre o vídeo, acima dos controlos nativos) — rolo contínuo */}
      {enabled && text && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex justify-center px-3">
          <span className="max-w-[92%] rounded-md bg-black/75 px-3 py-1.5 text-center text-[15px] font-medium leading-snug text-white shadow-lg sm:text-base line-clamp-3">
            {text}
          </span>
        </div>
      )}

      {/* Controlo CC + seletor de idioma (canto superior direito do player) */}
      <div className="absolute right-2 top-2 z-50 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setEnabled((v) => {
              const nv = !v
              try { window.localStorage?.setItem(CAPTION_ON_KEY, nv ? "1" : "0") } catch {}
              return nv
            })
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
              <div className="absolute right-0 top-8 z-50 max-h-64 w-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                {langs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setLang(l)
                      try { window.localStorage?.setItem(CAPTION_LANG_KEY, l) } catch {}
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
