/**
 * Webhook Guard — protege o webhook do bot Telegram contra "drift"/hijack.
 *
 * Contexto: em 22/07/2026 o webhook do bot foi desviado para um servidor
 * externo (ssh.inkognit.org) → o site parou de receber os sinais Premium
 * (chat + MTM Auto Premium partiram; trades tiveram de ser postas à mão).
 *
 * Este cron verifica de X em X min se o webhook ainda aponta para o site MTM.
 * Se detetar drift (host diferente ou path errado), REPÕE automaticamente e
 * alerta o admin por DM. Assim a janela de falha passa de horas para <5 min.
 */

import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import {
  getMtmcopyWebhookInfo,
  registerMtmcopyTelegramWebhook,
  sendTelegramChannelMessage,
} from "@/lib/mtmcopy/telegram-bot"
import { getSiteOrigin } from "@/lib/site-url"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const site = getSiteOrigin()
  let expectedHost = ""
  try {
    expectedHost = new URL(site).host
  } catch {
    return NextResponse.json({ ok: false, error: "site origin inválido" }, { status: 500 })
  }

  const info = await getMtmcopyWebhookInfo()
  const currentUrl = info?.url || ""

  let currentHost = ""
  let currentPath = ""
  try {
    if (currentUrl) {
      const u = new URL(currentUrl)
      currentHost = u.host
      currentPath = u.pathname
    }
  } catch {
    /* url malformada → conta como drift */
  }

  const drifted =
    !currentUrl ||
    currentHost !== expectedHost ||
    !currentPath.startsWith("/api/telegram/webhook")

  if (!drifted) {
    return NextResponse.json({
      ok: true,
      drifted: false,
      host: currentHost,
      pending: info?.pending_update_count ?? null,
      last_error: info?.last_error_message ?? null,
    })
  }

  // Drift detetado → repor o webhook para o site MTM.
  const reset = await registerMtmcopyTelegramWebhook(site)

  // Alertar o admin por DM.
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "telegram_admin_chat_id")
      .maybeSingle()
    const adminChatId = data?.value ? String(data.value).replace(/["\s]/g, "") : ""
    if (adminChatId) {
      await sendTelegramChannelMessage(
        adminChatId,
        `⚠️ ALERTA SEGURANÇA — o webhook do bot estava desviado para "${currentHost || "(vazio)"}".\n\n` +
          `Foi reposto automaticamente para ${expectedHost} (${reset.ok ? "OK" : "FALHOU: " + (reset.description ?? "")}).\n\n` +
          `Alguém com o teu TOKEN DO BOT mudou o webhook. Roda o token no @BotFather e atualiza TELEGRAM_AIBOT_TOKEN na Vercel.`,
      )
    }
  } catch {
    /* notificação best-effort */
  }

  return NextResponse.json({
    ok: true,
    drifted: true,
    previousHost: currentHost || null,
    reset: reset.ok,
    reset_error: reset.ok ? null : reset.description,
  })
}
