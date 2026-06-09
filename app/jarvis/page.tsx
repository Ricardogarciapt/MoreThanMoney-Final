"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

export default function JarvisPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login?redirect=/jarvis")
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#050810", display: "flex", alignItems: "center", justifyContent: "center", color: "#D2A63C", fontFamily: "monospace", fontSize: 14, letterSpacing: 2 }}>
        JARVIS A INICIALIZAR...
      </div>
    )
  }

  if (!user) return null

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#050810" }}>
      <iframe
        src="/aios/index.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="microphone; autoplay"
        title="JARVIS MTM AI OS"
      />
    </div>
  )
}
