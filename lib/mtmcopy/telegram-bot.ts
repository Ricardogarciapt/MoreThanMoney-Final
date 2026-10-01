/**
 * Bot admin MTMcopier + descoberta de canais Telegram: @MoreThanMoney_aibot.
 *
 * ═══ CORRECÇÃO DE 01/10/2026: O NOME POR OMISSÃO ESTAVA TROCADO ════════════════════════════
 *
 * Este cabeçalho dizia o contrário — que `MoreThanMoney_aibot` era «o nome ANTIGO» e que o certo
 * era `morethanmoneypt_bot`. Está ao revés, e a confusão tem uma explicação: `morethanmoneypt_bot`
 * é o **nome a mostrar** do bot, não o username. Quem o leu no Telegram tomou-o por username.
 *
 * Verificado de primeira mão, contra o t.me, com um terceiro handle inexistente como controlo:
 *
 *   t.me/MoreThanMoney_aibot  → <title>Telegram: Launch @MoreThanMoney_aibot</title>
 *                               og:title «MoreThanMoneypt_bot» + bloco `tgme_page_title`  → EXISTE
 *   t.me/morethanmoneypt_bot  → <title>Telegram: Contact @morethanmoneypt_bot</title>
 *                               sem `tgme_page_title`                                      → NÃO EXISTE
 *   t.me/zz_nao_existe_…      → a mesma forma exacta do anterior                           (controlo)
 *
 * Isto NÃO dá erro em sítio nenhum, e é por isso que durou: onde o valor aparece num link
 * (`t.me/<bot>?start=lead`, no botão de acolhimento do grupo de leads, no closer, nas respostas
 * públicas do funil do Instagram), um nome errado dá uma página do Telegram a dizer que o
 * utilizador não existe. A pessoa carrega no link que a casa lhe deu e bate numa porta fechada —
 * no passo exacto em que ela decidiu vir falar connosco.
 *
 * O valor por omissão passa a ser o que está PROVADO vivo. `TELEGRAM_BOT_USERNAME` continua a
 * mandar sobre isto; a guarda `lib/telegram-bot-nome.check.ts` pergunta ao t.me se o nome
 * configurado existe mesmo, porque esta é a classe de erro que não se vê a ler o código.
 */
export const MTMCOPY_BOT_USERNAME_DEFAULT = 'MoreThanMoney_aibot'

/** Token canónico: TELEGRAM_AIBOT_TOKEN (não usar @MoreThanMoney_Copierbot). */
export function getMtmcopyBotToken(): string {
  return (
    process.env.TELEGRAM_AIBOT_TOKEN?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    ''
  )
}

export const MTMCOPY_BOT_USERNAME = () =>
  (process.env.TELEGRAM_BOT_USERNAME || `@${MTMCOPY_BOT_USERNAME_DEFAULT}`)
    .trim()
    .replace(/^@/, '')

export interface MtmcopyBotInfo {
  ok: boolean
  id?: number
  username?: string
  first_name?: string
  error?: string
}

export async function getMtmcopyBotInfo(): Promise<MtmcopyBotInfo> {
  const token = getMtmcopyBotToken()
  if (!token) return { ok: false, error: 'TELEGRAM_AIBOT_TOKEN não configurado' }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      next: { revalidate: 0 },
    })
    const data = (await res.json()) as {
      ok?: boolean
      description?: string
      result?: { id?: number; username?: string; first_name?: string }
    }
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description ?? 'getMe falhou' }
    }
    return {
      ok: true,
      id: data.result.id,
      username: data.result.username,
      first_name: data.result.first_name,
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'getMe falhou' }
  }
}

async function botApi<T>(method: string, params?: Record<string, string>): Promise<T | null> {
  const token = getMtmcopyBotToken()
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
  const token = getMtmcopyBotToken()
  if (!token) {
    return { ok: false, error: 'TELEGRAM_AIBOT_TOKEN não configurado' }
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
        'Canal não encontrado. Confirma o @username e adiciona @MoreThanMoney_aibot como administrador do canal de sinais.',
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

/** Publica mensagem num canal/grupo Telegram (admin teste). */
/**
 * EDITA uma mensagem já publicada pelo bot num canal.
 *
 * Serve para quando a FONTE edita o texto: em vez de publicar uma correção nova (que o cliente
 * lê como um segundo sinal), corrige-se a mensagem que já lá está, como o trader fez no canal
 * dele. O Telegram devolve "message is not modified" quando o texto é igual — isso é sucesso,
 * não erro: significa que já estava certo.
 */
export async function editTelegramChannelMessage(
  chatId: string,
  messageId: number,
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown' },
): Promise<{ ok: boolean; unchanged?: boolean; error?: string }> {
  const token = getMtmcopyBotToken()
  if (!token) return { ok: false, error: 'TELEGRAM_AIBOT_TOKEN não configurado' }

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parseMode,
      disable_web_page_preview: true,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; description?: string }
  if (data.ok) return { ok: true }
  if (/message is not modified/i.test(data.description ?? '')) return { ok: true, unchanged: true }
  return { ok: false, error: data.description ?? 'Falha ao editar mensagem' }
}

export async function sendTelegramChannelMessage(
  chatId: string,
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown'; replyToMessageId?: number | null },
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const token = getMtmcopyBotToken()
  if (!token) return { ok: false, error: 'TELEGRAM_AIBOT_TOKEN não configurado' }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode,
      disable_web_page_preview: true,
      // Encadeamento: update (TP/SL/BE) publicado como RESPOSTA à mensagem do sinal.
      ...(options?.replyToMessageId
        ? { reply_parameters: { message_id: options.replyToMessageId, allow_sending_without_reply: true } }
        : {}),
    }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    description?: string
    result?: { message_id?: number }
  }
  if (!data.ok) {
    return { ok: false, error: data.description ?? 'Falha ao enviar mensagem' }
  }
  const messageId = data.result?.message_id
  // Relay best-effort para o parceiro (Wifi Money): cobre as mensagens que o próprio bot
  // publica na Premium (o webhook não as entrega). Só dispara se o chat for o canal-fonte.
  try {
    const [{ relayTextToWifi }, { getSupabaseAdmin }] = await Promise.all([
      import('@/lib/telegram/relay'),
      import('@/lib/supabase-admin-client'),
    ])
    await relayTextToWifi(getSupabaseAdmin(), text, messageId ?? Date.now(), chatId, options?.replyToMessageId ?? null)
  } catch {
    /* nunca bloquear o envio principal */
  }
  return { ok: true, messageId }
}

export async function getMtmcopyWebhookInfo(): Promise<{
  url?: string
  pending_update_count?: number
  last_error_message?: string | null
} | null> {
  const token = getMtmcopyBotToken()
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      next: { revalidate: 0 },
    })
    const data = (await res.json()) as { ok?: boolean; result?: Record<string, unknown> }
    if (!data.ok || !data.result) return null
    return {
      url: typeof data.result.url === 'string' ? data.result.url : undefined,
      pending_update_count:
        typeof data.result.pending_update_count === 'number'
          ? data.result.pending_update_count
          : undefined,
      last_error_message:
        typeof data.result.last_error_message === 'string'
          ? data.result.last_error_message
          : null,
    }
  } catch {
    return null
  }
}

export async function registerMtmcopyTelegramWebhook(
  siteUrl: string,
): Promise<{ ok: boolean; description?: string; webhook_url?: string }> {
  const token = getMtmcopyBotToken()
  if (!token) return { ok: false, description: 'TELEGRAM_AIBOT_TOKEN em falta' }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const webhookUrl = secret
    ? `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook?secret=${encodeURIComponent(secret)}`
    : `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook`

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query', 'my_chat_member'],
      drop_pending_updates: false,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; description?: string }
  return {
    ok: data.ok === true,
    description: data.description,
    webhook_url: webhookUrl,
  }
}

/** @deprecated usar registerMtmcopyTelegramWebhook */
export async function registerTelegramWebhook(siteUrl: string) {
  return registerMtmcopyTelegramWebhook(siteUrl)
}
