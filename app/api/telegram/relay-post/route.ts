import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { resolveAppChannelSlug } from '@/lib/telegram-app-channels'
import { resolveReplyToChatMessageId } from '@/lib/telegram-reply-thread'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'

// Premium: espelhamos aqui o TEXTO LITERAL do Telegram para o 'premium-ideas' (pedido Ricardo —
// mensagens idênticas ao Telegram, com zona/entrada/TP1-3/comentário). O master-poll deixa de postar
// o render terso quando já existe este literal (passa a fallback), por isso não há duplicação. As
// mensagens do próprio bot não voltam ao webhook, logo esta é a única inserção do literal na app.

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
    /** id da msg NO DESTINO a que responder (se o VPS já o souber). Normalmente não sabe. */
    reply_to_message_id?: number
    /** Texto do SINAL-PAI (o SETUP a que este HIT/update responde) — dá o contexto ao executor
     *  para casar a gestão com o sinal certo. */
    reply_to_text?: string
    /** id + canal da msg NA FONTE (New York/London Intelligence) — para encadear as RESPOSTAS
     *  no destino (mapa fonte→destino em telegram_relay_log), tal como aparecem no canal original. */
    source_chat_id?: string | number
    source_message_id?: number
    reply_to_source_id?: number
  }
  const chatId = body.chat_id != null ? String(body.chat_id) : ''
  const rawText = (body.text ?? '').toString()
  if (!chatId || !rawText.trim()) {
    return NextResponse.json({ ok: false, error: 'chat_id e text obrigatórios' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const slug = resolveAppChannelSlug({ id: Number(chatId) })

  // BRANDING do canal: garante o cabeçalho "🏦 MTM Premium" (como no canal original), sem duplicar.
  let outText = rawText.trim()
  if (slug === 'premium-ideas' && !/^\s*🏦/.test(outText)) {
    outText = `🏦 MTM Premium\n\n${outText}`
  }

  const replyTo = typeof body.reply_to_message_id === 'number' ? body.reply_to_message_id : null
  const replyText = typeof body.reply_to_text === 'string' && body.reply_to_text.trim() ? body.reply_to_text.trim() : null
  const sourceChatId = body.source_chat_id != null ? String(body.source_chat_id) : null
  const sourceMsgId = typeof body.source_message_id === 'number' ? body.source_message_id : null
  const replyToSourceId = typeof body.reply_to_source_id === 'number' ? body.reply_to_source_id : null

  // THREADING (Respostas como no original): resolve a msg-pai NO DESTINO a partir da msg-pai na FONTE.
  let replyToDest: number | null = replyTo
  if (replyToDest == null && replyToSourceId != null && sourceChatId) {
    try {
      const { data: parent } = await supabase
        .from('telegram_relay_log')
        .select('target_message_id')
        .eq('source_chat_id', sourceChatId)
        .eq('source_message_id', replyToSourceId)
        .eq('target_chat_id', chatId)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .maybeSingle()
      replyToDest = parent?.target_message_id ?? null
    } catch { /* best-effort: sem mapa → publica na mesma, só não encadeia */ }
  }

  // DEDUP ATÓMICO: com ids da fonte, reservamos a linha no mapa ANTES de publicar. Conflito no
  // unique (source_chat_id, source_message_id, target_chat_id) → já foi relayado (pelo real-time OU
  // por um poll anterior) → NÃO repetir: evita duplicados no canal e dupla execução. Isto é o que
  // permite ao POLLER de segurança reenviar sem risco (só passam mensagens ainda em falta).
  let claimId: string | null = null
  if (sourceChatId && sourceMsgId != null) {
    const { data: claim } = await supabase
      .from('telegram_relay_log')
      .insert({ source_chat_id: sourceChatId, source_message_id: sourceMsgId, target_chat_id: chatId, status: 'pending' })
      .select('id')
      .maybeSingle()
    if (claim) {
      claimId = claim.id as string
    } else {
      // Conflito no unique → já existe linha. Só é duplicado REAL se já foi publicada ('sent').
      // Se ficou em 'error'/'pending' (envio anterior falhou), reaproveitamos a linha p/ RETENTAR.
      const { data: ex } = await supabase
        .from('telegram_relay_log')
        .select('id, status')
        .eq('source_chat_id', sourceChatId)
        .eq('source_message_id', sourceMsgId)
        .eq('target_chat_id', chatId)
        .maybeSingle()
      if (!ex || ex.status === 'sent') return NextResponse.json({ ok: true, skipped: 'dup' })
      claimId = ex.id as string
    }
  }

  const r = await sendTelegramChannelMessage(chatId, outText, { replyToMessageId: replyToDest })

  // Fecha a reserva com o id da msg no destino (para futuras RESPOSTAS encadearem por este mapa).
  if (claimId) {
    await supabase
      .from('telegram_relay_log')
      .update({ status: r.ok ? 'sent' : 'error', target_message_id: r.messageId ?? null, error: r.ok ? null : (r.error ?? 'falha') })
      .eq('id', claimId)
  }

  // EXECUÇÃO: o Telegram não entrega ao webhook as mensagens do próprio bot, por isso o
  // processador (Premium/Forex/Sensei-telegram) nunca as veria. Alimentamo-lo aqui direto.
  // O processador auto-filtra por allowlist de canais (chats não-ativos são ignorados) e
  // tem guarda de duplicados — seguro chamar para tudo o que passa por aqui.
  // RECEÇÃO: se o canal estiver desligado no admin, não processa nem espelha (o relay do VPS
  // continua a chamar, mas nada entra no sistema).
  const intakeSlug = slug === 'premium-ideas' ? 'premium' : null
  if (intakeSlug) {
    const { isIntakeEnabled } = await import('@/lib/mtmcopy/intake-switches')
    if (!(await isIntakeEnabled(intakeSlug as 'premium'))) {
      return NextResponse.json({ ok: true, skipped: 'intake_off', channel: 'premium' })
    }
  }

  const execText = outText.replace(/^\s*🏦[^\n]*\n+/, '') // tira o cabeçalho de marca
  if (r.ok) {
    try {
      const { processMtmcopyTelegramMessage } = await import('@/lib/mtmcopy/processor')
      await processMtmcopyTelegramMessage({
        chat: { id: Number(chatId), type: 'channel', title: 'MTM Premium' },
        text: execText,
        message_id: r.messageId ?? 0,
        // reply_to_message com TEXT → o executor resolve o sinal-pai direto (sem depender de
        // threading/lookup). Passamos o message_id (se houver) e/ou o texto do SETUP.
        ...(replyTo || replyText
          ? { reply_to_message: { ...(replyTo ? { message_id: replyTo } : {}), ...(replyText ? { text: replyText } : {}) } }
          : {}),
      } as Parameters<typeof processMtmcopyTelegramMessage>[0])
    } catch (e) {
      console.error('[relay-post] processador erro:', e instanceof Error ? e.message : e)
    }

    // ESPELHO DO LITERAL → chat da app (só Premium/'premium-ideas'). Sem etiqueta (telegram_sender=null,
    // pedido Ricardo). Dedup por telegram_message_id. O T2T reconhece a entrada pelo próprio texto.
    try {
      if (slug === 'premium-ideas' && r.messageId) {
        const { data: dup } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('channel_slug', slug)
          .eq('telegram_message_id', r.messageId)
          .maybeSingle()
        if (!dup) {
          const { data: msg } = await supabase
            .from('chat_messages')
            .insert({
              channel_slug: slug,
              user_id: null,
              content: execText,
              message_type: 'telegram_forward',
              telegram_sender: null,
              telegram_message_id: r.messageId,
              notified: true,
              // Threading: follow-ups (HIT TP1/BE/fecho) são REPLIES no Telegram → responder ao
              // mesmo pai no chat da app (senão aparecem todos ao mesmo nível).
              ...(await resolveReplyToChatMessageId(slug, replyTo).then((id) => (id ? { reply_to_id: id } : {}))),
            })
            .select('id')
            .single()
          await sendTelegramChannelPush({ slug, content: execText, chatMessageId: msg?.id as string, telegramMessageId: r.messageId }).catch(() => {})
        }
      }
    } catch (e) {
      console.error('[relay-post] espelho premium erro:', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: r.ok, messageId: r.messageId, error: r.error })
}
