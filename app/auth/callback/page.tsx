"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { determinePostLoginRedirect, safeInternalRedirectPath } from "@/lib/role-redirect"
import { ensureMemberProfile } from "@/lib/member-profile"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

export default function AuthCallbackPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("A processar autenticação...")

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus("loading")
        setMessage("A processar autenticação...")

        const redirectParam = safeInternalRedirectPath(searchParams.get("redirect"))

        const errorParam = searchParams.get("error")
        const errorDescription = searchParams.get("error_description")

        if (errorParam) {
          console.error("❌ [CALLBACK] Erro OAuth:", errorParam, errorDescription)
          throw new Error(errorDescription || errorParam || "Erro na autenticação OAuth")
        }

        const code = searchParams.get("code")

        if (code) {
          const processedCode = sessionStorage.getItem(`processed_code_${code}`)
          if (processedCode) {
            console.log("⚠️ [CALLBACK] Código já processado")
            return
          }
          sessionStorage.setItem(`processed_code_${code}`, "true")

          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error("❌ [CALLBACK] exchangeCodeForSession:", error)
            const msg = (error.message || "").toLowerCase()
            if (
              msg.includes("pkce") ||
              msg.includes("code_verifier") ||
              msg.includes("code verified")
            ) {
              sessionStorage.removeItem(`processed_code_${code}`)
              localStorage.removeItem("mtm_auth_session")
              try {
                await supabase.auth.signOut()
              } catch {
                /* ignore */
              }
              setStatus("error")
              setMessage("Erro de autenticação. Por favor, tenta novamente.")
              setTimeout(() => {
                window.location.href =
                  "/login?error=pkce_error&message=" +
                  encodeURIComponent("Erro de sessão. Tenta iniciar sessão novamente.")
              }, 2000)
              return
            }
            throw new Error(error.message || "Erro ao processar código de autenticação")
          }

          if (!data?.session) {
            throw new Error("Sessão não foi criada após trocar código")
          }

          const { setCachedSession } = await import("@/lib/auth-cache")
          setCachedSession(data.session)

          const profile = await ensureMemberProfile(supabase, data.session)
          const redirectTo = determinePostLoginRedirect(profile, redirectParam)
          const fullRedirectUrl = redirectTo.startsWith("http")
            ? redirectTo
            : `${window.location.origin}${redirectTo}`

          window.location.replace(fullRedirectUrl)
          return
        }

        const hash = window.location.hash
        if (hash && hash.includes("access_token")) {
          await new Promise((r) => setTimeout(r, 100))
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession()

          if (sessionError) throw sessionError
          if (!session) throw new Error("Sessão não encontrada (implicit flow)")

          const { setCachedSession } = await import("@/lib/auth-cache")
          setCachedSession(session)

          const profile = await ensureMemberProfile(supabase, session)
          const redirectTo = determinePostLoginRedirect(profile, redirectParam)
          const fullRedirectUrl = redirectTo.startsWith("http")
            ? redirectTo
            : `${window.location.origin}${redirectTo}`

          window.location.replace(fullRedirectUrl)
          return
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error("❌ [CALLBACK] getSession:", sessionError)
        }

        if (session) {
          const { setCachedSession } = await import("@/lib/auth-cache")
          setCachedSession(session)

          const profile = await ensureMemberProfile(supabase, session)
          const redirectTo = determinePostLoginRedirect(profile, redirectParam)
          const fullRedirectUrl = redirectTo.startsWith("http")
            ? redirectTo
            : `${window.location.origin}${redirectTo}`

          window.location.replace(fullRedirectUrl)
          return
        }

        throw new Error("Nenhuma sessão encontrada. Inicia sessão novamente.")
      } catch (error: unknown) {
        console.error("❌ [CALLBACK] Erro:", error)
        setStatus("error")
        setMessage(error instanceof Error ? error.message : "Erro ao processar autenticação")
        setTimeout(() => {
          window.location.href = "/login"
        }, 2500)
      }
    }

    handleCallback()
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center max-w-md mx-auto p-8">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-[#D2A63C] animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">A processar...</h2>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Sucesso!</h2>
            <p className="text-gray-400">{message}</p>
            <p className="text-sm text-gray-500 mt-4">A redirecionar...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Erro</h2>
            <p className="text-gray-400 mb-4">{message}</p>
            <p className="text-sm text-gray-500">A redirecionar para login...</p>
          </>
        )}
      </div>
    </div>
  )
}
