"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

export default function JarvisPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace("/login?redirect=/jarvis")
      return
    }
    // Redirect directly to static AIOS page — avoids X-Frame-Options DENY
    window.location.replace("/aios/index.html")
  }, [user, isLoading, router])

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#050810",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#D2A63C", fontFamily: "monospace", fontSize: 14, letterSpacing: 2
    }}>
      JARVIS A INICIALIZAR...
    </div>
  )
}
