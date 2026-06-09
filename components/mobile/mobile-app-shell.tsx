"use client"

import { ReactNode, useEffect } from "react"
import { usePathname } from "next/navigation"
import { usePreventPageZoom } from "@/lib/prevent-page-zoom"

export default function MobileAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isMobileRoute = pathname?.startsWith("/mobile") ?? false

  usePreventPageZoom(isMobileRoute)

  useEffect(() => {
    if (isMobileRoute) {
      document.body.classList.add("mobile-route")
    } else {
      document.body.classList.remove("mobile-route")
    }

    return () => {
      document.body.classList.remove("mobile-route")
    }
  }, [isMobileRoute])

  return <div className="mobile-app-container">{children}</div>
}
