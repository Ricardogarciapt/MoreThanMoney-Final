"use client"

import { useState } from "react"
import { useI18n } from "@/components/i18n-provider"
import { BootcampPainel } from "@/components/webtrader/bootcamp-painel"
import { TEXTO_BOOTCAMP, type LinguaBootcamp } from "@/lib/webtrader/bootcamp"

/**
 * Sala «WebTrader MTM» no canal do educador MTM, ao lado da sala Estratégias MTM.
 * A playlist vem da própria sala (lms_streams.playlist_url), editável em /admin?tab=education.
 */
export default function WebtraderMtmSala({ playlistUrl }: { playlistUrl: string | null }) {
  const { lang } = useI18n()
  const [lingua, setLingua] = useState<LinguaBootcamp>(lang === "pt" ? "pt" : "en")
  const t = TEXTO_BOOTCAMP[lingua]
  return (
    <section id="webtrader-mtm" className="scroll-mt-24 overflow-hidden rounded-2xl border border-[#D2A63C]/30 bg-gradient-to-b from-[#D2A63C]/[0.08] to-transparent">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D2A63C]/20 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t.selo}</p>
          <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">{t.titulo}</h2>
        </div>
        <div className="flex rounded-lg border border-[#D2A63C]/40 bg-black/60 p-0.5 text-xs font-semibold">
          {(["pt", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLingua(l)} aria-pressed={lingua === l}
              className={`rounded-md px-3 py-1.5 uppercase transition-colors ${lingua === l ? "bg-[#D2A63C] text-black" : "text-[#D2A63C] hover:bg-[#D2A63C]/10"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-gray-300">{t.sub}</p>
        <BootcampPainel lingua={lingua} playlistUrl={playlistUrl} />
      </div>
    </section>
  )
}
