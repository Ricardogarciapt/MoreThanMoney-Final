/**
 * backoffice.morethanmoney.pt — o MESMO site, servido por subdomínio.
 *
 * PORQUÊ NÃO UMA APP SEPARADA
 * Uma segunda app Next.js obrigava a duplicar sessão, base de dados e componentes, e a partir daí
 * cada correcção teria de ser feita duas vezes — na prática, seria feita uma e esquecida na outra.
 * O subdomínio é só uma porta de entrada diferente para o mesmo código: as páginas vivem em
 * `app/backoffice/*` e o middleware reescreve `backoffice.morethanmoney.pt/x` para `/backoffice/x`.
 *
 * REESCREVER, NÃO REDIRECCIONAR: a barra de endereço tem de continuar a dizer
 * `backoffice.morethanmoney.pt/extracto`. Um redireccionamento para `www...../backoffice/extracto`
 * deitava fora a razão de ter subdomínio.
 *
 * Este ficheiro é puro (sem `next/*`, sem rede) para as regras de caminho poderem ser verificadas
 * numa guarda — é fácil escrever um prefixo a mais e fechar o `/login` sem dar por isso.
 */

/** Os anfitriões que servem o backoffice. Local incluído para se poder testar antes do DNS existir. */
export function ehAnfitriaoBackoffice(host: string | null | undefined): boolean {
  if (!host) return false
  // Sem porta e sem maiúsculas: `backoffice.localhost:3001` e `Backoffice.MoreThanMoney.pt` são o mesmo.
  const h = host.split(':')[0].trim().toLowerCase()
  if (!h) return false
  return h === 'backoffice.morethanmoney.pt' || h === 'backoffice.localhost'
}

/**
 * Caminhos que o subdomínio serve TAL E QUAL, sem prefixo `/backoffice`.
 *
 * O `/login` está aqui por uma razão prática: se a sessão não for partilhada entre `www` e
 * `backoffice` (e por omissão os cookies do Supabase são do anfitrião, não do domínio — ver o
 * relatório), a pessoa tem de poder entrar NO PRÓPRIO subdomínio. Fechá-lo dava uma porta sem
 * fechadura e sem chave.
 *
 * As APIs também passam: são as mesmas rotas do site, e cada uma autentica-se sozinha. Duplicá-las
 * sob `/backoffice/api` era pedir que metade ficasse esquecida.
 */
const PASSAM_DIRETO = [
  '/api/',
  '/_next/',
  '/.well-known/',
  '/login',
  '/logout',
  '/auth/',
  '/forgot-password',
  '/reset-password',
  '/favicon.ico',
  '/downloads/',
  '/images/',
  '/fonts/',
] as const

export function passaDireto(pathname: string): boolean {
  return PASSAM_DIRETO.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')))
}

/**
 * Para onde é que este caminho do subdomínio vai, por dentro.
 *
 * `null` = não mexer. Caso contrário devolve o caminho já com `/backoffice` à frente.
 * A raiz do subdomínio dá `/backoffice` (e não `/backoffice/`, que o Next trataria como outra rota).
 *
 * Quem já vem com `/backoffice` não leva prefixo outra vez: sem esta linha, um link interno
 * absoluto gerava `/backoffice/backoffice/...` e dava 404 numa navegação e não na primeira, que é
 * o género de avaria que se demora uma tarde a perceber.
 */
/**
 * As SECÇÕES do backoffice, e a razão de existir esta lista.
 *
 * 25/09: o subdomínio servia QUALQUER caminho como se fosse do backoffice. Um link para `/admin`
 * ou `/mtm` — e o site está cheio deles, em componentes partilhados — ficava em
 * `backoffice.morethanmoney.pt/admin`, que por dentro virava `/backoffice/admin` e não existe.
 * A pessoa clicava num atalho conhecido e caía num 404 dentro do subdomínio errado.
 *
 * Agora o subdomínio serve SÓ o que é dele; tudo o resto é devolvido ao site principal. Uma lista
 * explícita, e não «tudo o que não estiver na lista de excepções», porque o erro tem de ser do
 * lado seguro: uma secção nova que se esqueça aqui manda a pessoa para o `www` (chato, e nota-se
 * logo), enquanto o contrário engolia páginas inteiras do site para dentro do backoffice.
 *
 * A guarda `backoffice-dominio.check.ts` compara esta lista com o menu do layout.
 */
export const SECCOES_BACKOFFICE = ['extracto', 'pipeline', 'tarefas', 'equipa', 'material'] as const

/** O primeiro segmento do caminho (`/pipeline/3` → `pipeline`). */
function primeiroSegmento(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0]?.split('?')[0] ?? ''
}

/** Este caminho pertence ao backoffice? (já com prefixo, ou uma secção dele) */
export function ehCaminhoDoBackoffice(pathname: string): boolean {
  if (pathname === '/backoffice' || pathname.startsWith('/backoffice/')) return true
  if (pathname === '/' || pathname === '') return true
  return (SECCOES_BACKOFFICE as readonly string[]).includes(primeiroSegmento(pathname))
}

export function caminhoInternoBackoffice(pathname: string): string | null {
  if (passaDireto(pathname)) return null
  if (pathname === '/backoffice' || pathname.startsWith('/backoffice/')) return null
  if (pathname === '/' || pathname === '') return '/backoffice'
  // Só as secções do backoffice se reescrevem. O resto NÃO é daqui — ver `urlNoSitePrincipal`.
  if (!ehCaminhoDoBackoffice(pathname)) return null
  return '/backoffice' + (pathname.startsWith('/') ? pathname : '/' + pathname)
}

/** O mesmo caminho, no site principal. É para onde volta o que não é do backoffice. */
export function urlNoSitePrincipal(pathname: string, search = ''): string {
  const base = 'https://www.morethanmoney.pt'
  const caminho = pathname.startsWith('/') ? pathname : '/' + pathname
  return base + caminho + (search || '')
}

/** Este pedido é para o backoffice (pelo subdomínio ou pelo caminho directo no domínio normal)? */
export function ehPedidoBackoffice(host: string | null | undefined, pathname: string): boolean {
  if (pathname === '/backoffice' || pathname.startsWith('/backoffice/')) return true
  // No subdomínio, só as SECÇÕES do backoffice. Reclamar tudo era o que punha `/admin` e `/mtm`
  // dentro dele, a dar 404 — ver o comentário em SECCOES_BACKOFFICE.
  return ehAnfitriaoBackoffice(host) && !passaDireto(pathname) && ehCaminhoDoBackoffice(pathname)
}

/** No subdomínio, este caminho tem de ser devolvido ao site principal? */
export function devolverAoSitePrincipal(host: string | null | undefined, pathname: string): boolean {
  if (!ehAnfitriaoBackoffice(host)) return false
  if (passaDireto(pathname)) return false
  return !ehCaminhoDoBackoffice(pathname)
}

/**
 * A ENTRADA, que é também onde se manda quem não tem papéis.
 *
 * NÃO é a homepage: alguém sem papéis no backoffice pode ser um cliente normal, e despejá-lo na
 * landing sem explicação é o mesmo tipo de silêncio que deixou 43 pessoas de fora em agosto. A
 * entrada diz-lhe que a conta não faz parte da equipa e a quem falar.
 *
 * E é a ENTRADA, e não uma página `/sem-acesso` própria, por uma razão de mecânica: uma página de
 * recusa DENTRO de `/backoffice` herda o layout do backoffice, o layout exige papéis, e o
 * encaminhamento andava à roda até o browser desistir. Assim há um sítio só que decide — mostra o
 * painel a quem entra, mostra a explicação a quem não entra — e nunca se reenvia para si mesmo.
 */
export const CAMINHO_ENTRADA_BACKOFFICE = '/backoffice'

/**
 * Caminhos do backoffice que o middleware deixa passar sem papéis.
 *
 * Só a entrada. Se a lista crescer, cada linha nova é uma página que gente de fora consegue abrir —
 * por isso a decisão vive aqui, à vista, e não espalhada por `if`s no middleware.
 */
export function dispensaPapeis(pathname: string): boolean {
  return pathname === CAMINHO_ENTRADA_BACKOFFICE
}
