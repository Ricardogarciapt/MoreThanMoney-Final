"use client"

import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function ConditionalNavbarFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isExactOrChildPath = (basePath: string) => {
    if (!pathname) return false
    return pathname === basePath || pathname.startsWith(`${basePath}/`)
  }

  // Rotas standalone: não renderizar navbar/footer global.
  // Importante: usar match exato ou subrota para evitar esconder páginas
  // que apenas começam com o mesmo prefixo (ex: /workshop).
  const standalonePaths = ["/iqcharts2", "/charts-primeverse", "/app-mobile", "/work"]
  const isStandalonePage = standalonePaths.some(isExactOrChildPath)

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

