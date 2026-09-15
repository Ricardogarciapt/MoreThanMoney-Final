"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { determinePostLoginRedirect, safeInternalRedirectPath } from "@/lib/role-redirect"
import { isRegisteredMember } from "@/lib/member-access"
import { loadMemberProfile } from "@/lib/member-profile"
import { isOAuthFlow, OAUTH_FLOW_REGISTER, REGISTER_NOT_FOUND_MESSAGE } from "@/lib/oauth-flow"
import { Loader2 } from "lucide-react"

/**
 * Fluxo implícito (hash #access_token) e visitas sem ?code= no servidor.
 * O fragmento nunca é enviado ao route handler.
 */
export default function AuthFinishPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const redirectParam = safeInternalRedirectPath(searchParams.get("redirect"))
      const flowParam = searchParams.get("flow")
      const flow = isOAuthFlow(flowParam) ? flowParam : "login"

      const hash = window.location.hash
      if (hash && hash.includes("access_token")) {
        await new Promise((r) => setTimeout(r, 100))
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (cancelled) return

      if (sessionError || !session) {
        window.location.replace("/login")
        return
      }

      const { setCachedSession } = await import("@/lib/auth-cache")
      setCachedSession(session)

      const profile = await loadMemberProfile(supabase, session.user.id)

      if (!isRegisteredMember(profile)) {
        // Oferta de gratidão (2026-09): WebTrader / credenciais para quem tem a conta oferecida.
        if (profile) {
          const { destinoPelaOferta } = await import("@/lib/mtmfunded/oferta-acesso-cliente")
          const destino = await destinoPelaOferta(session.access_token, redirectParam)
          if (destino) {
            window.location.replace(`${window.location.origin}${destino}`)
            return
          }
        }
        await supabase.auth.signOut()
        const { clearCachedSession } = await import("@/lib/auth-cache")
        clearCachedSession()
        const regPath = flow === OAUTH_FLOW_REGISTER ? "/register" : "/register"
        const q = new URLSearchParams({ message: REGISTER_NOT_FOUND_MESSAGE })
        window.location.replace(`${regPath}?${q}`)
        return
      }

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
