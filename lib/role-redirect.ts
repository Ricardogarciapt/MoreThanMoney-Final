/**
 * Função para determinar o redirecionamento após login baseado em user_type e member_category
 */

/** Alinhado com public.profiles + checks de rota */
export interface UserProfile {
  id?: string
  email?: string
  full_name?: string
  username?: string
  avatar_url?: string
  phone?: string
  whatsapp?: string
  created_at?: string
  user_type?: string
  member_category?: string
  is_active?: boolean
  trial_expired?: boolean
}

/** Evita open redirect: só caminhos relativos internos. */
export function safeInternalRedirectPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null
  const p = path.trim()
  if (!p.startsWith("/") || p.startsWith("//")) return null
  return p
}

export function determinePostLoginRedirect(
  profile: UserProfile | null,
  requestedRedirect?: string | null
): string {
  const safeRequested = safeInternalRedirectPath(requestedRedirect)

  // Sem perfil ainda (OAuth lento, rede, ou perfil em criação): NÃO tratar como "pending".
  // Antes: !profile?.is_active era true com profile null → mensagem falsa de aprovação.
  if (!profile) {
    return safeRequested ?? "/member-area"
  }

  // Se tem redirect específico e é admin, respeitar
  if (safeRequested && profile.user_type === "admin") {
    return safeRequested
  }

  // ADMIN - Redirecionar para admin ou redirect solicitado
  if (profile.user_type === "admin") {
    return safeRequested || "/admin"
  }

  // VIP - Redirecionar para app-mobile (acesso total)
  if (profile?.member_category === 'vip') {
    return '/app-mobile'
  }

  // MEMBER IQ (member_category='iq')
  if (profile?.member_category === 'iq') {
    // Após login vai para app-mobile, mas pode navegar pelo site (exceto VIP e Admin)
    return '/app-mobile'
  }

  // MEMBER SKOOL (member_category='skool')
  if (profile?.member_category === 'skool') {
    // Após login vai para app-mobile, acesso limitado
    return '/app-mobile'
  }

  // GUEST (Trial 7 dias)
  if (profile?.user_type === 'guest') {
    // 7 dias de acesso igual ao Membro Skool (exceto /portfolios)
    // Redireciona para app-mobile
    return '/app-mobile'
  }

  // PRESENTATION (Demo 48h)
  if (profile?.user_type === 'presentation') {
    // Apenas acesso a new-landing e apresentação IQONIC
    return '/new-landing'
  }

  // PENDING / conta desativada — só com perfil carregado
  if (profile.user_type === "pending" || profile.is_active === false) {
    return "/success?message=Aguardando+aprovação+administrativa"
  }

  // INACTIVE
  if (profile?.user_type === 'inactive') {
    return '/new-landing'
  }

  // MEMBER STANDARD - Sem categoria específica
  if (profile?.user_type === 'member' && (!profile?.member_category || profile?.member_category === 'standard')) {
    // Acesso padrão como Membro Skool
    return '/app-mobile'
  }

  // Fallback
  return '/new-landing'
}

/**
 * Verifica se um utilizador pode aceder a uma rota específica
 */
export function canAccessRoute(
  profile: UserProfile | null,
  route: string
): boolean {
  if (!profile || !profile.is_active) {
    return false
  }

  // Admin tem acesso a tudo
  if (profile.user_type === 'admin') {
    return true
  }

  // VIP tem acesso a tudo exceto /admin
  if (profile.member_category === 'vip') {
    return !route.startsWith('/admin')
  }

  // Apresentação - apenas new-landing
  if (profile.user_type === 'presentation') {
    return route === '/new-landing' || route === '/'
  }

  // Inactive - apenas páginas públicas
  if (profile.user_type === 'inactive') {
    return ['/new-landing', '/'].includes(route)
  }

  // Member IQ - acesso exceto VIP e Admin
  if (profile.member_category === 'iq') {
    const restrictedRoutes = ['/admin', '/aimtm'] // Rotas VIP
    return !restrictedRoutes.some(restricted => route.startsWith(restricted))
  }

  // Member Skool - acesso limitado (SEM /portfolios)
  if (profile.member_category === 'skool') {
    const restrictedRoutes = ['/admin', '/portfolios', '/aimtm']
    return !restrictedRoutes.some(restricted => route.startsWith(restricted))
  }

  // Guest - mesmo acesso que Skool (7 dias de trial)
  if (profile.user_type === 'guest' && !profile.trial_expired) {
    const restrictedRoutes = ['/admin', '/portfolios', '/aimtm']
    return !restrictedRoutes.some(restricted => route.startsWith(restricted))
  }

  // Member Standard - igual a Skool
  if (profile.user_type === 'member') {
    const restrictedRoutes = ['/admin', '/portfolios', '/aimtm']
    return !restrictedRoutes.some(restricted => route.startsWith(restricted))
  }

  // Default: negar acesso
  return false
}

/**
 * Obtém uma mensagem de erro personalizada para acesso negado
 */
export function getAccessDeniedMessage(
  profile: UserProfile | null,
  route: string
): string {
  if (!profile) {
    return 'Necessita de fazer login para aceder a esta página.'
  }

  if (profile.user_type === 'pending') {
    return 'A sua conta está a aguardar aprovação.'
  }

  if (profile.user_type === 'presentation') {
    return 'Acesso apenas disponível para a apresentação.'
  }

  if (profile.user_type === 'inactive') {
    return 'A sua subscrição está inativa. Por favor, ative a sua subscrição.'
  }

  if (route === '/portfolios' && (profile.member_category === 'skool' || profile.user_type === 'guest')) {
    return 'Os Portfólios estão disponíveis apenas para Membros IQ e VIP.'
  }

  if (route.startsWith('/admin')) {
    return 'Apenas administradores podem aceder ao painel admin.'
  }

  if (route.startsWith('/aimtm') && profile.member_category !== 'vip') {
    return 'O AI MTM Trader está disponível apenas para membros VIP.'
  }

  return 'Não tem permissão para aceder a esta página.'
}

