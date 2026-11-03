/**
 * QUEM PODE SEGUIR CADA ESTRATÉGIA DO MTM AUTO — a mesma regra no site, no MTM Auto e no motor.
 *
 * 03/11/2026, decisão do dono:
 *   · MTM Auto Premium II  → clientes Premium (65 €) ou acima, quem paga o MTM Auto (Stripe ou
 *                            App Store — esclarecido pelo dono no mesmo dia), OU corretora validada;
 *   · MTM Auto Premium     → todos os membros;
 *   · MTM Auto GoldKiller  → todos os membros;
 *   · MTM Auto Edge        → só membros com a PU Prime validada.
 * As restantes estratégias continuam abertas a quem tem direito ao MTM Auto.
 *
 * Esta regra SOMA-SE ao direito ao MTM Auto (lib/entitlements · direito_mtm_auto): quem não tem
 * direito não segue nada; quem tem direito segue as estratégias do seu nível.
 *
 * Módulo PURO (sem base de dados): serve o planeador das rotas, as APIs e os testes. A leitura dos
 * perfis vive em `lib/acesso-estrategias-servidor.ts`. A app MTM Auto tem uma cópia byte a byte em
 * `lib/acesso-estrategias.ts` — mudar a regra = mudar as duas e os testes.
 */

export type NivelEstrategia = 'membros' | 'premium_ou_corretora' | 'puprime_validado'

/** Slug da estratégia (mtmauto_providers.slug, em minúsculas) → nível. Ausente = 'membros'. */
export const NIVEL_POR_ESTRATEGIA: Record<string, NivelEstrategia> = {
  'mtm-auto-premium-ii': 'premium_ou_corretora',
  'mtm-auto-edge': 'puprime_validado',
  'premium-ouro': 'membros',
  goldkiller: 'membros',
}

export function nivelDaEstrategia(slug: string | null | undefined): NivelEstrategia {
  return NIVEL_POR_ESTRATEGIA[String(slug ?? '').trim().toLowerCase()] ?? 'membros'
}

export interface PerfilAcessoEstrategia {
  /** admin do site ou do MTM Auto: vê e segue tudo. */
  admin?: boolean
  /** Premium (65 €), Fundador, IQ, VIP — conta activa (lib/perfil-ui · podeAcederPremiumUi). */
  premiumOuMais?: boolean
  /** Paga a subscrição do MTM Auto (Stripe activa/trial ou App Store activa/em graça). */
  mtmAutoPago?: boolean
  /** Corretora parceira validada (PU Prime ou VT Markets, conta real). */
  corretoraValidada?: boolean
  /** PU Prime validada (UID confirmado, validação aprovada ou conta real PU Prime ligada). */
  puPrimeValidado?: boolean
  /** Estratégias concedidas à mão pelo admin (tabela acesso_estrategias_concedido) — passam qualquer nível. */
  concedidas?: string[]
}

export type MotivoAcessoEstrategia = 'livre' | 'admin' | 'premium' | 'corretora' | 'puprime' | 'falta_premium_ou_corretora' | 'falta_puprime' | 'concedido'

export interface AcessoEstrategia {
  pode: boolean
  motivo: MotivoAcessoEstrategia
  nivel: NivelEstrategia
}

export function acessoEstrategia(slug: string | null | undefined, p: PerfilAcessoEstrategia | null | undefined): AcessoEstrategia {
  const nivel = nivelDaEstrategia(slug)
  if (nivel === 'membros') return { pode: true, motivo: 'livre', nivel }
  if (p?.admin) return { pode: true, motivo: 'admin', nivel }
  const chave = String(slug ?? '').trim().toLowerCase()
  if (p?.concedidas?.some((c) => String(c).trim().toLowerCase() === chave)) return { pode: true, motivo: 'concedido', nivel }
  if (nivel === 'puprime_validado') {
    return p?.puPrimeValidado ? { pode: true, motivo: 'puprime', nivel } : { pode: false, motivo: 'falta_puprime', nivel }
  }
  if (p?.premiumOuMais || p?.mtmAutoPago) return { pode: true, motivo: 'premium', nivel }
  if (p?.corretoraValidada || p?.puPrimeValidado) return { pode: true, motivo: 'corretora', nivel }
  return { pode: false, motivo: 'falta_premium_ou_corretora', nivel }
}

/** Texto para o cliente (PT) — o que falta para desbloquear. */
export const EXPLICACAO_ACESSO_ESTRATEGIA: Record<NivelEstrategia, string> = {
  membros: 'Disponível para todos os membros.',
  premium_ou_corretora: 'Disponível para membros Premium (65 €), assinantes do MTM Auto ou com a corretora validada.',
  puprime_validado: 'Disponível só para membros com a conta PU Prime validada.',
}

/** O mesmo em inglês (a app MTM Auto fala inglês por omissão). */
export const EXPLICACAO_ACESSO_ESTRATEGIA_EN: Record<NivelEstrategia, string> = {
  membros: 'Available to all members.',
  premium_ou_corretora: 'Available to Premium members (€65), MTM Auto subscribers or with a validated broker account.',
  puprime_validado: 'Available only to members with a validated PU Prime account.',
}

/** Corretora parceira pelo nome ou servidor (PU Prime / VT Markets). */
export function corretoraDoServidor(servidor: string | null | undefined): 'puprime' | 'vtmarkets' | null {
  const n = String(servidor ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  if (n.includes('PUPRIME')) return 'puprime'
  if (n.includes('VTMARKETS') || n.includes('VANTAGEINTERNATIONAL')) return 'vtmarkets'
  return null
}

/** Servidor de demonstração (não prova nada sobre a corretora). */
export function servidorDemo(servidor: string | null | undefined): boolean {
  return /demo/i.test(String(servidor ?? ''))
}
