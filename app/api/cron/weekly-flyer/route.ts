/**
 * Cron SEMANAL do flyer "Resultados da Semana" (pedido Ricardo 2026-08-22).
 *
 * Sábado de manhã, com a semana fechada:
 *  1) calcula os números canónicos (lib/mtm-flyer/weekly-stats);
 *  2) envia o flyer (/api/flyer/weekly) ao Ricardo por Telegram (sendPhoto —
 *     o Telegram faz fetch do URL, não precisamos de gerar ficheiro);
 *  3) agenda o mesmo flyer como STORY no @morethanmoney.pt via a fila
 *     `social_scheduled_posts` já usada pelo cron ig-publish. Entra como
 *     'approved' porque a ordem do Ricardo é permanente ("todas as semanas…
 *     postar no instagram stories") — o ig-publish publica em <5 min.
 *
 * Dedup por semana: se já existe uma linha desta semana criada por este cron,
 * não agenda segunda story (re-runs manuais só reenviam o Telegram).
 */

import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"
import { getWeeklyFlyerStats, fmtSigned, fmtPt } from "@/lib/mtm-flyer/weekly-stats"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const IG_ACCOUNT_MTM = "17841474872672009" // @morethanmoney.pt

async function adminChatId(): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "telegram_admin_chat_id")
      .maybeSingle()
    const raw = data?.value
    const v =
      raw && typeof raw === "object" && "chat_id" in (raw as Record<string, unknown>)
        ? String((raw as Record<string, unknown>).chat_id)
        : String(raw ?? "").replace(/["\s]/g, "")
    return v || process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "1446687230"
  } catch {
    return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "1446687230"
  }
}

async function sendFlyerTelegram(chatId: string, photoUrl: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  const token = getMtmcopyBotToken()
  if (!token) return { ok: false, error: "TELEGRAM_AIBOT_TOKEN não configurado" }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  })
  const data = (await res.json()) as { ok?: boolean; description?: string }
  return data.ok ? { ok: true } : { ok: false, error: data.description ?? "Falha no sendPhoto" }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const stats = await getWeeklyFlyerStats(request.nextUrl.searchParams.get("w"))

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.morethanmoney.pt"
  const chatId = await adminChatId()
  const summary =
    `${fmtSigned(stats.totalPips)} pips em sinais fechados · ≈ $${fmtPt(stats.minLotUsd)} a lote mínimo\n` +
    `Premium ${fmtSigned(stats.premium.netPips)} · Scanner ${fmtSigned(stats.scanner.pips)} · Sensei ${fmtSigned(stats.sensei.pips)} · GoldKiller ${fmtSigned(stats.goldkiller.pips)}`

  // Sai SEMPRE em dois flyers separados, PT e EN (pedido Ricardo 2026-08-22).
  const results: Record<string, { telegram: string; story: string; url: string }> = {}
  for (const lang of ["pt", "en"] as const) {
    const flyerUrl = `${site}/api/flyer/weekly?w=${stats.weekStart}&lang=${lang}`

    // 2) Telegram para o admin
    const caption =
      lang === "pt"
        ? `📊 Resultados da semana ${stats.periodLabel} (PT)\n${summary}\nStory agendada no @morethanmoney.pt (publica em ~5 min).`
        : `📊 Weekly results ${stats.periodLabelEn} (EN)\nStory agendada no @morethanmoney.pt.`
    const tg = await sendFlyerTelegram(chatId, flyerUrl, caption)

    // 3) Instagram Story (fila ig-publish) — dedup por semana+língua
    let story = "skipped"
    const { data: existing } = await supabase
      .from("social_scheduled_posts")
      .select("id")
      .eq("created_by", "weekly-flyer-cron")
      .contains("media_urls", [flyerUrl])
      .limit(1)

    if (!existing || existing.length === 0) {
      const { error } = await supabase.from("social_scheduled_posts").insert({
        ig_account_id: IG_ACCOUNT_MTM,
        ig_username: "morethanmoney.pt",
        pillar: "resultados",
        media_type: "STORIES",
        media_urls: [flyerUrl],
        caption: "",
        scheduled_at: new Date().toISOString(),
        status: "approved",
        approved_by: "weekly-flyer-cron",
        approved_at: new Date().toISOString(),
        created_by: "weekly-flyer-cron",
      })
      story = error ? `error: ${error.message}` : "queued"
    }

    results[lang] = { telegram: tg.ok ? "sent" : tg.error ?? "error", story, url: flyerUrl }
  }

  return NextResponse.json({
    ok: Object.values(results).every((r) => r.telegram === "sent"),
    week: stats.weekStart,
    totalPips: stats.totalPips,
    minLotUsd: stats.minLotUsd,
    ...results,
  })
}
