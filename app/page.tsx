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
      // Hash não é enviado ao servidor: /auth/finish (client) processa o fragmento
      console.log('🔍 [ROOT] OAuth (hash) detectado, redirecionando para /auth/finish')
      window.location.href = `/auth/finish${hash}`
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
