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
    // O AIOS deixou de ser um ficheiro estático a 30/09/2026 — é uma página React em /aios. O
    // endereço antigo (`/aios/index.html`) já não existe, e este atalho dava 404.
    // `router.replace` e não `window.location`: agora é uma rota do próprio Next, não um ficheiro.
    router.replace("/aios")
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
