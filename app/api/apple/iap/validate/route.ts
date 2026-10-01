import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { productToSubscriptionPlan, APPLE_BUNDLE_ID } from '@/lib/apple-iap'
import { verifyAppleTransaction } from '@/lib/apple-iap-verify'
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionSignup,
} from '@/lib/mlm-subscription-integration'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

const supabase = getSupabaseAdmin()

/** Alerta o admin (DM) quando uma compra Apple colide com uma subscrição Stripe ativa. */
async function alertCrossChannelConflict(opts: {
  userId: string
  email?: string
  stripeSubscriptionId?: string | null
  applePlan: string
}): Promise<void> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .maybeSingle()
    const adminChatId = data?.value ? String(data.value).replace(/["\s]/g, '') : ''
    if (!adminChatId) return
    await sendTelegramChannelMessage(
      adminChatId,
      `⚠️ DUPLA SUBSCRIÇÃO — o utilizador ${opts.email ?? opts.userId} comprou "${opts.applePlan}" na App Store ` +
        `mas já tinha uma subscrição STRIPE ativa (${opts.stripeSubscriptionId ?? '?'}).\n\n` +
        `A compra Apple foi honrada (já foi cobrada). Cancela a subscrição Stripe no fim do período para evitar dupla cobrança.`,
    )
  } catch {
    /* alerta best-effort */
  }
}

// POST /api/apple/iap/validate
// Recebe o JWS token de StoreKit 2, activa a subscrição em Supabase e regista o cupão se aplicável.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      jwsToken,
      userId,          // UUID do utilizador no Supabase (se já autenticado)
      email,           // email para criar conta (se novo utilizador)
      couponCode,      // código de cupão aplicado (opcional)
      agenteCodigo,    // código do agente que trouxe esta compra (opcional) — ver a venda, abaixo
      sponsorUsername, // patrocinador MLM (ref=username)
      environment,     // 'production' | 'sandbox'
    } = body

    if (!jwsToken) {
      return NextResponse.json({ error: 'jwsToken obrigatório' }, { status: 400 })
    }

    // Verificação CRIPTOGRÁFICA da signed transaction (StoreKit 2) contra os certificados
    // raiz da Apple. Se a assinatura não for válida, rejeita (evita ativação por pedido forjado).
    const txPayload = await verifyAppleTransaction(jwsToken)
    if (!txPayload) {
      return NextResponse.json({ error: 'Assinatura da transação inválida' }, { status: 400 })
    }

    const productId            = txPayload.productId as string
    const transactionId        = String(txPayload.transactionId ?? txPayload.transaction_id ?? '')
    const originalTransactionId = String(txPayload.originalTransactionId ?? txPayload.original_transaction_id ?? transactionId)
    const expiresDateMs        = (txPayload.expiresDate as number) ?? (txPayload.expires_date_ms as number) ?? 0
    const bundleId             = txPayload.bundleId as string ?? txPayload.bundle_id as string

    if (bundleId && bundleId !== APPLE_BUNDLE_ID) {
      return NextResponse.json({ error: 'Bundle ID inválido' }, { status: 400 })
    }

    const { plan, category, billing } = productToSubscriptionPlan(productId)
    const expiresAt = expiresDateMs ? new Date(expiresDateMs).toISOString() : null

    // Verificar se transacção já foi processada (idempotência)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .eq('apple_original_transaction_id', originalTransactionId)
      .maybeSingle()

    let resolvedUserId = userId || existing?.id

    if (!resolvedUserId) {
      const authHeader = req.headers.get('authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token)
        if (userData?.user?.id) resolvedUserId = userData.user.id
      }
    }

    if (!resolvedUserId) {
      // Tentar encontrar por email
      if (email) {
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle()
        resolvedUserId = byEmail?.id
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json({
        error: 'Utilizador não encontrado. Cria conta primeiro.',
        requiresRegistration: true,
        transactionId,
        originalTransactionId,
        productId,
        plan,
        category,
        billing,
        expiresAt,
      }, { status: 404 })
    }

    const sponsor = (sponsorUsername as string | undefined)?.trim()

    // Guard cross-canal: detectar subscrição Stripe ATIVA antes de marcar app_store.
    // Honramos a compra Apple (já foi cobrada), mas alertamos p/ reconciliação e mantemos
    // o stripe_subscription_id (não é apagado) para o admin poder cancelar a do Stripe.
    const { data: current } = await supabase
      .from('profiles')
      .select('email, subscription_platform, subscription_status, stripe_subscription_id')
      .eq('id', resolvedUserId)
      .maybeSingle()
    const hadActiveStripe =
      current?.subscription_status === 'active' &&
      current?.subscription_platform === 'stripe' &&
      !!current?.stripe_subscription_id

    // Activar subscrição no Supabase
    const updatePayload: Record<string, unknown> = {
      subscription_plan:          plan,
      member_category:            category,
      subscription_billing_cycle: billing,
      subscription_status:        'active',
      subscription_platform:      'app_store',
      subscription_expires_at:    expiresAt,
      next_billing_at:            expiresAt,
      user_type:                  'member',
      is_active:                  true,
      apple_original_transaction_id: originalTransactionId,
      apple_product_id:           productId,
      updated_at:                 new Date().toISOString(),
    }

    if (sponsor) {
      updatePayload.mlm_sponsor_username = sponsor
    }

    // Registar cupão se fornecido
    const couponUpper = (couponCode || '').trim().toUpperCase()
    if (couponUpper) {
      updatePayload.coupon_code = couponUpper
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', resolvedUserId)

    if (updateError) {
      console.error('[APPLE-IAP] Erro ao activar subscrição:', updateError)
      return NextResponse.json({ error: 'Erro ao activar subscrição' }, { status: 500 })
    }

    // Registar uso de cupão na tabela coupon_usages
    if (couponUpper) {
      try {
        const { data: coupon } = await supabase
          .from('coupons')
          .select('id')
          .eq('code', couponUpper)
          .eq('is_active', true)
          .maybeSingle()

        if (coupon) {
          await supabase.from('coupon_usages').upsert(
            { coupon_id: coupon.id, user_id: resolvedUserId, context: 'apple_iap' },
            { onConflict: 'coupon_id,user_id' }
          )
          // NAO se incrementa aqui o coupons.used_count. O que estava neste sitio nao funcionava
          // de duas maneiras: a RPC `increment_coupon_usage` nao existe na base, e o "fallback"
          // gravava `used_count: supabase.rpc as unknown as number` — uma funcao passada como
          // numero, que o JSON.stringify deixa cair. Resultado: o contador ficou sempre a 0, e
          // por isso o limite `max_uses` verificado em /api/apple/iap/sign-offer NUNCA dispara.
          // O uso real fica registado acima em coupon_usages (unico por cupao+utilizador).
          // Falta decidir como contar: criar a RPC atomica, ou passar a contar coupon_usages.
        }
      } catch (couponErr) {
        console.error('[APPLE-IAP] Erro ao registar cupão:', couponErr)
      }
    }

    // MLM: comissão directa + árvore (primeira compra / restore idempotente)
    try {
      const mlmCtx = appleMlmContext(productId, plan)
      await processMlmSubscriptionSignup(supabase, {
        userId: resolvedUserId,
        sponsorUsername: sponsor,
        planId: mlmCtx.planId,
        amountCents: mlmCtx.amountCents,
        currency: mlmCtx.currency,
        paymentReference: applePaymentReference('purchase', transactionId || originalTransactionId),
        platform: 'apple',
      })
    } catch (mlmErr) {
      console.error('[APPLE-IAP] Erro MLM signup:', mlmErr)
    }

    // A VENDA, para o livro da equipa. O MLM acima já era chamado daqui; o livro não era — e por
    // isso uma compra na app nunca pagava a quem a trabalhou. A referência é o `transactionId`, a
    // mesma que `/api/apple/iap/webhook` usa: quem chegar primeiro registra, o segundo não duplica.
    //
    // A assinatura da transacção já foi verificada acima contra a raiz da Apple — é isso que faz
    // deste sítio um lugar legítimo para criar dinheiro a pagar. Não se acrescenta o mesmo em
    // `/api/subscriptions/apple-server-notifications` de propósito: essa rota descodifica o JWS sem
    // verificar a assinatura, e um payload forjado passaria a criar comissões.
    try {
      const { registarVendaConfirmada } = await import('@/lib/vendas/livro')
      const ctx = appleMlmContext(productId, plan)
      await registarVendaConfirmada(supabase, {
        fonte: 'apple',
        referencia: transactionId || originalTransactionId,
        compradorId: resolvedUserId,
        pack: ctx.planId,
        valorCents: ctx.amountCents,
        moeda: ctx.currency,
        // Restaurar uma compra antiga não é uma venda nova: quando a subscrição já estava activa,
        // isto é uma renovação (ou um restore), e o residual é que se aplica — não os 35 % do
        // primeiro pagamento. O livro conta o número do pagamento e trata do resto.
        tipo: existing?.subscription_status === 'active' ? 'renovacao' : 'primeira',
        nota: `App Store — ${productId}`,
        /**
         * O agente que trouxe esta compra, SE a app o mandar.
         *
         * ── PORQUE É QUE VEM DO CORPO E NÃO DE UM COOKIE ──
         *
         * Uma compra StoreKit não passa por um browser nosso: não há `?ag=` nem cookie. O único
         * sítio onde o código pode estar é na app, se ela o tiver guardado (por exemplo de um link
         * que abriu a ficha na loja). Hoje a app NÃO manda nada, e por isso estas vendas ficam
         * «sem código» — que é a verdade e tem de se ler como tal.
         *
         * O campo existe mesmo vazio, e isso é a parte que importa: quando a app passar a mandá-lo,
         * não há nada a lembrar deste lado. A alternativa era deixar esta porta sem o campo, e
         * então o dia em que a app o mandasse ele era silenciosamente deitado fora.
         *
         * Não se vai buscar ao perfil do comprador: isso é a ligação fraca que fez toda a receita
         * de 01/10 cair em «sem_codigo» — por pessoa e sobrescrita pelo último código que ela usar.
         */
        agenteCodigo: typeof agenteCodigo === 'string' ? agenteCodigo : null,
      })
    } catch (vendaErr) {
      console.error('[VENDAS] não foi possível registar a venda da Apple no livro:', vendaErr)
    }

    const wasAlreadyActive = existing?.subscription_status === 'active'
    if (!wasAlreadyActive) {
      const mlmCtx = appleMlmContext(productId, plan)
      void sendNewMemberWelcomeIfEligible({
        userId: resolvedUserId,
        source: 'app_store',
        planId: mlmCtx.planId,
        sponsorUsername: sponsor,
        notifyTeam: true,
        eventId: `apple_validate_${originalTransactionId}`,
      })
    }

    if (hadActiveStripe) {
      console.warn(`⚠️ [APPLE-IAP] Compra Apple sobre Stripe ATIVO: user=${resolvedUserId} stripeSub=${current?.stripe_subscription_id}`)
      void alertCrossChannelConflict({
        userId: resolvedUserId,
        email: current?.email as string | undefined,
        stripeSubscriptionId: current?.stripe_subscription_id as string | null,
        applePlan: `${category}/${billing}`,
      })
    }

    console.log(`✅ [APPLE-IAP] Subscrição activada: user=${resolvedUserId} plan=${plan} tx=${transactionId}`)

    return NextResponse.json({
      success:     true,
      userId:      resolvedUserId,
      plan,
      category,
      billing,
      expiresAt,
      transactionId,
      originalTransactionId,
    })
  } catch (err) {
    console.error('[APPLE-IAP] Erro:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
