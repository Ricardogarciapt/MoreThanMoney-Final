"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { determinePostLoginRedirect, safeInternalRedirectPath } from "@/lib/role-redirect"
import { ensureMemberProfile } from "@/lib/member-profile"
import { Loader2 } from "lucide-react"

/**
 * Executado após o route handler definir a sessão em cookies.
 * Garante perfil (inclui fetch a /api/admin/settings no browser) e redireciona.
 */
export default function PostOAuthPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const redirectParam = safeInternalRedirectPath(searchParams.get("redirect"))

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (cancelled) return

      if (error || !session) {
        const q = new URLSearchParams({ error: "no_session" })
        window.location.replace(`/login?${q}`)
        return
      }

      const { setCachedSession } = await import("@/lib/auth-cache")
      setCachedSession(session)

      const profile = await ensureMemberProfile(supabase, session)
      const redirectTo = determinePostLoginRedirect(profile, redirectParam)
      const full =
        redirectTo.startsWith("http") ? redirectTo : `${window.location.origin}${redirectTo}`
      window.location.replace(full)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-[#D2A63C] animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">A concluir o login…</p>
      </div>
    </div>
  )
}
