import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SCANNERS } from "@/lib/scanners-catalog"
import { SCANNER_LANDINGS, getScannerLanding } from "@/lib/scanner-landings"
import { ScannerLandingView } from "@/components/scanner/scanner-landing"

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return SCANNER_LANDINGS.map((l) => ({ slug: l.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const landing = getScannerLanding(slug)
  const scanner = SCANNERS.find((s) => s.key === landing?.key)
  if (!landing || !scanner) return {}
  const image = landing.poster ?? scanner.image
  return {
    title: `${scanner.name} · MoreThanMoney`,
    description: landing.metaDescription,
    alternates: { canonical: `/scanner/${slug}` },
    openGraph: {
      title: scanner.name,
      description: landing.metaDescription,
      images: [image],
      locale: "pt_PT",
    },
  }
}

export default async function ScannerLandingPage({ params }: Props) {
  const { slug } = await params
  const landing = getScannerLanding(slug)
  const scanner = SCANNERS.find((s) => s.key === landing?.key)
  if (!landing || !scanner) notFound()
  const others = SCANNER_LANDINGS.filter((l) => l.slug !== slug).map((l) => ({
    slug: l.slug,
    name: SCANNERS.find((s) => s.key === l.key)?.name ?? l.slug,
  }))
  return <ScannerLandingView scanner={scanner} landing={landing} others={others} />
}
