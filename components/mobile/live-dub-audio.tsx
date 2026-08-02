"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, ChevronDown, Check } from "lucide-react"

// Dobragem ao vivo: seletor de canal de ÁUDIO. Ao escolher um idioma dobrado, silencia
// o vídeo e toca a voz clonada (TTS por frase, servido em /captions?audio=1&lang=).
// O áudio dobrado chega ~6-8s atrasado (ASR→tradução→TTS); por isso, no canal dobrado
// ATRASAMOS o vídeo ~DUB_VIDEO_DELAY_S para as vozes sincronizarem. O PT original fica rápido.

const DUB_LANGS: [string, string][] = [
  ["", "Português (original)"],
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
]

// Atraso do vídeo (segundos) para alinhar com a voz dobrada. O ÁUDIO é sempre tocado
// INTEIRO e por ordem (nunca se saltam frases). Para não derivar, atrasa-se o VÍDEO
// e, se a fila crescer, acelera-se levemente a fala (sem perder palavras).
const DUB_VIDEO_DELAY_S = 9      // latência típica do pipeline ASR→tradução→TTS
const DUB_CATCHUP_AT = 2         // a partir de N clips pendentes acelera um pouco
const DUB_RATE_NORMAL = 1.0
const DUB_RATE_CATCHUP = 1.06    // +6% imperceptível, recupera atraso SEM cortar frases

function liveEdgeOf(v: HTMLVideoElement): number {
  try {
    if (v.seekable && v.seekable.length) return v.seekable.end(v.seekable.length - 1)
    if (v.buffered && v.buffered.length) return v.buffered.end(v.buffered.length - 1)
  } catch {}
  return 0
}

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
  const lastSeqRef = useRef(-1) // último seq já enfileirado (dedupe → não repete a frase)

  useEffect(() => {
    const v = videoRef.current
    const hls = (v as any)?.__mtmHls
    if (!audioRef.current && typeof Audio !== "undefined") {
      audioRef.current = new Audio()
      audioRef.current.onended = playNext
    }
    const a = audioRef.current

    // ---- Canal ORIGINAL: restaura latência baixa e volta à borda ao vivo ----
    const restoreLive = () => {
      try {
        if (hls?.config) {
          hls.config.liveSyncDuration = undefined // volta a usar liveSyncDurationCount (3)
          hls.config.liveMaxLatencyDuration = undefined
          hls.config.maxLiveSyncPlaybackRate = 1.1 // pode voltar a apanhar o edge
        }
        if (v) {
          const edge = liveEdgeOf(v)
          if (edge > 2 && edge - v.currentTime > 3) v.currentTime = edge - 1.5 // apanha o edge
        }
      } catch {}
    }

    if (!lang) {
      if (v) { v.muted = false; v.volume = 1 } // restaura o áudio original
      if (a) { a.pause(); a.src = "" }
      queueRef.current = []
      setActive(false)
      restoreLive()
      return
    }

    // ---- Canal DOBRADO: ESCONDE o áudio original, ATRASA o vídeo ~DUB_VIDEO_DELAY_S ----
    const enforceMute = () => {
      const el = videoRef.current
      if (el && (!el.muted || el.volume !== 0)) { el.muted = true; el.volume = 0 } // silêncio total do original
    }
    if (v) {
      v.muted = true
      v.volume = 0
      v.addEventListener("volumechange", enforceMute)
    }
    // hls.js: passa a jogar DUB_VIDEO_DELAY_S atrás do edge e segura aí (não recupera latência).
    if (hls?.config) {
      hls.config.liveSyncDuration = DUB_VIDEO_DELAY_S
      hls.config.liveMaxLatencyDuration = DUB_VIDEO_DELAY_S + 15
      hls.config.maxLiveSyncPlaybackRate = 1 // NÃO acelerar p/ o edge — mantém o vídeo atrasado
    }
    // Mantém o vídeo ~DUB_VIDEO_DELAY_S atrás (seek inicial + correções; funciona também no HLS nativo).
    const holdDelay = () => {
      const el = videoRef.current
      if (!el) return
      const edge = liveEdgeOf(el)
      if (edge < DUB_VIDEO_DELAY_S) return // ainda sem buffer suficiente
      const latency = edge - el.currentTime
      const bufStart = el.buffered && el.buffered.length ? el.buffered.start(0) : 0
      const target = Math.max(bufStart + 0.5, edge - DUB_VIDEO_DELAY_S)
      // Demasiado perto do edge (adiantou) ou demasiado atrás (derivou) → recoloca no alvo.
      if (latency < DUB_VIDEO_DELAY_S - 2 || latency > DUB_VIDEO_DELAY_S + 5) {
        try { el.currentTime = target } catch {}
      }
    }

    setActive(true)
    let running = true
    sinceRef.current = 0
    lastSeqRef.current = -1
    queueRef.current = []

    const poll = async () => {
      try {
        enforceMute()
        const r = await fetch(
          `/api/live-sessions/streams/${streamId}/captions?since=${sinceRef.current}&limit=8&audio=1&lang=${lang}`,
        )
        if (!r.ok || !running) return
        const d = await r.json()
        for (const c of d?.captions ?? []) {
          if (c.seq <= lastSeqRef.current) continue // dedupe → nunca repete a frase
          lastSeqRef.current = c.seq
          if (c.audioUrl) queueRef.current.push(c.audioUrl) // NUNCA se descartam clips (não roubar palavras)
          sinceRef.current = c.seq
        }
        if (a && a.paused) playNext()
      } catch {}
    }

    // Arranca na BORDA AO VIVO: caminha até ao último seq SEM gerar áudio, e só dobra o que vem a seguir.
    let t: ReturnType<typeof setInterval> | null = null
    let delayTimer: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      try {
        let s = 0
        for (let i = 0; i < 50 && running; i++) {
          const r = await fetch(`/api/live-sessions/streams/${streamId}/captions?since=${s}&limit=100&lang=${lang}`)
          if (!r.ok) break
          const d = await r.json()
          const cues = d?.captions ?? []
          if (!cues.length) break
          s = d.latestSeq ?? cues[cues.length - 1].seq
          if (cues.length < 100) break
        }
        sinceRef.current = s
        lastSeqRef.current = s
      } catch {}
      if (running) {
        // Seek inicial para o atraso + manutenção (dá tempo ao buffer encher).
        setTimeout(() => { if (running) holdDelay() }, 1200)
        delayTimer = setInterval(() => { if (running) holdDelay() }, 2000)
        poll()
        t = setInterval(poll, 1500)
      }
    })()

    return () => {
      running = false
      if (t) clearInterval(t)
      if (delayTimer) clearInterval(delayTimer)
      if (v) v.removeEventListener("volumechange", enforceMute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, streamId])

  function playNext() {
    const a = audioRef.current
    const url = queueRef.current.shift()
    if (a && url) {
      // Catch-up: quantos mais clips pendentes, mais depressa toca (recupera o atraso
      // sem cortar frases). Volta a 1.0x quando a fila esvazia.
      a.playbackRate = queueRef.current.length >= DUB_CATCHUP_AT ? DUB_RATE_CATCHUP : DUB_RATE_NORMAL
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
        // Abre PARA CIMA (o botão fica no fundo do player → menu para baixo saía do ecrã).
        <div className="absolute bottom-full right-0 z-50 mb-1 w-44 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
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
