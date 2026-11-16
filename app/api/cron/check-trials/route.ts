import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { createMailTransporter, mailFrom, getSiteUrl } from "@/lib/mail-transport"
import { createCustomTemplate } from "@/lib/email-templates"
import { DIAS_TRIAL_PREMIUM, TRIAL_PEDE_CARTAO } from "@/lib/stripe-checkout-premium"

/** O cron corre uma vez por dia (02:00 UTC): 26 h apanha cada trial uma vez, entre 2 e 26 h antes do fim. */
const JANELA_LEMBRETE_HORAS = 26

/**
 * Lembrete antes da primeira cobrança (16/11/2026). O trial passou a pedir o cartão à entrada; quem
 * se esquece e é cobrado sem aviso pede reembolso e abre disputa. Um email, uma vez, na véspera.
 */
async function lembretesAntesDaCobranca(supabase: ReturnType<typeof getSupabaseAdmin>, now: Date) {
  if (!TRIAL_PEDE_CARTAO) return { enviados: 0 }
  const ate = new Date(now.getTime() + JANELA_LEMBRETE_HORAS * 3600_000).toISOString()
  const { data: trials } = await supabase
    .from("periodos_gratis")
    .select("stripe_subscription_id, user_id, fim")
    .eq("origem", "trial_3d")
    .eq("estado", "a_decorrer")
    .eq("tem_metodo_pagamento", true)
    .is("lembrete_enviado_em", null)
    .gt("fim", now.toISOString())
    .lte("fim", ate)
    .limit(200)
  if (!trials?.length) return { enviados: 0 }
  const site = getSiteUrl()
  const transporter = createMailTransporter()
  let enviados = 0
  for (const t of trials as Array<{ stripe_subscription_id: string; user_id: string | null; fim: string }>) {
    if (!t.user_id) continue
    const { data: perfil } = await supabase.from("profiles").select("email, full_name").eq("id", t.user_id).maybeSingle()
    const email = (perfil as { email?: string | null } | null)?.email
    if (!email) continue
    const nome = String((perfil as { full_name?: string | null }).full_name ?? "").split(" ")[0] || "olá"
    const quando = new Date(t.fim).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    const html = createCustomTemplate(
      `<p>Olá ${nome},</p>
<p>Os teus ${DIAS_TRIAL_PREMIUM} dias grátis de Premium acabam a <strong>${quando}</strong> (hora de Lisboa).</p>
<p>Se não fizeres nada, a subscrição Premium começa nessa altura a <strong>65 €/mês</strong>, no cartão que indicaste. Se não quiseres continuar, cancelas num clique na tua <a href="${site}/member-area">área de membro</a> antes dessa hora e não pagas nada.</p>
<p>Qualquer dúvida, responde a este email.</p>
<p style="font-size:12px;color:#888">Conteúdo educativo, não constitui consultoria financeira. Trading envolve risco de perda.</p>`,
      `O teu Premium grátis acaba a ${quando}`,
      site,
    )
    try {
      await transporter.sendMail({ from: mailFrom(), to: email, subject: "Os teus dias grátis de Premium acabam amanhã", html })
      await supabase
        .from("periodos_gratis")
        .update({ lembrete_enviado_em: new Date().toISOString() })
        .eq("stripe_subscription_id", t.stripe_subscription_id)
      enviados++
    } catch (e) {
      console.error("[check-trials] lembrete falhou", e instanceof Error ? e.message : e)
    }
  }
  return { enviados }
}

export const dynamic = "force-dynamic"

/** Desativa trials expirados — corre diariamente via Vercel Cron. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date()

  const { data: trialUsers, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, user_type, trial_expires_at")
    .in("user_type", ["guest", "presentation"])
    .eq("trial_expired", false)
    .not("trial_expires_at", "is", null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const expired: string[] = []

  for (const user of trialUsers || []) {
    const expiryDate = new Date(user.trial_expires_at)
    if (expiryDate >= now) continue

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        trial_expired: true,
        updated_at: now.toISOString(),
      })
      .eq("id", user.id)

    if (!updateError) expired.push(user.email || user.id)
  }

  let lembretes = { enviados: 0 }
  try {
    lembretes = await lembretesAntesDaCobranca(supabase, now)
  } catch (e) {
    console.error("[check-trials] lembretes", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    success: true,
    trial_reminders_sent: lembretes.enviados,
    checked_at: now.toISOString(),
    total_checked: trialUsers?.length || 0,
    expired_count: expired.length,
    expired_users: expired,
  })
}
