import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"
import { lerMenu, publicarMenu } from "@/lib/telegram/menu-bot-servidor"

const TELEGRAM_API = `https://api.telegram.org/bot`

/**
 * O MENU DO BOT — o que aparece no botão «/» do Telegram.
 *
 * Tem de bater certo com o que o webhook responde (app/api/telegram/webhook/route.ts). Faltavam
 * aqui o /mtmauto e o /status, que o bot já respondia e ninguém descobria; e o /admin, que agora
 * só vai ao menu PRIVADO do dono — pôr um comando de administração no menu de toda a gente é
 * anunciar uma porta que não é para ela.
 *
 * Desde 23/10 o menu edita-se em Gestão → Telegram → Menu do bot (site_settings
 * `telegram_bot_menu`); este endpoint publica o que lá estiver, e sem nada guardado publica o menu
 * de sempre. As regras vivem em lib/telegram/menu-bot.ts.
 */
export async function POST(request: NextRequest) {
  // Admin-only: verify secret or admin auth
  const authHeader = request.headers.get("authorization")
  const adminSecret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const token = getMtmcopyBotToken()
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_AIBOT_TOKEN não configurado" }, { status: 500 })
  }

  try {
    const menu = await lerMenu(getSupabaseAdmin())
    const r = await publicarMenu(token, menu)
    return NextResponse.json({ success: r.ok, commands: r.comandos, results: r.resultados })
  } catch (error) {
    console.error("Erro ao configurar comandos do bot:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// GET: show current commands
export async function GET() {
  const token = getMtmcopyBotToken()
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_AIBOT_TOKEN não configurado" }, { status: 500 })
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/getMyCommands`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Erro ao obter comandos" }, { status: 500 })
  }
}
