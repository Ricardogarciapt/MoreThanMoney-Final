import { NextResponse } from "next/server"

export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  // 1. Bot info
  let botInfo: any = null
  if (botToken) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
      const j = await r.json()
      if (j.ok) botInfo = j.result
    } catch {}
  }

  // 2. Webhook info
  let webhookInfo: any = null
  if (botToken) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
      const j = await r.json()
      if (j.ok) webhookInfo = j.result
    } catch {}
  }

  // 3. Channel map from env
  const tradeIdeasId =
    process.env.TELEGRAM_TRADE_IDEAS_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || null
  const premiumIdeasId = process.env.TELEGRAM_PREMIUM_IDEAS_CHAT_ID || null

  // 4. Chat info for each configured channel
  async function getChatTitle(id: string | null) {
    if (!id || !botToken) return null
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${id}`)
      const j = await r.json()
      return j.ok ? j.result?.title ?? id : `NOT FOUND (id: ${id})`
    } catch {
      return `ERROR (id: ${id})`
    }
  }

  const [tradeTitle, premiumTitle] = await Promise.all([
    getChatTitle(tradeIdeasId),
    getChatTitle(premiumIdeasId),
  ])

  return NextResponse.json({
    bot: botInfo
      ? { username: botInfo.username, name: botInfo.first_name, id: botInfo.id }
      : "NOT CONFIGURED",
    webhook: webhookInfo
      ? {
          url: webhookInfo.url || "(empty — not registered)",
          pending_updates: webhookInfo.pending_update_count,
          last_error: webhookInfo.last_error_message ?? null,
        }
      : "ERROR",
    channels: {
      "trade-ideas-setup": {
        env_var: process.env.TELEGRAM_TRADE_IDEAS_CHAT_ID
          ? "TELEGRAM_TRADE_IDEAS_CHAT_ID"
          : process.env.TELEGRAM_CHANNEL_ID
          ? "TELEGRAM_CHANNEL_ID (legacy)"
          : "NOT SET",
        id: tradeIdeasId,
        title: tradeTitle,
      },
      "premium-ideas": {
        env_var: process.env.TELEGRAM_PREMIUM_IDEAS_CHAT_ID ? "TELEGRAM_PREMIUM_IDEAS_CHAT_ID" : "NOT SET",
        id: premiumIdeasId,
        title: premiumTitle,
      },
    },
  })
}
