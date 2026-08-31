import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { emitirLicenca, daquiAUmAno, normalizarLogin, type PlanoLicenca } from '@/lib/licencas'
import { licencaSenseiEmailTemplate } from '@/lib/email-templates'
import {
  brandedMailAttachments,
  createMailTransporter,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/**
 * O que acontece às licenças do EA quando o Stripe fala.
 *
 * Vive à parte do webhook geral porque o webhook já tem 600 linhas e cada produto que lá entra
 * torna mais difícil perceber o que corre para quem. Aqui a regra é uma só: o pagamento emite a
 * licença, a renovação estende-a, o cancelamento revoga-a.
 */

export const FONTE_CHECKOUT = 'sensei_ea_checkout'

const PLANOS: Record<string, PlanoLicenca> = {
  sensei_ea_annual: 'anual',
  sensei_ea_lifetime: 'vitalicia',
}

export function ehCheckoutDoEA(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.source === FONTE_CHECKOUT
}

async function enviarEmailDaLicenca(
  para: string,
  nome: string,
  chave: string,
  plano: PlanoLicenca,
  mt5Login: string | null,
  expiraEm: string | null,
) {
  try {
    const html = licencaSenseiEmailTemplate(nome, chave, plano, mt5Login, expiraEm, getSiteUrl())
    await createMailTransporter().sendMail({
      from: mailFrom(),
      to: para,
      subject: `A tua licença do MTM Sensei EA — ${chave}`,
      html: prepareBrandedEmailHtml(html),
      attachments: brandedMailAttachments(),
    })
  } catch (e) {
    // Falhar o email não pode falhar a emissão: a licença já existe e aparece na área de membro
    // e no admin. Melhor uma chave emitida sem email do que um pagamento sem licença.
    console.error('[LICENCAS] Falhou o email da licença:', e)
  }
}

/**
 * Pagamento concluído → licença emitida.
 *
 * Idempotente pelo id da sessão: o Stripe repete webhooks, e um cliente com duas chaves para o
 * mesmo pagamento é um problema de suporte que não se resolve sozinho.
 */
export async function emitirLicencaDoCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const planId = String(session.metadata?.plan ?? '')
  const plano = PLANOS[planId]
  if (!plano) {
    console.warn('[LICENCAS] Checkout do EA com plano desconhecido:', planId)
    return
  }

  const db = getSupabaseAdmin()
  const email = (session.metadata?.email || session.customer_details?.email || '').toLowerCase()
  const userId = session.metadata?.user_id || null
  const mt5Login = normalizarLogin(session.metadata?.mt5_login)
  const subId = typeof session.subscription === 'string' ? session.subscription : null
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : null

  const referencia = subId || piId || session.id
  const { data: jaExiste } = await db
    .from('licencas')
    .select('id')
    .eq('notas', `stripe:${referencia}`)
    .maybeSingle()
  if (jaExiste) return

  const licenca = await emitirLicenca({
    userId,
    email: email || null,
    plano,
    origem: 'stripe',
    mt5Login,
    contasPermitidas: 1,
    expiraEm: plano === 'anual' ? daquiAUmAno() : null,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    stripeSubscriptionId: subId,
    stripePaymentIntent: piId,
    notas: `stripe:${referencia}`,
  })

  if (email) {
    const nome = session.customer_details?.name || ''
    await enviarEmailDaLicenca(email, nome, licenca.chave, plano, licenca.mt5_login, licenca.expira_em)
  }

  console.log(`✅ [LICENCAS] Licença ${licenca.chave} (${plano}) emitida para ${email || userId}`)
}

/** Renovação anual paga → a licença dessa subscrição ganha mais um ano. */
export async function renovarLicencaDaSubscricao(subscriptionId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('licencas')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  if (!data) return

  await db
    .from('licencas')
    .update({ estado: 'ativa', expira_em: daquiAUmAno() })
    .eq('id', data.id)
  console.log(`🔁 [LICENCAS] Licença da subscrição ${subscriptionId} renovada por mais um ano`)
}

/** Subscrição cancelada → licença revogada. Vitalícias não têm subscrição, logo não passam aqui. */
export async function revogarLicencaDaSubscricao(subscriptionId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('licencas')
    .select('id, chave')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  if (!data) return

  await db.from('licencas').update({ estado: 'revogada' }).eq('id', data.id)
  console.log(`🚫 [LICENCAS] Licença ${data.chave} revogada (subscrição cancelada)`)
}
