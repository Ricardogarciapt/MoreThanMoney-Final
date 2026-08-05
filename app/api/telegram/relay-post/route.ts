import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

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
