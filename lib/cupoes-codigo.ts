/**
 * CUPÕES — uma só porta para normalizar, validar e decidir o plano (19/11/2026).
 *
 * Porque existe: cada rota validava o cupão à sua maneira e cada uma tinha um buraco diferente.
 *  - «SHE IS FACELESS» (com espaços) dava «inexistente»: o código guardado é SHEISFACELESS e só
 *    se fazia `trim().toUpperCase()`. No checkout o `pareceCupao` recusava os espaços em silêncio.
 *  - O checkout lia `stripe_promotion_code_id` sem ver `valid_from` nem os usos reais, e o caminho
 *    sem Stripe dava 30 dias grátis por cada cupão `free_*` ativo — mesmo expirado ou já gasto.
 *  - O `plan_override` era ignorado: um cupão de Membro (100 % forever) aplicava-se ao Premium,
 *    porque o registo em modo trial manda sempre `premium_monthly`.
 *
 * Tudo o que decide se um cupão vale passa a vir daqui.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { cupaoEsgotado } from '@/lib/cupoes-usos'

/** «she is faceless » → «SHEISFACELESS». Hífens e underscores ficam (MTM-APP-…, AG-…). */
export function normalizarCodigoCupao(codigo: unknown): string {
  if (typeof codigo !== 'string') return ''
  return codigo.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}

export type CupaoRow = {
  id: string
  code: string
  type: string
  discount_value: number | string | null
  plan_override: string | null
  max_uses: number | null
  used_count?: number | null
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  stripe_coupon_id?: string | null
  stripe_promotion_code_id?: string | null
  stripe_duration?: string | null
  apple_offer_id?: string | null
  apple_offer_products?: string[] | null
  grant_days?: number | null
  grants_vip?: boolean | null
  marketplace_produto_id?: string | null
  marketplace_educator_id?: string | null
}

export type MotivoRecusa =
  | 'em_falta'
  | 'inexistente'
  | 'inativo'
  | 'ainda_nao'
  | 'expirado'
  | 'esgotado'
  | 'ja_usado'
  | 'plano_errado'
  | 'erro'

export const MENSAGEM_RECUSA: Record<MotivoRecusa, string> = {
  em_falta: 'Código de cupão em falta',
  inexistente: 'Cupão inválido ou inexistente',
  inativo: 'Este cupão não está activo',
  ainda_nao: 'Este cupão ainda não está disponível',
  expirado: 'Este cupão já expirou',
  esgotado: 'Este cupão já atingiu o número máximo de utilizações',
  ja_usado: 'Já utilizaste este cupão anteriormente',
  plano_errado: 'Este cupão não se aplica a este plano',
  erro: 'Erro interno ao validar cupão',
}

export type ResultadoCupao =
  | { ok: true; cupao: CupaoRow }
  | { ok: false; motivo: MotivoRecusa; cupao?: CupaoRow }

/**
 * Valida um cupão contra a base: existe, ativo, dentro das datas, com usos (contados em
 * `coupon_usages`) e, se houver `userId`, ainda não usado por essa pessoa.
 */
export async function avaliarCupao(
  db: Pick<SupabaseClient, 'from'>,
  codigoBruto: unknown,
  opts: { userId?: string | null; agora?: Date } = {},
): Promise<ResultadoCupao> {
  const code = normalizarCodigoCupao(codigoBruto)
  if (!code) return { ok: false, motivo: 'em_falta' }

  const { data, error } = await db.from('coupons').select('*').eq('code', code).maybeSingle()
  if (error) return { ok: false, motivo: 'erro' }
  if (!data) return { ok: false, motivo: 'inexistente' }
  const cupao = data as CupaoRow

  const agora = opts.agora ?? new Date()
  if (!cupao.is_active) return { ok: false, motivo: 'inativo', cupao }
  if (cupao.valid_from && new Date(cupao.valid_from) > agora) return { ok: false, motivo: 'ainda_nao', cupao }
  if (cupao.valid_until && new Date(cupao.valid_until) < agora) return { ok: false, motivo: 'expirado', cupao }
  if (await cupaoEsgotado(db, cupao)) return { ok: false, motivo: 'esgotado', cupao }

  if (opts.userId) {
    const { data: uso } = await db
      .from('coupon_usages')
      .select('id')
      .eq('coupon_id', cupao.id)
      .eq('user_id', opts.userId)
      .limit(1)
      .maybeSingle()
    if (uso) return { ok: false, motivo: 'ja_usado', cupao }
  }
  return { ok: true, cupao }
}

/** Ciclo de faturação de um planId interno (`premium_monthly` → `monthly`). */
function cicloDoPlano(planId: string): 'monthly' | 'annual' {
  return planId.endsWith('_annual') ? 'annual' : 'monthly'
}

/**
 * Plano a cobrar com este cupão. O cupão manda: um cupão de Membro leva sempre ao Membro, mesmo
 * que o formulário tenha mandado Premium. Devolve `null` se o cupão não serve para subscrições.
 */
export function planoParaCupao(planOverride: string | null | undefined, planIdPedido: string): string | null {
  const ciclo = cicloDoPlano(planIdPedido)
  switch (planOverride ?? null) {
    case null:
    case 'any':
    case 'founder':
      return planIdPedido
    case 'both':
      return planIdPedido.startsWith('app_member') || planIdPedido.startsWith('premium')
        ? planIdPedido
        : `premium_${ciclo}`
    case 'app_member':
      return planIdPedido.startsWith('app_member') ? planIdPedido : `app_member_${ciclo}`
    case 'premium':
      return planIdPedido.startsWith('premium') ? planIdPedido : `premium_${ciclo}`
    case 'vip':
      return planIdPedido.startsWith('premium') || planIdPedido.startsWith('elite')
        ? planIdPedido
        : `premium_${ciclo}`
    case 'mtmfunded':
      return null
    default:
      return planIdPedido
  }
}

/** Tipos que dão desconto numa subscrição Stripe (os outros resgatam-se fora do checkout). */
export const TIPOS_DE_CHECKOUT = new Set(['discount_pct', 'free_months', 'free_subscription'])

/** Cupões gerados por pessoa (migração da app / corretora): não vão ao Stripe, resgatam-se à parte. */
export function ehCupaoPorPessoa(code: string): boolean {
  return /^MTM-(APP|BROKER)-/.test(code)
}

/** Um cupão de checkout tem de ter o seu promotion code no Stripe para dar desconto. */
export function precisaDeStripe(
  c: Pick<CupaoRow, 'type' | 'code' | 'marketplace_produto_id' | 'marketplace_educator_id'> & { plan_override?: string | null },
): boolean {
  if (!TIPOS_DE_CHECKOUT.has(c.type)) return false
  // MTM Funded valida o cupão no seu próprio checkout (lib/mtmfunded/cupao.ts), sem promotion code.
  if (c.plan_override === 'mtmfunded') return false
  if (ehCupaoPorPessoa(c.code)) return false
  if (c.marketplace_produto_id || c.marketplace_educator_id) return false
  return true
}
