"use client"

import { ReactNode, useEffect } from "react"
import { usePathname } from "next/navigation"
import { usePreventPageZoom } from "@/lib/prevent-page-zoom"

export default function AppMobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAppMobile = pathname?.startsWith("/app-mobile") ?? false

  usePreventPageZoom(isAppMobile)

  useEffect(() => {
    if (isAppMobile) {
      document.body.classList.add("app-mobile-route")
    } else {
      document.body.classList.remove("app-mobile-route")
    }

    return () => {
      document.body.classList.remove("app-mobile-route")
    }
  }, [isAppMobile])

  return <div className="app-mobile-container">{children}</div>
}
