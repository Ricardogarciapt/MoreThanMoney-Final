"use client"

import { useEffect, useRef, useState } from "react"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Carregador único da IFrame Player API do YouTube (partilhado por todos os players da página).
let ytApiPromise: Promise<any> | null = null
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject()
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT) }
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script")
      s.id = "yt-iframe-api"
      s.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(s)
    }
  })
  return ytApiPromise
}

/** Player de playlist com botões próprios de Anterior/Próximo (via IFrame API). */
function PlaylistPlayer({ playlistId }: { playlistId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          listType: "playlist",
          list: playlistId,
          rel: 0,
          modestbranding: 1,
          cc_load_policy: 1,
          hl: "pt",
          cc_lang_pref: "pt",
          playsinline: 1,
        },
        events: { onReady: () => !cancelled && setReady(true) },
      })
    })
    return () => {
      cancelled = true
      try { playerRef.current?.destroy?.() } catch { /* noop */ }
      playerRef.current = null
    }
  }, [playlistId])

  const prev = () => playerRef.current?.previousVideo?.()
  const next = () => playerRef.current?.nextVideo?.()

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black" style={{ aspectRatio: "16 / 9" }}>
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={prev}
          disabled={!ready}
          className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!ready}
          className="rounded-full border border-[#D2A63C]/50 bg-[#D2A63C]/15 px-3 py-1.5 text-[12px] font-semibold text-[#D2A63C] disabled:opacity-40"
        >
          Próximo ▶
        </button>
      </div>
    </>
  )
}

/**
 * "Rever aulas" — playlist de YouTube associada a uma sala, para os alunos
 * reverem as aulas gravadas. Visibilidade controlada pela sala (playlist_access_tier),
 * avaliada pelo componente pai que passa `canAccess`.
 */

/** Extrai o list=ID de um URL de playlist do YouTube. */
export function extractPlaylistId(url?: string | null): string | null {
  if (!url) return null
  const m = String(url).match(/[?&]list=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // aceitar também o ID cru
  if (/^[a-zA-Z0-9_-]{12,}$/.test(url.trim())) return url.trim()
  return null
}

/** CTA de upgrade — no iOS nativo NÃO abre Stripe (política Apple); usa a subscrição in-app. */
function UpgradeButton() {
  const onClick = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const isIOSNative = /MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)
    if (isIOSNative) {
      alert("Faz upgrade da tua subscrição em Mais → Subscrição.")
      return
    }
    window.location.href = "/upgrade"
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 rounded-full bg-[#D2A63C] px-3 py-1 text-[11px] font-bold text-black"
    >
      Fazer upgrade
    </button>
  )
}

export function LmsPlaylistSection({
  playlistUrl,
  playlistTitle,
  canAccess,
  tierLabel,
  defaultOpen = false,
}: {
  playlistUrl?: string | null
  /** nome dado pelo educador; fallback "Rever aulas · Playlist" */
  playlistTitle?: string | null
  canAccess: boolean
  /** rótulo do plano necessário, p/ mensagem de bloqueio */
  tierLabel?: string | null
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = extractPlaylistId(playlistUrl)
  if (!id) return null

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D2A63C]" />
          {playlistTitle?.trim() || "Rever aulas · Playlist"}
        </span>
        <span className="text-[10px] text-gray-500">{open ? "Fechar" : "Abrir"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {canAccess ? (
            <>
              {/* Player com botões próprios Anterior/Próximo (avança/recua entre vídeos da playlist),
                  além das setas nativas do YouTube. */}
              <PlaylistPlayer playlistId={id} />
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
                Usa <strong className="text-gray-400">◀ Anterior / Próximo ▶</strong> para navegar entre as aulas.
                No ⚙️ do leitor escolhes as <strong className="text-gray-400">legendas (CC)</strong> e, quando o
                vídeo tem várias faixas, o <strong className="text-gray-400">idioma do áudio</strong>.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700 bg-black/40 px-3 py-4 text-center">
              <p className="text-xs text-gray-400">
                🔒 As aulas gravadas desta sala estão disponíveis para {tierLabel || "membros com o plano necessário"}.
              </p>
              <UpgradeButton />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
