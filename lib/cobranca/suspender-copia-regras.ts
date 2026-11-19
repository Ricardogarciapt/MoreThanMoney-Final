/**
 * CÓPIA EM PAUSA POR FALTA DE PAGAMENTO — a regra (pura). Pedido do Ricardo, 19/11/2026.
 *
 * «Não pagaste: a tua cópia pára, deixas de ter acesso até pagares, tentamos cobrar e reativar, e
 * as contas ligadas na MetaApi ficam undeployed (sem custo). Pagaste: volta tudo.»
 *
 * Quem NUNCA é pausado:
 *   • admin e super admin (site ou app MTM Auto);
 *   • VIP (user_type OU member_category) — inclui os que não pagam nada (criadores de conteúdo…);
 *   • isenções e acessos manuais da app MTM Auto ainda em prazo;
 *   • quem está nas `excecoes` de `site_settings.copia_suspensao` (email ou user_id).
 *
 * Quem paga (e por isso também não é pausado), por qualquer uma das portas:
 *   • subscrição MTM Auto na Stripe active/trialing, ou Apple activa;
 *   • MTM Copy legado pago e com data;
 *   • o pack do site (Membro 35 € / Premium 65 €…) activo, com estado bom e no prazo.
 *
 * O resto «deve» e, se tiver alguma coisa ligada (cópia ou conta na MetaApi), é pausado. A Stripe
 * tem a última palavra: antes de pausar, o servidor procura pelo email uma subscrição paga — se a
 * houver, NÃO se pausa (o perfil é que está dessincronizado e isso vai para o resumo).
 */

export interface PerfilPagamento {
  email?: string | null
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
  subscription_status?: string | null
  subscription_expires_at?: string | null
  mtmcopy_subscription_active?: boolean | null
  mtmcopy_subscription_expires_at?: string | null
}

export interface AutoPagamento {
  papel?: string | null
  super_admin?: boolean | null
  subscricao?: string | null
  isento?: boolean | null
  motivo_isencao?: string | null
  acesso_manual?: boolean | null
  acesso_ate?: string | null
  apple_estado?: string | null
  apple_expira_em?: string | null
}

export type SituacaoPagamento =
  | { estado: 'isento'; motivo: 'admin' | 'super_admin' | 'vip' | 'isento_app' | 'acesso_manual' | 'excecao' }
  | { estado: 'paga'; motivo: 'pack_site' | 'mtmauto_stripe' | 'mtmauto_apple' | 'mtmcopy_legado' }
  | { estado: 'deve'; motivo: 'pagamento_falhado' | 'subscricao_cancelada' | 'inativo' | 'expirou' }

/** Estados da Stripe/perfil em que o pack NÃO está pago. past_due = o banco recusou e ainda não pagou. */
export const ESTADOS_SEM_PAGAMENTO = new Set(['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'inactive', 'paused'])

const depois = (d: string | null | undefined, agora: Date) => Boolean(d) && new Date(String(d)).getTime() > agora.getTime()
const low = (s: unknown) => String(s ?? '').trim().toLowerCase()

export function situacaoPagamento(
  perfil: PerfilPagamento | null | undefined,
  auto: AutoPagamento | null | undefined,
  opcoes: { agora?: Date; excecoes?: string[]; userId?: string } = {},
): SituacaoPagamento {
  const agora = opcoes.agora ?? new Date()
  const tipo = low(perfil?.user_type)
  const categoria = low(perfil?.member_category)
  const excecoes = new Set((opcoes.excecoes ?? []).map(low).filter(Boolean))

  if (auto?.super_admin) return { estado: 'isento', motivo: 'super_admin' }
  if (tipo === 'admin' || low(auto?.papel) === 'admin') return { estado: 'isento', motivo: 'admin' }
  if (tipo === 'vip' || categoria === 'vip') return { estado: 'isento', motivo: 'vip' }
  if ((opcoes.userId && excecoes.has(low(opcoes.userId))) || (perfil?.email && excecoes.has(low(perfil.email)))) {
    return { estado: 'isento', motivo: 'excecao' }
  }
  // 'cliente_mtm' é uma isenção derivada do pack do site: não conta por si.
  if (auto?.isento && auto.motivo_isencao !== 'cliente_mtm') return { estado: 'isento', motivo: 'isento_app' }
  if (auto?.acesso_manual && (!auto.acesso_ate || depois(auto.acesso_ate, agora))) return { estado: 'isento', motivo: 'acesso_manual' }

  if (low(auto?.subscricao) === 'active' || low(auto?.subscricao) === 'trialing') return { estado: 'paga', motivo: 'mtmauto_stripe' }
  const apple = low(auto?.apple_estado)
  if (apple === 'grace' || (apple === 'active' && (!auto?.apple_expira_em || depois(auto.apple_expira_em, agora)))) {
    return { estado: 'paga', motivo: 'mtmauto_apple' }
  }
  if (perfil?.mtmcopy_subscription_active && depois(perfil.mtmcopy_subscription_expires_at, agora)) {
    return { estado: 'paga', motivo: 'mtmcopy_legado' }
  }

  const estado = low(perfil?.subscription_status)
  const noPrazo = !perfil?.subscription_expires_at || depois(perfil.subscription_expires_at, agora)
  if (perfil && tipo !== 'inactive' && perfil.is_active === true && !ESTADOS_SEM_PAGAMENTO.has(estado) && noPrazo) {
    return { estado: 'paga', motivo: 'pack_site' }
  }

  if (estado === 'past_due' || estado === 'unpaid') return { estado: 'deve', motivo: 'pagamento_falhado' }
  if (estado === 'canceled' || estado === 'incomplete_expired') return { estado: 'deve', motivo: 'subscricao_cancelada' }
  if (!noPrazo) return { estado: 'deve', motivo: 'expirou' }
  return { estado: 'deve', motivo: 'inativo' }
}

/** O que está ligado agora para esta pessoa (ids). */
export interface Ligado {
  site: string[]
  auto: string[]
  subs: string[]
  /** Contas MetaApi DEPLOYED desta pessoa. */
  metaapi: Array<{ id: string; origem: 'site' | 'auto' }>
}

export const NADA_LIGADO: Ligado = { site: [], auto: [], subs: [], metaapi: [] }

export function temAlgoLigado(l: Ligado): boolean {
  return l.site.length + l.auto.length + l.subs.length + l.metaapi.length > 0
}

export type Decisao =
  | { accao: 'pausar' }
  | { accao: 'religar' }
  | { accao: 'nada'; porque: string }

/**
 * Juntando tudo: deve + tem algo ligado + sem suspensão aberta → pausar. Já não deve + suspensão
 * aberta → religar. A Stripe (`stripePaga`) ganha ao perfil: `true` nunca pausa; `'erro'` também não
 * (não se corta ninguém às cegas).
 */
export function decidir(ctx: {
  situacao: SituacaoPagamento
  ligado: Ligado
  suspensaoAberta: boolean
  stripePaga?: boolean | 'erro'
}): Decisao {
  const deve = ctx.situacao.estado === 'deve'
  if (ctx.suspensaoAberta) {
    if (!deve || ctx.stripePaga === true) return { accao: 'religar' }
    return { accao: 'nada', porque: 'continua por pagar' }
  }
  if (!deve) return { accao: 'nada', porque: ctx.situacao.motivo }
  if (!temAlgoLigado(ctx.ligado)) return { accao: 'nada', porque: 'sem nada ligado' }
  if (ctx.stripePaga === true) return { accao: 'nada', porque: 'stripe diz que paga (perfil dessincronizado)' }
  if (ctx.stripePaga === 'erro') return { accao: 'nada', porque: 'stripe ilegível' }
  return { accao: 'pausar' }
}

const MOTIVO_HUMANO: Record<string, string> = {
  pagamento_falhado: 'o pagamento da tua subscrição falhou',
  subscricao_cancelada: 'a tua subscrição foi cancelada',
  inativo: 'a tua subscrição não está activa',
  expirou: 'a tua subscrição terminou',
}

export function motivoHumano(m: string): string {
  return MOTIVO_HUMANO[m] ?? 'a tua subscrição não está paga'
}
