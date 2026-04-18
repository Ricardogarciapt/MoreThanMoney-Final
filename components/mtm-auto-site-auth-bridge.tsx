"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import type { User as MtmUser } from "@mtm-auto/lib/types"
import { useAppStore } from "@mtm-auto/lib/store"

function buildInitials(display: string, email: string) {
  const t = display.trim()
  if (t.length >= 2) {
    const parts = t.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    }
    return t.slice(0, 2).toUpperCase()
  }
  return (email.split("@")[0] || "U").slice(0, 2).toUpperCase()
}

/** Mantém o estado local da app MTM Auto alinhado com a sessão Supabase do site. */
export function MtmAutoSiteAuthBridge() {
  const { user: siteUser, isLoading } = useAuth()
  const syncFromSiteUser = useAppStore((s) => s.syncFromSiteUser)

  useEffect(() => {
    if (isLoading || !siteUser?.id) return

    const name =
      siteUser.full_name?.trim() ||
      siteUser.username?.trim() ||
      siteUser.email?.split("@")[0] ||
      "Utilizador"

    const mtm: MtmUser = {
      id: siteUser.id,
      name,
      email: siteUser.email || "",
      initials: buildInitials(name, siteUser.email || ""),
      role: siteUser.mtm_auto_admin ? "admin" : "client",
      createdAt: siteUser.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    }

    syncFromSiteUser(mtm)
  }, [siteUser, isLoading, syncFromSiteUser])

  return null
}
