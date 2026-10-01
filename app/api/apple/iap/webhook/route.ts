import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { verifyAppleTransaction, verifyAppleNotification } from '@/lib/apple-iap-verify'
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionRenewal,
  processMlmSubscriptionSignup,
} from '@/lib/mlm-subscription-integration'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'
import { estornarVenda, registarVendaConfirmada } from '@/lib/vendas/livro'

const supabase = getSupabaseAdmin()

// POST /api/apple/iap/webhook
// Recebe notificações do App Store Server (renovações, cancelamentos, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const signedPayload = body.signedPayload as string
    if (!signedPayload) {
      return NextResponse.json({ error: 'signedPayload obrigatório' }, { status: 400 })
    }

    // Verificação CRIPTOGRÁFICA da notificação assinada (App Store Server V2).
    const notification = await verifyAppleNotification(signedPayload)
    if (!notification) {
      return NextResponse.json({ error: 'Assinatura da notificação inválida' }, { status: 400 })
    }

    const notificationType = notification.notificationType as string
    const subtype          = notification.subtype as string | undefined
    const data             = notification.data as Record<string, unknown> | undefined

    console.log(`[APPLE-WEBHOOK] ${notificationType}/${subtype ?? '-'}`)

    if (!data) {
      return NextResponse.json({ ok: true })
    }

    const signedTransactionInfo = data.signedTransactionInfo as string | undefined
    const tx      = signedTransactionInfo ? await verifyAppleTransaction(signedTransactionInfo) : null

    if (!tx) {
      return NextResponse.json({ ok: true })
    }

    const originalTxId = String(tx.originalTransactionId ?? tx.original_transaction_id ?? '')
    const transactionId = String(tx.transactionId ?? tx.transaction_id ?? originalTxId)
    const productId    = tx.productId    as string
    const expiresDateMs = (tx.expiresDate ?? tx.expires_date_ms ?? 0) as number
    const expiresAt    = expiresDateMs ? new Date(expiresDateMs).toISOString() : null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscription_renewal_count, mlm_sponsor_username')
      .eq('apple_original_transaction_id', originalTxId)
      .maybeSingle()

    if (!profile) {
      console.warn(`[APPLE-WEBHOOK] Utilizador não encontrado para tx=${originalTxId}`)
      return NextResponse.json({ ok: true })
    }

    const userId = profile.id
    const isRenewal = notificationType === 'DID_RENEW'

    switch (notificationType) {
      case 'DID_RENEW':
      case 'SUBSCRIBED':
      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (subtype !== 'AUTO_RENEW_DISABLED') {
          const profileUpdate: Record<string, unknown> = {
            subscription_status:     'active',
            subscription_expires_at: expiresAt,
            next_billing_at:         expiresAt,
            is_active:               true,
            subscription_platform:   'app_store',
            updated_at:              new Date().toISOString(),
          }
          if (isRenewal) {
            profileUpdate.subscription_renewal_count =
              (profile.subscription_renewal_count || 0) + 1
          }
          await supabase.from('profiles').update(profileUpdate).eq('id', userId)
        } else {
          await supabase.from('profiles').update({
            next_billing_at: null,
            updated_at:      new Date().toISOString(),
          }).eq('id', userId)
        }
        break
      }

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED': {
        await supabase.from('profiles').update({
          subscription_status: 'expired',
          is_active:           false,
          updated_at:          new Date().toISOString(),
        }).eq('id', userId)
        break
      }

      case 'REFUND':
      case 'REVOKE': {
        await supabase.from('profiles').update({
          subscription_status:     'cancelled',
          is_active:               false,
          subscription_expires_at: new Date().toISOString(),
          updated_at:              new Date().toISOString(),
        }).eq('id', userId)
        break
      }

      case 'DID_CHANGE_RENEWAL_PREF': {
        if (productId) {
          const { productToSubscriptionPlan } = await import('@/lib/apple-iap')
          const { plan, category, billing }   = productToSubscriptionPlan(productId)
          await supabase.from('profiles').update({
            subscription_plan:          plan,
            member_category:            category,
            subscription_billing_cycle: billing,
            updated_at:                 new Date().toISOString(),
          }).eq('id', userId)
        }
        break
      }

      default:
        console.log(`[APPLE-WEBHOOK] Tipo não tratado: ${notificationType}`)
    }

    if (productId && (notificationType === 'DID_RENEW' || notificationType === 'SUBSCRIBED')) {
      try {
        const mlmCtx = appleMlmContext(productId)
        if (isRenewal) {
          await processMlmSubscriptionRenewal(supabase, {
            userId,
            sponsorUsername: profile.mlm_sponsor_username,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference('renewal', transactionId),
          })
        } else {
          await processMlmSubscriptionSignup(supabase, {
            userId,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference('purchase', transactionId),
            platform: 'apple',
          })
          if (notificationType === 'SUBSCRIBED') {
            void sendNewMemberWelcomeIfEligible({
              userId,
              source: 'app_store',
              planId: mlmCtx.planId,
              notifyTeam: true,
              eventId: `apple_webhook_${transactionId}`,
            })
          }
        }
      } catch (mlmErr) {
        console.error('[APPLE-WEBHOOK] MLM error:', mlmErr)
      }

      // A VENDA, para o livro da equipa. Estava a faltar: até 26/09 nenhum dos caminhos da Apple
      // escrevia em `vendas_vendas`, e por isso uma compra feita na app nunca pagava comissão a
      // quem a trabalhou — só o binário. Quem vende pela app é a mesma equipa que vende pelo site.
      //
      // A referência é o `transactionId` (não o `original`): cada renovação traz o seu, e é ele que
      // faz de chave de deduplicação. O mesmo id chega por aqui e por `/api/apple/iap/validate`
      // quando a app confirma a compra — a idempotência do livro é que garante que só conta uma vez.
      try {
        const ctx = appleMlmContext(productId)
        await registarVendaConfirmada(supabase, {
          fonte: 'apple',
          referencia: transactionId,
          compradorId: userId,
          pack: ctx.planId,
          valorCents: ctx.amountCents,
          moeda: ctx.currency,
          tipo: isRenewal ? 'renovacao' : 'primeira',
          pagoEm: typeof tx.purchaseDate === 'number' ? new Date(tx.purchaseDate).toISOString() : undefined,
          nota: `App Store — ${productId}`,
          /**
           * SEM código de agente, e declarado em vez de omitido.
           *
           * Uma notificação da Apple é servidor-para-servidor: não traz browser, não traz cookie e
           * não traz nada que a app tenha guardado. Não há aqui nenhum código a passar.
           *
           * O que havia a fazer e NÃO se faz: ir buscar o código à primeira venda do mesmo
           * `originalTransactionId`, ou ao perfil do comprador. A primeira era carimbar todas as
           * renovações com um link clicado uma vez; a segunda é a ligação fraca que fez toda a
           * receita de 01/10 cair em «sem_codigo». As duas davam números que ninguém pode
           * contestar porque ninguém sabe de onde vêm — e a régua de vida mata agentes com eles.
           *
           * Quando a compra também passa por `/api/apple/iap/validate` (a app a confirmar), é essa
           * que registra primeiro e é essa que pode trazer código: a idempotência do livro garante
           * que o que chegar depois não apaga nada.
           */
          agenteCodigo: null,
        })
      } catch (vendaErr) {
        // O acesso já foi dado e o dinheiro já entrou: um erro no livro não pode fazer a Apple
        // repetir a notificação. Fica no log e relança-se à mão no admin (a referência é única).
        console.error('[VENDAS] não foi possível registar a venda da Apple no livro:', vendaErr)
      }
    }

    // Devolução do lado da Apple → reverter o que ela pagou, como já se faz no Stripe. Sem isto, um
    // reembolso deixava a comissão em pé e a equipa ficava paga por dinheiro que voltou para trás.
    if (notificationType === 'REFUND' || notificationType === 'REVOKE') {
      try {
        const r = await estornarVenda(supabase, {
          fonte: 'apple',
          referencias: [transactionId, originalTxId].filter(Boolean),
          motivo: `Apple ${notificationType}`,
          cents: null,
        })
        console.log('[VENDAS] devolução da Apple processada', { transactionId, ...r })
      } catch (estornoErr) {
        console.error('[VENDAS] não foi possível reverter a venda da Apple:', estornoErr)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[APPLE-WEBHOOK] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
