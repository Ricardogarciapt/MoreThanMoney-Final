import { NextResponse } from "next/server"
import { telegramService, telegramConfig } from "@/lib/telegram-service"

export async function GET() {
  try {
    // Verificar status do bot
    let botStatus = { status: "offline" }
    let channelStatus = { status: "disconnected" }
    let webhookStatus = { status: "inactive" }

    try {
      const botResponse = await telegramService.getMe()
      if (botResponse.ok) {
        botStatus = {
          id: botResponse.result.id,
          username: botResponse.result.username,
          first_name: botResponse.result.first_name,
          status: "online",
        }
      }
    } catch (error) {
      console.error("Erro ao verificar status do bot:", error)
    }

    try {
      const channelResponse = await telegramService.getChannelInfo()
      if (channelResponse.ok) {
        channelStatus = {
          id: channelResponse.result.id,
          title: channelResponse.result.title || telegramConfig.channelName,
          member_count: channelResponse.result.member_count,
          status: "connected",
        }
      }
    } catch (error) {
      console.error("Erro ao verificar status do canal:", error)
    }

    // Simular status do webhook (em produção, você pode verificar isso com getWebhookInfo)
    webhookStatus = {
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/telegram/webhook` : "",
      status: botStatus.status === "online" ? "active" : "inactive",
    }

    // Simular último sinal (em produção, você buscaria do banco de dados)
    const lastSignal = {
      content: "🚀 EURUSD BUY @ 1.0950 | TP: 1.1000 | SL: 1.0920",
      timestamp: new Date().toISOString(),
      type: "BUY",
    }

    return NextResponse.json({
      success: true,
      data: {
        bot: botStatus,
        channel: channelStatus,
        webhook: webhookStatus,
        lastSignal,
      },
    })
  } catch (error) {
    console.error("Erro ao verificar status:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao verificar status do Telegram",
      },
      { status: 500 },
    )
  }
}
