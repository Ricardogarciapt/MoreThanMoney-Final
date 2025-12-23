import { type NextRequest, NextResponse } from "next/server"
import { telegramService } from "@/lib/telegram-service"
import { db } from "@/lib/database-service"

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
