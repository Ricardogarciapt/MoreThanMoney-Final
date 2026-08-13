/**
 * Relay Watchdog — vigia o VPS que aloja os relays de Telegram (Premium/Sensei/PrimeVerse)
 * e alerta o admin em <5min se o Premium deixar de fluir.
 *
 * Contexto (incidente 2026-08-13): o VPS (t3.micro, sem swap) pendurou por OOM às 02:54 UTC;
 * o relay do Premium (gmi-relay) vive nesse VPS → o Premium parou e só se descobriu pela
 * sessão de Londres perdida. A Vercel não corre MTProto, por isso não pode ingerir os sinais
 * em fallback — mas PODE detetar a falha cedo e avisar (janela horas → minutos).
 *
 * Deteção:
 *  1) Sonda a acessibilidade do VPS (HTTP ao Elastic IP) — sinal inequívoco (foi o que falhou).
 *  2) Frescura do canal Premium (chat_messages.premium-ideas) durante horas de mercado —
 *     aviso mais suave (silêncio pode ser só ausência de sinais).
 * Anti-spam: guarda estado em site_settings.relay_watchdog_state; só re-alerta a cada 30min,
 * e envia uma mensagem de RECUPERAÇÃO quando o VPS volta.
 */

import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { sendTelegramChannelMessage } from "@/lib/mtmcopy/telegram-bot"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isMarketOpen } from "@/lib/mtmcopy/market-hours"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const VPS_HEALTH_URL = process.env.STREAM_VPS_HEALTH_URL || "http://13.62.134.34/"
const STATE_KEY = "relay_watchdog_state"
const REALERT_MINUTES = 30 // não repetir o mesmo alerta antes disto
const PREMIUM_SILENCE_MINUTES = 60 // silêncio do Premium em horas de mercado que levanta suspeita

async function vpsReachable(): Promise<boolean> {
  // Qualquer resposta HTTP (mesmo 301/404) = host de pé. Timeout/erro de ligação = em baixo.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(VPS_HEALTH_URL, { method: "HEAD", signal: ctrl.signal, redirect: "manual" })
    return r.status > 0
  } catch {
    try {
      const r2 = await fetch(VPS_HEALTH_URL, { signal: ctrl.signal })
      return r2.status > 0
    } catch {
      return false
    }
  } finally {
    clearTimeout(t)
  }
}

async function adminChatId(): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "telegram_admin_chat_id")
      .maybeSingle()
    const v = data?.value ? String(data.value).replace(/["\s]/g, "") : ""
    return v || process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "1446687230"
  } catch {
    return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "1446687230"
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = Date.now()

  // 1) VPS de pé?
  const up = await vpsReachable()

  // 2) Frescura do Premium (última mensagem em premium-ideas)
  let premiumAgeMin: number | null = null
  try {
    const { data } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("channel_slug", "premium-ideas")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.created_at) premiumAgeMin = Math.round((now - new Date(data.created_at).getTime()) / 60000)
  } catch {
    /* ignora */
  }

  const marketOpen = isMarketOpen("XAUUSD").open
  const premiumStale = marketOpen && premiumAgeMin != null && premiumAgeMin > PREMIUM_SILENCE_MINUTES

  // Estado anterior (dedup)
  let prev: { status?: string; last_alert_at?: number } = {}
  try {
    const { data } = await supabase.from("site_settings").select("value").eq("key", STATE_KEY).maybeSingle()
    if (data?.value && typeof data.value === "object") prev = data.value as typeof prev
  } catch {
    /* ignora */
  }

  const status = !up ? "vps_down" : premiumStale ? "premium_stale" : "ok"
  const minsSinceAlert = prev.last_alert_at ? (now - prev.last_alert_at) / 60000 : Infinity
  const statusChanged = prev.status !== status

  let alerted = false
  const chatId = await adminChatId()

  // Recuperação: estava mau, agora ok → avisa e limpa.
  if (status === "ok" && prev.status && prev.status !== "ok") {
    try {
      await sendTelegramChannelMessage(chatId, `✅ Relays recuperados — VPS de pé e Premium a fluir de novo.`)
      alerted = true
    } catch {
      /* best-effort */
    }
  }

  // Alerta: problema novo, ou passou o intervalo de re-alerta.
  if (status !== "ok" && (statusChanged || minsSinceAlert >= REALERT_MINUTES)) {
    const msg =
      status === "vps_down"
        ? `🚨 VPS de streaming/relays INACESSÍVEL (${VPS_HEALTH_URL}).\n\n` +
          `O relay do Premium corre nesse VPS → o Premium pode ter PARADO. Verifica a instância EC2 (Stream Site) — provável OOM/host pendurado. Última msg Premium há ${premiumAgeMin ?? "?"} min.`
        : `⚠️ Premium SILENCIOSO há ${premiumAgeMin} min em horas de mercado, mas o VPS responde. O relay pode estar preso (verifica gmi-relay) ou a fonte não postou.`
    try {
      await sendTelegramChannelMessage(chatId, msg)
      alerted = true
    } catch {
      /* best-effort */
    }
  }

  // Persistir estado
  try {
    await supabase.from("site_settings").upsert(
      {
        key: STATE_KEY,
        value: { status, last_alert_at: alerted && status !== "ok" ? now : prev.last_alert_at ?? null, checked_at: now, premiumAgeMin, up },
        description: "Estado do watchdog dos relays (VPS + Premium)",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
  } catch {
    /* ignora */
  }

  return NextResponse.json({ ok: true, status, up, premiumAgeMin, marketOpen, alerted })
}
