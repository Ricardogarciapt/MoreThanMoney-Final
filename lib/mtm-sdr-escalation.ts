import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Escalada de leads QUENTES para o admin (supervisão da máquina de vendas).
 * Quando o SDR de IA deteta intenção de compra / pedido de falar com humano / depósito feito,
 * avisa o Ricardo no chat de admin do Telegram para ele SALTAR para a conversa. Autónomo, mas
 * com a tua supervisão nos momentos que valem dinheiro. Dedup: 1 escalada por lead / 6h.
 */
const ADMIN_CHAT = () =>
  process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230' // Ricardo (site_settings.telegram_admin_chat_id)

// Sinais de "lead quente" na MENSAGEM do lead (não na resposta da IA).
const HOT = new RegExp(
  [
    'paguei', 'paga(r|mento)', 'comprar', 'compro', 'inscrev', 'quero (começar|come[çc]ar|entrar|isto|já|ja)',
    'quanto (custa|é|e|fica)', 'pre[çc]o', 'cart[ãa]o', 'transferi', 'depositei', 'fiz o dep[óo]sito',
    'j[áa] depositei', 'uid', 'falar com (algu[ée]m|humano|ricardo|uma pessoa)', 'humano', 'whatsapp',
    'chamada', 'liga(r|-me)', 'urgente', 'estou pronto', 'bora', 'vamos a isto',
  ].join('|'),
  'i',
)

interface EscalateInput {
  chatId: string
  username?: string | null
  firstName?: string | null
  userText: string
  aiReply?: string | null
  channel?: string // 'telegram' | 'instagram' | ...
}

/** Deteta lead quente + avisa o admin (best-effort, nunca lança). Devolve true se escalou. */
export async function maybeEscalateLead(input: EscalateInput): Promise<boolean> {
  try {
    const text = (input.userText || '').trim()
    if (!text || !HOT.test(text)) return false

    const supabase = getSupabaseAdmin()
    // Dedup: só escala se não houve escalada nas últimas 6h para este lead.
    const key = `sdr_escalated_${input.chatId}`
    const { data: last } = await supabase
      .from('site_settings').select('value').eq('key', key).maybeSingle()
    const lastTs = Number((last?.value as { ts?: number } | null)?.ts || 0)
    if (Date.now() - lastTs < 6 * 3600 * 1000) return false

    const who = input.username ? `@${input.username}` : input.firstName || input.chatId
    const jump = input.username ? `\n➡️ Saltar: https://t.me/${input.username}` : ''
    const ch = input.channel ? ` [${input.channel}]` : ''
    const msg =
      `🔥 LEAD QUENTE${ch} — ${who}\n\n` +
      `💬 Disse: "${text.slice(0, 180)}"\n` +
      (input.aiReply ? `🤖 IA respondeu: "${input.aiReply.slice(0, 120)}"\n` : '') +
      `\nEstá pronto — considera saltar para a conversa.${jump}`

    await sendTelegramChannelMessage(ADMIN_CHAT(), msg)
    await supabase.from('site_settings').upsert({ key, value: { ts: Date.now() } }, { onConflict: 'key' })
    return true
  } catch (e) {
    console.error('[sdr-escalation] erro:', e instanceof Error ? e.message : e)
    return false
  }
}
