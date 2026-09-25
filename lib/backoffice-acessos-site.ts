/**
 * A QUE PARTES DO SITE é que uma pessoa da equipa tem acesso.
 *
 * PORQUÊ ISTO É UM FICHEIRO À PARTE
 * Há duas perguntas que se parecem e não são a mesma:
 *
 *   1. «Esta pessoa entra no backoffice?»  → papéis (`lib/backoffice-papeis.ts`)
 *   2. «Esta pessoa entra no /member-area, nos sinais, no LMS?» → isto.
 *
 * Confundi-las é o erro caro. Um afiliado criado de raiz não é cliente: tem login para o
 * backoffice e mais nada. Um closer que também é membro Premium continua a ver o Premium porque
 * PAGOU, não porque é closer. Se o papel abrisse o site, bastava dar um papel a alguém para lhe
 * dar produto de graça — e, pior, bastava tirar-lhe o papel para lhe tirar o que ele pagou.
 *
 * A REGRA, numa frase: a lista de áreas só APERTA, nunca abre.
 *
 * O portão de activação (`lib/member-activation.ts`) e o `is_active` continuam a mandar, como
 * mandam hoje em todas as portas do site. Esta lista é um filtro POR CIMA: das áreas que a pessoa
 * já teria direito a ver, quais é que o Ricardo escolheu deixar ligadas. Uma lista vazia não
 * significa «tudo»: significa o comportamento normal de membro, nada acrescentado (ver
 * `areasPermitidas`). E uma pessoa que o portão de activação bloqueia não recupera nada por ter
 * áreas marcadas — a marca fica lá, inofensiva, até ela pagar.
 */

import { isRegisteredMember } from '@/lib/member-access'
import type { UserProfile } from '@/lib/role-redirect'

/**
 * O CATÁLOGO das áreas que se podem ligar/desligar por pessoa.
 *
 * Fica em código, e não numa tabela, porque cada chave destas corresponde a um caminho real que
 * alguém tem de ir fechar. Uma área inventada no admin que nenhuma porta conhece é pior do que
 * não existir: dá a sensação de ter sido concedida e não concede nada.
 */
export const AREAS_SITE = [
  'member_area',
  'app_mobile',
  'sinais',
  'lms',
  'mtmauto',
  'scanner',
  'mtmfunded',
] as const
export type AreaSite = (typeof AREAS_SITE)[number]

export const AREA_NOME: Record<AreaSite, string> = {
  member_area: 'Área de Membro',
  app_mobile: 'App (web e nativas)',
  sinais: 'Sinais e alertas',
  lms: 'Formação / Sessões',
  mtmauto: 'MTM Auto',
  scanner: 'Scanners',
  mtmfunded: 'MTM Funded',
}

export function ehAreaSite(valor: unknown): valor is AreaSite {
  return typeof valor === 'string' && (AREAS_SITE as readonly string[]).includes(valor)
}

/** O caminho pelo qual cada área se reconhece num pedido. Serve o middleware e as rotas. */
const PREFIXOS: Record<AreaSite, readonly string[]> = {
  member_area: ['/member-area'],
  app_mobile: ['/app-mobile'],
  sinais: ['/alertas-mtm', '/api/signals', '/api/alerts'],
  lms: ['/live-sessions', '/live', '/avaliacoes'],
  mtmauto: ['/mtmauto', '/mtmautoapp'],
  scanner: ['/scanner', '/scanner-access'],
  mtmfunded: ['/mtmfunded'],
}

/** Que área é que este caminho representa? `null` = caminho que esta lista não governa. */
export function areaDoCaminho(pathname: string): AreaSite | null {
  for (const area of AREAS_SITE) {
    if (PREFIXOS[area].some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))) {
      return area
    }
  }
  return null
}

/**
 * As áreas que esta pessoa pode ver, de facto.
 *
 * `restricao` é o que está guardado para ela em `backoffice_acessos_site`:
 *   · `null`/vazio  → sem restrição: vale o acesso normal de membro, como sempre valeu
 *   · lista de áreas → só essas, E apenas se o acesso normal de membro já as permitia
 *
 * Quem não passa o `isRegisteredMember` (não pagou, está bloqueado, activação pendente) fica com
 * conjunto vazio. É a mesma resposta que o site já dá hoje; escrevê-la aqui só garante que a
 * lista de áreas nunca se torna uma porta de serviço.
 */
export function areasPermitidas(
  profile: UserProfile | null | undefined,
  restricao: readonly AreaSite[] | null | undefined,
): Set<AreaSite> {
  if (!isRegisteredMember(profile)) return new Set()

  if (!restricao || restricao.length === 0) return new Set(AREAS_SITE)

  // Intersecção, e não substituição: a lista escolhe DE ENTRE o que já havia.
  return new Set(AREAS_SITE.filter((a) => restricao.includes(a)))
}

/**
 * Pode ver este caminho?
 *
 * Um caminho que a lista não governa (`areaDoCaminho` → null) devolve `true`, porque não é este
 * o portão dele — a homepage, o /register ou o /upgrade não vão passar a estar fechados por
 * causa de uma lista de áreas de membro. As áreas governadas é que respondem pela regra de cima.
 */
export function podeVerCaminho(
  profile: UserProfile | null | undefined,
  restricao: readonly AreaSite[] | null | undefined,
  pathname: string,
): boolean {
  const area = areaDoCaminho(pathname)
  if (!area) return true
  return areasPermitidas(profile, restricao).has(area)
}

/** Limpa o que vem do admin: só chaves do catálogo, sem repetidos, ordem estável. */
export function normalizarAreas(valor: unknown): AreaSite[] {
  if (!Array.isArray(valor)) return []
  const set = new Set<AreaSite>()
  for (const v of valor) if (ehAreaSite(v)) set.add(v)
  return AREAS_SITE.filter((a) => set.has(a))
}
