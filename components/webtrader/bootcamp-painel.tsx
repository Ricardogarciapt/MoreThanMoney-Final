"use client"

import { useEffect, useState } from "react"
import { GraduationCap, PlayCircle, X } from "lucide-react"
import { extractPlaylistId } from "@/components/live/lms-playlist-section"
import {
  CANAL_SALA_WEBTRADER,
  EPISODIOS_WEBTRADER,
  PLAYLIST_WEBTRADER_EN,
  SALA_WEBTRADER_ID,
  TEXTO_BOOTCAMP,
  type LinguaBootcamp,
} from "@/lib/webtrader/bootcamp"

const EDUCADOR_MTM = "9739ae1a-884d-4d03-8e4a-6da498e51c63"

/**
 * Lista dos seis vídeos e, quando a sala já tem playlist, o leitor DENTRO do WebTrader.
 * Cada vídeo da lista é clicável e abre esse episódio no leitor (índice da playlist do YouTube).
 */
export function BootcampPainel({
  lingua,
  playlistUrl,
  linkSala = false,
}: {
  lingua: LinguaBootcamp
  playlistUrl: string | null
  linkSala?: boolean
}) {
  const t = TEXTO_BOOTCAMP[lingua]
  const lista = extractPlaylistId(lingua === "en" ? PLAYLIST_WEBTRADER_EN : playlistUrl)
  const [atual, setAtual] = useState(1)
  return (
    <div className="space-y-3">
      {lista ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
          <iframe
            key={`${lista}-${atual}`}
            src={`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(lista)}&index=${atual - 1}&rel=0&modestbranding=1&playsinline=1${atual > 1 ? "&autoplay=1" : ""}`}
            title={`${t.titulo} · ${atual}`}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400">
          <PlayCircle className="h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden /> {t.aCaminho}
        </p>
      )}
      <ol className="space-y-1.5">
        {EPISODIOS_WEBTRADER.map((e) => {
          const ativo = Boolean(lista) && e.n === atual
          return (
            <li key={e.n}>
              <button
                type="button"
                disabled={!lista}
                onClick={() => setAtual(e.n)}
                aria-current={ativo ? "true" : undefined}
                className={`flex w-full gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  ativo ? "border-[#D2A63C] bg-[#D2A63C]/10" : "border-zinc-800 bg-black/40"
                } ${lista ? "hover:border-[#D2A63C]/60" : "cursor-default"}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D2A63C]/15 text-xs font-bold text-[#E9C46A]">
                  {lista ? <PlayCircle className="h-4 w-4" aria-hidden /> : e.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    {e.n}. {e.titulo[lingua]} <span className="text-[11px] font-normal text-zinc-500">· {e.minutos} {t.min}</span>
                  </span>
                  <span className="block text-[12px] leading-snug text-zinc-400">{e.resumo[lingua]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {linkSala && (
        <a href={CANAL_SALA_WEBTRADER} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-semibold text-[#D2A63C] hover:underline">
          {t.abrirSala} →
        </a>
      )}
      <p className="text-[11px] text-zinc-500">{t.aviso}</p>
    </div>
  )
}

/** Lê a playlist da sala (o admin cola-a em /admin?tab=education, sem deploy). */
export function usePlaylistBootcamp(ativo = true): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    fetch(`/api/live-sessions/streams?educatorId=${EDUCADOR_MTM}`)
      .then((r) => r.json())
      .then((j: { data?: { id: string; playlist_url?: string | null }[] }) => {
        const sala = (j.data || []).find((s) => s.id === SALA_WEBTRADER_ID)
        if (vivo) setUrl(sala?.playlist_url ?? null)
      })
      .catch(() => null)
    return () => { vivo = false }
  }, [ativo])
  return url
}

/** Botão «Tutorial» da barra do WebTrader: abre o bootcamp numa janela por cima do terminal. */
export function TutorialWebtrader() {
  const [aberto, setAberto] = useState(false)
  const [lingua, setLingua] = useState<LinguaBootcamp>("pt")
  const playlist = usePlaylistBootcamp(aberto)
  useEffect(() => {
    try { if (!navigator.language.toLowerCase().startsWith("pt")) setLingua("en") } catch { /* sem navigator */ }
  }, [])
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false) }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [aberto])
  const t = TEXTO_BOOTCAMP[lingua]
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Tutorial" aria-label="Tutorial do WebTrader"
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#D2A63C]/40 bg-black/40 px-2 text-[12px] font-semibold text-[#E9C46A] hover:bg-[#D2A63C]/10 [@media(pointer:coarse)]:h-10">
        <GraduationCap className="h-4 w-4" /> <span className="hidden md:inline">Tutorial</span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[2147483640] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setAberto(false)}>
          <div role="dialog" aria-modal="true" aria-label={t.titulo} onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#D2A63C]/30 bg-[#0b0b0d] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">Tutorial</p>
                <h2 className="text-lg font-bold text-white">{t.titulo}</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-[#D2A63C]/40 p-0.5 text-[11px] font-semibold">
                  {(["pt", "en"] as const).map((l) => (
                    <button key={l} type="button" onClick={() => setLingua(l)} aria-pressed={lingua === l}
                      className={`rounded-md px-2 py-1 uppercase ${lingua === l ? "bg-[#D2A63C] text-black" : "text-[#D2A63C]"}`}>{l}</button>
                  ))}
                </div>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <p className="mb-3 text-sm text-zinc-300">{t.sub}</p>
            <BootcampPainel lingua={lingua} playlistUrl={playlist} linkSala />
          </div>
        </div>
      )}
    </>
  )
}
