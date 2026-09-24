import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

const TELEGRAM_API = `https://api.telegram.org/bot`

/**
 * O MENU DO BOT — o que aparece no botão «/» do Telegram.
 *
 * Tem de bater certo com o que o webhook responde (app/api/telegram/webhook/route.ts). Faltavam
 * aqui o /mtmauto e o /status, que o bot já respondia e ninguém descobria; e o /admin, que agora
 * só vai ao menu PRIVADO do dono — pôr um comando de administração no menu de toda a gente é
 * anunciar uma porta que não é para ela.
 */
const BOT_COMMANDS = [
  { command: "start", description: "Começar e ligar ao assistente MTM" },
  { command: "premium", description: "Packs, preços e como entrar" },
  { command: "grupos", description: "Aceder aos grupos de sinais" },
  { command: "sinais", description: "Ver os últimos sinais de trading" },
  { command: "mtmauto", description: "Só a app que copia os sinais por ti" },
  { command: "corretora", description: "Abrir conta na corretora (PU Prime)" },
  { command: "app", description: "Descarregar a app e experimentar" },
  { command: "status", description: "Estado da tua ligação e do teu acesso" },
  { command: "ajuda", description: "Ajuda e comandos disponíveis" },
]

/** Os comandos do dono — registados SÓ no chat privado dele (`scope: chat`). */
const ADMIN_COMMANDS = [
  ...BOT_COMMANDS,
  { command: "admin", description: "Painel de administração MTM" },
  { command: "painel", description: "Painel de administração MTM" },
]

const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "1446687230"

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
    // Set commands for all chat types
    const scopes = [
      { scope: { type: "default" } },
      { scope: { type: "all_private_chats" } },
      { scope: { type: "all_group_chats" } },
    ]

    const results = []
    for (const { scope } of scopes) {
      const res = await fetch(`${TELEGRAM_API}${token}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: BOT_COMMANDS,
          scope,
          language_code: "pt",
        }),
      })
      const data = await res.json()
      results.push({ scope: scope.type, ok: data.ok, result: data })
    }

    // Also set without language code (global fallback)
    for (const { scope } of scopes) {
      const res = await fetch(`${TELEGRAM_API}${token}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: BOT_COMMANDS, scope }),
      })
      const data = await res.json()
      results.push({ scope: `${scope.type}_global`, ok: data.ok })
    }

    // O menu do dono, só na conversa privada dele.
    {
      const res = await fetch(`${TELEGRAM_API}${token}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: ADMIN_COMMANDS,
          scope: { type: "chat", chat_id: Number(ADMIN_CHAT()) },
        }),
      })
      const data = await res.json()
      results.push({ scope: "admin_chat", ok: data.ok, result: data })
    }

    // Also set bot description
    await fetch(`${TELEGRAM_API}${token}/setMyDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Bot oficial MoreThanMoney — Sinais de trading, ligação com mentores e atualizações da plataforma.",
        language_code: "pt",
      }),
    })

    await fetch(`${TELEGRAM_API}${token}/setMyShortDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        short_description: "Sinais MTM & ligação ao mentor",
        language_code: "pt",
      }),
    })

    const allOk = results.every((r) => r.ok)
    return NextResponse.json({
      success: allOk,
      commands: BOT_COMMANDS,
      results,
    })
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
