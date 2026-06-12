import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isRegisteredMember } from "@/lib/member-access"
import { isMemberProtectedPath, registerRedirectUrl } from "@/lib/member-route-guard"

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

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
  const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)

  if (hasSupabaseEnv) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    })

    // Atualizar sessão do usuário
    await supabase.auth.getUser()
  }

  // Não aplicar middleware em rotas de autenticação, callbacks e ficheiros estáticos
  const pathname = request.nextUrl.pathname
  
  // Excluir ficheiros estáticos (imagens, etc.)
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot']
  if (staticExtensions.some(ext => pathname.toLowerCase().endsWith(ext))) {
    return response
  }
  
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/"
  ) {
    return response
  }

  // Adicionar headers de segurança básicos
  // X-Frame-Options: DENY não é aplicado em /app-mobile nem em rotas do scanner —
  // o WKWebView (iOS) e o TradingView widget necessitam de contexto de embedding livre.
  const isNativeAppRoute = pathname.startsWith("/app-mobile") || pathname.startsWith("/scanner")
  if (!isNativeAppRoute) {
    response.headers.set("X-Frame-Options", "DENY")
  }
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // Rate limiting para APIs (exceto auth e crons Vercel)
  const isVercelCron = request.headers.get("x-vercel-cron") === "1"
  const isCronApiPath =
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/notifications/check-alerts" ||
    pathname === "/api/email-marketing/sequences/process"

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth") &&
    !(isVercelCron && isCronApiPath)
  ) {
    const ip = (request as any).ip || request.headers.get("x-forwarded-for") || "unknown"

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
  }

  const ua = request.headers.get("user-agent") || ""
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)

  if (isMobileUa) {
    const educatorMatch = pathname.match(/^\/live\/([^/]+)$/)
    if (educatorMatch?.[1]) {
      const url = request.nextUrl.clone()
      url.pathname = "/app-mobile"
      url.search = `tab=live&educator=${encodeURIComponent(educatorMatch[1])}`
      return NextResponse.redirect(url)
    }

    const streamMatch = pathname.match(/^\/live-sessions\/([^/]+)$/)
    if (streamMatch?.[1] && streamMatch[1] !== "studio") {
      const url = request.nextUrl.clone()
      url.pathname = "/app-mobile"
      url.search = `tab=live&stream=${encodeURIComponent(streamMatch[1])}`
      return NextResponse.redirect(url)
    }
  }

  // Headers específicos para admin e dashboard-gestao (sem cache)
  if (request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/dashboard-gestao")) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  // ── /mtmcopy = página de venda (sempre pública) ───────────────────────────
  if (pathname === "/mtmcopy" || pathname === "/mtmcopy/") {
    return response
  }

  const mtmcopyNeedsAuth =
    pathname.startsWith("/mtmcopy/metrics") || pathname.startsWith("/mtmcopy/app")

  if (mtmcopyNeedsAuth && hasSupabaseEnv) {
    const supabaseMtmcopy = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    })

    const { data: { user: mtmcopyUser } } = await supabaseMtmcopy.auth.getUser()
    if (!mtmcopyUser) {
      const redirect = encodeURIComponent(pathname + request.nextUrl.search)
      return NextResponse.redirect(new URL(`/login?redirect=${redirect}`, request.url))
    }

    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
  }

  // ── Membros sem perfil (OAuth backdoor) → /register ───────────────────────
  if (isMemberProtectedPath(pathname) && hasSupabaseEnv) {
    const supabaseMember = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    })

    const {
      data: { user: memberUser },
    } = await supabaseMember.auth.getUser()

    if (memberUser) {
      const { data: memberProfile } = await supabaseMember
        .from("profiles")
        .select(
          "id, user_type, member_category, is_active, subscription_plan, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired"
        )
        .eq("id", memberUser.id)
        .maybeSingle()

      if (!isRegisteredMember(memberProfile)) {
        return NextResponse.redirect(
          new URL(
            registerRedirectUrl(request.nextUrl.origin, {
              mobile: pathname.startsWith("/app-mobile"),
            }),
            request.url
          )
        )
      }
    } else if (pathname.startsWith("/member-area") || pathname.startsWith("/app-mobile")) {
      const loginPath = pathname.startsWith("/app-mobile") ? "/app-mobile/login" : "/login"
      const redirect = encodeURIComponent(pathname + request.nextUrl.search)
      return NextResponse.redirect(new URL(`${loginPath}?redirect=${redirect}`, request.url))
    }
  }

  // ── Protecção /aios — apenas admins ───────────────────────────────────────
  if (pathname.startsWith("/aios") && hasSupabaseEnv) {
    // Supabase já está inicializado acima neste middleware
    const supabase2 = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    })

    const { data: { user: aiosUser } } = await supabase2.auth.getUser()
    if (!aiosUser) {
      return NextResponse.redirect(new URL('/login?redirect=/aios', request.url))
    }

    const { data: aiosProfile } = await supabase2
      .from('profiles')
      .select('user_type')
      .eq('id', aiosUser.id)
      .single()

    if (aiosProfile?.user_type !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }

    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
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
     * - Static files are automatically excluded by Next.js
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
