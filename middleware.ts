import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isRegisteredMember } from "@/lib/member-access"
import { isMemberProtectedPath, registerRedirectUrl } from "@/lib/member-route-guard"
import { isExpiredTrial } from "@/lib/trial-access"
import { activationRedirectPath, requiresActivation } from "@/lib/member-activation"
import { needsAccessRevalidation } from "@/lib/access-migration"

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

  const pathname = request.nextUrl.pathname

  // Excluir ficheiros estáticos (imagens, etc.) — sair cedo, sem tocar em auth
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot']
  if (staticExtensions.some(ext => pathname.toLowerCase().endsWith(ext))) {
    return response
  }

  // /.well-known/* (ex.: assetlinks.json p/ Android App Links, apple-app-site-association)
  // tem de ser servido cru, sem auth/headers/redirects, senão a verificação falha.
  if (pathname.startsWith('/.well-known/')) {
    return response
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
  const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)
  const isApiRoute = pathname.startsWith("/api/")

  // Cliente Supabase ÚNICO + user em cache: no máximo UMA chamada de rede (getUser)
  // por request, reutilizada por todos os blocos de proteção abaixo. Evita os 2-3
  // round-trips de auth que tornavam cada navegação lenta (sobretudo no Safari).
  let supabaseClient: ReturnType<typeof createServerClient> | null = null
  const getSupabase = () => {
    if (!supabaseClient) {
      supabaseClient = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    }
    return supabaseClient
  }

  let userFetched = false
  let cachedUser: Awaited<ReturnType<ReturnType<typeof createServerClient>["auth"]["getUser"]>>["data"]["user"] = null
  const getCachedUser = async () => {
    if (!hasSupabaseEnv) return null
    if (!userFetched) {
      userFetched = true
      const { data } = await getSupabase().auth.getUser()
      cachedUser = data.user
    }
    return cachedUser
  }

  // Refrescar a sessão (cookie) apenas em PÁGINAS. Em /api/* cada rota autentica-se
  // sozinha, por isso evitamos o round-trip de auth em cada chamada de API (chat,
  // preços, polling…). Estáticos já saíram acima.
  if (hasSupabaseEnv && !isApiRoute) {
    await getCachedUser()
  }

  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/access-migration") ||
    pathname === "/"
  ) {
    return response
  }

  /**
   * QUEM PODE SER EMOLDURADO.
   *
   * `X-Frame-Options: DENY` é o normal e protege contra clickjacking. Mas há rotas que existem
   * PARA serem emolduradas, e nelas o cabeçalho não é segurança — é uma página em branco:
   *
   * · `/app-mobile`, `/scanner`, `/apresentacoes` — o WKWebView do iOS e o widget do TradingView
   *   precisam de contexto de embedding livre.
   * · `/mtmsocial` — corre DENTRO da app-mobile e das nativas, na lista de Apps. Com o DENY, a
   *   página carregava inteira (200, 53 KB) e o browser recusava desenhá-la: um rectângulo
   *   branco, sem erro nenhum no ecrã a dizer porquê.
   *
   * Nestas usa-se `frame-ancestors 'self'` em vez de nada: continua a impedir que um site de
   * terceiros nos emoldure, mas deixa a nossa própria app fazê-lo. É o que o `DENY` deveria ter
   * sido desde o início — ele não distingue «ninguém» de «só nós».
   */
  const emolduravel =
    pathname.startsWith("/app-mobile") ||
    pathname.startsWith("/scanner") ||
    pathname.startsWith("/apresentacoes") ||
    pathname.startsWith("/mtmsocial") ||
    // A biblioteca Advanced Charts do TradingView desenha-se num iframe do PRÓPRIO site
    // (public/charting_library/*.html): com DENY o gráfico ficava em branco.
    pathname.startsWith("/charting_library") ||
    pathname.startsWith("/datafeeds")

  if (emolduravel) {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'")
  } else {
    response.headers.set("X-Frame-Options", "DENY")
  }
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // Studio de streaming interno precisa de câmara/mic/ecrã → permitir para o próprio site (self);
  // continua bloqueado a iframes de terceiros. (Antes: camera=(),microphone=() bloqueava tudo.)
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
  )

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
    const mtmcopyUser = await getCachedUser()
    if (!mtmcopyUser) {
      const redirect = encodeURIComponent(pathname + request.nextUrl.search)
      return NextResponse.redirect(new URL(`/login?redirect=${redirect}`, request.url))
    }

    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
  }

  // ── Membros sem perfil (OAuth backdoor) → /register ───────────────────────
  if (isMemberProtectedPath(pathname) && hasSupabaseEnv) {
    const memberUser = await getCachedUser()

    if (memberUser) {
      const { data: memberProfile } = await getSupabase()
        .from("profiles")
        .select(
          "id, email, user_type, member_category, is_active, subscription_plan, subscription_platform, subscription_status, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired, profile_data"
        )
        .eq("id", memberUser.id)
        .maybeSingle()

      if (memberProfile && needsAccessRevalidation(memberProfile)) {
        return NextResponse.redirect(new URL("/access-migration", request.url))
      }

      if (!isRegisteredMember(memberProfile)) {
        // Trial terminado → funil agressivo: na web vai direto ao /upgrade (Stripe).
        // No iOS nativo NÃO se envia p/ Stripe (compliance) — segue o fluxo normal.
        const ua = request.headers.get("user-agent") || ""
        const iosNative = /MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)
        // Ativação pendente → escolha de pack (não /register: a conta existe, falta pagar).
        // No iOS nativo não se envia para Stripe (compliance) — segue o fluxo normal.
        if (requiresActivation(memberProfile) && !iosNative) {
          return NextResponse.redirect(new URL(activationRedirectPath(), request.url))
        }
        if (isExpiredTrial(memberProfile) && !iosNative) {
          return NextResponse.redirect(new URL("/upgrade?from=trial", request.url))
        }
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
    const aiosUser = await getCachedUser()
    if (!aiosUser) {
      return NextResponse.redirect(new URL('/login?redirect=/aios', request.url))
    }

    const { data: aiosProfile } = await getSupabase()
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
