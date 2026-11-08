/**
 * ESPELHO CHAT → TELEGRAM — o que entra num chat da app sai, igual, num grupo Telegram.
 *
 * 03/11/2026, pedido do dono: o canal Telegram «MTM Auto Premium II» recebe TUDO o que sai no chat
 * `sinais-premium-ii`: o sinal (com o gráfico), as imagens e o acompanhamento da trade (entrada
 * tocada, parciais, break-even, fecho, descarte). Os vários escritores desse chat (webhook do
 * Premium Scanner, motor de preço, T2T, desfechos) não precisam de saber do Telegram: este espelho
 * lê o chat e manda o que ainda não tem `telegram_message_id`.
 *
 *   · seguimento em resposta (reply_to_id) → responde à mensagem-mãe no Telegram;
 *   · mensagem com imagem → sendPhoto com o texto na legenda (gráfico do sinal em PNG);
 *   · cada mensagem é reclamada uma vez (`mtmcopy_signal_dedup`) — pode correr no webhook e no
 *     cron de minuto a minuto ao mesmo tempo sem duplicar;
 *   · só olha para os últimos 30 min: ligar o espelho não despeja o histórico no grupo.
 *
 * O grupo é só destino: o que lá se escreve não volta à app (lib/telegram-app-channels ›
 * GRUPOS_FECHADOS).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { claimSignalOnce } from '@/lib/mtmcopy/premium-single'
import { resolvedPremiumIIChatId, resolvedDefyChatId, resolvedRocketnovaChatId } from '@/lib/telegram-channel-ids'

const TG_TOKEN = () => (process.env.TELEGRAM_AIBOT_TOKEN || '').trim()
const JANELA_MS = 30 * 60_000
const TTL_RECLAMACAO_S = 60 * 60 * 24 * 7
const MAX_POR_PASSAGEM = 20

/** chat da app → grupo Telegram de destino. */
export const ESPELHOS: Array<{ canal: string; telegram: () => string | null }> = [
  { canal: 'sinais-premium-ii', telegram: resolvedPremiumIIChatId },
  // DEFY (04/11): grupo «MoreThanMoney Defy Signals».
  { canal: 'sinais-defy', telegram: resolvedDefyChatId },
  // RocketNova (08/11): só com TELEGRAM_CHANNEL_ROCKETNOVA definido.
  { canal: 'sinais-rocketnova', telegram: resolvedRocketnovaChatId },
]

interface Mensagem {
  id: string
  content: string | null
  image_url: string | null
  reply_to_id: string | null
  created_at: string
}

/** O gráfico do sinal sai em SVG na app; o Telegram só aceita PNG/JPG. */
export function imagemParaTelegram(url: string | null | undefined): string | null {
  const u = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(u)) return null
  if (u.includes('/api/signals/chart-image') && !/[?&]f=png\b/.test(u)) return `${u}${u.includes('?') ? '&' : '?'}f=png`
  return u
}

async function chamarTelegram(metodo: 'sendMessage' | 'sendPhoto', corpo: Record<string, unknown>): Promise<number | null> {
  const token = TG_TOKEN()
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(metodo === 'sendPhoto' ? 25_000 : 10_000),
    })
    const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null
    if (!j?.ok) {
      console.warn(`[espelho-telegram] ${metodo}:`, j?.description ?? r.status)
      return null
    }
    return Number(j.result?.message_id ?? 0) || null
  } catch (e) {
    console.warn('[espelho-telegram] falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Envia UMA mensagem do chat para o grupo. Devolve o id da mensagem no Telegram. */
async function enviar(chatTelegram: string, m: Mensagem, responderA: number | null): Promise<number | null> {
  const texto = String(m.content ?? '').trim()
  const foto = imagemParaTelegram(m.image_url)
  const resposta = responderA != null ? { reply_to_message_id: responderA, allow_sending_without_reply: true } : {}
  if (foto) {
    // Legenda até 1024: um texto maior vai primeiro como mensagem e a foto responde-lhe.
    if (texto.length <= 1000) {
      const id = await chamarTelegram('sendPhoto', { chat_id: chatTelegram, photo: foto, ...(texto ? { caption: texto } : {}), ...resposta })
      if (id) return id
      // Foto recusada (render lento, URL privado): o texto não se perde.
      if (!texto) return null
      return chamarTelegram('sendMessage', { chat_id: chatTelegram, text: texto, disable_web_page_preview: true, ...resposta })
    }
    const idTexto = await chamarTelegram('sendMessage', { chat_id: chatTelegram, text: texto.slice(0, 4000), disable_web_page_preview: true, ...resposta })
    if (idTexto) await chamarTelegram('sendPhoto', { chat_id: chatTelegram, photo: foto, reply_to_message_id: idTexto, allow_sending_without_reply: true, disable_notification: true })
    return idTexto
  }
  if (!texto) return null
  return chamarTelegram('sendMessage', { chat_id: chatTelegram, text: texto.slice(0, 4000), disable_web_page_preview: true, ...resposta })
}

export interface ResumoEspelho { canal: string; enviadas: number; falhadas: number }

/** Uma passagem por todos os espelhos. Idempotente; nunca lança. */
export async function espelharCanaisParaTelegram(): Promise<ResumoEspelho[]> {
  const out: ResumoEspelho[] = []
  if (!TG_TOKEN()) return out
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - JANELA_MS).toISOString()
  for (const e of ESPELHOS) {
    const resumo: ResumoEspelho = { canal: e.canal, enviadas: 0, falhadas: 0 }
    out.push(resumo)
    const chatTelegram = e.telegram()
    if (!chatTelegram) continue
    try {
      const { data } = await db
        .from('chat_messages')
        .select('id, content, image_url, reply_to_id, created_at')
        .eq('channel_slug', e.canal)
        .is('telegram_message_id', null)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('created_at', desde)
        .order('created_at', { ascending: true })
        .limit(MAX_POR_PASSAGEM)
      for (const m of (data ?? []) as Mensagem[]) {
        if (!String(m.content ?? '').trim() && !m.image_url) continue
        const chave = `espelho-tg:${e.canal}:${m.id}`
        if (!(await claimSignalOnce(chave, TTL_RECLAMACAO_S))) continue
        let responderA: number | null = null
        if (m.reply_to_id) {
          const { data: mae } = await db.from('chat_messages').select('telegram_message_id').eq('id', m.reply_to_id).maybeSingle()
          const n = Number(mae?.telegram_message_id ?? 0)
          responderA = Number.isFinite(n) && n > 0 ? n : null
        }
        const tgId = await enviar(chatTelegram, m, responderA)
        if (!tgId) {
          // Falhou: devolve a reclamação para a próxima passagem tentar outra vez.
          await db.from('mtmcopy_signal_dedup').delete().eq('key', chave)
          resumo.falhadas++
          continue
        }
        await db.from('chat_messages').update({ telegram_message_id: tgId }).eq('id', m.id)
        resumo.enviadas++
      }
    } catch (err) {
      console.warn('[espelho-telegram]', e.canal, err instanceof Error ? err.message : String(err))
    }
  }
  return out
}
