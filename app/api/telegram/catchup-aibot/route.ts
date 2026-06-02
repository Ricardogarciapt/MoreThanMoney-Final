import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const BOT_TOKEN = process.env.TELEGRAM_AIBOT_TOKEN || ""
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`
const WEBHOOK_URL = "https://morethanmoney.pt/api/telegram/webhook-aibot"

const CHANNEL_MAP: Record<string, string> = {}

function buildChannelMap() {
  const tradeId = process.env.TELEGRAM_TRADE_IDEAS_CHAT_ID?.trim()
  const premiumId = process.env.TELEGRAM_PREMIUM_IDEAS_CHAT_ID?.trim()
  const addBoth = (id: string, slug: string) => {
    CHANNEL_MAP[id] = slug
    const norm = id.startsWith("-100") ? id : `-100${id.replace(/^-/, "")}`
    CHANNEL_MAP[norm] = slug
  }
  if (tradeId) addBoth(tradeId, "trade-ideas-setup")
  if (premiumId) addBoth(premiumId, "premium-ideas")
}

buildChannelMap()

function todayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

async function setWebhook() {
  return fetch(`${BASE_URL}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      allowed_updates: ["message", "channel_post"],
    }),
  })
}

export async function POST(_request: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_AIBOT_TOKEN not set" },
      { status: 400 }
    )
  }

  const stats = { fetched: 0, saved: 0, skipped: 0, errors: 0 }

  try {
    // Desligar webhook para poder usar getUpdates
    await fetch(`${BASE_URL}/deleteWebhook`, { method: "POST" })

    const updRes = await fetch(
      `${BASE_URL}/getUpdates?limit=100&offset=0&allowed_updates=["channel_post","message"]`
    )
    const updData = await updRes.json()

    if (!updData.ok) {
      await setWebhook()
      return NextResponse.json({ success: false, error: updData.description })
    }

    const updates = updData.result || []
    stats.fetched = updates.length

    const supabase = getSupabaseAdmin()
    const todayTs = todayStart()

    for (const update of updates) {
      const post = update.channel_post || update.message
      if (!post) { stats.skipped++; continue }

      const content = post.text || post.caption || ""
      if (!content) { stats.skipped++; continue }

      if (post.date < todayTs) { stats.skipped++; continue }

      const chatId = String(post.chat?.id ?? "")
      const slug = CHANNEL_MAP[chatId]
      if (!slug) { stats.skipped++; continue }

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
      }
    }

    await setWebhook()
    return NextResponse.json({ success: true, stats, channels: CHANNEL_MAP })
  } catch (error) {
    await setWebhook()
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function GET() {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_AIBOT_TOKEN not set" })
  }
  const res = await fetch(`${BASE_URL}/getWebhookInfo`)
  const data = await res.json()
  return NextResponse.json({
    webhook: data.result?.url,
    pending: data.result?.pending_update_count,
    channels: CHANNEL_MAP,
  })
}
