import { type NextRequest, NextResponse } from "next/server"
import { telegramService } from "@/lib/telegram-service"
import { db } from "@/lib/database-service"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

// Map Telegram chat IDs → chat channel slugs
// Env vars aceites (qualquer um serve):
//   TELEGRAM_TRADE_IDEAS_CHAT_ID  ou  TELEGRAM_CHANNEL_ID  → trade-ideas-setup
//   TELEGRAM_PREMIUM_IDEAS_CHAT_ID                          → premium-ideas
const CHANNEL_MAP: Record<string, string> = {}

function buildChannelMap() {
  const tradeIdeasId =
    process.env.TELEGRAM_TRADE_IDEAS_CHAT_ID ||
    process.env.TELEGRAM_CHANNEL_ID   // fallback para env legacy
  const premiumIdeasId = process.env.TELEGRAM_PREMIUM_IDEAS_CHAT_ID
  if (tradeIdeasId)  CHANNEL_MAP[tradeIdeasId]  = "trade-ideas-setup"
  if (premiumIdeasId) CHANNEL_MAP[premiumIdeasId] = "premium-ideas"
}

buildChannelMap()

async function mirrorTelegramMessage(supabase: ReturnType<typeof getSupabaseAdmin>, message: any) {
  const chatId = String(message.chat?.id ?? "")
  const slug = CHANNEL_MAP[chatId]

  if (!slug) {
    // Guardar canal desconhecido para facilitar configuração
    const channelTitle = message.chat?.title ?? ""
    const channelUsername = message.chat?.username ?? ""
    console.log(`[Telegram] Canal não mapeado: id=${chatId} title="${channelTitle}" username="${channelUsername}"`)

    // Auto-detectar pelo título: se parece ser um dos canais esperados, inserir como descoberta
    const titleLower = channelTitle.toLowerCase()
    let autoSlug: string | null = null
    if (titleLower.includes("premium")) autoSlug = "premium-ideas"
    else if (titleLower.includes("trade") || titleLower.includes("setup") || titleLower.includes("sinais")) autoSlug = "trade-ideas-setup"

    if (autoSlug) {
      console.log(`[Telegram] Auto-mapeando "${channelTitle}" (${chatId}) → ${autoSlug}`)
      await supabase.from("chat_messages").insert({
        channel_slug: autoSlug,
        user_id: null,
        content: message.text || message.caption || null,
        image_url: null,
        message_type: "telegram_forward",
        telegram_sender: channelTitle || "Telegram",
        telegram_message_id: message.message_id,
      }).then(({ error }) => {
        if (error) console.error(`[Telegram] Erro auto-mapeamento:`, error.message)
        else console.log(`[Telegram] ✅ Auto-mapeado ${chatId} → ${autoSlug}`)
      })
    }
    return
  }

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
    const botToken = process.env.TELEGRAM_BOT_TOKEN
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
  })

  if (error) {
    console.error(`[Telegram] Erro ao inserir mensagem em ${slug}:`, error.message)
  } else {
    console.log(`[Telegram] ✅ Mensagem ${telegramMessageId} inserida em ${slug}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    // Verificar se é uma mensagem do canal
    if (body.channel_post) {
      const message = body.channel_post

      // Mirror to chat channels if configured
      await mirrorTelegramMessage(supabase, message)

      // Processar mensagem como sinal de trading
      const signal = telegramService.processSignalMessage(message)

      if (signal) {
        // Salvar sinal na base de dados
        await db.create("telegram_signals", signal)

        console.log("Novo sinal processado:", signal)
      }
    }

    // Handle private messages & commands
    if (body.message?.chat?.id && typeof body.message?.text === "string") {
      const text: string = body.message.text.trim()
      const chatId = String(body.message.chat.id)
      const botToken = process.env.TELEGRAM_BOT_TOKEN

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
    console.error("Erro no webhook do Telegram:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Webhook ativo",
    bot: "@MoreThanMoney_aibot",
    channel: "https://t.me/+2XMn1YEjfjYwYTE0",
  })
}
