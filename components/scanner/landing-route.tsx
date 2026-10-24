import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SCANNERS } from "@/lib/scanners-catalog"
import { SCANNER_LANDINGS, getScannerLanding } from "@/lib/scanner-landings"
import { ScannerLandingView } from "@/components/scanner/scanner-landing"
import type { Lang } from "@/components/scanner/landing-i18n"

// Rotas das landings: /scanner/<slug> (português) e /en/scanner/<slug> (inglês).

export const landingParams = () => SCANNER_LANDINGS.map((l) => ({ slug: l.slug }))

export function landingMetadata(slug: string, lang: Lang): Metadata {
  const landing = getScannerLanding(slug)
  const scanner = SCANNERS.find((s) => s.key === landing?.key)
  if (!landing || !scanner) return {}
  const L = lang === "en" && landing.en ? { ...landing, ...landing.en } : landing
  const image = (lang === "en" ? landing.posterEn : undefined) ?? landing.poster ?? scanner.image
  return {
    title: `${scanner.name} · MoreThanMoney`,
    description: L.metaDescription,
    alternates: {
      canonical: lang === "en" ? `/en/scanner/${slug}` : `/scanner/${slug}`,
      languages: { "pt-PT": `/scanner/${slug}`, en: `/en/scanner/${slug}` },
    },
    openGraph: { title: scanner.name, description: L.metaDescription, images: [image], locale: lang === "en" ? "en_GB" : "pt_PT" },
  }
}

export function LandingRoute({ slug, lang }: { slug: string; lang: Lang }) {
  const landing = getScannerLanding(slug)
  const scanner = SCANNERS.find((s) => s.key === landing?.key)
  if (!landing || !scanner) notFound()
  const others = SCANNER_LANDINGS.filter((l) => l.slug !== slug).map((l) => ({
    slug: l.slug,
    name: SCANNERS.find((s) => s.key === l.key)?.name ?? l.slug,
  }))
  return <ScannerLandingView scanner={scanner} landing={landing} others={others} lang={lang} />
}
