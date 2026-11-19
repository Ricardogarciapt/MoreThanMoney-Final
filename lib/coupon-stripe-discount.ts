import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  avaliarCupao,
  MENSAGEM_RECUSA,
  planoParaCupao,
  TIPOS_DE_CHECKOUT,
  type CupaoRow,
} from '@/lib/cupoes-codigo'

export type CupaoNoCheckout =
  | {
      ok: true
      cupao: CupaoRow
      /** Plano a cobrar — o do cupão quando o formulário pediu outro. */
      planId: string
      /** Promotion code Stripe a aplicar na sessão. */
      promotionCodeId: string | null
      /** Sem promotion code: meses grátis como trial (só cupões `free_*` sem Stripe). */
      trialDays: number | null
    }
  | { ok: false; erro: string; codigo: 'CUPAO_INVALIDO' | 'PARTNERSHIP_COUPON' }

/**
 * Decide o que um cupão faz numa sessão de checkout de subscrição para um utilizador novo.
 * Valida tudo (datas, usos reais, plano) — um cupão inválido devolve erro em vez de seguir em
 * silêncio para um preço que a pessoa não esperava.
 */
export async function resolverCupaoCheckout(codigo: string, planIdPedido: string): Promise<CupaoNoCheckout> {
  const r = await avaliarCupao(getSupabaseAdmin(), codigo)
  if (!r.ok) return { ok: false, erro: MENSAGEM_RECUSA[r.motivo], codigo: 'CUPAO_INVALIDO' }
  const cupao = r.cupao

  if (cupao.type === 'partnership') {
    return {
      ok: false,
      erro: 'Cupão de parceria: concede acesso sem cartão — usa o fluxo de resgate.',
      codigo: 'PARTNERSHIP_COUPON',
    }
  }
  if (!TIPOS_DE_CHECKOUT.has(cupao.type) || cupao.marketplace_produto_id || cupao.marketplace_educator_id) {
    return { ok: false, erro: MENSAGEM_RECUSA.plano_errado, codigo: 'CUPAO_INVALIDO' }
  }

  const planId = planoParaCupao(cupao.plan_override, planIdPedido)
  if (!planId) return { ok: false, erro: MENSAGEM_RECUSA.plano_errado, codigo: 'CUPAO_INVALIDO' }

  if (cupao.stripe_promotion_code_id) {
    return { ok: true, cupao, planId, promotionCodeId: cupao.stripe_promotion_code_id, trialDays: null }
  }
  // Sem Stripe: só os `free_*` têm tradução segura (meses → trial). Um desconto em % sem promotion
  // code não se consegue aplicar — antes caía no 1.º mês a 35 € e a pessoa via «50 % aplicado».
  if (cupao.type === 'free_months' || cupao.type === 'free_subscription') {
    const meses = Math.max(1, Math.min(24, Math.round(Number(cupao.discount_value) || 1)))
    return { ok: true, cupao, planId, promotionCodeId: null, trialDays: meses * 30 }
  }
  return { ok: false, erro: 'Este cupão ainda não está ligado ao pagamento. Fala connosco.', codigo: 'CUPAO_INVALIDO' }
}
