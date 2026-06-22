import { NextResponse } from "next/server"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

export async function GET() {
  try {
    const botToken = getMtmcopyBotToken()
    const chatId = "-1002055149876"

    if (!botToken) {
      return NextResponse.json({
        success: false,
        error: "Bot token não configurado",
      })
    }

    // Buscar mensagens recentes
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?chat_id=${chatId}&limit=10`)
    const data = await response.json()

    if (!data.ok) {
      return NextResponse.json({
        success: false,
        error: "Erro ao buscar mensagens",
        details: data.description,
      })
    }

    // Processar mensagens
    const messages = data.result
      .filter((update: any) => update.message || update.channel_post)
      .map((update: any) => {
        const message = update.message || update.channel_post
        return {
          id: message.message_id,
          text: message.text || "Mensagem sem texto",
          date: new Date(message.date * 1000).toLocaleString("pt-PT"),
          topic: extractTopic(message.text || ""),
          author: message.from?.first_name || "Canal",
        }
      })
      .slice(0, 10)

    return NextResponse.json({
      success: true,
      messages,
      total: messages.length,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "Erro interno do servidor",
    })
  }
}

function extractTopic(text: string): string {
  if (text.includes("💰") || text.toLowerCase().includes("sinal")) return "SINAIS"
  if (text.includes("🏛️") || text.toLowerCase().includes("etf")) return "ETF'S"
  if (text.includes("🚀") || text.toLowerCase().includes("cripto")) return "Cripto"
  if (text.includes("📈") || text.toLowerCase().includes("forex")) return "Forex"
  return "Geral"
}
