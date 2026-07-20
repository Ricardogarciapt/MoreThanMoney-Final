import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Renovação automática do Premium broker-gated — corre diariamente.
 * Para cada lead com acesso concedido (telegram_leads.stage='granted' + cupão + UID):
 *  - resolve o utilizador que resgatou o cupão (profiles.coupon_code)
 *  - lê o saldo do broker (broker_clients por UID)
 *  - saldo ≥ $300 (ou sem dados frescos = grace) → RENOVA Premium +31 dias
 *  - saldo < $300 com dados FRESCOS → sinaliza 'at_risk' + notifica admin (não revoga
 *    à cega — os exports são manuais e podem estar velhos)
 * Auto-renováveis: mantém o Premium vivo enquanto o cliente está ativo no broker.
 */
const MIN_DEPOSIT = 300
const FRESH_DAYS = 40

async function notifyAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, text: string) {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "telegram_admin_chat_id").maybeSingle()
  const chat = (data?.value as { chat_id?: string } | null)?.chat_id
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!chat || !token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {})
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = getSupabaseAdmin()

  const { data: leads } = await supabase
    .from("telegram_leads")
    .select("chat_id, broker_uid, coupon_code")
    .eq("stage", "granted")
    .not("coupon_code", "is", null)
    .not("broker_uid", "is", null)

  const now = new Date()
  const in31 = new Date(now.getTime() + 31 * 864e5).toISOString()
  let renewed = 0
  let atRisk = 0
  let pendingRedeem = 0
  const risky: string[] = []

  for (const l of leads ?? []) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("coupon_code", l.coupon_code as string)
      .maybeSingle()
    if (!prof) {
      pendingRedeem++ // cupão ainda não foi resgatado na app
      continue
    }
    const { data: bc } = await supabase
      .from("broker_clients")
      .select("balance_usd, updated_at")
      .eq("uid", l.broker_uid as string)
      .maybeSingle()
    const bal = bc ? Number(bc.balance_usd ?? 0) : null
    const fresh = bc?.updated_at ? now.getTime() - new Date(bc.updated_at).getTime() < FRESH_DAYS * 864e5 : false

    if (bal === null || bal >= MIN_DEPOSIT) {
      // RENOVA (ativo, ou sem dados frescos → grace)
      await supabase
        .from("profiles")
        .update({
          member_category: "premium",
          subscription_plan: "premium",
          subscription_status: "active",
          subscription_platform: "manual",
          is_active: true,
          subscription_expires_at: in31,
          updated_at: now.toISOString(),
        })
        .eq("id", prof.id)
      renewed++
    } else if (fresh && bal < MIN_DEPOSIT) {
      // saldo caiu abaixo do mínimo (dados frescos) → sinaliza (revogação é decisão do admin)
      atRisk++
      risky.push(`${prof.email ?? l.chat_id} (UID ${l.broker_uid}, saldo $${bal})`)
      await supabase
        .from("telegram_leads")
        .update({ stage: "at_risk", updated_at: now.toISOString() })
        .eq("chat_id", l.chat_id as string)
    }
  }

  if (risky.length) {
    await notifyAdmin(
      supabase,
      `⚠️ <b>Broker-gate — saldo abaixo de $${MIN_DEPOSIT}</b>\n\n${risky.join("\n")}\n\n` +
        `O Premium destes NÃO foi renovado. Confirma e revoga se quiseres.`,
    )
  }

  return NextResponse.json({ ok: true, renewed, atRisk, pendingRedeem, total: (leads ?? []).length })
}
