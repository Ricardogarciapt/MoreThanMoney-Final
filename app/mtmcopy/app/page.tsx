"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Loader2 } from "lucide-react"

/** Redireciona: admin → consola; cliente → configuração em /mtmcopy */
export default function MtmcopyAppRedirectPage() {
  const router = useRouter()
  const { isAdmin, isLoading, user } = useAuth()

  useEffect(() => {
    if (isLoading) return
    if (isAdmin || user?.user_type === "admin") {
      router.replace("/admin/mtmcopy")
    } else {
      router.replace("/mtmcopy")
    }
  }, [isLoading, isAdmin, user, router])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
    </div>
  )
}
