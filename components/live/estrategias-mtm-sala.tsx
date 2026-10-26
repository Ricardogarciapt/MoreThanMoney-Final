"use client"

import { useState } from "react"
import { FileText, Lock, PlayCircle } from "lucide-react"
import { LmsPlaylistSection } from "@/components/live/lms-playlist-section"
import { useI18n } from "@/components/i18n-provider"
import { podeAcederAoTier } from "@/lib/perfil-ui"
import { ESTRATEGIAS_MTM, capaEstrategia, capaSala, type Lingua } from "@/lib/estrategias-mtm"

const TEXTO = {
  pt: {
    selo: "Sala · Estratégias MTM",
    titulo: "As estratégias dos scanners MTM",
    sub: "Três vídeos por estratégia (o que é, como confirmar e na prática) e o guia em PDF com a checklist. Vê os vídeos, lê o guia e treina em demo antes de usares o scanner ao vivo.",
    videos: "Vídeos",
    guia: "Guia em PDF",
    semEn: "A versão em inglês está a caminho.",
    aviso: "Conteúdo educativo, não é aconselhamento financeiro. O trading tem risco.",
  },
  en: {
    selo: "Room · MTM Strategies",
    titulo: "The strategies behind the MTM scanners",
    sub: "Three videos per strategy (what it is, how to confirm it and in practice) and the PDF guide with the checklist. Watch the videos, read the guide and practise on demo before using the live scanner.",
    videos: "Videos",
    guia: "PDF guide",
    semEn: "The English version is on its way.",
    aviso: "Educational content, not financial advice. Trading carries risk.",
  },
} as const

/**
 * Secção própria da sala «Estratégias MTM» no canal do educador: capa, um cartão por estratégia e,
 * no cartão escolhido, a playlist (PT ou EN) e o guia. Separada do card de cursos para não se
 * misturar com os cursos da XTB do mesmo educador.
 */
export default function EstrategiasMtmSala({
  tier,
  userPlan,
  userType,
  memberCategory,
}: {
  /** Nível da sala (vem de lms_streams.playlist_access_tier). */
  tier: string | null
  userPlan?: string | null
  userType?: string | null
  memberCategory?: string | null
}) {
  const { lang } = useI18n()
  const [lingua, setLingua] = useState<Lingua>(lang === "pt" ? "pt" : "en")
  const [slug, setSlug] = useState(ESTRATEGIAS_MTM[0].slug)
  const t = TEXTO[lingua]
  const pode = podeAcederAoTier({ user_type: userType, member_category: memberCategory, subscription_plan: userPlan }, tier)
  const atual = ESTRATEGIAS_MTM.find((e) => e.slug === slug) ?? ESTRATEGIAS_MTM[0]
  const playlist = atual.playlist[lingua]

  return (
    <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/30 bg-gradient-to-b from-[#D2A63C]/[0.08] to-transparent">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capaSala(lingua)} alt="" className="h-44 w-full object-cover sm:h-56" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t.selo}</p>
            <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">{t.titulo}</h2>
          </div>
          <div className="flex rounded-lg border border-[#D2A63C]/40 bg-black/60 p-0.5 text-xs font-semibold">
            {(["pt", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLingua(l)}
                aria-pressed={lingua === l}
                className={`rounded-md px-3 py-1.5 uppercase transition-colors ${
                  lingua === l ? "bg-[#D2A63C] text-black" : "text-[#D2A63C] hover:bg-[#D2A63C]/10"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-gray-300">{t.sub}</p>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ESTRATEGIAS_MTM.map((e) => (
            <button
              key={e.slug}
              type="button"
              onClick={() => setSlug(e.slug)}
              aria-pressed={e.slug === slug}
              className={`group overflow-hidden rounded-xl border text-left transition-colors ${
                e.slug === slug ? "border-[#D2A63C] ring-1 ring-[#D2A63C]/50" : "border-zinc-800 hover:border-[#D2A63C]/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capaEstrategia(e.slug, lingua)} alt={e.nome} loading="lazy" className="aspect-video w-full object-cover" />
              <div className="bg-zinc-950/80 px-2.5 py-2">
                <p className="text-sm font-semibold text-white">{e.nome}</p>
                <p className="line-clamp-2 text-[11px] leading-snug text-gray-400">{e.resumo[lingua]}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-black/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-white">{atual.nome}</p>
            {pode ? (
              <a
                href={atual.guia[lingua]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/40 px-3 py-1.5 text-xs font-semibold text-[#D2A63C] transition-colors hover:bg-[#D2A63C] hover:text-black"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {t.guia}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {t.guia}
              </span>
            )}
          </div>
          {playlist ? (
            <LmsPlaylistSection
              key={`${atual.slug}-${lingua}`}
              defaultOpen
              playlistUrl={playlist}
              playlistTitle={`${atual.nome} · ${t.videos}`}
              canAccess={pode}
              tierLabel={lingua === "pt" ? "membros da app (€35) e superiores" : "app members (€35) and above"}
            />
          ) : (
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <PlayCircle className="h-4 w-4" aria-hidden />
              {t.semEn}
            </p>
          )}
        </div>

        <p className="text-[11px] text-zinc-500">{t.aviso}</p>
      </div>
    </section>
  )
}
