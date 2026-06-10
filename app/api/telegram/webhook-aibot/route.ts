import { type NextRequest, NextResponse, after } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { processMtmcopyTelegramMessage } from "@/lib/mtmcopy/processor"
import { resolveAppChannelSlug } from "@/lib/telegram-app-channels"

async function resolveTelegramImageUrl(message: {
  photo?: Array<{ file_id: string }>
}): Promise<string | null> {
  if (!message.photo?.length) return null
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return null

  const bestPhoto = message.photo[message.photo.length - 1]
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${bestPhoto.file_id}`,
    )
    if (!fileRes.ok) return null
    const fileData = await fileRes.json()
    if (!fileData.ok) return null
    return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.channel_post || body.message
    if (!message) return NextResponse.json({ ok: true })

    const chat = message.chat ?? {}
    const isGroupMessage =
      chat.type === "supergroup" || chat.type === "group" || chat.type === "channel" || chat.id < 0

    if (isGroupMessage) {
      const { registerDiscoveredTelegramChat } = await import("@/lib/mtmcopy/signal-sources-config")
      await registerDiscoveredTelegramChat(chat)

      after(() =>
        processMtmcopyTelegramMessage(message).catch((err) =>
          console.error("[mtmcopy] erro no webhook-aibot:", err),
        ),
      )
    }

    const slug = resolveAppChannelSlug(chat)
    if (!slug) return NextResponse.json({ ok: true })

    const content = message.text || message.caption || null
    const imageUrl = await resolveTelegramImageUrl(message)
    if (!content && !imageUrl) return NextResponse.json({ ok: true })

    const supabase = getSupabaseAdmin()
    const senderName = chat.title || message.sender_chat?.title || "Telegram"
    const telegramMessageId = message.message_id

    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("telegram_message_id", telegramMessageId)
      .eq("channel_slug", slug)
      .maybeSingle()

    if (existing) return NextResponse.json({ ok: true })

    const { error: insertError } = await supabase.from("chat_messages").insert({
      channel_slug: slug,
      user_id: null,
      content,
      image_url: imageUrl,
      message_type: "telegram_forward",
      telegram_sender: senderName,
      telegram_message_id: telegramMessageId,
      created_at: new Date(message.date * 1000).toISOString(),
    })

    if (insertError) {
      console.error(`[webhook-aibot] Erro ao inserir em ${slug}:`, insertError.message)
      return NextResponse.json({ ok: true })
    }

    const PUSH_TITLES: Record<string, string> = {
      "trade-ideas-setup": "📊 Novo Setup de Trading!",
      "premium-ideas": "💎 Nova Ideia Premium!",
    }
    const title = PUSH_TITLES[slug] ?? "📩 Nova mensagem MTM"
    const bodyText = (content || (imageUrl ? "Nova imagem" : "Nova mensagem")).length > 120
      ? (content || "Nova imagem").substring(0, 117) + "…"
      : (content || (imageUrl ? "Nova imagem" : "Nova mensagem"))
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt"
    fetch(`${siteUrl}/api/notifications/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        all: true,
        title,
        body: bodyText,
        data: { type: "chat_message", url: "/app-mobile", channel: slug },
      }),
    }).catch((e) => console.error("[webhook-aibot] push failed:", e))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[webhook-aibot]", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export const maxDuration = 60
