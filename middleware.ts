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
  devolverAoSitePrincipal,
  urlNoSitePrincipal,
} from "@/lib/backoffice-dominio"
// A leitura vem do ficheiro SÓ-LEITURA, nunca de `backoffice-sessao`: esse importa `next/headers`,
// que não existe no edge onde o middleware corre.
import { papeisActivosDe } from "@/lib/backoffice-papeis-leitura"
import { capacidadesDe, pode } from "@/lib/backoffice-papeis"
import { areaDoCaminho, normalizarAreas } from "@/lib/backoffice-acessos-site"
// O tecto vive em `lib/com-tecto.ts` — é puro, corre no edge, e o porquê está lá escrito.
import { comTecto, TECTO_MIDDLEWARE_MS } from "@/lib/com-tecto"

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

/**
 * NENHUMA ESPERA PELO SUPABASE FICA SEM TECTO.
 *
 * 25/09: o site devolveu `MIDDLEWARE_INVOCATION_TIMEOUT` (504) em páginas normais. Medido no
 * momento, contra o projecto: `/auth/v1/user` respondeu em 33s numa chamada de cinco (as outras em
 * 0,14s) e o PostgREST em 126s — com a base de dados a ter 14 ligações e 2 consultas activas. Ou
 * seja, não era carga de pedidos: era a instância sem CPU para responder. O middleware esperava por
 * essas respostas SEM limite, e o tecto da Vercel (25s) chegava primeiro — uma base de dados lenta
 * passava a ser um site em baixo.
 *
 * Este tecto não conserta a base de dados. Serve para o site DEGRADAR em vez de cair.
 */
/**
 * Este pedido TRAZ cookie de sessão do Supabase?
 *
 * Não prova que a sessão é válida — prova que quem pede não é um visitante anónimo. É essa
 * distinção que permite, quando o auth não responde a tempo, deixar passar quem já tinha sessão em
 * vez de o atirar para o /login. Quem não traz cookie continua a ser tratado como quem não tem
 * sessão, que é a decisão certa e não custa nada.
 */
function trazCookieDeSessao(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
}

/**
 * Restrições de área em memória, por pessoa.
 *
 * A tabela `backoffice_acessos_site` tem hoje ZERO linhas: ninguém está restringido. Mesmo assim,
 * cada abertura de `/member-area`, `/app-mobile`, `/alertas-mtm`, `/mtmauto`, `/scanner`… pagava uma
 * ida completa à base de dados para o descobrir, dentro do middleware e no caminho crítico. Guardar
 * a resposta um minuto tira esse custo de cima da navegação sem tirar o controlo ao Ricardo: uma
 * restrição que ele escreva no admin passa a valer no minuto seguinte, não instantaneamente.
 */
const cacheAreas = new Map<string, { areas: string[]; validoAte: number }>()
const CACHE_AREAS_MS = 60 * 1000

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

  /**
   * O MANIFESTO E OS SERVICE WORKERS TAMBÉM NÃO DEPENDEM DE QUEM ESTÁ LIGADO.
   *
   * 25/09, nos registos da Vercel: `/manifest.json` e `/firebase-messaging-sw.js` a devolverem 504
   * porque esperavam pela autenticação. Nenhum dos dois muda conforme a pessoa — e o service worker
   * é justamente o que ainda funciona quando o resto está mal. Deixá-lo preso ao auth era garantir
   * que, num mau momento do Supabase, até as notificações deixavam de poder registar-se.
   */
  if (
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.endsWith("-sw.js")
  ) {
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
  // «Não sei quem é» NÃO é o mesmo que «não tem sessão». Esta bandeira guarda a diferença, e é o
  // bloco mais abaixo que decide o que fazer com ela — com o cookie na mão.
  let autenticacaoIndecisa = false
  let cachedUser: Awaited<ReturnType<ReturnType<typeof createServerClient>["auth"]["getUser"]>>["data"]["user"] = null
  const getCachedUser = async () => {
    if (!hasSupabaseEnv) return null
    if (!userFetched) {
      userFetched = true
      const pedidoAuth = getSupabase().auth.getUser() as Promise<{
        data: { user: typeof cachedUser }
      }>
      const resposta = await comTecto<{ user: typeof cachedUser } | null>(
        pedidoAuth.then((r) => ({ user: r.data.user })).catch(() => null),
        null,
        TECTO_MIDDLEWARE_MS,
      )
      if (resposta === null) {
        autenticacaoIndecisa = true
        cachedUser = null
      } else {
        cachedUser = resposta.user
      }
    }
    return cachedUser
  }

  /**
   * A AUTENTICAÇÃO É PEDIDA POR QUEM DECIDE COM ELA, E MAIS NINGUÉM.
   *
   * Até 25/09 havia aqui um `await getCachedUser()` incondicional, para refrescar o cookie de
   * sessão em todas as páginas. O custo disso só se viu quando o Supabase se engasgou: os registos
   * da Vercel mostram 504 em `/login`, `/new-landing`, `/FreeSession` e `/manifest.json` — páginas
   * que não perguntam a ninguém quem é, mas que esperavam à mesma pela resposta do auth. Uma
   * página pública ficava refém de um serviço de que não precisa.
   *
   * `getCachedUser` já é preguiçoso e memorizado: os blocos abaixo que precisam de saber quem é
   * chamam-no, e continua a haver no máximo UMA chamada de rede por pedido. O que muda é que quem
   * não precisa deixa de pagar — e deixa de cair quando o auth cai.
   *
   * O que se perde: o refrescamento do cookie em páginas sem guardas. É aceitável — o cliente
   * Supabase no browser refresca a sessão sozinho, e as páginas com guardas continuam a refrescá-la
   * como sempre.
   */

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
  /**
   * O SUBDOMÍNIO SÓ SERVE O QUE É DELE.
   *
   * 25/09: os atalhos do site (`/admin`, `/mtm`, e o que mais vem de componentes partilhados)
   * ficavam em `backoffice.morethanmoney.pt/admin`, porque o subdomínio reclamava qualquer
   * caminho. Por dentro isso virava `/backoffice/admin`, que não existe — a pessoa clicava num
   * link conhecido e caía num 404 no sítio errado.
   *
   * Agora o que não é do backoffice volta ao site principal, no MESMO caminho e com a mesma
   * query. É um redireccionamento e não uma reescrita de propósito: a barra de endereço tem de
   * passar a dizer `www`, senão a pessoa fica a navegar o site inteiro debaixo de um subdomínio
   * que não é o dele — e o próximo link relativo repetia o problema.
   */
  if (devolverAoSitePrincipal(request.headers.get("host"), pathname)) {
    return NextResponse.redirect(urlNoSitePrincipal(pathname, request.nextUrl.search), 308)
  }

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
      // Tecto: sem resposta, entra-se sem papéis nenhuns — e `bo.entrar` fecha a porta logo abaixo.
      // Fechar por lentidão é chato; deixar o pedido pendurado até ao 504 da Vercel é pior, e era o
      // que fazia a raiz de backoffice.morethanmoney.pt cair (registos da Vercel, 25/09).
      const [atribuicoes, perfilBo] = await Promise.all([
        comTecto<Array<{ papel: unknown }>>(
          papeisActivosDe(supabaseBo as never, boUser.id).catch(() => []),
          [],
          TECTO_MIDDLEWARE_MS,
        ),
        comTecto<{ user_type?: string; is_active?: boolean } | null>(
          (supabaseBo
            .from("profiles")
            .select("user_type, is_active")
            .eq("id", boUser.id)
            .maybeSingle() as unknown as Promise<{
            data: { user_type?: string; is_active?: boolean } | null
          }>)
            .then((r) => r.data)
            .catch(() => null),
          null,
          TECTO_MIDDLEWARE_MS,
        ),
      ])
      const capacidades = capacidadesDe(
        atribuicoes.map((a) => a.papel as never),
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

    /**
     * O AUTH NÃO RESPONDEU, MAS A PESSOA TRAZ SESSÃO.
     *
     * Sem resposta do auth há três saídas: cair em 504 (era o que acontecia), atirar para o /login
     * quem estava validamente ligado, ou servir a página. Serve-se a página — os dados dela vêm de
     * rotas `/api/*` que se autenticam sozinhas, por isso quem não tem direito continua a não ver
     * nada. O que se evita é castigar a pessoa por uma lentidão que não é dela. Quem NÃO traz
     * cookie não entra por aqui e segue as guardas normais, como visitante.
     */
    if (autenticacaoIndecisa && trazCookieDeSessao(request)) {
      response.headers.set("X-MTM-Auth", "sem-resposta")
      return response
    }

    if (memberUser) {
      /**
       * A LEITURA DO PERFIL TAMBÉM TEM TECTO — e falhar não pode custar o acesso.
       *
       * `maybeSingle()` devolve `data: null` tanto para «não existe perfil» como para uma leitura
       * que correu mal. As duas coisas caíam no mesmo sítio, e mais abaixo `isRegisteredMember`
       * trata `null` como «não é membro»: bastava o PostgREST engasgar-se para um membro pago ser
       * atirado para o /register. Por isso a falha distingue-se do vazio, e quando a base não
       * responde serve-se a página em vez de decidir com informação que não temos.
       */
      const pedidoPerfil = getSupabase()
        .from("profiles")
        .select(
          "id, email, user_type, member_category, is_active, subscription_plan, subscription_platform, subscription_status, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired, profile_data"
        )
        .eq("id", memberUser.id)
        .maybeSingle() as unknown as Promise<{ data: unknown; error: unknown }>

      const LEITURA_FALHOU = Symbol("leitura-falhou")
      const lido = await comTecto<unknown>(
        pedidoPerfil
          .then((r) => (r.error ? LEITURA_FALHOU : r.data))
          .catch(() => LEITURA_FALHOU),
        LEITURA_FALHOU,
        TECTO_MIDDLEWARE_MS,
      )

      if (lido === LEITURA_FALHOU) {
        response.headers.set("X-MTM-Perfil", "sem-resposta")
        return response
      }

      const memberProfile = lido as Parameters<typeof isRegisteredMember>[0]

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
      const agora = Date.now()
      const guardado = cacheAreas.get(areaUser.id)
      let restricao: string[]

      if (guardado && guardado.validoAte > agora) {
        restricao = guardado.areas
      } else {
        // Tecto curto e falha para o lado aberto: sem resposta, o acesso é o normal de membro — que
        // é exactamente o que uma lista vazia já significava. Ninguém fica fechado por lentidão.
        const pedidoAreas = getSupabase()
          .from("backoffice_acessos_site")
          .select("areas")
          .eq("user_id", areaUser.id)
          .maybeSingle() as unknown as Promise<{ data: { areas?: unknown } | null }>
        const restricaoRow = await comTecto<{ areas?: unknown } | null>(
          pedidoAreas.then((r) => r.data ?? {}).catch(() => ({})),
          null,
          TECTO_MIDDLEWARE_MS,
        )
        restricao = normalizarAreas(restricaoRow?.areas)
        // Só se guarda o que foi realmente lido. Guardar um tecto esgotado ensinava a cache a
        // mentir durante um minuto.
        if (restricaoRow !== null) {
          cacheAreas.set(areaUser.id, { areas: restricao, validoAte: agora + CACHE_AREAS_MS })
        }
      }

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

    // Tecto: sem resposta não é admin, e /aios fecha. É a decisão certa para uma porta de admin —
    // e devolve-a num instante, em vez de deixar o pedido a contar até ao 504.
    const aiosProfile = await comTecto<{ user_type?: string } | null>(
      (getSupabase()
        .from('profiles')
        .select('user_type')
        .eq('id', aiosUser.id)
        .single() as unknown as Promise<{ data: { user_type?: string } | null }>)
        .then((r) => r.data)
        .catch(() => null),
      null,
      TECTO_MIDDLEWARE_MS,
    )

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
