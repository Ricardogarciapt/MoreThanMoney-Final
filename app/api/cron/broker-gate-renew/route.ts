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
 *  - saldo < $300 com dados FRESCOS → REVOGA (Premium off + cupão off + expulsa dos
 *    grupos Forex/Sensei/Premium) + notifica lead e admin. Grace se dados não frescos
 *    (>40d) ou sem registo — não revoga à cega (exports do broker são manuais).
 * Auto-renováveis: mantém o Premium vivo enquanto o cliente está ativo no broker.
 */
const MIN_DEPOSIT = 300
const FRESH_DAYS = 40
const PREMIUM_CHAT = "-1002424441843" // grupo "MoreThanMoney Premium Signals"
const FOREX_CHAT = "-1003716578747"
const SENSEI_CHAT = "-1003853860780"
const ALL_GROUPS = [FOREX_CHAT, SENSEI_CHAT, PREMIUM_CHAT]

async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return await r.json()
  } catch {
    return null
  }
}
/** Link pessoal one-time para o grupo Premium (upsell escondido). */
async function premiumGroupInvite(chatId: string): Promise<string | null> {
  const r = await tg("createChatInviteLink", { chat_id: PREMIUM_CHAT, member_limit: 1, name: `premium ${chatId}` })
  return (r as { result?: { invite_link?: string } } | null)?.result?.invite_link ?? null
}
/** Remove o utilizador de todos os grupos (ban + unban = kick sem banir p/ sempre). */
async function kickFromGroups(userId: string) {
  const uid = Number(userId)
  if (!uid) return
  for (const chat of ALL_GROUPS) {
    await tg("banChatMember", { chat_id: chat, user_id: uid, revoke_messages: false })
    await tg("unbanChatMember", { chat_id: chat, user_id: uid, only_if_banned: true })
  }
}

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
    .select("chat_id, broker_uid, coupon_code, premium_group_granted_at")
    .eq("stage", "granted")
    .not("coupon_code", "is", null)
    .not("broker_uid", "is", null)

  const now = new Date()
  const in31 = new Date(now.getTime() + 31 * 864e5).toISOString()
  let renewed = 0
  let revoked = 0
  let pendingRedeem = 0
  let premiumGranted = 0
  const risky: string[] = []

  for (const l of leads ?? []) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, email, member_category, subscription_status, subscription_platform")
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

      // UPSELL ESCONDIDO: se PAGA Premium (Stripe/Apple, não 'manual') + depósito > $300
      // e ainda não tem o grupo Premium → puxa-o para lá com link pessoal.
      if (
        bal !== null &&
        bal > MIN_DEPOSIT &&
        !l.premium_group_granted_at &&
        prof.member_category === "premium" &&
        prof.subscription_status === "active" &&
        prof.subscription_platform &&
        prof.subscription_platform !== "manual"
      ) {
        const link = await premiumGroupInvite(String(l.chat_id))
        if (link) {
          await tg("sendMessage", {
            chat_id: l.chat_id,
            text:
              `👑 <b>Desbloqueaste o grupo Premium exclusivo!</b>\n\n` +
              `Por seres Premium ativo + conta ≥ $${MIN_DEPOSIT}, tens acesso aos sinais Premium:\n${link}`,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          })
          await supabase
            .from("telegram_leads")
            .update({ premium_group_granted_at: now.toISOString() })
            .eq("chat_id", l.chat_id as string)
          premiumGranted++
        }
      }
    } else if (fresh && bal < MIN_DEPOSIT) {
      // AUTO-REVOGAÇÃO: saldo abaixo do mínimo com dados FRESCOS → remove acesso.
      revoked++
      risky.push(`${prof.email ?? l.chat_id} (UID ${l.broker_uid}, saldo $${bal})`)
      await supabase
        .from("profiles")
        .update({ member_category: "standard", subscription_status: "inactive", is_active: false, updated_at: now.toISOString() })
        .eq("id", prof.id)
      if (l.coupon_code) {
        await supabase.from("coupons").update({ is_active: false }).eq("code", l.coupon_code as string)
      }
      await kickFromGroups(String(l.chat_id))
      await supabase
        .from("telegram_leads")
        .update({ stage: "revoked", premium_group_granted_at: null, updated_at: now.toISOString() })
        .eq("chat_id", l.chat_id as string)
      await tg("sendMessage", {
        chat_id: l.chat_id,
        text: `⚠️ O teu acesso foi <b>suspenso</b> — o saldo na PU Prime desceu abaixo de $${MIN_DEPOSIT}. Repõe o saldo e envia-me novo print para reativar. 🙏`,
        parse_mode: "HTML",
      })
    }
  }

  if (risky.length) {
    await notifyAdmin(
      supabase,
      `⚠️ <b>Broker-gate — acesso REVOGADO (saldo < $${MIN_DEPOSIT})</b>\n\n${risky.join("\n")}\n\n` +
        `Premium desativado + expulsos dos grupos. Repõem o saldo + novo print para reativar.`,
    )
  }

  return NextResponse.json({ ok: true, renewed, premiumGranted, revoked, pendingRedeem, total: (leads ?? []).length })
}
