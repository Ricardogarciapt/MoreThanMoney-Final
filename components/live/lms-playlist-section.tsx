"use client"

import { useState } from "react"

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
            <div className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                src={`https://www.youtube.com/embed/videoseries?list=${id}`}
                title="Playlist de aulas"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700 bg-black/40 px-3 py-4 text-center">
              <p className="text-xs text-gray-400">
                🔒 As aulas gravadas desta sala estão disponíveis para {tierLabel || "membros com o plano necessário"}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
