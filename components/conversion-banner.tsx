"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Banner do funil de conversão — aparece a quem tem acesso "grátis manual" com
 * conversion_deadline. Countdown + oferta (Fundador 50% / intro 34,99€) → /upgrade.
 * No app iOS nativo NÃO abre Stripe (compliance) — remete p/ Mais → Subscrição.
 */

type Status = {
  isFreeGranted: boolean
  memberCategory?: string | null
  deadline?: string
  daysLeft?: number
  offer?: { title: string; coupon?: string; plan?: string }
}

function isIOSNative(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  return /MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)
}

export function ConversionBanner({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("mtm_conv_banner_dismissed") === "1") {
      setDismissed(true)
    }
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch("/api/conversion/status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = (await res.json()) as Status
        if (j?.isFreeGranted) setStatus(j)
      } catch {
        /* silencioso */
      }
    })()
  }, [])

  if (!status?.isFreeGranted || dismissed) return null

  const deadlineStr = status.deadline
    ? new Date(status.deadline).toLocaleDateString("pt-PT", { day: "2-digit", month: "long" })
    : ""
  const days = status.daysLeft ?? 0

  const onUpgrade = () => {
    if (isIOSNative()) {
      alert("Continua Premium em Mais → Subscrição (App Store).")
      return
    }
    window.location.href = "/upgrade"
  }

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem("mtm_conv_banner_dismissed", "1") } catch {}
  }

  return (
    <div
      className={`relative flex items-center gap-3 border border-[#D2A63C]/40 bg-gradient-to-r from-[#1a1508] to-[#0d0b06] ${
        compact ? "rounded-xl px-3 py-2.5" : "rounded-2xl px-4 py-3"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}>
          ⏳ O teu acesso gratuito termina a <b className="text-[#D2A63C]">{deadlineStr}</b>
          {days > 0 ? ` · faltam ${days} dias` : ""}
        </p>
        <p className={`text-gray-300 ${compact ? "text-[10px]" : "text-xs"} mt-0.5`}>
          {status.offer?.title || "Continua com a tua subscrição"}
          {status.offer?.coupon ? ` (código ${status.offer.coupon})` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className={`shrink-0 rounded-full bg-[#D2A63C] font-bold text-black ${compact ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs"}`}
      >
        Continuar
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar"
        className="shrink-0 rounded-full px-1.5 text-gray-500 hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}
