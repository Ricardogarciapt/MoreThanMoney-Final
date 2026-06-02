import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.channel_post || body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = String(message.chat?.id ?? "")
    const slug = CHANNEL_MAP[chatId]
    if (!slug) return NextResponse.json({ ok: true })

    const content = message.text || message.caption || null
    if (!content) return NextResponse.json({ ok: true })

    const supabase = getSupabaseAdmin()
    const senderName = message.chat?.title || message.sender_chat?.title || "Telegram"
    const telegramMessageId = message.message_id

    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("telegram_message_id", telegramMessageId)
      .eq("channel_slug", slug)
      .maybeSingle()

    if (existing) return NextResponse.json({ ok: true })

    await supabase.from("chat_messages").insert({
      channel_slug: slug,
      user_id: null,
      content,
      image_url: null,
      message_type: "telegram_forward",
      telegram_sender: senderName,
      telegram_message_id: telegramMessageId,
      created_at: new Date(message.date * 1000).toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[webhook-aibot]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: "Webhook aibot ativo", channels: CHANNEL_MAP })
}
