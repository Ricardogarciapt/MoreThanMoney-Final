"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    
    // Detectar callback OAuth (Google Login) - preservar hash
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      console.log('🔍 [ROOT] OAuth callback detectado, redirecionando para /auth/callback')
      console.log('🔍 [ROOT] Hash:', hash)
      // Redirecionar PRESERVANDO o hash
      window.location.href = `/auth/callback${hash}`
      return
    }
    
    // Caso normal: redirecionar para new-landing
    console.log('🔍 [ROOT] Sem OAuth, redirecionando para /new-landing')
    router.push('/new-landing')
  }, [router])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
        <p className="text-gray-400">A carregar...</p>
      </div>
    </div>
  )
}
