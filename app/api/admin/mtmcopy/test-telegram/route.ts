import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { TELEGRAM_GROUPS } from '@/lib/mtmcopy/copy-methods'
import { processMtmcopyTelegramMessage } from '@/lib/mtmcopy/processor'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

const CHANNEL_CHAT: Record<string, string> = {
  'premium-signals': TELEGRAM_GROUPS.find((g) => g.id === 'premium')!.chatId,
  'trade-ideas': TELEGRAM_GROUPS.find((g) => g.id === 'trade_ideas')!.chatId,
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const {
    channel,
    chat_id,
    text,
    send_to_telegram,
    run_pipeline,
  } = body as {
    channel?: 'premium-signals' | 'trade-ideas'
    chat_id?: string
    text?: string
    send_to_telegram?: boolean
    run_pipeline?: boolean
  }

  if (!text?.trim()) {
    return NextResponse.json({ ok: false, error: 'text obrigatório' }, { status: 400 })
  }

  const chatId = chat_id?.trim() || (channel ? CHANNEL_CHAT[channel] : null)
  if (!chatId) {
    return NextResponse.json({ ok: false, error: 'channel ou chat_id obrigatório' }, { status: 400 })
  }

  let telegramMessageId: number | undefined

  if (send_to_telegram !== false) {
    const sent = await sendTelegramChannelMessage(chatId, text.trim())
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 422 })
    }
    telegramMessageId = sent.messageId
  }

  if (run_pipeline) {
    await processMtmcopyTelegramMessage({
      message_id: telegramMessageId ?? Math.floor(Date.now() / 1000),
      text: text.trim(),
      chat: {
        id: Number(chatId),
        title: channel === 'trade-ideas' ? 'Trade Ideas' : 'Premium Signals',
        type: 'channel',
      },
    })
  }

  return NextResponse.json({
    success: true,
    ok: true,
    chat_id: chatId,
    telegram_message_id: telegramMessageId,
    pipeline: Boolean(run_pipeline),
    sent_to_telegram: send_to_telegram !== false,
    message: run_pipeline
      ? 'Mensagem processada pelo pipeline MTMcopy (provider + subscribers)'
      : 'Mensagem publicada no canal Telegram',
  })
}
