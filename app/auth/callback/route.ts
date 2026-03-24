import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { safeInternalRedirectPath } from "@/lib/role-redirect"

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()

function loginRedirect(origin: string, params: Record<string, string>) {
  const u = new URL("/login", origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v) u.searchParams.set(k, v)
  })
  return NextResponse.redirect(u)
}

/**
 * Troca o código OAuth no servidor (lê o code_verifier dos cookies do browser).
 * Evita falhas PKCE do exchangeCodeForSession só no cliente.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  const code = url.searchParams.get("code")
  const oauthError = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")
  const redirectParam = safeInternalRedirectPath(url.searchParams.get("redirect"))
  const origin = url.origin

  if (oauthError) {
    return loginRedirect(origin, {
      error: "oauth",
      message: errorDescription || oauthError,
    })
  }

  if (!code) {
    // Fragmento (#access_token) não chega ao servidor — fluxo implícito trata-se em /auth/finish
    return NextResponse.redirect(new URL("/auth/finish", origin))
  }

  const postOauth = new URL("/auth/post-oauth", origin)
  if (redirectParam) {
    postOauth.searchParams.set("redirect", redirectParam)
  }

  let response = NextResponse.redirect(postOauth)

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error("[auth/callback] exchangeCodeForSession:", error.message)
    return loginRedirect(origin, {
      error: "auth_failed",
      message: error.message || "Falha na autenticação",
    })
  }

  return response
}
