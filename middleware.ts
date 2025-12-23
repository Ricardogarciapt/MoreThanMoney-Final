import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

// Cache para rate limiting
const rateLimit = new Map<string, { count: number; timestamp: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minuto
const MAX_REQUESTS = 100 // máximo de requisições por minuto

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const userRequests = rateLimit.get(ip)

  if (!userRequests) {
    rateLimit.set(ip, { count: 1, timestamp: now })
    return false
  }

  if (now - userRequests.timestamp > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { count: 1, timestamp: now })
    return false
  }

  if (userRequests.count >= MAX_REQUESTS) {
    return true
  }

  userRequests.count++
  return false
}

export async function middleware(request: NextRequest) {
  // Criar cliente Supabase com cookies apropriados para middleware
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Atualizar sessão do usuário
  await supabase.auth.getUser()

  // Não aplicar middleware em rotas de autenticação e callbacks
  const pathname = request.nextUrl.pathname
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/"
  ) {
    return response
  }

  // Adicionar headers de segurança básicos
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // Rate limiting para APIs (exceto auth)
  if (request.nextUrl.pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    const ip = (request as any).ip || request.headers.get("x-forwarded-for") || "unknown"

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
  }

  // Headers específicos para admin (sem cache)
  if (request.nextUrl.pathname.startsWith("/admin")) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
