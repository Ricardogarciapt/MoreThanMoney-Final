"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Loader2, ShieldAlert } from "lucide-react"

/**
 * /aios — JARVIS AI OS
 * Apenas acessível a utilizadores com user_type = 'admin'.
 * O middleware já bloqueia o acesso a nível de servidor;
 * esta página adiciona uma camada extra de verificação client-side.
 */
export default function AiosPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace("/login?redirect=/aios")
      return
    }
    const uType = (user as any).user_type ?? (user as any).profile?.user_type
    if (uType === "admin") {
      setIsAdmin(true)
    } else {
      setIsAdmin(false)
    }
  }, [user, isLoading, router])

  if (isLoading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-[#050810] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#050810] flex items-center justify-center text-white flex-col gap-4">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <p className="text-gray-400">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#050810]" style={{ zIndex: 9999 }}>
      <iframe
        src="/aios/index.html"
        className="w-full h-full border-0"
        title="JARVIS — MoreThanMoney AI OS"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
