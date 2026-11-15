import type Stripe from 'stripe'

/**
 * As duas portas do Premium mensal (decisão do Ricardo, 26/10/2026):
 *
 *   1. **3 dias grátis SEM cartão** (06/11/2026) — nada cobrado nem pedido nos 3 dias. Ao fim
 *      deles, sem método de pagamento, o Stripe cancela a subscrição e o acesso fecha com a página
 *      /ativar-premium, que abre o checkout dos 65 €/mês. Quem puser cartão antes continua sem corte.
 *   2. **Ativar já** — a 1.ª mensalidade fica a 35 € (cupão abaixo), as seguintes a 65 €.
 *
 * Antes o trial levava o cupão de 34,99 € para depois dos 3 dias e o «pagar já» não levava
 * nenhum: quem escolhia ativar logo pagava 65 € e quem testava pagava menos. Ficou ao contrário.
 */

/** Cupão Stripe de uma só vez: 30 € de desconto → 1.º mês a 35 €. */
export const CUPAO_INTRO_PREMIUM = 'INTRO_PREMIUM_35'

export const DIAS_TRIAL_PREMIUM = 3

/**
 * Campanha 90 dias (06/11/2026): quem chega com experiência anterior noutras plataformas de
 * educação digital usa este cupão. Regista-se como Membro (app MTM System; o MTM Auto paga-se à
 * parte), nada é cobrado nos 90 dias e no fim passa a Premium a 65 €/mês.
 * O código público nunca nomeia nenhuma plataforma.
 */
export const CUPAO_CAMPANHA_90D = '90DAYSPREVIOUSXP'
export const DIAS_CAMPANHA_90D = 90
/**
 * A campanha pede o cartão no registo (cobra só ao fim dos 90 dias). Pôr `false` passa-a a sem
 * cartão como o trial: no fim, sem método de pagamento, fecha com a página /ativar-premium.
 */
export const CAMPANHA_90D_PEDE_CARTAO = true

/** Etiqueta gravada no metadata da subscrição e na tabela `periodos_gratis`. */
export type OrigemPeriodoGratis = 'trial_3d' | 'campanha_90d'
export const ORIGEM_TRIAL: OrigemPeriodoGratis = 'trial_3d'
export const ORIGEM_CAMPANHA_90D: OrigemPeriodoGratis = 'campanha_90d'

/** O plano que a pessoa tem DURANTE os 90 dias da campanha: Membro, não Premium. */
export const PLANO_DURANTE_CAMPANHA = 'app_member_monthly'

export function ehCupaoCampanha90d(codigo: unknown): boolean {
  return typeof codigo === 'string' && codigo.trim().toUpperCase() === CUPAO_CAMPANHA_90D
}

/** Origem do período grátis a partir do metadata da subscrição Stripe. */
export function origemDoPeriodoGratis(metadata?: Record<string, string> | null): OrigemPeriodoGratis | null {
  const o = metadata?.periodo_gratis
  return o === ORIGEM_TRIAL || o === ORIGEM_CAMPANHA_90D ? o : null
}

/**
 * A nota que aparece por cima do botão de pagar do Stripe. Diz porque é que o cartão é pedido
 * mesmo quando nada é cobrado — sem ela, o trial parecia uma cobrança disfarçada.
 */
export function notaMetodoPagamento(trial: boolean): string {
  if (trial) {
    return `Não pedimos cartão nem cobramos nada nos ${DIAS_TRIAL_PREMIUM} dias grátis. Ao fim deles, se quiseres continuar, ativas o Premium a 65 €/mês. Cancelas quando quiseres, sem compromisso.`
  }
  const porque =
    'Nos termos da nossa Política de Privacidade e da Política de Devolução, o método de pagamento tem de ser inserido para ativar o acesso.'
  return `${porque} Cancelas quando quiseres, sem fidelização.`
}

/** Nota da campanha 90 dias: cartão agora, nada cobrado nos 90 dias, depois Premium. */
export function notaCampanha90d(): string {
  return CAMPANHA_90D_PEDE_CARTAO
    ? `Não cobramos nada nos ${DIAS_CAMPANHA_90D} dias. Ao fim deles passas a Premium a 65 €/mês. Cancelas quando quiseres antes disso, sem compromisso.`
    : `Não pedimos cartão nem cobramos nada nos ${DIAS_CAMPANHA_90D} dias. Ao fim deles, se quiseres continuar, ativas o Premium a 65 €/mês.`
}

/**
 * Recolha completa no Stripe: morada de faturação, telemóvel e a nota do cartão.
 * Junta-se a qualquer sessão de subscrição Premium.
 */
export function recolhaCompleta(trial: boolean): Pick<
  Stripe.Checkout.SessionCreateParams,
  'billing_address_collection' | 'phone_number_collection' | 'custom_text'
> {
  // Trial sem cartão: um clique. A morada e o telemóvel pedem-se quando a pessoa ativar.
  if (trial) return { custom_text: { submit: { message: notaMetodoPagamento(true) } } }
  return {
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    custom_text: { submit: { message: notaMetodoPagamento(trial) } },
  }
}

/**
 * Um código de cupão plausível. O preenchimento automático do browser metia o email no campo do
 * cupão (aconteceu a 26/10): o código «cupão» desligava o trial e o Stripe cobrava 65 € a seco.
 */
export function pareceCupao(codigo: unknown): codigo is string {
  if (typeof codigo !== 'string') return false
  const c = codigo.trim()
  return c.length >= 3 && c.length <= 40 && /^[A-Za-z0-9_-]+$/.test(c)
}

/**
 * Parâmetros do trial de 3 dias SEM cartão numa sessão de checkout de subscrição.
 * O Stripe não mostra campos de cartão (`if_required`) e, se no fim não houver método de
 * pagamento, cancela a subscrição — o webhook fecha o acesso com `trial_sem_pagamento`.
 */
export function paramsTrialSemCartao(): Pick<
  Stripe.Checkout.SessionCreateParams,
  'payment_method_collection' | 'subscription_data'
> {
  return {
    payment_method_collection: 'if_required',
    subscription_data: {
      trial_period_days: DIAS_TRIAL_PREMIUM,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: { periodo_gratis: ORIGEM_TRIAL },
    },
  }
}

/** Parâmetros da campanha 90 dias (preço Premium, 90 dias grátis, Membro durante o período). */
export function paramsCampanha90d(): Pick<
  Stripe.Checkout.SessionCreateParams,
  'payment_method_collection' | 'subscription_data' | 'custom_text'
> {
  return {
    payment_method_collection: CAMPANHA_90D_PEDE_CARTAO ? 'always' : 'if_required',
    custom_text: { submit: { message: notaCampanha90d() } },
    subscription_data: {
      trial_period_days: DIAS_CAMPANHA_90D,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: { periodo_gratis: ORIGEM_CAMPANHA_90D, plano_durante: PLANO_DURANTE_CAMPANHA },
    },
  }
}
