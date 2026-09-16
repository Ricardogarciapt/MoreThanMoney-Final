"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { carregarApiYouTube } from "@/lib/youtube-iframe-api"
import { useLmsHlsVideo } from "@/hooks/use-lms-hls-video"
import { extractPlaylistId } from "@/components/live/lms-playlist-section"

export type TipoLeitorIntro = "youtube" | "playlist" | "hls"

/**
 * O LEITOR — um só, para tudo o que seja introdução.
 *
 * O curso «Como usar a MoreThanMoney» e os vídeos «Aprende a usar …» abrem exatamente este modal.
 * Não são dois leitores parecidos que depois divergem: é o mesmo, com uma fonte diferente.
 *
 * Quando a fonte é uma playlist mostra a lista de aulas com o progresso e retoma onde o aluno
 * ficou. O «onde ficou» é o índice da aula no localStorage — barato, por pessoa, e sem uma linha
 * de base de dados por cada vez que alguém carrega em play (o Supabase não aguentaria isso, e o
 * ganho em precisão não pagava).
 */

const CHAVE_RETOMA = "mtm-intro-retoma-v1"

function lerRetoma(playlistId: string): number {
  try {
    const cru = window.localStorage.getItem(CHAVE_RETOMA)
    const mapa = cru ? (JSON.parse(cru) as Record<string, number>) : {}
    const i = Number(mapa[playlistId])
    return Number.isFinite(i) && i >= 0 ? i : 0
  } catch {
    return 0
  }
}

function gravarRetoma(playlistId: string, indice: number): void {
  try {
    const cru = window.localStorage.getItem(CHAVE_RETOMA)
    const mapa = cru ? (JSON.parse(cru) as Record<string, number>) : {}
    mapa[playlistId] = indice
    window.localStorage.setItem(CHAVE_RETOMA, JSON.stringify(mapa))
  } catch {
    /* sessão privada, armazenamento bloqueado — o leitor continua a funcionar, só não retoma */
  }
}

/** Id de um vídeo único do YouTube (watch?v=…, youtu.be/…, /embed/…, /shorts/…). */
export function idVideoYoutube(url: string): string | null {
  const limpo = (url || "").trim()
  if (!limpo) return null
  try {
    const u = new URL(limpo.startsWith("http") ? limpo : `https://${limpo}`)
    const v = u.searchParams.get("v")
    if (v) return v
    const partes = u.pathname.split("/").filter(Boolean)
    if (u.hostname.includes("youtu.be")) return partes[0] || null
    const i = partes.findIndex((p) => p === "embed" || p === "shorts" || p === "live")
    if (i >= 0 && partes[i + 1]) return partes[i + 1]
    return null
  } catch {
    return null
  }
}

function LeitorPlaylist({ playlistId }: { playlistId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const [pronto, setPronto] = useState(false)
  const [aulas, setAulas] = useState<string[]>([])
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    let cancelado = false
    const inicio = lerRetoma(playlistId)

    carregarApiYouTube().then((YT) => {
      if (cancelado || !hostRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          listType: "playlist",
          list: playlistId,
          index: inicio,
          rel: 0,
          modestbranding: 1,
          cc_load_policy: 1,
          hl: "pt",
          cc_lang_pref: "pt",
          playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            if (cancelado) return
            setPronto(true)
            try {
              setAulas(e.target.getPlaylist?.() || [])
              if (inicio > 0) e.target.playVideoAt?.(inicio)
              setIndice(e.target.getPlaylistIndex?.() ?? inicio)
            } catch {
              /* a playlist pode ainda não estar carregada — o onStateChange apanha-a a seguir */
            }
          },
          onStateChange: (e: any) => {
            if (cancelado) return
            try {
              const lista = e.target.getPlaylist?.() || []
              if (lista.length > 0) setAulas(lista)
              const i = e.target.getPlaylistIndex?.()
              if (typeof i === "number" && i >= 0) {
                setIndice(i)
                gravarRetoma(playlistId, i)
              }
            } catch {
              /* noop */
            }
          },
        },
      })
    })

    return () => {
      cancelado = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      playerRef.current = null
    }
  }, [playlistId])

  const irPara = (i: number) => {
    try {
      playerRef.current?.playVideoAt?.(i)
      setIndice(i)
      gravarRetoma(playlistId, i)
    } catch {
      /* noop */
    }
  }

  const total = aulas.length
  const percentagem = total > 0 ? Math.round(((indice + 1) / total) * 100) : 0

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div
          className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black"
          style={{ aspectRatio: "16 / 9" }}
        >
          <div ref={hostRef} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => playerRef.current?.previousVideo?.()}
            disabled={!pronto}
            className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            ◀ Anterior
          </button>
          <button
            type="button"
            onClick={() => playerRef.current?.nextVideo?.()}
            disabled={!pronto}
            className="rounded-full border border-[#D2A63C]/50 bg-[#D2A63C]/15 px-3 py-1.5 text-[12px] font-semibold text-[#D2A63C] disabled:opacity-40"
          >
            Próximo ▶
          </button>
          {total > 0 && (
            <span className="ml-auto text-[11px] text-gray-500">
              Aula {indice + 1} de {total}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {total > 0 && (
          <>
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-[#D2A63C]" style={{ width: `${percentagem}%` }} />
            </div>
            <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-1 lg:max-h-[58vh]">
              {aulas.map((_id, i) => (
                <button
                  key={`${_id}-${i}`}
                  type="button"
                  onClick={() => irPara(i)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition ${
                    i === indice
                      ? "border-[#D2A63C]/60 bg-[#D2A63C]/10 text-[#D2A63C]"
                      : i < indice
                        ? "border-gray-800 bg-black/40 text-gray-500"
                        : "border-gray-800 bg-black/40 text-gray-300 hover:border-gray-600"
                  }`}
                >
                  <span className="w-5 shrink-0 text-[11px] tabular-nums">{i + 1}</span>
                  <span className="truncate">{i < indice ? "Vista" : i === indice ? "A ver" : "Aula"}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LeitorHls({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  useLmsHlsVideo(videoRef, url)
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black"
      style={{ aspectRatio: "16 / 9" }}
    >
      <video ref={videoRef} controls playsInline className="absolute inset-0 h-full w-full" />
    </div>
  )
}

export default function LeitorIntroModal({
  aberto,
  aoFechar,
  titulo,
  url,
  tipo,
  descricao,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  url: string
  tipo: TipoLeitorIntro
  descricao?: string | null
}) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  const fechar = useCallback(() => aoFechar(), [aoFechar])

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar()
    }
    window.addEventListener("keydown", aoTeclar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", aoTeclar)
      document.body.style.overflow = overflow
    }
  }, [aberto, fechar])

  if (!aberto || !montado) return null

  const playlistId = tipo === "playlist" ? extractPlaylistId(url) : null
  const videoId = tipo === "youtube" ? idVideoYoutube(url) : null

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483646] flex items-start justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={fechar}
    >
      <div
        className="w-full max-w-5xl rounded-2xl border border-[#D2A63C]/25 bg-[#0a0a0c] p-4 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white sm:text-xl">{titulo}</h2>
            {descricao && <p className="mt-1 text-[13px] leading-relaxed text-gray-400">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="shrink-0 rounded-full border border-gray-700 p-2 text-gray-300 hover:border-gray-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {playlistId ? (
          <LeitorPlaylist playlistId={playlistId} />
        ) : videoId ? (
          <div
            className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&cc_load_policy=1&hl=pt&cc_lang_pref=pt`}
              title={titulo}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : tipo === "hls" ? (
          <LeitorHls url={url} />
        ) : (
          <p className="rounded-lg border border-dashed border-gray-700 bg-black/40 p-6 text-center text-sm text-gray-400">
            Ainda não há vídeo para mostrar aqui.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
