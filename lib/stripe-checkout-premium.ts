import type Stripe from 'stripe'

/**
 * As duas portas do Premium mensal (decisão do Ricardo, 26/10/2026):
 *
 *   1. **3 dias grátis** — cartão agora, nada cobrado nos 3 dias, ao 4.º dia 65 €/mês.
 *   2. **Ativar já** — a 1.ª mensalidade fica a 35 € (cupão abaixo), as seguintes a 65 €.
 *
 * Antes o trial levava o cupão de 34,99 € para depois dos 3 dias e o «pagar já» não levava
 * nenhum: quem escolhia ativar logo pagava 65 € e quem testava pagava menos. Ficou ao contrário.
 */

/** Cupão Stripe de uma só vez: 30 € de desconto → 1.º mês a 35 €. */
export const CUPAO_INTRO_PREMIUM = 'INTRO_PREMIUM_35'

export const DIAS_TRIAL_PREMIUM = 3

/**
 * A nota que aparece por cima do botão de pagar do Stripe. Diz porque é que o cartão é pedido
 * mesmo quando nada é cobrado — sem ela, o trial parecia uma cobrança disfarçada.
 */
export function notaMetodoPagamento(trial: boolean): string {
  const porque =
    'Nos termos da nossa Política de Privacidade e da Política de Devolução, o método de pagamento tem de ser inserido para ativar o acesso.'
  return trial
    ? `${porque} Não cobramos nada nos ${DIAS_TRIAL_PREMIUM} dias grátis; ao fim deles cobramos 65 €/mês. Cancelas quando quiseres antes disso.`
    : `${porque} Cancelas quando quiseres, sem fidelização.`
}

/**
 * Recolha completa no Stripe: morada de faturação, telemóvel e a nota do cartão.
 * Junta-se a qualquer sessão de subscrição Premium.
 */
export function recolhaCompleta(trial: boolean): Pick<
  Stripe.Checkout.SessionCreateParams,
  'billing_address_collection' | 'phone_number_collection' | 'custom_text'
> {
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
