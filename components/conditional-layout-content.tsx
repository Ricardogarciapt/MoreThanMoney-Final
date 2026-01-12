"use client"

import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import Analytics from "@/components/analytics"
import GeolocationDetector from "@/components/geolocation-detector"

export default function ConditionalLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStandalonePage = pathname?.startsWith('/iqcharts2') || pathname?.startsWith('/charts-primeverse')
  const isAppMobile = pathname?.startsWith('/app-mobile')

  // Páginas standalone: sem navbar, footer, etc
  if (isStandalonePage) {
    return <main>{children}</main>
  }

  // App Mobile: sem navbar original (usa sidebar própria), sem footer
  if (isAppMobile) {
    return (
      <>
        <GeolocationDetector />
        <main>{children}</main>
        <Analytics />
      </>
    )
  }

  // Páginas normais: com navbar, footer, etc
  return (
    <>
      <GeolocationDetector />
      <Navbar />
      <main>{children}</main>
      <Footer />
      <Analytics />
    </>
  )
}


