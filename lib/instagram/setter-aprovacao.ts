/**
 * APROVAÇÃO HUMANA DA DM DO SETTER (10/11/2026).
 *
 * A DM ao comentador saía sozinha (`enviar_dm: true`, decisão de 06/10). A auditoria da máquina de
 * vendas de 10/11 pediu um humano no circuito: a Meta só dá UMA private reply por comentário, e uma
 * DM mal escrita queima o lead sem segunda tentativa.
 *
 * Como funciona: o setter grava a DM como `rascunho` e chama `pedirAprovacaoDm`, que manda ao chat
 * do dono (TELEGRAM_ADMIN_CHAT_ID) o comentário, a DM e dois botões. «Enviar» passa a linha a
 * `pendente` e usa o MESMO caminho do reenvio (`reenviarDm`), que respeita as 48 h do comentário.
 * «Descartar» fecha-a como `descartado`. Nada mais muda no setter.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { chatDeAdminDoAmbiente } from '@/lib/telegram-admin-menu'

export const PREFIXO_IGDM = 'igdm:'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Puro: o texto e os botões do pedido de aprovação. */
export function mensagemDeAprovacao(p: {
  commentId: string
  commenter: string | null
  comentario: string
  textoDm: string
  horasDesdeComentario: number | null
}): { texto: string; teclado: unknown } {
  const resta = p.horasDesdeComentario == null ? '' : ` · expira em ~${Math.max(0, Math.round(48 - p.horasDesdeComentario))} h`
  return {
    texto:
      `📸 <b>DM do setter à espera de OK</b>${resta}\n\n` +
      `<b>@${esc(p.commenter ?? '?')}</b> comentou:\n<i>${esc(p.comentario.slice(0, 400))}</i>\n\n` +
      `<b>DM que sai:</b>\n${esc(p.textoDm.slice(0, 1200))}`,
    teclado: {
      inline_keyboard: [[
        { text: '✅ Enviar DM', callback_data: `${PREFIXO_IGDM}ok:${p.commentId}`.slice(0, 64) },
        { text: '🗑 Descartar', callback_data: `${PREFIXO_IGDM}no:${p.commentId}`.slice(0, 64) },
      ]],
    },
  }
}

/** Puro: lê o botão. */
export function lerBotaoDm(data: string): { acao: 'ok' | 'no'; commentId: string } | null {
  const m = /^igdm:(ok|no):([0-9_]{5,60})$/.exec(String(data ?? ''))
  return m ? { acao: m[1] as 'ok' | 'no', commentId: m[2] } : null
}

export async function pedirAprovacaoDm(p: Parameters<typeof mensagemDeAprovacao>[0]): Promise<void> {
  const bot = getMtmcopyBotToken()
  const chat = chatDeAdminDoAmbiente()
  if (!bot || !chat) return
  const m = mensagemDeAprovacao(p)
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: m.texto, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: m.teclado }),
    })
  } catch (e) {
    console.error('[setter-aprovacao] aviso ao dono falhou', e)
  }
}

/** Aplica a decisão do dono. Devolve o texto de confirmação para o chat. */
export async function decidirDmPorTelegram(data: string): Promise<string> {
  const b = lerBotaoDm(data)
  if (!b) return 'Botão desconhecido.'
  const db = getSupabaseAdmin()
  if (b.acao === 'no') {
    const { data: r } = await db
      .from('ig_setter_rascunhos')
      .update({ estado: 'descartado', erro: 'descartado pelo dono (Telegram)' })
      .eq('comment_id', b.commentId)
      .eq('estado', 'rascunho')
      .select('comment_id')
    return r?.length ? '🗑 DM descartada.' : 'Esta DM já não estava à espera (já saiu, expirou ou foi decidida).'
  }
  const { data: r } = await db
    .from('ig_setter_rascunhos')
    .update({ estado: 'pendente', erro: null })
    .eq('comment_id', b.commentId)
    .eq('estado', 'rascunho')
    .eq('dm_possivel', true)
    .select('comment_id')
  if (!r?.length) return 'Esta DM já não estava à espera (já saiu, expirou ou foi decidida).'
  const { reenviarDm } = await import('./setter')
  const x = await reenviarDm(b.commentId)
  if (x.ok) return '✅ DM enviada.'
  if (x.estado === 'expirado') return '⌛ Passaram as 48 h do comentário: a DM já não pode sair.'
  return `⚠️ Não saiu (${esc(x.erro ?? x.estado)}). Fica pendente e o cron tenta outra vez até às 48 h.`
}
