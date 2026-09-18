/**
 * Como a UI lê o perfil — num sítio só.
 *
 * As apps iOS/Android mostram páginas do site dentro de webviews, por isso tudo o que muda de
 * pessoa para pessoa é decidido aqui, no site. O problema não era haver diferenças (um admin tem
 * ferramentas que um cliente não tem, e conteúdo pago é pago) — era cada ecrã decidir a MESMA
 * diferença à sua maneira.
 *
 * Três exemplos reais que isto resolve:
 *
 *   • O VIP está marcado em `user_type`, em `member_category` e às vezes em `membership_level`.
 *     Quem lê só um campo esconde coisas a oito pessoas conforme o campo que escolheu — hoje há
 *     cinco contas com `user_type='vip'` cuja categoria diz outra coisa, e essas cinco viam
 *     metade da app como se não fossem VIP.
 *   • O Premium também vive em dois sítios (`member_category` e `subscription_plan`). Um ecrã que
 *     leia só a categoria chama "Membro" a quem paga Premium — e ainda lhe oferece o upgrade que
 *     essa pessoa já comprou.
 *   • A regra "admin, VIP ou Premium" estava escrita três vezes (Apps MTM, MTM Terminal no
 *     browser, MTM Terminal no servidor) e as três não diziam exactamente o mesmo.
 *
 * Isto é a leitura para DESENHAR ecrãs. Quem decide o que se pode EXECUTAR — abrir ordens, ligar
 * contas, publicar sinais — continua a ser o servidor (`lib/entitlements.ts`, que precisa da
 * chave de serviço e por isso não pode ser importado por um componente de browser).
 */

export type PerfilUi = {
  user_type?: string | null
  member_category?: string | null
  membership_level?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
}

const minusculas = (v: unknown): string => String(v ?? '').trim().toLowerCase()

/**
 * `is_active = false` é a alavanca que fecha tudo: conta em pausa por pagamento, ativação
 * pendente e trial expirado passam todos por aqui.
 */
export function contaAtivaUi(p?: PerfilUi | null): boolean {
  return Boolean(p) && p!.is_active !== false
}

export function ehAdminUi(p?: PerfilUi | null): boolean {
  return contaAtivaUi(p) && minusculas(p?.user_type) === 'admin'
}

/** VIP, seja por que campo for — é uma decisão nossa, não um plano que se compra. */
export function ehVipUi(p?: PerfilUi | null): boolean {
  if (!contaAtivaUi(p)) return false
  return (
    minusculas(p?.user_type) === 'vip' ||
    minusculas(p?.member_category) === 'vip' ||
    minusculas(p?.membership_level) === 'vip'
  )
}

/** Trial gratuito: nasce `guest` com a categoria Premium para experimentar. */
export function ehTrialUi(p?: PerfilUi | null): boolean {
  return contaAtivaUi(p) && minusculas(p?.user_type) === 'guest'
}

/**
 * Premium pago, em qualquer das formas em que a base o escreve. O Fundador é Premium com outro
 * nome — negá-lo aqui seria esconder-lhe o que já pagou.
 */
export function ehPremiumUi(p?: PerfilUi | null): boolean {
  if (!contaAtivaUi(p)) return false
  const cat = minusculas(p?.member_category)
  const nivel = minusculas(p?.membership_level)
  const plano = minusculas(p?.subscription_plan)
  return (
    cat.includes('premium') ||
    cat.includes('fundador') ||
    nivel.includes('premium') ||
    nivel.includes('founder') ||
    nivel.includes('fundador') ||
    plano.includes('premium') ||
    plano.includes('founder') ||
    plano.includes('fundador')
  )
}

/**
 * A regra "admin, VIP ou Premium" — a das Apps MTM, do MTM Terminal e de tudo o que lhes seguir.
 * O IQ entra porque o registo IQ de 65 € é o Premium com outro nome.
 */
export function podeAcederPremiumUi(p?: PerfilUi | null): boolean {
  if (!contaAtivaUi(p)) return false
  if (ehAdminUi(p) || ehVipUi(p) || ehPremiumUi(p)) return true
  return minusculas(p?.member_category) === 'iq'
}

/** Os níveis de acesso que uma sala ao vivo ou uma playlist podem exigir. */
export type TierAcesso = 'free' | 'all' | 'app_member' | 'premium' | 'vip'

/**
 * Pode entrar numa sala/playlist deste nível?
 *
 * Havia quatro cópias desta regra — lobby web, lista da app, ficha do educador e cartão de cursos
 * — e as quatro discordavam. Três consequências que os clientes viam:
 *
 *   • O VIP levava com cadeado numa sala Premium na web, e entrava na mesma sala pela app. A
 *     hierarquia estava invertida: o VIP, que é a decisão mais forte que tomamos sobre alguém,
 *     via menos do que um Premium.
 *   • No cartão de cursos, uma playlist VIP era negada a TODA a gente menos ao admin — nem o
 *     próprio VIP entrava no que era só dele.
 *   • Uma sala marcada `free` era negada em três das quatro cópias, porque só uma delas conhecia
 *     essa palavra. O que se anunciava como gratuito aparecia com cadeado.
 */
export function podeAcederAoTier(p: PerfilUi | null | undefined, tier?: string | null): boolean {
  const nivel = minusculas(tier) || 'all'
  const chave = chavePerfilUi(p)
  if (chave === 'admin') return true
  if (nivel === 'free' || nivel === 'all') return contaAtivaUi(p)
  // O VIP entra em tudo: é uma decisão nossa sobre a pessoa, não um degrau da escada de packs.
  if (chave === 'vip') return true
  if (nivel === 'vip') return false
  if (nivel === 'premium') return chave === 'premium' || chave === 'iq'
  if (nivel === 'app_member') {
    return chave === 'premium' || chave === 'iq' || chave === 'membro' || chave === 'trial'
  }
  return false
}

/**
 * O SERVIDOR entrega a reprodução (playback_url, HLS, WHEP, legendas/dobragem) desta sala?
 *
 * O cadeado das salas Premium/VIP era só visual: /api/live-sessions/streams mandava o endereço
 * de reprodução a qualquer pessoa, com ou sem sessão, e o cadeado vivia no ecrã. Aqui fica a
 * decisão do servidor, com a MESMA regra do ecrã (`podeAcederAoTier`) e duas diferenças:
 *
 *   • `free` é público mesmo SEM conta — é a /FreeSession, que não pede login;
 *   • a equipa (admin do site, educador autenticado, operador da sala) vê sempre: é quem
 *     transmite, testa e acompanha a sala, e não pode ficar com o próprio player às escuras.
 *
 * Sem perfil (visitante anónimo) só entra no `free`.
 */
export function podeVerReproducaoDaSala(
  p: PerfilUi | null | undefined,
  tier?: string | null,
  opcoes: { equipa?: boolean } = {},
): boolean {
  if (opcoes.equipa) return true
  if (minusculas(tier) === 'free') return true
  if (!p) return false
  return podeAcederAoTier(p, tier)
}

export type ChavePerfil =
  | 'admin'
  | 'vip'
  | 'premium'
  | 'iq'
  | 'skool'
  | 'trial'
  | 'membro'
  | 'inativo'

/**
 * O nome do perfil, para etiquetas e emblemas. Uma pessoa é uma coisa só: se cada ecrã escolher
 * o campo que prefere, a mesma conta é "VIP" no chat e "App Member (35 €)" nas definições.
 *
 * A ordem é a da precedência: manda o direito mais forte.
 */
export function chavePerfilUi(p?: PerfilUi | null): ChavePerfil {
  if (!p) return 'inativo'
  if (!contaAtivaUi(p) || minusculas(p.user_type) === 'inactive') return 'inativo'
  if (ehAdminUi(p)) return 'admin'
  if (ehVipUi(p)) return 'vip'
  // O trial vem antes do Premium de propósito: é um `guest` com a categoria Premium, e chamar-lhe
  // "Premium" esconde-lhe a única coisa que precisa de saber — que aquilo acaba.
  if (ehTrialUi(p)) return 'trial'
  if (ehPremiumUi(p)) return 'premium'
  if (minusculas(p.member_category) === 'iq') return 'iq'
  if (minusculas(p.member_category) === 'skool') return 'skool'
  return 'membro'
}
