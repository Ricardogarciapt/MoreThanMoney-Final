import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const escHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

/** Aviso ao dono no Telegram (HTML). Nunca rebenta quem o chama. */
export async function avisarDonoSolucoes(texto: string): Promise<void> {
  try {
    const { sendTelegramChannelMessage } = await import('@/lib/mtmcopy/telegram-bot')
    let chat = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || ''
    if (!chat) {
      const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
      const v = data?.value as { chat_id?: string } | string | null
      chat = typeof v === 'string' ? v : v?.chat_id ? String(v.chat_id) : ''
    }
    if (chat) await sendTelegramChannelMessage(chat, texto, { parseMode: 'HTML' })
  } catch (e) {
    console.error('[solucoes] aviso ao dono falhou:', e instanceof Error ? e.message : e)
  }
}
