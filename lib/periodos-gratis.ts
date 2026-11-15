import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  ORIGEM_CAMPANHA_90D,
  PLANO_DURANTE_CAMPANHA,
  origemDoPeriodoGratis,
  type OrigemPeriodoGratis,
} from '@/lib/stripe-checkout-premium'

/**
 * Períodos grátis com subscrição Stripe: o trial de 3 dias (sem cartão) e a campanha 90 dias.
 *
 * A fonte de verdade é a subscrição no Stripe (trial_end, estado). A tabela `periodos_gratis`
 * (migração 237) é o espelho que o admin, o backoffice e o MLM lêem sem ir ao Stripe.
 *
 * Fecho: sem método de pagamento no fim, o Stripe cancela a subscrição. O webhook escreve
 * `inactive_reason = 'trial_sem_pagamento'` e o middleware manda a pessoa para /ativar-premium.
 */

export const MOTIVO_FIM_SEM_PAGAMENTO = 'trial_sem_pagamento'

export type EstadoPeriodoGratis = 'a_decorrer' | 'convertido' | 'terminado_sem_pagamento' | 'cancelado'

export interface LinhaPeriodoGratis {
  stripe_subscription_id: string
  user_id: string | null
  stripe_customer_id: string | null
  origem: OrigemPeriodoGratis
  inicio: string | null
  fim: string | null
  estado: EstadoPeriodoGratis
  tem_metodo_pagamento: boolean
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null)

function temMetodoPagamento(sub: Stripe.Subscription): boolean {
  return Boolean(sub.default_payment_method || sub.default_source)
}

/** O plano que vale enquanto o período grátis dura (Membro na campanha). */
export function planoEfetivo(sub: Stripe.Subscription, planIdDoPreco: string): string {
  const origem = origemDoPeriodoGratis(sub.metadata)
  if (origem === ORIGEM_CAMPANHA_90D && sub.status === 'trialing') return PLANO_DURANTE_CAMPANHA
  return planIdDoPreco
}

/** A subscrição acabou dentro (ou no fim) do período grátis, sem nunca ter sido paga. */
export function terminouNoPeriodoGratis(sub: Stripe.Subscription): boolean {
  if (!origemDoPeriodoGratis(sub.metadata)) return false
  if (!sub.trial_end) return false
  const fim = sub.ended_at ?? sub.canceled_at ?? Math.floor(Date.now() / 1000)
  // Um dia de folga: o Stripe cancela no fim do trial, às vezes uns minutos depois.
  return fim <= sub.trial_end + 86_400
}

function estadoDe(sub: Stripe.Subscription): EstadoPeriodoGratis {
  if (sub.status === 'trialing') return 'a_decorrer'
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return terminouNoPeriodoGratis(sub) ? 'terminado_sem_pagamento' : 'cancelado'
  }
  return 'convertido'
}

/**
 * Espelha a subscrição em `periodos_gratis` e, enquanto o período dura, a data de fim no perfil
 * (`trial_expires_at`). Não faz nada a subscrições sem período grátis. Nunca lança.
 */
export async function sincronizarPeriodoGratis(
  sub: Stripe.Subscription,
  userId?: string | null,
): Promise<void> {
  const origem = origemDoPeriodoGratis(sub.metadata)
  if (!origem) return
  const db = getSupabaseAdmin()
  try {
    let uid = userId ?? null
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
    if (!uid && customerId) {
      const { data } = await db.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      uid = (data?.id as string | undefined) ?? null
    }
    const estado = estadoDe(sub)
    const linha: LinhaPeriodoGratis = {
      stripe_subscription_id: sub.id,
      user_id: uid,
      stripe_customer_id: customerId,
      origem,
      inicio: iso(sub.trial_start),
      fim: iso(sub.trial_end),
      estado,
      tem_metodo_pagamento: temMetodoPagamento(sub),
    }
    await db
      .from('periodos_gratis')
      .upsert({ ...linha, atualizado_em: new Date().toISOString() }, { onConflict: 'stripe_subscription_id' })

    if (uid && estado === 'a_decorrer') {
      await db
        .from('profiles')
        .update({ trial_expires_at: linha.fim, subscription_status: 'trialing' })
        .eq('id', uid)
    }
    if (uid && estado === 'convertido') {
      // Pagou: limpa um fecho anterior por falta de pagamento (não mexe noutras suspensões).
      await db
        .from('profiles')
        .update({ inactive_reason: null, inactive_since: null, access_revoked_at: null })
        .eq('id', uid)
        .eq('inactive_reason', MOTIVO_FIM_SEM_PAGAMENTO)
    }
  } catch (err) {
    console.error('[periodos-gratis] falhou sincronizar', sub.id, err)
  }
}
