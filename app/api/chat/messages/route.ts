import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { canWriteChannel } from "@/lib/chat-channel-permissions"
import { awardXp } from "@/lib/xp-service"
import { getSiteOrigin } from "@/lib/site-url"

const CHANNEL_META: Record<string, { emoji: string; display: string }> = {
  trading:    { emoji: "📈", display: "#Trading" },
  cripto:     { emoji: "₿",  display: "#Cripto" },
  geral:      { emoji: "💬", display: "#Geral" },
  "etf-stocks": { emoji: "📊", display: "#ETF & Stocks" },
}

function dispatchChatPush(
  channelSlug: string,
  senderName: string,
  senderId: string,
  messageId: string,
  content: string | null,
  imageUrl: string | null,
) {
  const meta = CHANNEL_META[channelSlug] ?? { emoji: "💬", display: `#${channelSlug}` }
  const preview = content?.substring(0, 100) || (imageUrl ? "🖼️ Imagem partilhada" : "📎 Ficheiro")
  const url = `/app-mobile?tab=chat&channel=${encodeURIComponent(channelSlug)}`

  fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      all: true,
      excludeUserId: senderId,
      title: `${meta.emoji} Nova mensagem em ${meta.display}`,
      body: `${senderName}: ${preview}`,
      url,
      data: { type: "chat_message", channel: channelSlug, message_id: messageId, url },
      tag: `chat_${channelSlug}`,
    }),
  }).catch((err) => console.error("[chat/messages] push dispatch error:", err))
}

const ALLOWED_MESSAGE_TYPES = new Set(["text", "image", "video", "link", "document"])

const MESSAGE_SELECT = `
  *,
  profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
  reply_to_message:chat_messages!reply_to_id(
    content, image_url, message_type, telegram_sender,
    profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category)
  )
`

async function resolveUser(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_type, member_category, subscription_plan, is_active, created_at, full_name, avatar_url")
    .eq("id", data.user.id)
    .single()

  if (!profile) return null
  return profile
}

export async function POST(request: NextRequest) {
  try {
    const profile = await resolveUser(request)
    if (!profile) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const channelSlug = String(body.channel_slug || "").trim()
    if (!channelSlug) {
      return NextResponse.json({ error: "Canal em falta" }, { status: 400 })
    }

    if (!canWriteChannel(channelSlug, profile)) {
      return NextResponse.json({ error: "Sem permissão para publicar neste canal" }, { status: 403 })
    }

    const content = typeof body.content === "string" ? body.content.trim() || null : null
    const imageUrl = typeof body.image_url === "string" ? body.image_url : null
    const linkUrl = typeof body.link_url === "string" ? body.link_url : null
    const linkPreview = body.link_preview ?? null
    const replyToId = typeof body.reply_to_id === "string" ? body.reply_to_id : null

    let messageType = typeof body.message_type === "string" ? body.message_type : "text"
    if (!ALLOWED_MESSAGE_TYPES.has(messageType)) messageType = "text"
    if (linkUrl && !content && !imageUrl) messageType = "link"

    if (!content && !imageUrl && !linkUrl) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({
        channel_slug: channelSlug,
        user_id: profile.id,
        content,
        image_url: imageUrl,
        link_url: linkUrl,
        link_preview: linkPreview,
        message_type: messageType,
        reply_to_id: replyToId,
        // Push despachado aqui (dispatchChatPush) → marca para o trigger da BD NÃO
        // duplicar. Inserções diretas (app iOS nativa) ficam notified=false → o trigger
        // notify_native_chat_message trata do push.
        notified: true,
      })
      .select(MESSAGE_SELECT)
      .single()

    if (error) {
      console.error("[chat/messages] insert error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const xp = await awardXp(supabase, profile.id, "chat_message_sent", {
      actionDescription: `Chat #${channelSlug}`,
    })

    // Dispara push server-side (fire-and-forget — não bloqueia a resposta)
    dispatchChatPush(
      channelSlug,
      profile.full_name || "Membro",
      profile.id,
      inserted.id,
      content,
      imageUrl,
    )

    return NextResponse.json({
      message: inserted,
      xp: { ...xp, action_type: "chat_message_sent" },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno"
    console.error("[chat/messages] exception:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
