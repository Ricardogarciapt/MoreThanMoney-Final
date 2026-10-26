"use client"

import { useI18n } from "@/components/i18n-provider"

/**
 * O vídeo de um minuto do caminho MTM Auto, na língua do site. A página em si continua em PT;
 * o vídeo segue a língua escolhida no resto do site (as mesmas seis do onboarding MTM).
 */
const LINGUAS = ["pt", "en", "es", "fr", "de", "it"] as const
type Lingua = (typeof LINGUAS)[number]

const TITULO: Record<Lingua, string> = {
  pt: "O MTM Auto num minuto",
  en: "MTM Auto in one minute",
  es: "MTM Auto en un minuto",
  fr: "MTM Auto en une minute",
  de: "MTM Auto in einer Minute",
  it: "MTM Auto in un minuto",
}

export default function VideoMtmAuto({ className = "" }: { className?: string }) {
  const { lang } = useI18n()
  const l: Lingua = (LINGUAS as readonly string[]).includes(lang) ? (lang as Lingua) : "pt"
  const src = `/videos/onboarding-mtm-auto-${l}.mp4`
  return (
    <section className={className}>
      <p className="mb-2 text-[13px] font-semibold text-[#E9C46A]">{TITULO[l]}</p>
      <div className="overflow-hidden rounded-2xl border border-[#3a2f17] bg-black shadow-[0_0_60px_-18px_rgba(210,166,60,0.45)]">
        <video key={src} className="aspect-video w-full" src={src} controls playsInline preload="metadata" />
      </div>
    </section>
  )
}
