"use client"

import { ReactNode, useEffect } from "react"
import { usePathname } from "next/navigation"
import AIAssistantFloating from "@/components/mobile/ai-assistant-floating"

export default function AppMobileLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()

  useEffect(() => {
    // Adicionar classe ao body quando estiver em /app-mobile
    if (pathname?.startsWith('/app-mobile')) {
      document.body.classList.add('app-mobile-route')
    } else {
      document.body.classList.remove('app-mobile-route')
    }

    return () => {
      document.body.classList.remove('app-mobile-route')
    }
  }, [pathname])

  return (
    <div className="app-mobile-container">
      {children}
      <AIAssistantFloating />
    </div>
  )
}
