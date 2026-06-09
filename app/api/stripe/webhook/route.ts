// /api/stripe/webhook/route.ts
// Handles all Stripe webhook events — subscriptions, payments, cancellations

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendScannerAccessEmail, sendMTMcopierSetupNotification } from '@/lib/email-service'

// Nomes amigáveis dos scanners por planId (para o email de instruções TradingView)
const SCANNER_PLAN_NAMES: Record<string, string> = {
  goldkiller_lifetime: 'Scanner Gold Killer (Vitalício)',
  mtm_scanner_monthly: 'Scanner MTM V3.4 (Mensal)',
  mtm_scanner_lifetime: 'Scanner MTM V3.4 (Vitalício)',
  scanners_monthly: 'Pack Total de Scanners MTM (Mensal)',
  scanners_semestral: 'Pack Total de Scanners MTM (Semestral)',
  scanners_lifetime: 'Pack Total de Scanners MTM (Vitalício — inclui Sensei X)',
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency — skip already processed events
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .single()

  if (existing) {
    return NextResponse.json({ received: true, skipped: true })
  }

  // Record event
  await supabase.from('stripe_events').insert({ id: event.id, type: event.type, data: event.data })

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  if (!userId) return

  await supabase
    .from('checkout_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('stripe_session_id', session.id)

  // Compra de scanner com username TradingView → enviar email com instruções de acesso
  const tvUsername = session.metadata?.tradingview_username
  const planId = session.metadata?.plan
  if (tvUsername && planId && SCANNER_PLAN_NAMES[planId]) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      if (profile?.email) {
        await sendScannerAccessEmail(
          profile.email,
          profile.full_name || 'Trader',
          SCANNER_PLAN_NAMES[planId],
          tvUsername
        )
      }

      // Guardar o username TradingView no perfil para referência/gestão de acessos
      await supabase
        .from('profiles')
        .update({ tradingview_username: tvUsername })
        .eq('id', userId)
        .then(undefined, () => {/* coluna pode não existir ainda — não bloquear o fluxo */})
    } catch (err) {
      console.error('Erro ao enviar email de acesso ao scanner:', err)
    }
  }

  // Addon MTMcopier (Telegram → MT5) — notificar a equipa para finalizar o onboarding manual
  if (planId === 'mtmcopy_addon_monthly') {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      const { data: existingConn } = await supabase
        .from('mtmcopy_connections')
        .select('telegram_channel, mt5_server, mt5_login_last4')
        .eq('user_id', userId)
        .maybeSingle()

      await supabase
        .from('mtmcopy_connections')
        .upsert({ user_id: userId, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

      if (profile?.email) {
        await sendMTMcopierSetupNotification(
          profile.email,
          profile.full_name || 'Trader',
          existingConn?.telegram_channel,
          existingConn?.mt5_server,
          existingConn?.mt5_login_last4
        )
      }
    } catch (err) {
      console.error('Erro ao processar activação do MTMcopier:', err)
    }
  }

  if (session.mode === 'payment') {
    const pack = session.metadata?.pack
    const expiresAt = pack === '65'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('profiles').update({
      stripe_customer_id: session.customer as string,
      subscription_status: 'active',
      subscription_plan: `pack_${pack}`,
      subscription_platform: 'stripe',
      checkout_source: 'stripe',
      is_active: true,
      subscription_expires_at: expiresAt,
      last_payment_at: new Date().toISOString(),
      payment_failed_count: 0,
    }).eq('id', userId)

    await supabase.from('payment_history').insert({
      user_id: userId,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      plan: `pack_${pack}`,
      billing_cycle: 'one_time',
      source: 'stripe',
    })

  } else if (session.mode === 'subscription') {
    await supabase.from('profiles').update({
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      is_active: true,
      payment_failed_count: 0,
    }).eq('id', userId)
  }

  // ── MLM: binary tree placement + comissão ao patrocinador ───────────────
  const sponsorUsername = session.metadata?.sponsor_username
  if (sponsorUsername && sponsorUsername.trim()) {
    try {
      const { data: mlmSettings } = await supabase
        .from('mlm_settings')
        .select('is_active, direct_commission_pct')
        .eq('id', 1)
        .single()

      if (mlmSettings?.is_active) {
        const { data: sponsor } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', sponsorUsername.trim())
          .single()

        if (sponsor) {
          const amountTotal = session.amount_total || 0
          const commissionPct = (mlmSettings.direct_commission_pct || 20) / 100
          const commissionAmount = parseFloat(((amountTotal / 100) * commissionPct).toFixed(2))
          const buyerId = userId || null

          // 1. Inserir comissão de referência direta
          await supabase.from('mlm_commissions').insert({
            beneficiary_id: sponsor.id,
            from_user_id: buyerId,
            type: 'direct_referral',
            amount: commissionAmount,
            source_plan: session.metadata?.plan || '',
            stripe_session_id: session.id,
            status: 'pending',
          })

          // 2. Atualizar mlm_sponsor_username no comprador
          if (buyerId) {
            await supabase
              .from('profiles')
              .update({ mlm_sponsor_username: sponsorUsername.trim() })
              .eq('id', buyerId)
              .then(undefined, () => {})

            // 3. Colocar comprador na árvore binária e actualizar contadores
            await placeBuyerInMlmTree(supabase, buyerId, sponsor.id, commissionAmount)
          } else {
            // Guest checkout — só actualiza pending_commissions do sponsor
            await upsertSponsorNode(supabase, sponsor.id, commissionAmount)
          }
        }
      }
    } catch (mlmErr) {
      console.error('[MLM] Erro ao processar MLM:', mlmErr)
    }
  }
}

// ─── MLM Helpers ─────────────────────────────────────────────────────────────

/**
 * Garante que o patrocinador tem um nó e incrementa pending_commissions.
 */
async function upsertSponsorNode(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  sponsorId: string,
  commissionAmount: number
) {
  const { data: sNode } = await supabase
    .from('mlm_nodes')
    .select('id, pending_commissions')
    .eq('user_id', sponsorId)
    .maybeSingle()

  if (sNode) {
    await supabase
      .from('mlm_nodes')
      .update({
        pending_commissions: (sNode.pending_commissions || 0) + commissionAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', sponsorId)
  } else {
    await supabase.from('mlm_nodes').insert({
      user_id: sponsorId,
      pending_commissions: commissionAmount,
    }).then(undefined, () => {})
  }
}

/**
 * Coloca um novo comprador na árvore binária:
 * 1. Cria/obtém nó do patrocinador
 * 2. Encontra o melhor slot (BFS, perna com menos membros)
 * 3. Cria nó do comprador como filho
 * 4. Propaga left_count/right_count para cima
 * 5. Recalcula ranks de todos os ancestrais
 */
async function placeBuyerInMlmTree(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  buyerId: string,
  sponsorId: string,
  commissionAmount: number
) {
  // Verificar se comprador já tem nó
  const { data: existingBuyerNode } = await supabase
    .from('mlm_nodes')
    .select('id')
    .eq('user_id', buyerId)
    .maybeSingle()
  if (existingBuyerNode) return

  // Garantir que patrocinador tem nó
  let { data: sponsorNode } = await supabase
    .from('mlm_nodes')
    .select('id, left_child_id, right_child_id, left_count, right_count, pending_commissions')
    .eq('user_id', sponsorId)
    .maybeSingle()

  if (!sponsorNode) {
    const { data: newNode } = await supabase
      .from('mlm_nodes')
      .insert({ user_id: sponsorId })
      .select('id, left_child_id, right_child_id, left_count, right_count, pending_commissions')
      .single()
    sponsorNode = newNode
  }
  if (!sponsorNode) return

  // Actualizar pending_commissions do patrocinador
  await supabase
    .from('mlm_nodes')
    .update({
      pending_commissions: (sponsorNode.pending_commissions || 0) + commissionAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', sponsorId)

  // Encontrar slot via BFS a partir do patrocinador
  const slot = await findNextSlot(supabase, sponsorNode.id)
  if (!slot) return

  // Criar nó do comprador
  const { data: buyerNode } = await supabase
    .from('mlm_nodes')
    .insert({
      user_id: buyerId,
      sponsor_id: sponsorId,
      parent_node_id: slot.parentId,
      position: slot.position,
    })
    .select('id')
    .single()

  if (!buyerNode) return

  // Actualizar filho do parent
  const childField = slot.position === 'left' ? 'left_child_id' : 'right_child_id'
  await supabase
    .from('mlm_nodes')
    .update({ [childField]: buyerNode.id, updated_at: new Date().toISOString() })
    .eq('id', slot.parentId)

  // Propagar contadores de baixo para cima
  await propagateCounts(supabase, slot.parentId, slot.position)

  // Recalcular ranks dos ancestrais
  await recalculateRanksUpwards(supabase, slot.parentId)
}

/**
 * BFS para encontrar o primeiro slot disponível, priorizando a perna mais curta.
 */
async function findNextSlot(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  rootNodeId: string
): Promise<{ parentId: string; position: 'left' | 'right' } | null> {
  const queue: string[] = [rootNodeId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, left_child_id, right_child_id, left_count, right_count')
      .eq('id', nodeId)
      .single()

    if (!node) continue

    if (!node.left_child_id) return { parentId: nodeId, position: 'left' }
    if (!node.right_child_id) return { parentId: nodeId, position: 'right' }

    // Ambas as pernas preenchidas — adicionar à que tem menos membros
    if ((node.left_count || 0) <= (node.right_count || 0)) {
      queue.push(node.left_child_id)
    } else {
      queue.push(node.right_child_id)
    }

    // Safety: BFS max 127 nós (7 níveis)
    if (visited.size > 127) break
  }
  return null
}

/**
 * Propaga left_count/right_count para todos os ancestrais do nó.
 */
async function propagateCounts(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  nodeId: string,
  childPosition: 'left' | 'right'
) {
  let currentId: string | null = nodeId
  let position = childPosition

  let depth = 0
  while (currentId && depth < 20) {
    depth++
    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, parent_node_id, position, left_count, right_count')
      .eq('id', currentId)
      .single()

    if (!node) break

    const field = position === 'left' ? 'left_count' : 'right_count'
    const newCount = ((node[field] as number) || 0) + 1
    await supabase
      .from('mlm_nodes')
      .update({ [field]: newCount, updated_at: new Date().toISOString() })
      .eq('id', currentId)

    if (!node.parent_node_id) break
    position = node.position as 'left' | 'right'
    currentId = node.parent_node_id
  }
}

/**
 * Recalcula o rank de um nó e todos os seus ancestrais.
 */
async function recalculateRanksUpwards(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  nodeId: string
) {
  const { data: allRanks } = await supabase
    .from('mlm_ranks')
    .select('id, left_requirement, right_requirement, direct_requirement, sort_order, name')
    .order('sort_order', { ascending: false }) // Maior rank primeiro

  if (!allRanks || allRanks.length === 0) return

  let currentId: string | null = nodeId
  let depth = 0

  while (currentId && depth < 20) {
    depth++
    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, user_id, parent_node_id, left_count, right_count, total_direct, rank_id')
      .eq('id', currentId)
      .single()

    if (!node) break

    // Calcular rank mais alto que este nó qualifica
    const newRankId = calculateRank(
      node.left_count || 0,
      node.right_count || 0,
      node.total_direct || 0,
      allRanks
    )

    if (newRankId !== node.rank_id) {
      await supabase
        .from('mlm_nodes')
        .update({ rank_id: newRankId, updated_at: new Date().toISOString() })
        .eq('id', currentId)

      await supabase
        .from('profiles')
        .update({ mlm_rank_id: newRankId })
        .eq('id', node.user_id)
        .then(undefined, () => {})
    }

    if (!node.parent_node_id) break
    currentId = node.parent_node_id
  }
}

/**
 * Devolve o ID do rank mais alto que um nó qualifica.
 * ranks deve estar ordenado do maior para o menor (sort_order DESC).
 */
function calculateRank(
  leftCount: number,
  rightCount: number,
  totalDirect: number,
  ranks: Array<{ id: number; left_requirement: number; right_requirement: number; direct_requirement: number; sort_order: number }>
): number {
  for (const rank of ranks) {
    const okLeft = leftCount >= (rank.left_requirement || 0)
    const okRight = rightCount >= (rank.right_requirement || 0)
    const okDirect = totalDirect >= (rank.direct_requirement || 0)
    if (okLeft && okRight && okDirect) return rank.id
  }
  return ranks[ranks.length - 1]?.id ?? 0
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  const item = sub.items.data[0]
  const plan = item?.price?.metadata?.plan || 'monthly'
  const billingCycle = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly'
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

  await supabase.from('profiles').update({
    stripe_subscription_id: sub.id,
    stripe_price_id: item?.price?.id,
    subscription_status: sub.status === 'active' ? 'active' : sub.status,
    subscription_plan: plan,
    subscription_billing_cycle: billingCycle,
    subscription_platform: 'stripe',
    subscription_expires_at: periodEnd,
    next_billing_at: periodEnd,
    subscription_auto_renew: !sub.cancel_at_period_end,
    is_active: sub.status === 'active' || sub.status === 'trialing',
    payment_failed_count: 0,
  }).eq('id', profile.id)
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'canceled',
    is_active: false,
    access_revoked_at: new Date().toISOString(),
    inactive_reason: 'subscription_canceled',
    inactive_since: new Date().toISOString(),
    subscription_auto_renew: false,
  }).eq('id', profile.id)
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', invoice.customer as string)
    .single()

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'active',
    is_active: true,
    last_payment_at: new Date().toISOString(),
    payment_failed_count: 0,
  }).eq('id', profile.id)

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    billing_cycle: 'renewal',
    source: 'stripe',
  })
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, payment_failed_count')
    .eq('stripe_customer_id', invoice.customer as string)
    .single()

  if (!profile) return

  const failCount = (profile.payment_failed_count || 0) + 1

  const updates: any = {
    payment_failed_count: failCount,
    subscription_status: failCount >= 3 ? 'unpaid' : 'past_due',
  }

  if (failCount >= 3) {
    updates.is_active = false
    updates.access_revoked_at = new Date().toISOString()
    updates.inactive_reason = 'payment_failed'
    updates.inactive_since = new Date().toISOString()
  }

  await supabase.from('profiles').update(updates).eq('id', profile.id)

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    source: 'stripe',
  })
}

export const runtime = 'nodejs'
