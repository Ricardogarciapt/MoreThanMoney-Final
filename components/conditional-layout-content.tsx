"use client"

import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import SocialFeedRSS from "@/components/social-feed-rss"
import Analytics from "@/components/analytics"
import GeolocationDetector from "@/components/geolocation-detector"

export default function ConditionalLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStandalonePage = pathname?.startsWith('/iqcharts2') || pathname?.startsWith('/charts-primeverse')

  if (isStandalonePage) {
    return <main>{children}</main>
  }

  return (
    <>
      <GeolocationDetector />
      <Navbar />
      <SocialFeedRSS />
      <main>{children}</main>
      <Footer />
      <Analytics />
    </>
  )
}


