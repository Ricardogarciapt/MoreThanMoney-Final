"use client"

import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function ConditionalNavbarFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStandalonePage =
    pathname?.startsWith('/iqcharts2') ||
    pathname?.startsWith('/charts-primeverse') ||
    pathname?.startsWith('/app-mobile')

  if (isStandalonePage) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  )
}

