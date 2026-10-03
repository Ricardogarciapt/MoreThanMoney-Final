import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { isInternalApiRequest } from '@/lib/internal-api'
import { mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } from '@/lib/mail-transport'
import { activationPatch, type ActivationDecision } from '@/lib/member-activation'
import { buildActivationEmail } from '@/lib/activation-emails'
import { getStripeClient } from '@/lib/stripe-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/members/decisions
 *
 * Aplica as decisões tomadas no painel de membros (grátis · pagar · parceiro · inativar)
 * e envia o email correspondente.
 *
 * Body:
 *  {
 *    decisions: [{ email, decision: 'pay'|'free'|'partner'|'off',
 *                  cancelSubscription?: boolean, blockAccess?: boolean }],
 *    dryRun?: boolean   // default TRUE — sem dryRun:false nada é escrito nem enviado
 *    send?: boolean     // enviar os emails (default true quando dryRun:false)
 *    allowAdmins?: boolean  // por defeito contas admin nunca são bloqueadas
 *    campaign?: string
 *  }
 *
 * Regras:
 *  - `pay` com blockAccess → `is_active=false` + ativação pendente: o membro mantém
 *    login e histórico, mas as áreas de membro (site e apps) ficam fechadas até pagar.
 *    O middleware encaminha-o para a escolha de pack, e o trigger da BD limpa o estado
 *    assim que qualquer pagamento reativa a conta.
 *  - `off` → conta inativa (user_type='inactive').
 *  - `free` / `partner` → acesso mantido; só muda a marcação e o email que recebe.
 *  - contas admin nunca são bloqueadas sem `allowAdmins` (evita fechar o próprio backoffice).
 */

type DecisionInput = {
  email: string
  decision: ActivationDecision
  cancelSubscription?: boolean
  blockAccess?: boolean
}

function firstName(full?: string | null, email?: string): string {
  const n = (full || '').trim()
  if (n) return n.split(/\s+/)[0]
  return (email || '').split('@')[0]
}

function pooledTransporter() {
  return nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: Infinity,
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
    rateDelta: 1000,
    rateLimit: 3,
  })
}

export async function POST(request: NextRequest) {
  if (!isInternalApiRequest(request)) {
    const denied = await requireAdmin(request)
    if (denied) return denied
  }

  let body: {
    decisions?: DecisionInput[]
    dryRun?: boolean
    send?: boolean
    allowAdmins?: boolean
    campaign?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const decisions = Array.isArray(body.decisions) ? body.decisions : []
  if (!decisions.length) {
    return NextResponse.json({ ok: false, error: 'decisions em falta' }, { status: 400 })
  }

  const dryRun = body.dryRun !== false
  const send = dryRun ? false : body.send !== false
  const campaign = body.campaign || 'ativacao-2026-08'
  const supabase = getSupabaseAdmin()

  const emails = decisions.map((d) => (d.email || '').trim().toLowerCase()).filter(Boolean)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, user_type, member_category, is_active, profile_data, stripe_subscription_id, last_payment_at')
    .in('email', emails)

  const byEmail = new Map((profiles ?? []).map((p) => [(p.email || '').toLowerCase(), p]))

  const transporter = send && process.env.GMAIL_APP_PASSWORD ? pooledTransporter() : null
  const results: Array<Record<string, unknown>> = []

  for (const d of decisions) {
    const email = (d.email || '').trim().toLowerCase()
    const profile = byEmail.get(email)
    if (!profile) {
      results.push({ email, ok: false, motivo: 'perfil não encontrado' })
      continue
    }

    const isAdmin = profile.user_type === 'admin'
    const querBloquear = d.decision === 'off' || (d.decision === 'pay' && d.blockAccess === true)
    const bloqueia = querBloquear && (!isAdmin || body.allowAdmins === true)
    const nuncaPagou = !profile.last_payment_at
    const acoes: string[] = []

    // ── 1. Estado da conta ──────────────────────────────────────────────────
    const update: Record<string, unknown> = {}
    if (bloqueia) {
      update.is_active = false
      if (d.decision === 'off') {
        update.user_type = 'inactive'
        acoes.push('conta inativada')
      } else {
        update.profile_data = activationPatch(profile, {
          decision: d.decision,
          newMember: nuncaPagou,
          campaign,
        })
        acoes.push('ativação pendente (acesso fechado até pagar)')
      }
    } else if (querBloquear && isAdmin) {
      acoes.push('NÃO bloqueado: conta admin (usa allowAdmins para forçar)')
    }

    if (d.decision === 'partner') {
      update.profile_data = { ...(profile.profile_data as object ?? {}), partner: true, partner_since: new Date().toISOString() }
      acoes.push('marcado como parceiro')
    }

    if (Object.keys(update).length && !dryRun) {
      const { error } = await supabase.from('profiles').update(update).eq('id', profile.id)
      if (error) {
        results.push({ email, ok: false, motivo: `update falhou: ${error.message}` })
        continue
      }
    }

    // ── 2. Assinatura Stripe ────────────────────────────────────────────────
    if (d.cancelSubscription && profile.stripe_subscription_id) {
      acoes.push(`cancelar subscrição Stripe ${profile.stripe_subscription_id}`)
      if (!dryRun) {
        try {
          await getStripeClient().subscriptions.cancel(profile.stripe_subscription_id)
        } catch (err) {
          acoes.push(`ERRO Stripe: ${err instanceof Error ? err.message : 'desconhecido'}`)
        }
      }
    } else if (d.cancelSubscription) {
      acoes.push('sem subscrição Stripe para cancelar')
    }

    // ── 3. Email ────────────────────────────────────────────────────────────
    const mail = buildActivationEmail(d.decision, firstName(profile.full_name, email), email, {
      bloqueado: bloqueia,
    })
    acoes.push(`email: ${mail.subject}`)

    if (transporter) {
      try {
        await transporter.sendMail({
          from: mailFrom(),
          to: email,
          subject: mail.subject,
          html: prepareBrandedEmailHtml(mail.html),
          text: mail.text,
          attachments: brandedMailAttachments(),
        })
      } catch (err) {
        acoes.push(`ERRO email: ${err instanceof Error ? err.message : 'desconhecido'}`)
      }
    }

    results.push({
      email,
      nome: profile.full_name,
      decisao: d.decision,
      nunca_pagou: nuncaPagou,
      admin: isAdmin,
      acoes,
      ok: true,
    })
  }

  transporter?.close()

  return NextResponse.json({
    ok: true,
    dryRun,
    enviados: send,
    total: results.length,
    results,
  })
}
