import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { buildAppChannelMap, resolveAppChannelSlug } from "@/lib/telegram-app-channels"
import { canalPublicadoPelaMestre } from "@/lib/mestres/servidor/canais-publicados"
import { processMtmcopyTelegramMessage } from "@/lib/mtmcopy/processor"

import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

function botApiBase() {
  return `https://api.telegram.org/bot${getMtmcopyBotToken()}`
}
const WEBHOOK_URL = "https://www.morethanmoney.pt/api/telegram/webhook"
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

function webhookUrl(): string {
  if (!WEBHOOK_SECRET) return WEBHOOK_URL
  return `${WEBHOOK_URL}?secret=${encodeURIComponent(WEBHOOK_SECRET)}`
}

async function setWebhook() {
  return fetch(`${botApiBase()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl(),
      allowed_updates: ["message", "channel_post", "edited_channel_post", "my_chat_member"],
    }),
  })
}

async function backfillFromSignalLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sinceIso: string,
  stats: { saved: number; skipped: number; errors: number },
) {
  const { data: logs } = await supabase
    .from("mtmcopy_signal_log")
    .select("telegram_message_id, raw_message, created_at, channel_key")
    .gte("created_at", sinceIso)
    .not("telegram_message_id", "is", null)
    .not("raw_message", "is", null)
    .order("created_at", { ascending: true })

  const seen = new Set<number>()
  for (const row of logs ?? []) {
    const tid = row.telegram_message_id as number
    if (!tid || tid > 1_000_000 || seen.has(tid)) continue
    seen.add(tid)

    const slug =
      row.channel_key === "premium-signals"
        ? "premium-ideas"
        : row.channel_key === "trade-ideas"
          ? "trade-ideas-setup"
          : null
    if (!slug) {
      stats.skipped++
      continue
    }

    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("telegram_message_id", tid)
      .eq("channel_slug", slug)
      .maybeSingle()
    if (existing) {
      stats.skipped++
      continue
    }

    const { error } = await supabase.from("chat_messages").insert({
      channel_slug: slug,
      user_id: null,
      content: row.raw_message,
      image_url: null,
      message_type: "telegram_forward",
      telegram_sender: slug === "premium-ideas" ? "MoreThanMoney Premium Signals" : "Telegram",
      telegram_message_id: tid,
      created_at: row.created_at,
    })
    if (error) {
      console.error("[catchup-aibot] backfill log:", error.message)
      stats.errors++
    } else {
      stats.saved++
    }
  }
}

export async function POST(_request: NextRequest) {
  if (!getMtmcopyBotToken()) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_AIBOT_TOKEN not set" },
      { status: 400 }
    )
  }

  const stats = { fetched: 0, saved: 0, skipped: 0, errors: 0, backfill_log: 0 }

  try {
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    // Desligar webhook para poder usar getUpdates
    await fetch(`${botApiBase()}/deleteWebhook`, { method: "POST" })

    const updRes = await fetch(
      `${botApiBase()}/getUpdates?limit=100&offset=0&allowed_updates=["channel_post","message"]`
    )
    const updData = await updRes.json()

    if (!updData.ok) {
      await setWebhook()
      return NextResponse.json({ success: false, error: updData.description })
    }

    const updates = updData.result || []
    stats.fetched = updates.length

    const supabase = getSupabaseAdmin()
    const todayTs = Math.floor(new Date(sinceIso).getTime() / 1000)

    for (const update of updates) {
      const post = update.channel_post || update.message
      if (!post) { stats.skipped++; continue }

      const content = post.text || post.caption || ""
      if (!content) { stats.skipped++; continue }

      if (post.date < todayTs) { stats.skipped++; continue }

      const slug = resolveAppChannelSlug(post.chat ?? {})
      if (!slug) { stats.skipped++; continue }
      if (await canalPublicadoPelaMestre(slug)) { stats.skipped++; continue }

      const { data: existing } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("telegram_message_id", post.message_id)
        .eq("channel_slug", slug)
        .maybeSingle()

      if (existing) { stats.skipped++; continue }

      const { error } = await supabase.from("chat_messages").insert({
        channel_slug: slug,
        user_id: null,
        content,
        image_url: null,
        message_type: "telegram_forward",
        telegram_sender: post.chat?.title || "Telegram",
        telegram_message_id: post.message_id,
        created_at: new Date(post.date * 1000).toISOString(),
      })

      if (error) {
        console.error("[catchup-aibot]", error.message)
        stats.errors++
      } else {
        stats.saved++
        try {
          await processMtmcopyTelegramMessage(post)
        } catch (procErr) {
          console.error("[catchup-aibot] mtmcopy:", procErr)
        }
      }
    }

    const beforeBackfill = stats.saved
    await backfillFromSignalLog(supabase, sinceIso, stats)
    stats.backfill_log = stats.saved - beforeBackfill

    await setWebhook()
    return NextResponse.json({ success: true, stats, channels: Object.fromEntries(buildAppChannelMap()) })
  } catch (error) {
    await setWebhook()
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export const maxDuration = 120

export async function GET() {
  if (!getMtmcopyBotToken()) {
    return NextResponse.json({ error: "TELEGRAM_AIBOT_TOKEN not set" })
  }
  const res = await fetch(`${botApiBase()}/getWebhookInfo`)
  const data = await res.json()
  return NextResponse.json({
    webhook: data.result?.url,
    pending: data.result?.pending_update_count,
    channels: Object.fromEntries(buildAppChannelMap()),
  })
}
