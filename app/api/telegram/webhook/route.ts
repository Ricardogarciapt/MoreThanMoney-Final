import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { processMtmcopyTelegramMessage } from "@/lib/mtmcopy/processor"
import {
  getMtmcopyBotInfo,
  getMtmcopyBotToken,
  getMtmcopyWebhookInfo,
  MTMCOPY_BOT_USERNAME,
  registerMtmcopyTelegramWebhook,
} from "@/lib/mtmcopy/telegram-bot"
import { getSiteOrigin } from "@/lib/site-url"
import { resolveAppChannelSlug } from "@/lib/telegram-app-channels"
import { sendTelegramChannelPush } from "@/lib/telegram-channel-push"

async function mirrorTelegramMessage(supabase: ReturnType<typeof getSupabaseAdmin>, message: any) {
  const chatId = String(message.chat?.id ?? "")
  const slug = resolveAppChannelSlug(message.chat ?? {})

  if (!slug) {
    const channelTitle = message.chat?.title ?? ""
    const channelUsername = message.chat?.username ?? ""
    console.log(`[Telegram] Canal não mapeado: id=${chatId} title="${channelTitle}" username="${channelUsername}"`)
    return
  }

  console.log(`[Telegram] Espelhar ${chatId} → ${slug}`)

  const telegramMessageId = message.message_id
  const senderName = message.chat?.title || message.sender_chat?.title || "Telegram"

  // Dedup: skip if already imported
  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("telegram_message_id", telegramMessageId)
    .eq("channel_slug", slug)
    .maybeSingle()

  if (existing) return

  // Build content
  let content: string | null = message.text || message.caption || null
  let imageUrl: string | null = null

  // Handle photo: pick highest resolution
  if (message.photo && message.photo.length > 0) {
    const bestPhoto = message.photo[message.photo.length - 1]
    const fileId = bestPhoto.file_id
    const botToken = getMtmcopyBotToken()
    if (botToken) {
      try {
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
        if (fileRes.ok) {
          const fileData = await fileRes.json()
          if (fileData.ok) {
            imageUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const { error } = await supabase.from("chat_messages").insert({
    channel_slug: slug,
    user_id: null,
    content,
    image_url: imageUrl,
    message_type: "telegram_forward",
    telegram_sender: senderName,
    telegram_message_id: telegramMessageId,
    ...(message.date ? { created_at: new Date(message.date * 1000).toISOString() } : {}),
  })

  if (error) {
    console.error(`[Telegram] Erro ao inserir mensagem em ${slug}:`, error.message)
  } else {
    console.log(`[Telegram] ✅ Mensagem ${telegramMessageId} inserida em ${slug}`)

    const push = await sendTelegramChannelPush({
      slug,
      content,
      imageUrl,
      telegramMessageId,
    })
    if (!push.ok) {
      console.warn(`[Telegram] Push falhou para ${slug}:`, push.error ?? push.status)
    }
  }
}

async function handleTelegramChannelMessage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: Parameters<typeof processMtmcopyTelegramMessage>[0],
) {
  const runMtmcopy = async () => {
    try {
      await processMtmcopyTelegramMessage(message)
    } catch (err) {
      console.error("[mtmcopy] erro no processamento:", err)
    }
  }

  // Chat + push imediatos em paralelo com MTMcopier (MetaAPI não bloqueia a app)
  await Promise.all([
    mirrorTelegramMessage(supabase, message),
    (async () => {
      const { registerDiscoveredTelegramChat } = await import("@/lib/mtmcopy/signal-sources-config")
      await registerDiscoveredTelegramChat(message.chat ?? {})
    })(),
    runMtmcopy(),
  ])
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    if (body.channel_post) {
      await handleTelegramChannelMessage(supabase, body.channel_post)
    }

    if (body.edited_channel_post) {
      await handleTelegramChannelMessage(supabase, body.edited_channel_post)
    }

    if (body.message?.chat?.type === "supergroup" || body.message?.chat?.type === "group") {
      await handleTelegramChannelMessage(supabase, body.message)
    }

    if (body.edited_message?.chat?.type === "supergroup" || body.edited_message?.chat?.type === "group") {
      await handleTelegramChannelMessage(supabase, body.edited_message)
    }

    // Comandos privados DM (não processar mensagens de grupos/canais)
    if (
      body.message?.chat?.type === "private" &&
      body.message?.chat?.id &&
      typeof body.message?.text === "string"
    ) {
      const text: string = body.message.text.trim()
      const chatId = String(body.message.chat.id)
      const botToken = getMtmcopyBotToken()

      const sendMessage = async (msg: string) => {
        if (!botToken) return
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
        })
      }

      // /start with token — vincular ao mentor
      const startMatch = text.match(/^\/start\s+([a-zA-Z0-9_]+)$/)
      if (startMatch?.[1]) {
        const token = startMatch[1]

        const { data: profile } = await supabase
          .from("mentor_profiles")
          .select("user_id")
          .eq("telegram_start_token", token)
          .maybeSingle()

        if (profile?.user_id) {
          await supabase
            .from("mentor_profiles")
            .update({ telegram_chat_id: chatId })
            .eq("user_id", profile.user_id)

          await supabase.from("notifications").insert({
            user_id: profile.user_id,
            type: "mentor",
            title: "Telegram ligado ao Mentor",
            message: "Canal privado do mentor ativo. Vais receber lembretes e progresso por aqui também.",
            data: { source: "telegram" },
            read: false,
          })

          await sendMessage("✅ <b>Telegram ligado com sucesso!</b>\n\nVais receber as tuas notificações de mentor por aqui. Bem-vindo ao MTM! 🚀")
        } else {
          await sendMessage("❌ Token inválido ou expirado. Vai à plataforma MTM e tenta novamente.")
        }
      }

      // /start sem token
      else if (text === "/start") {
        await sendMessage(
          "👋 <b>Bem-vindo ao bot MoreThanMoney!</b>\n\n" +
          "Para ligar o teu Telegram ao mentor, segue o link na plataforma em <b>morethanmoney.pt</b>.\n\n" +
          "Comandos disponíveis:\n" +
          "/sinais — Últimos sinais de trading\n" +
          "/status — Estado da ligação\n" +
          "/ajuda — Ajuda"
        )
      }

      // /sinais — últimos sinais
      else if (text === "/sinais" || text === "/sinais@MoreThanMoney_aibot") {
        const { data: signals } = await supabase
          .from("telegram_signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5)

        if (!signals || signals.length === 0) {
          await sendMessage("📊 Sem sinais recentes. Aguarda o próximo sinal!")
        } else {
          const lines = signals.map((s: any, i: number) => {
            const date = new Date(s.created_at).toLocaleDateString("pt-PT")
            return `${i + 1}. <b>${s.symbol || "N/A"}</b> — ${s.direction || ""} ${s.entry_price ? `@ ${s.entry_price}` : ""} <i>(${date})</i>`
          })
          await sendMessage("📊 <b>Últimos sinais MTM:</b>\n\n" + lines.join("\n"))
        }
      }

      // /status
      else if (text === "/status" || text === "/status@MoreThanMoney_aibot") {
        const { data: mentor } = await supabase
          .from("mentor_profiles")
          .select("user_id, telegram_chat_id")
          .eq("telegram_chat_id", chatId)
          .maybeSingle()

        if (mentor) {
          await sendMessage("✅ <b>Telegram ligado à plataforma MTM</b>\n\nTudopronto! Vais receber notificações por aqui.")
        } else {
          await sendMessage("⚠️ <b>Telegram não ligado</b>\n\nVai à plataforma MTM e liga o teu Telegram na área do mentor.")
        }
      }

      // /ajuda
      else if (text === "/ajuda" || text === "/ajuda@MoreThanMoney_aibot" || text === "/help") {
        await sendMessage(
          "ℹ️ <b>Comandos disponíveis:</b>\n\n" +
          "/start — Ligar ao mentor MTM\n" +
          "/sinais — Ver últimos sinais de trading\n" +
          "/status — Verificar ligação\n" +
          "/ajuda — Esta mensagem\n\n" +
          "🌐 Plataforma: <a href='https://morethanmoney.pt'>morethanmoney.pt</a>"
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Erro no webhook do Telegram:", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const { isMetaApiConfigured } = await import("@/lib/mtmcopy/metaapi")
  const botInfo = await getMtmcopyBotInfo()
  const webhook = await getMtmcopyWebhookInfo()
  const register = request.nextUrl.searchParams.get("register") === "1"

  let webhookRegister: { ok: boolean; description?: string; webhook_url?: string } | undefined
  if (register) {
    webhookRegister = await registerMtmcopyTelegramWebhook(getSiteOrigin())
  }

  return NextResponse.json({
    status: "Webhook ativo",
    bot: botInfo.ok
      ? { username: botInfo.username, name: botInfo.first_name, id: botInfo.id }
      : { error: botInfo.error ?? "TELEGRAM_AIBOT_TOKEN em falta" },
    expected_bot: `@${MTMCOPY_BOT_USERNAME()}`,
    webhook,
    webhook_register: webhookRegister,
    mtmcopy: "Bot API · Telegram → MetaAPI → MT5",
    metaapi: isMetaApiConfigured() ? "configurado" : "METAAPI_TOKEN em falta",
  })
}
