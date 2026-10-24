import type { Metadata } from "next"
import { LandingRoute, landingMetadata, landingParams } from "@/components/scanner/landing-route"

type Props = { params: Promise<{ slug: string }> }

export const generateStaticParams = landingParams
export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return landingMetadata((await params).slug, "pt")
}

export default async function ScannerLandingPage({ params }: Props) {
  return <LandingRoute slug={(await params).slug} lang="pt" />
}
