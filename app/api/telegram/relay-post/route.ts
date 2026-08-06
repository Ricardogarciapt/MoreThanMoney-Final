import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { resolveAppChannelSlug } from '@/lib/telegram-app-channels'

/**
 * Espelha a mensagem relayada no CHAT da app (ex.: Premium → 'premium-ideas'), como o webhook faria.
 * Necessário porque o Telegram não entrega ao webhook as mensagens do próprio bot → sem isto o chat
 * Premium da app fica vazio. Assim, o sinal aparece no chat (como no Telegram) E ganha o botão
 * Tap to Trade (premium-ideas está no âmbito T2T). Best-effort + dedup por telegram_message_id.
 */
async function mirrorToAppChat(chatId: string, text: string, messageId: number | null | undefined) {
  try {
    const slug = resolveAppChannelSlug({ id: Number(chatId), title: 'MTM Premium' })
    if (!slug) return
    const supabase = getSupabaseAdmin()
    if (messageId) {
      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('telegram_message_id', messageId)
        .eq('channel_slug', slug)
        .maybeSingle()
      if (existing) return // já espelhado
    }
    const senderName = slug === 'premium-ideas' ? 'MoreThanMoney Premium Signals' : 'Telegram'
    await supabase.from('chat_messages').insert({
      channel_slug: slug,
      user_id: null,
      content: text,
      message_type: 'telegram_forward',
      telegram_sender: senderName,
      telegram_message_id: messageId ?? null,
      notified: true,
    })
  } catch (e) {
    console.error('[relay-post] espelho chat app erro:', e instanceof Error ? e.message : e)
  }
}

// Endpoint p/ os relays (VPS Telethon) publicarem via o BOT do site — o token válido vive só
// na Vercel, por isso o relay NÃO precisa dele. Autenticado por Bearer CRON_SECRET. Só POST de texto.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    chat_id?: string | number
    text?: string
    reply_to_message_id?: number
  }
  const chatId = body.chat_id != null ? String(body.chat_id) : ''
  const text = (body.text ?? '').toString()
  if (!chatId || !text.trim()) {
    return NextResponse.json({ ok: false, error: 'chat_id e text obrigatórios' }, { status: 400 })
  }
  const replyTo = typeof body.reply_to_message_id === 'number' ? body.reply_to_message_id : null
  const r = await sendTelegramChannelMessage(chatId, text.trim(), { replyToMessageId: replyTo })

  // EXECUÇÃO: o Telegram não entrega ao webhook as mensagens do próprio bot, por isso o
  // processador (Premium/Forex/Sensei-telegram) nunca as veria. Alimentamo-lo aqui direto.
  // O processador auto-filtra por allowlist de canais (chats não-ativos são ignorados) e
  // tem guarda de duplicados — seguro chamar para tudo o que passa por aqui.
  if (r.ok) {
    // Espelha no chat da app (Premium → premium-ideas) para aparecer + ter o botão Tap to Trade.
    await mirrorToAppChat(chatId, text.trim(), r.messageId)
    try {
      const { processMtmcopyTelegramMessage } = await import('@/lib/mtmcopy/processor')
      const execText = text.trim().replace(/^\s*🏦[^\n]*\n+/, '') // tira o cabeçalho de marca
      await processMtmcopyTelegramMessage({
        chat: { id: Number(chatId), type: 'channel', title: 'MTM Premium' },
        text: execText,
        message_id: r.messageId ?? 0,
        ...(replyTo ? { reply_to_message: { message_id: replyTo } } : {}),
      } as Parameters<typeof processMtmcopyTelegramMessage>[0])
    } catch (e) {
      console.error('[relay-post] processador erro:', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: r.ok, messageId: r.messageId, error: r.error })
}
