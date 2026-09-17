/**
 * Quem paga a renovação e como — regra única dos crons de subscrição (17/09).
 *
 * Até aqui o cron `member-subscriptions` dava +30 dias a toda a gente com
 * `subscription_auto_renew !== false`, e esse campo é `true` por defeito. Resultado: contas
 * manuais (Skool, Premium concedido) renovavam de graça todos os meses, e o aviso de renovação
 * dizia-lhes «renova automaticamente e serão cobrados» sem haver nada para cobrar.
 *
 * Agora «renova sozinha» só é verdade quando existe um débito real a correr:
 *  - `isento`       → admin ou VIP. Não se cobra (decisão do dono); o acesso estende-se.
 *  - `stripe`       → subscrição Stripe activa (não past_due) e sem cancelamento marcado. A data vem da Stripe.
 *  - `app_store`    → subscrição Apple activa. As notificações da Apple mantêm a data.
 *  - `cobrar`       → tudo o resto. No fim do período o acesso fica em pausa até pagar pela Stripe.
 */

export type ClasseRenovacao = 'isento' | 'stripe' | 'app_store' | 'cobrar'

export interface PerfilRenovacao {
  user_type?: string | null
  member_category?: string | null
  subscription_platform?: string | null
  subscription_status?: string | null
  subscription_auto_renew?: boolean | null
  stripe_subscription_id?: string | null
}

export interface EstadoStripe {
  /** active | trialing | past_due | canceled | … ; null = não foi possível ler */
  status: string | null
  cancelaNoFim: boolean
  /** Fim do período pago, em ISO. */
  fimPeriodo: string | null
}

// past_due fica de fora: o pagamento falhou; o acesso volta quando a Stripe cobrar (webhook).
const STRIPE_A_COBRAR = new Set(['active', 'trialing'])

export function eIsento(p: PerfilRenovacao): boolean {
  return p.user_type === 'admin' || p.user_type === 'vip' || p.member_category === 'vip'
}

export function classificarRenovacao(p: PerfilRenovacao, stripe: EstadoStripe | null): ClasseRenovacao {
  if (eIsento(p)) return 'isento'
  if (p.stripe_subscription_id && stripe && stripe.status && STRIPE_A_COBRAR.has(stripe.status) && !stripe.cancelaNoFim) {
    return 'stripe'
  }
  if (p.subscription_platform === 'app_store' && p.subscription_auto_renew !== false && p.subscription_status === 'active') {
    return 'app_store'
  }
  return 'cobrar'
}

/** Lê a subscrição na Stripe. Falha de rede → null (o chamador decide não mexer). */
export async function lerEstadoStripe(subscriptionId: string | null | undefined): Promise<EstadoStripe | null> {
  if (!subscriptionId) return null
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  try {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 404) return { status: 'canceled', cancelaNoFim: false, fimPeriodo: null }
    if (!r.ok) return null
    const s = (await r.json()) as {
      status?: string
      cancel_at_period_end?: boolean
      current_period_end?: number
      items?: { data?: { current_period_end?: number }[] }
    }
    const fim = s.items?.data?.[0]?.current_period_end ?? s.current_period_end ?? null
    return {
      status: s.status ?? null,
      cancelaNoFim: s.cancel_at_period_end === true,
      fimPeriodo: fim ? new Date(fim * 1000).toISOString() : null,
    }
  } catch {
    return null
  }
}
