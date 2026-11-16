/**
 * O site de apresentação (/solucoes) servido por domínio próprio.
 *
 * Tal como o backoffice (lib/backoffice-dominio.ts), NÃO é uma app à parte: é a mesma app Next,
 * com uma porta de entrada diferente. Assim o balão de apoio, a agenda (/agendar), as APIs e a
 * sessão são os mesmos, e uma correcção faz-se uma vez.
 *
 * O domínio vem de NEXT_PUBLIC_SITE_SOLUCOES_HOSTS (lista separada por vírgulas, ex.:
 * "exemplo.pt,www.exemplo.pt"). Sem a variável, nada muda: a página vive em
 * morethanmoney.pt/solucoes. É pública de propósito (nomes de anfitrião não são segredo) para o
 * cliente também saber que está no domínio próprio e esconder a navbar do site principal.
 *
 * Puro (sem next/*, sem rede) para se poder verificar numa guarda.
 */

export const CAMINHO_SOLUCOES = '/solucoes'

function limpar(host: string | null | undefined): string {
  if (!host) return ''
  return host.split(':')[0].trim().toLowerCase()
}

export function anfitrioesSolucoes(valor: string | undefined = process.env.NEXT_PUBLIC_SITE_SOLUCOES_HOSTS): string[] {
  if (!valor) return []
  return valor
    .split(',')
    .map((h) => limpar(h))
    .filter(Boolean)
}

export function ehAnfitriaoSolucoes(host: string | null | undefined, lista: string[] = anfitrioesSolucoes()): boolean {
  const h = limpar(host)
  if (!h) return false
  return h === 'solucoes.localhost' || lista.includes(h)
}

/** Caminhos que o domínio próprio serve tal e qual (o resto do site é partilhado por baixo). */
const PASSAM_DIRETO = ['/api/', '/_next/', '/.well-known/', '/images/', '/videos/', '/fonts/', '/agendar', '/privacidade', '/terms', '/aviso-de-risco', '/favicon.ico', '/logo-']

export type DecisaoSolucoes =
  | { tipo: 'nada' }
  | { tipo: 'reescrever'; para: string }
  | { tipo: 'site-principal' }

/**
 * O que fazer com um pedido que chega pelo domínio próprio.
 *
 * - A raiz e as âncoras vão para /solucoes (reescrita: a barra continua a dizer o domínio).
 * - Recursos partilhados (APIs, imagens, agenda, privacidade) passam tal e qual.
 * - Tudo o resto volta ao site principal no mesmo caminho: ninguém navega o site inteiro debaixo
 *   do domínio de apresentação (foi a lição do backoffice a 25/09).
 */
export function decidirSolucoes(host: string | null | undefined, pathname: string, lista?: string[]): DecisaoSolucoes {
  if (!ehAnfitriaoSolucoes(host, lista)) return { tipo: 'nada' }
  if (pathname === '/' || pathname === '') return { tipo: 'reescrever', para: CAMINHO_SOLUCOES }
  if (pathname === CAMINHO_SOLUCOES || pathname.startsWith(CAMINHO_SOLUCOES + '/')) return { tipo: 'nada' }
  if (PASSAM_DIRETO.some((p) => pathname.startsWith(p))) return { tipo: 'nada' }
  return { tipo: 'site-principal' }
}
