"use client"

/**
 * Liga o pixel Opinly à sessão autenticada: assim que sabemos quem é o
 * visitante, identify() une o anonId ao email/userId — page views e conversões
 * anteriores do mesmo browser ficam atribuídas à pessoa certa.
 * O pixel carrega async (afterInteractive), por isso re-tenta até existir.
 */

import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
// só pelos tipos globais de window.opinly
import type {} from "@opinly/shared/pixel"

export default function OpinlyIdentify() {
  const { user } = useAuth()

  // Espelha o anonId do pixel num cookie: os endpoints server-side (checkout,
  // formulários) leem-no e unem os eventos de servidor ao visitante do browser.
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const mirror = () => {
      if (cancelled) return
      const anonId = window.opinly?.anonId
      if (anonId) {
        document.cookie = `opinly_anon_id=${encodeURIComponent(anonId)}; path=/; max-age=31536000; SameSite=Lax`
        return
      }
      if (attempts++ < 20) setTimeout(mirror, 500)
    }
    mirror()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user?.email && !user?.id) return
    let cancelled = false
    let attempts = 0
    const tryIdentify = () => {
      if (cancelled) return
      const opinly = window.opinly
      if (opinly?.identify) {
        opinly.identify({ email: user.email || undefined, userId: user.id || undefined })
        return
      }
      if (attempts++ < 20) setTimeout(tryIdentify, 500)
    }
    tryIdentify()
    return () => {
      cancelled = true
    }
  }, [user?.email, user?.id])

  return null
}
