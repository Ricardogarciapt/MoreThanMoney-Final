"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function AITrader() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard-gestao")
  }, [router])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-[#D2A63C]" />
    </div>
  )
}
