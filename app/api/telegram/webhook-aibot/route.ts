import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { processMtmcopyTelegramMessage } from "@/lib/mtmcopy/processor"
import { resolveReplyToChatMessageId } from "@/lib/telegram-reply-thread"
import { resolveAppChannelSlug } from "@/lib/telegram-app-channels"
import { sendTelegramChannelPush } from "@/lib/telegram-channel-push"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

/**
 * O `TelegramMessage` do processor so declara o que o processor usa. Este webhook
 * tambem espelha para a app, e para isso precisa de campos que o Telegram manda
 * mas aquele tipo nao lista: a fotografia e o `sender_chat` dos posts de canal.
 */
type TelegramChannelMessage = Parameters<typeof processMtmcopyTelegramMessage>[0] & {
  photo?: Array<{ file_id: string }>
  sender_chat?: { title?: string }
}

async function runMtmcopy(message: TelegramChannelMessage) {
  try {
    await processMtmcopyTelegramMessage(message)
  } catch (err) {
    console.error("[mtmcopy] erro no webhook-aibot:", err)
  }
}

async function resolveTelegramImageUrl(message: {
  photo?: Array<{ file_id: string }>
}): Promise<string | null> {
  if (!message.photo?.length) return null
  const botToken = getMtmcopyBotToken()
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

async function mirrorToApp(message: TelegramChannelMessage) {
  const chat = message.chat ?? {}
  // Mensagens de SERVIÇO (renomear grupo, entradas/saídas de membros, foto, pin, etc.) NÃO são sinais
  // → nunca viram "ideia"/notificação. Foi um rename destes que disparou uma notif de forex trocada.
  const svc = message as unknown as Record<string, unknown>
  if (
    svc.new_chat_title != null ||
    svc.new_chat_photo != null ||
    svc.delete_chat_photo != null ||
    svc.new_chat_members != null ||
    svc.left_chat_member != null ||
    svc.pinned_message != null ||
    svc.group_chat_created != null ||
    svc.supergroup_chat_created != null ||
    svc.migrate_to_chat_id != null ||
    svc.migrate_from_chat_id != null
  ) {
    return
  }
  const slug = resolveAppChannelSlug(chat)
  if (!slug) return
  // Canal publicado pela mestre: não se espelha o grupo (ver lib/mestres/servidor/canais-publicados).
  {
    const { canalPublicadoPelaMestre } = await import("@/lib/mestres/servidor/canais-publicados")
    if (await canalPublicadoPelaMestre(slug)) return
  }
  // RECEÇÃO por canal (admin): desligado → não espelha nem notifica.
  const { intakeKeyForChannelSlug, isIntakeEnabled } = await import("@/lib/telegram-intake-guard")
  const ik = intakeKeyForChannelSlug(slug)
  if (ik && !(await isIntakeEnabled(ik))) return

  const content = message.text || message.caption || null
  const imageUrl = await resolveTelegramImageUrl(message)
  if (!content && !imageUrl) return

  const supabase = getSupabaseAdmin()
  const senderName = chat.title || message.sender_chat?.title || "Telegram"
  const telegramMessageId = message.message_id

  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("telegram_message_id", telegramMessageId)
    .eq("channel_slug", slug)
    .maybeSingle()

  if (existing) return

  // Threading: no Telegram os follow-ups (HIT TP1/BE/fecho) são REPLIES ao setup → manter a thread
  // no chat da app (senão aparecem todos ao mesmo nível, como acontecia no Premium).
  const replyToId = await resolveReplyToChatMessageId(
    slug,
    (message as { reply_to_message?: { message_id?: number } }).reply_to_message?.message_id ?? null,
  )
  const { data: inserted, error: insertError } = await supabase
    .from("chat_messages")
    .insert({
      channel_slug: slug,
      user_id: null,
      content,
      image_url: imageUrl,
      message_type: "telegram_forward",
      telegram_sender: senderName,
      telegram_message_id: telegramMessageId,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
      // `date` e opcional no tipo (e o Telegram pode nao o mandar em casos raros).
      // Sem guarda, `new Date(undefined * 1000)` da Invalid Date e o .toISOString()
      // lanca RangeError — o espelho da mensagem rebentava em vez de gravar.
      created_at: new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    })
    .select("id")
    .single()

  if (insertError) {
    console.error(`[webhook-aibot] Erro ao inserir em ${slug}:`, insertError.message)
    return
  }

  const push = await sendTelegramChannelPush({
    slug,
    content,
    imageUrl,
    telegramMessageId,
    chatMessageId: inserted?.id ? String(inserted.id) : undefined,
  })
  if (!push.ok) {
    console.error("[webhook-aibot] push failed:", push.error ?? push.status)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = (body.channel_post || body.edited_channel_post || body.message || body.edited_message) as
      | TelegramChannelMessage
      | undefined
    if (!message) return NextResponse.json({ ok: true })

    const chat = message.chat ?? {}
    const isGroupMessage =
      chat.type === "supergroup" || chat.type === "group" || chat.type === "channel" || (chat.id ?? 0) < 0

    if (isGroupMessage) {
      await Promise.all([
        mirrorToApp(message),
        (async () => {
          const { registerDiscoveredTelegramChat } = await import("@/lib/mtmcopy/signal-sources-config")
          await registerDiscoveredTelegramChat(chat)
        })(),
        runMtmcopy(message),
      ])
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[webhook-aibot]", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export const maxDuration = 120
