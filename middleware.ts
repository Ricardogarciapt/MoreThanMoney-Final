import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isRegisteredMember } from "@/lib/member-access"
import { isMemberProtectedPath, registerRedirectUrl } from "@/lib/member-route-guard"
import { isExpiredTrial } from "@/lib/trial-access"
import { activationRedirectPath, requiresActivation } from "@/lib/member-activation"
import { needsAccessRevalidation } from "@/lib/access-migration-regras"
import {
  CAMINHO_ENTRADA_BACKOFFICE,
  caminhoInternoBackoffice,
  dispensaPapeis,
  ehAnfitriaoBackoffice,
  ehPedidoBackoffice,
} from "@/lib/backoffice-dominio"
// A leitura vem do ficheiro SÓ-LEITURA, nunca de `backoffice-sessao`: esse importa `next/headers`,
// que não existe no edge onde o middleware corre.
import { papeisActivosDe } from "@/lib/backoffice-papeis-leitura"
import { capacidadesDe, pode } from "@/lib/backoffice-papeis"
import { areaDoCaminho, normalizarAreas } from "@/lib/backoffice-acessos-site"

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

  /**
   * ── BACKOFFICE (backoffice.morethanmoney.pt) ────────────────────────────────
   *
   * Vem ANTES do bloco de saída antecipada abaixo porque a raiz do subdomínio (`/`) tem de ser
   * reescrita para `/backoffice`, e ali `pathname === "/"` sai sem passar por mais nada.
   *
   * REESCREVER e não redireccionar: a barra de endereço fica em `backoffice.morethanmoney.pt/x`.
   * Redireccionar para `/backoffice/x` no domínio normal deitava fora a razão de ter subdomínio.
   *
   * O portão é o mesmo do resto do código: `bo.entrar`, que só existe com papéis activos. Não há
   * `if (é admin)` aqui — o dono recebe as capacidades por `capacidadesDe`, pelo mesmo caminho.
   */
  if (ehPedidoBackoffice(request.headers.get("host"), pathname)) {
    const noSubdominio = ehAnfitriaoBackoffice(request.headers.get("host"))
    const interno = noSubdominio ? caminhoInternoBackoffice(pathname) ?? pathname : pathname
    // No subdomínio a entrada é a raiz. Mandar alguém para `/backoffice` aí punha
    // `backoffice.morethanmoney.pt/backoffice` na barra de endereço — funciona, mas parece avaria.
    const entrada = noSubdominio ? "/" : CAMINHO_ENTRADA_BACKOFFICE

    // A explicação de «não tens acesso» tem de ser visível a quem não tem acesso. Se ela própria
    // exigisse papéis, o encaminhamento andava à roda e a pessoa ficava sem saber porquê — foi o
    // silêncio de agosto, em que 43 pessoas ficaram de fora sem nunca lhes ser dito nada.
    if (!dispensaPapeis(interno)) {
      if (!hasSupabaseEnv) {
        // Sem configuração não se adivinha quem é. Fechar, e dizer que está fechado.
        return NextResponse.redirect(new URL(entrada, request.url))
      }

      const boUser = await getCachedUser()
      if (!boUser) {
        const destino = encodeURIComponent(pathname + request.nextUrl.search)
        return NextResponse.redirect(new URL(`/login?redirect=${destino}`, request.url))
      }

      /**
       * Os papéis lêem-se com a chave anon e a sessão da própria pessoa. A RLS da migração 127 diz
       * «cada um vê os seus», que é exactamente a pergunta feita aqui — e no edge não há service
       * role. Uma falha de leitura devolve lista vazia (ver `papeisActivosDe`), por isso o pior caso
       * é fechar a porta, nunca abri-la.
       */
      const supabaseBo = getSupabase()
      const [atribuicoes, perfilBoRes] = await Promise.all([
        papeisActivosDe(supabaseBo as never, boUser.id),
        supabaseBo.from("profiles").select("user_type, is_active").eq("id", boUser.id).maybeSingle(),
      ])

      const perfilBo = perfilBoRes.data as { user_type?: string; is_active?: boolean } | null
      const capacidades = capacidadesDe(
        atribuicoes.map((a) => a.papel),
        { admin: perfilBo?.user_type === "admin" && perfilBo?.is_active === true },
      )

      if (!pode(capacidades, "bo.entrar")) {
        return NextResponse.redirect(new URL(entrada, request.url))
      }
    }

    if (noSubdominio && interno !== pathname) {
      const url = request.nextUrl.clone()
      url.pathname = interno
      const reescrito = NextResponse.rewrite(url)
      // Os cookies que o `setAll` do Supabase escreveu vivem na resposta criada no topo. Perdê-los
      // aqui equivalia a nunca refrescar a sessão no subdomínio: a pessoa entrava e era expulsa
      // uns minutos depois, sem erro nenhum a dizer porquê.
      for (const cookie of response.cookies.getAll()) reescrito.cookies.set(cookie)
      reescrito.headers.set("X-Frame-Options", "DENY")
      reescrito.headers.set("X-Content-Type-Options", "nosniff")
      reescrito.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
      reescrito.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
      return reescrito
    }
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

  // ── /mtmcopy: descontinuado (fase 1). As páginas reencaminham para /mtmauto no next.config.mjs
  // (308), antes de chegarem aqui; as rotas /api/mtmcopy/* continuam vivas para as apps instaladas.

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

  /**
   * ── Restrição de áreas DO SITE, por pessoa ──────────────────────────────────
   *
   * Quem o Ricardo criou só para o backoffice (um afiliado que não é cliente), ou a quem limitou o
   * acesso, não tem que entrar nas áreas de produto. A lista só APERTA: nunca dá acesso a quem o
   * `is_active` ou o portão de activação já bloqueiam — isso continua a ser decidido nos blocos
   * acima, como sempre foi. Ver `lib/backoffice-acessos-site.ts`.
   *
   * A consulta só acontece em caminhos que esta lista governa (`areaDoCaminho`), para não pôr uma
   * ida à base em cada navegação do site inteiro.
   */
  const areaPedida = areaDoCaminho(pathname)
  if (areaPedida && hasSupabaseEnv && !isApiRoute) {
    const areaUser = await getCachedUser()
    if (areaUser) {
      const { data: restricaoRow } = await getSupabase()
        .from("backoffice_acessos_site")
        .select("areas")
        .eq("user_id", areaUser.id)
        .maybeSingle()

      const restricao = normalizarAreas((restricaoRow as { areas?: unknown } | null)?.areas)
      // Lista vazia = sem restrição. Só quem tem uma lista escrita é que é filtrado, e nunca se
      // fecha uma porta por a leitura ter falhado: sem linha, o acesso é o normal de membro.
      if (restricao.length > 0 && !restricao.includes(areaPedida)) {
        const url = request.nextUrl.clone()
        url.pathname = "/acesso-restrito"
        url.search = `?area=${encodeURIComponent(areaPedida)}`
        return NextResponse.rewrite(url)
      }
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
