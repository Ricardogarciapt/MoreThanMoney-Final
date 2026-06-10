const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN
export const MTMCOPY_BOT_USERNAME = () =>
  (process.env.TELEGRAM_BOT_USERNAME || '@MoreThanMoney_aibot').replace(/^@/, '')

async function botApi<T>(method: string, params?: Record<string, string>): Promise<T | null> {
  const token = BOT_TOKEN()
  if (!token) return null

  const url = new URL(`https://api.telegram.org/bot${token}/${method}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  const data = await res.json()
  if (!data.ok) {
    console.warn(`[mtmcopy/bot] ${method} falhou:`, data.description)
    return null
  }
  return data.result as T
}

export interface ChannelVerifyResult {
  ok: boolean
  chatId?: string
  title?: string
  botIsAdmin?: boolean
  error?: string
}

/** Verifica se o bot consegue ver o canal e se é administrador. */
export async function verifyTelegramChannel(channelInput: string): Promise<ChannelVerifyResult> {
  const token = BOT_TOKEN()
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN não configurado' }
  }

  const chatId = channelInput.trim().startsWith('-')
    ? channelInput.trim()
    : channelInput.trim().replace(/^https?:\/\/t\.me\//i, '@').replace(/^(?!@)/, '@')

  const chat = await botApi<{ id: number; title?: string; username?: string }>('getChat', {
    chat_id: chatId,
  })
  if (!chat) {
    return {
      ok: false,
      error:
        'Canal não encontrado. Confirma o @username e adiciona o bot como administrador do canal de sinais.',
    }
  }

  const me = await botApi<{ id: number }>('getMe')
  if (!me) return { ok: false, error: 'Não foi possível validar o bot.' }

  const member = await botApi<{ status: string }>('getChatMember', {
    chat_id: String(chat.id),
    user_id: String(me.id),
  })

  const botIsAdmin = member?.status === 'administrator' || member?.status === 'creator'

  return {
    ok: botIsAdmin,
    chatId: String(chat.id),
    title: chat.title,
    botIsAdmin,
    error: botIsAdmin
      ? undefined
      : `Adiciona @${MTMCOPY_BOT_USERNAME()} como administrador do canal "${chat.title || chatId}".`,
  }
}

export async function registerTelegramWebhook(siteUrl: string): Promise<{ ok: boolean; description?: string }> {
  const token = BOT_TOKEN()
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN em falta' }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const webhookUrl = secret
    ? `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook?secret=${encodeURIComponent(secret)}`
    : `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook`

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'channel_post', 'edited_channel_post'],
      drop_pending_updates: false,
    }),
  })
  const data = await res.json()
  return { ok: data.ok === true, description: data.description }
}
