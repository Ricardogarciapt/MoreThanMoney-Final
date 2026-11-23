"use client"

import { useState } from "react"
import { Share2, Download, Copy, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/**
 * Partilha manual de uma peça aprovada, para as redes que não se publicam sozinhas.
 *
 * - No telemóvel: a folha de partilha nativa (Web Share API) leva o ficheiro e a legenda.
 *   Se o browser não deixar partilhar o ficheiro (ou o servidor não aceitar CORS), leva só o texto e o link.
 * - No desktop: descarregar o ficheiro, copiar a legenda e abrir a rede. As redes sem
 *   texto pré-preenchido recebem a legenda no clipboard antes de abrir.
 *
 * Não publica nada: a publicação automática (Instagram/Facebook via API) continua como estava.
 */

const LIMITE_FICHEIRO = 60 * 1024 * 1024

type Rede = {
  nome: string
  nota: string
  /** true = o link já leva a legenda (não é preciso copiá-la). */
  prefill: boolean
  url: (texto: string) => string
}

const REDES: Rede[] = [
  { nome: "Instagram", nota: "Cria o post e cola a legenda.", prefill: false, url: () => "https://www.instagram.com/" },
  { nome: "TikTok", nota: "Carrega o vídeo e cola a legenda.", prefill: false, url: () => "https://www.tiktok.com/upload" },
  { nome: "YouTube Shorts", nota: "Carrega como Short e cola a legenda.", prefill: false, url: () => "https://studio.youtube.com/" },
  { nome: "Facebook", nota: "Cria o reel e cola a legenda.", prefill: false, url: () => "https://www.facebook.com/" },
  {
    nome: "Threads",
    nota: "A legenda já vai no texto; anexa o ficheiro.",
    prefill: true,
    url: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t.slice(0, 500))}`,
  },
  { nome: "WhatsApp", nota: "A legenda já vai no texto; anexa o ficheiro.", prefill: true, url: (t) => `https://wa.me/?text=${encodeURIComponent(t)}` },
]

function tipoDe(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  return (
    {
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream"
}

function nomeDe(url: string, tipo: string): string {
  const ultimo = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "")
  if (ultimo.includes(".")) return ultimo
  return `peca.${tipo.split("/")[1]?.split("+")[0] ?? "bin"}`
}

export function PartilharPeca({
  legenda,
  media,
  titulo,
  imagem,
}: {
  legenda: string
  media: string | null
  titulo: string
  imagem: boolean
}) {
  const { toast } = useToast()
  const [aberto, setAberto] = useState(false)
  const [aPartilhar, setAPartilhar] = useState(false)
  const podeNativo = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const copiarLegenda = async () => {
    try {
      await navigator.clipboard.writeText(legenda)
      toast({ title: "Legenda copiada" })
      return true
    } catch {
      toast({ title: "Não deu para copiar a legenda", variant: "destructive" })
      return false
    }
  }

  const partilharNativo = async () => {
    setAPartilhar(true)
    try {
      const dados: ShareData = { title: titulo, text: legenda }
      if (media) {
        let ficheiros: File[] = []
        try {
          const r = await fetch(media)
          if (r.ok) {
            const blob = await r.blob()
            if (blob.size <= LIMITE_FICHEIRO) {
              const tipo = blob.type || tipoDe(media)
              ficheiros = [new File([blob], nomeDe(media, tipo), { type: tipo })]
            }
          }
        } catch {
          // Sem CORS ou sem rede: segue só com o texto e o link.
        }
        if (ficheiros.length && navigator.canShare?.({ files: ficheiros })) {
          dados.files = ficheiros
        } else {
          dados.url = media
        }
      }
      await navigator.share(dados)
    } catch (e) {
      // Cancelar a folha de partilha não é erro.
      if ((e as Error).name !== "AbortError") {
        toast({ title: "A partilha não abriu", description: "Usa as opções manuais abaixo.", variant: "destructive" })
        setAberto(true)
      }
    } finally {
      setAPartilhar(false)
    }
  }

  const abrirRede = async (r: Rede) => {
    if (!r.prefill) await copiarLegenda()
    window.open(r.url(legenda), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => (podeNativo ? partilharNativo() : setAberto((v) => !v))}
        disabled={aPartilhar}
        aria-expanded={podeNativo ? undefined : aberto}
        className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.09] active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/60"
      >
        <Share2 className="h-3.5 w-3.5" /> {aPartilhar ? "A abrir…" : "Partilhar"}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2.5 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-3">
          <p className="text-[11px] text-zinc-500">
            Partilha manual: cada rede pede o vídeo e a legenda à sua maneira. Descarrega o ficheiro, copia a legenda e abre a rede.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {media && (
              <a
                href={media}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-[#D2A63C] px-2.5 py-1.5 text-xs font-medium text-zinc-950 transition hover:bg-[#E9C46A] active:scale-[0.97]"
              >
                <Download className="h-3.5 w-3.5" /> Descarregar {imagem ? "imagem" : "vídeo"}
              </a>
            )}
            <button
              type="button"
              onClick={copiarLegenda}
              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.09] active:scale-[0.97]"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar legenda
            </button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {REDES.map((r) => (
              <li key={r.nome}>
                <button
                  type="button"
                  onClick={() => abrirRede(r)}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2 text-left transition hover:border-[#D2A63C]/40 active:scale-[0.99]"
                >
                  <span>
                    <span className="block text-xs font-medium text-zinc-100">{r.nome}</span>
                    <span className="block text-[11px] text-zinc-500">{r.nota}</span>
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
