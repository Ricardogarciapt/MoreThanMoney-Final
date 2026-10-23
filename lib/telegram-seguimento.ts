/**
 * SEGUIMENTO NO TELEGRAM — o mesmo cartão que o chat da app recebe, em resposta à entrada.
 *
 * Pedido do dono (23/10/2026): os grupos Telegram que são fonte de sinais têm de receber o
 * seguimento da trade (alvos, break-even, stop, fecho), tal como os chats da app. Até aqui o
 * tracker de preço só escrevia no chat e mandava um push; o Telegram ficava com a entrada e mais
 * nada (GoldKiller: 30 seguimentos no chat, 0 no grupo, numa semana).
 *
 * Só canais com grupo próprio entram no mapa. O cartão vai como RESPOSTA à mensagem da entrada
 * (`chat_messages.telegram_message_id`); sem esse id não se envia — um «🎯 Alvo 1» solto num
 * grupo com dezenas de sinais por dia não diz a que trade pertence.
 *
 * Nunca lança: o Telegram em baixo não pode parar o tracker.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import {
  CANONICAL_TELEGRAM_CHANNELS,
  normalizeEnvChatId,
  resolvedForexIdeasChatId,
  resolvedGoldkillerScannerChatId,
  resolvedPerpsChatId,
} from '@/lib/telegram-channel-ids'

/** Grupo «Ideias e sinais - Scanner TrendShot» (env; sem env → não publica no Telegram). */
export function grupoTelegramTrendshot(): string | null {
  return normalizeEnvChatId(process.env.TELEGRAM_CHANNEL_TRENDSHOT ?? process.env.TELEGRAM_TRENDSHOT_CHAT_ID)
}

/** Canal da app → grupo Telegram que recebe o seguimento. */
export function grupoDoSeguimento(canal: string | null | undefined): string | null {
  switch (canal) {
    case 'sinais-goldkiller':
      return resolvedGoldkillerScannerChatId() || null
    case 'trade-ideas-setup':
      return resolvedForexIdeasChatId() || null
    case 'ideias-e-sinais': {
      const c = CANONICAL_TELEGRAM_CHANNELS.forexSwings
      const env = c.envVars.map((k) => process.env[k]).find((v) => v?.trim())
      return normalizeEnvChatId(env) ?? c.chatId
    }
    case 'aurum-flow':
      return resolvedPerpsChatId()
    case 'sinais-trendshot':
      return grupoTelegramTrendshot()
    default:
      return null
  }
}

/** Envia `texto` ao grupo do canal, em resposta à entrada `entradaChatId`. */
export async function enviarSeguimentoTelegram(a: {
  canal: string
  entradaChatId: string
  texto: string
}): Promise<boolean> {
  try {
    const chatId = grupoDoSeguimento(a.canal)
    const token = getMtmcopyBotToken()
    if (!chatId || !token) return false
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('telegram_message_id')
      .eq('id', a.entradaChatId)
      .maybeSingle()
    const replyTo = Number(data?.telegram_message_id)
    if (!Number.isFinite(replyTo) || replyTo <= 0) return false
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: a.texto,
        reply_to_message_id: replyTo,
        allow_sending_without_reply: true,
        disable_web_page_preview: true,
      }),
    })
    const j = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
    if (!j?.ok) console.warn('[telegram-seguimento]', a.canal, j?.description ?? res.status)
    return !!j?.ok
  } catch (e) {
    console.warn('[telegram-seguimento] falhou:', e instanceof Error ? e.message : String(e))
    return false
  }
}
