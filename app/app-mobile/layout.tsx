"use client"

import { ReactNode, useEffect } from "react"
import { usePathname } from "next/navigation"

export default function AppMobileLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname?.startsWith("/app-mobile")) {
      document.body.classList.add("app-mobile-route")
    } else {
      document.body.classList.remove("app-mobile-route")
    }

    return () => {
      document.body.classList.remove("app-mobile-route")
    }
  }, [pathname])

  return <div className="app-mobile-container">{children}</div>
}
