import { type NextRequest, NextResponse } from "next/server"
import { telegramService } from "@/lib/telegram-service"
import { db } from "@/lib/database-service"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Verificar se é uma mensagem do canal
    if (body.channel_post) {
      const message = body.channel_post

      // Processar mensagem como sinal de trading
      const signal = telegramService.processSignalMessage(message)

      if (signal) {
        // Salvar sinal na base de dados
        await db.create("telegram_signals", signal)

        console.log("Novo sinal processado:", signal)
      }
    }

    // Vincular chat privado ao mentor via token /start mtm_xxx
    if (body.message?.chat?.id && typeof body.message?.text === "string") {
      const text: string = body.message.text.trim()
      const match = text.match(/^\/start\s+([a-zA-Z0-9_]+)$/)
      if (match?.[1]) {
        const token = match[1]
        const chatId = String(body.message.chat.id)
        const supabase = getSupabaseAdmin()

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
        }
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
    bot: "@MoreThanMoney_Copierbot",
    channel: "https://t.me/+2XMn1YEjfjYwYTE0",
  })
}
