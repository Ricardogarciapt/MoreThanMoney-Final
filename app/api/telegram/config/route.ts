import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const config = await request.json()

    // Aqui você salvaria as configurações no banco de dados
    // Por agora, vamos simular o salvamento

    console.log("Configurações do bot salvas:", config)

    return NextResponse.json({
      success: true,
      message: "Configurações salvas com sucesso",
    })
  } catch (error) {
    console.error("Erro ao salvar configurações:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao salvar configurações",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    // Aqui você carregaria as configurações do banco de dados
    const config = {
      token: process.env.TELEGRAM_BOT_TOKEN || "",
      channelId: process.env.TELEGRAM_CHANNEL_ID || "",
      webhookUrl: "",
      autoSignals: true,
      signalKeywords: ["BUY", "SELL", "🚀", "🔻", "LONG", "SHORT"],
    }

    return NextResponse.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error("Erro ao carregar configurações:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao carregar configurações",
      },
      { status: 500 },
    )
  }
}
