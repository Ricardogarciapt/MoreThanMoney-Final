import { sanitizeEnv } from '@/lib/env-sanitize'

/**
 * O ADDON DO MTM COPY NO STRIPE (20 €/mês) — reconhecê-lo e tratá-lo à parte.
 *
 * O addon é uma SEGUNDA subscrição do mesmo cliente Stripe. O webhook tratava todos os eventos de
 * subscrição como se fossem do plano principal: um `customer.subscription.updated` do addon
 * gravava `subscription_plan = 'mtmcopy_addon_monthly'`, `member_category = 'standard'` e o
 * `stripe_subscription_id` do addon por cima do Premium — e um cancelamento do addon punha o
 * perfil inteiro `is_active = false`. Um Premium que desistisse só do MTM Copy perdia tudo.
 *
 * Regra daqui para a frente: um evento do addon mexe APENAS em
 *   • profiles.mtmcopy_subscription_active
 *   • profiles.mtmcopy_subscription_expires_at (= current_period_end — nunca null)
 *   • payment_history com plan = 'mtmcopy_addon_monthly'
 * e nunca em subscription_plan / member_category / stripe_subscription_id / is_active.
 *
 * Deteção pelo price id (env STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY) E pela metadata (`plan`), porque
 * as subscrições antigas podem ter sido criadas com outro preço mas com a metadata certa.
 *
 * Funções puras + um cliente "tipo supabase" injectado: é o que deixa testar sem Stripe nem BD.
 */

export const PLANO_ADDON_MTMCOPY = 'mtmcopy_addon_monthly'

/** Price id do addon, lido na hora (os testes mudam o env). */
export function precoAddonMtmcopy(): string {
  return sanitizeEnv(process.env.STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY)
}

export function ehPrecoAddon(priceId: unknown): boolean {
  const alvo = precoAddonMtmcopy()
  return Boolean(alvo) && typeof priceId === 'string' && priceId.trim() === alvo
}

function metadataDizAddon(meta: unknown): boolean {
  const m = (meta ?? {}) as Record<string, unknown>
  return m.plan === PLANO_ADDON_MTMCOPY || m.plan_id === PLANO_ADDON_MTMCOPY
}

type ItemLike = { price?: { id?: string | null; metadata?: unknown } | null; current_period_end?: number | null }
type SubLike = {
  id?: string
  status?: string
  metadata?: unknown
  current_period_end?: number | null
  items?: { data?: ItemLike[] }
}

/**
 * A subscrição é do addon? Sim se a metadata o diz, ou se TODOS os itens são o preço do addon.
 * "Todos" e não "algum": uma subscrição mista (rara) continua a ser do plano principal, e aí o
 * pior erro seria apagar o Premium de alguém.
 */
export function subscricaoEhAddon(sub: SubLike | null | undefined): boolean {
  if (!sub) return false
  if (metadataDizAddon(sub.metadata)) return true
  const itens = sub.items?.data ?? []
  if (!itens.length) return false
  return itens.every((i) => ehPrecoAddon(i.price?.id) || metadataDizAddon(i.price?.metadata))
}

type LinhaLike = {
  price?: { id?: string | null; metadata?: unknown } | null
  pricing?: { price_details?: { price?: string | null } | null } | null
  metadata?: unknown
  period?: { end?: number | null } | null
}
type FaturaLike = {
  id?: string | null
  amount_paid?: number | null
  amount_due?: number | null
  currency?: string | null
  subscription_details?: { metadata?: unknown } | null
  lines?: { data?: LinhaLike[] }
}

function precoDaLinha(l: LinhaLike): string | null {
  return l.price?.id ?? l.pricing?.price_details?.price ?? null
}

/** A fatura é do addon? Pela metadata da subscrição, ou todas as linhas com o preço do addon. */
export function faturaEhAddon(inv: FaturaLike | null | undefined): boolean {
  if (!inv) return false
  if (metadataDizAddon(inv.subscription_details?.metadata)) return true
  const linhas = inv.lines?.data ?? []
  if (!linhas.length) return false
  return linhas.every(
    (l) => ehPrecoAddon(precoDaLinha(l)) || metadataDizAddon(l.price?.metadata) || metadataDizAddon(l.metadata),
  )
}

/** current_period_end em ISO. Nas versões novas da API vive no item, não na subscrição. */
export function fimDoPeriodo(sub: SubLike): string | null {
  const noTopo = typeof sub.current_period_end === 'number' ? sub.current_period_end : 0
  const nosItens = Math.max(0, ...(sub.items?.data ?? []).map((i) => Number(i.current_period_end ?? 0)))
  const s = Math.max(noTopo, nosItens)
  return s > 0 ? new Date(s * 1000).toISOString() : null
}

export function fimDoPeriodoDaFatura(inv: FaturaLike): string | null {
  const s = Math.max(0, ...(inv.lines?.data ?? []).map((l) => Number(l.period?.end ?? 0)))
  return s > 0 ? new Date(s * 1000).toISOString() : null
}

/** O mínimo do cliente supabase que isto usa — para os testes passarem um falso. */
export interface DbLike {
  from(tabela: string): {
    update(v: Record<string, unknown>): { eq(col: string, val: unknown): PromiseLike<unknown> }
    insert(v: Record<string, unknown>): PromiseLike<unknown>
  }
}

const ESTADOS_COM_ACESSO = new Set(['active', 'trialing', 'past_due'])

/** customer.subscription.created/updated do addon. */
export async function addonSubscricaoAtualizada(db: DbLike, profileId: string, sub: SubLike) {
  const fim = fimDoPeriodo(sub)
  const ativo = ESTADOS_COM_ACESSO.has(String(sub.status ?? '')) && Boolean(fim)
  const patch: Record<string, unknown> = {
    mtmcopy_subscription_active: ativo,
    updated_at: new Date().toISOString(),
  }
  // Sem data não se grava null: o acesso legado exige um período datado.
  if (fim) patch.mtmcopy_subscription_expires_at = fim
  await db.from('profiles').update(patch).eq('id', profileId)
  return patch
}

/** customer.subscription.deleted do addon: só desliga o addon. O perfil fica como estava. */
export async function addonSubscricaoCancelada(db: DbLike, profileId: string) {
  const patch = { mtmcopy_subscription_active: false, updated_at: new Date().toISOString() }
  await db.from('profiles').update(patch).eq('id', profileId)
  return patch
}

/** invoice.payment_succeeded / payment_failed do addon. */
export async function addonPagamento(
  db: DbLike,
  profileId: string,
  inv: FaturaLike,
  estado: 'succeeded' | 'failed',
  billingCycle: string | null,
) {
  let patch: Record<string, unknown> | null = null
  if (estado === 'succeeded') {
    const fim = fimDoPeriodoDaFatura(inv)
    if (fim) {
      patch = {
        mtmcopy_subscription_active: true,
        mtmcopy_subscription_expires_at: fim,
        updated_at: new Date().toISOString(),
      }
      await db.from('profiles').update(patch).eq('id', profileId)
    }
  }
  // Uma falha do addon NÃO toca em payment_failed_count/subscription_status/is_active do perfil:
  // esses são do plano principal. O acesso do addon cai sozinho quando o período acaba.
  const registo: Record<string, unknown> = {
    user_id: profileId,
    stripe_invoice_id: inv.id ?? null,
    amount: estado === 'succeeded' ? inv.amount_paid ?? null : inv.amount_due ?? null,
    currency: inv.currency ?? null,
    status: estado,
    plan: PLANO_ADDON_MTMCOPY,
    source: 'stripe',
  }
  if (billingCycle) registo.billing_cycle = billingCycle
  await db.from('payment_history').insert(registo)
  return { patch, registo }
}
