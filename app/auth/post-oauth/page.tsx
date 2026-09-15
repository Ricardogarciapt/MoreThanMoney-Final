"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { determinePostLoginRedirect, safeInternalRedirectPath } from "@/lib/role-redirect"
import { isRegisteredMember } from "@/lib/member-access"
import { ensureMemberProfile, loadMemberProfile } from "@/lib/member-profile"
import {
  isOAuthFlow,
  OAUTH_FLOW_LOGIN,
  OAUTH_FLOW_REGISTER,
  OAUTH_PENDING_REG_KEY,
  REGISTER_NOT_FOUND_MESSAGE,
  type OAuthPendingRegistration,
} from "@/lib/oauth-flow"
import { Loader2 } from "lucide-react"

async function redirectToRegister(message: string) {
  await supabase.auth.signOut()
  const { clearCachedSession } = await import("@/lib/auth-cache")
  clearCachedSession()
  const q = new URLSearchParams({ message })
  window.location.replace(`/register?${q}`)
}

async function startOAuthRegisterCheckout(session: {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }
}) {
  const raw = sessionStorage.getItem(OAUTH_PENDING_REG_KEY)
  if (!raw) {
    await redirectToRegister(
      "Escolhe o teu plano e regista-te novamente para concluir o pagamento."
    )
    return
  }

  let pending: OAuthPendingRegistration
  try {
    pending = JSON.parse(raw) as OAuthPendingRegistration
  } catch {
    sessionStorage.removeItem(OAUTH_PENDING_REG_KEY)
    await redirectToRegister("Dados de registo inválidos. Tenta novamente.")
    return
  }

  const regToken = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const planId = `${pending.plan}_${pending.billing}`

  const checkoutRes = await fetch("/api/stripe/oauth-register-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId,
      regToken,
      sponsorUsername: pending.sponsor_username || "",
      couponCode: pending.coupon_code || "",
    }),
  })

  if (!checkoutRes.ok) {
    const err = await checkoutRes.json().catch(() => ({}))
    if (checkoutRes.status === 409) {
      const profile = await loadMemberProfile(supabase, session.user.id)
      if (isRegisteredMember(profile)) {
        const redirectTo = determinePostLoginRedirect(profile, "/app-mobile")
        const full =
          redirectTo.startsWith("http") ? redirectTo : `${window.location.origin}${redirectTo}`
        window.location.replace(full)
        return
      }
    }
    sessionStorage.removeItem(OAUTH_PENDING_REG_KEY)
    await redirectToRegister(err.error || "Erro ao iniciar pagamento. Tenta novamente.")
    return
  }

  const { url } = await checkoutRes.json()
  if (!url) {
    await redirectToRegister("Não foi possível redirecionar para o Stripe.")
    return
  }

  sessionStorage.removeItem(OAUTH_PENDING_REG_KEY)
  window.location.replace(url)
}

/**
 * Executado após o route handler definir a sessão em cookies.
 * Login OAuth: só entra se já existir perfil. Register OAuth: redireciona para Stripe.
 */
export default function PostOAuthPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const redirectParam = safeInternalRedirectPath(searchParams.get("redirect"))
      const flowParam = searchParams.get("flow")
      const flow = isOAuthFlow(flowParam) ? flowParam : OAUTH_FLOW_LOGIN

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

      const existingProfile = await loadMemberProfile(supabase, session.user.id)
      const isRegistered = isRegisteredMember(existingProfile)

      if (flow === OAUTH_FLOW_LOGIN) {
        if (!isRegistered && existingProfile) {
          // Oferta de gratidão (2026-09): WebTrader / credenciais para quem tem a conta oferecida.
          const { destinoPelaOferta } = await import("@/lib/mtmfunded/oferta-acesso-cliente")
          const destino = await destinoPelaOferta(session.access_token, redirectParam)
          if (destino) {
            window.location.replace(`${window.location.origin}${destino}`)
            return
          }
        }
        if (!isRegistered) {
          await redirectToRegister(REGISTER_NOT_FOUND_MESSAGE)
          return
        }

        const redirectTo = determinePostLoginRedirect(existingProfile, redirectParam)
        const full =
          redirectTo.startsWith("http") ? redirectTo : `${window.location.origin}${redirectTo}`
        window.location.replace(full)
        return
      }

      if (flow === OAUTH_FLOW_REGISTER) {
        if (isRegistered) {
          const redirectTo = determinePostLoginRedirect(existingProfile, redirectParam || "/app-mobile")
          const full =
            redirectTo.startsWith("http") ? redirectTo : `${window.location.origin}${redirectTo}`
          window.location.replace(full)
          return
        }

        await startOAuthRegisterCheckout(session)
        return
      }

      // Fallback legado (sem flow explícito): não criar perfil automaticamente
      if (!isRegistered) {
        await redirectToRegister(REGISTER_NOT_FOUND_MESSAGE)
        return
      }

      const profile = await ensureMemberProfile(supabase, session, { createIfMissing: false })
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
