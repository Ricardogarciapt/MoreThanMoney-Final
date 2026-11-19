/**
 * REELS DO CLONE → APROVAÇÃO DO RICARDO NO TELEGRAM → PUBLICAÇÃO SOZINHA (19/11/2026).
 *
 * Pedido dele: «quero eu poder aprovar no briefing os reels para se auto publicar».
 *
 * Caminho: «Fazer com o clone» (HeyGen) → projecto do editor → o Mac monta (legendas, gancho, CTA)
 * → `rascunhoDoReelDoClone` põe o reel na fila do Instagram como RASCUNHO e manda-lhe o vídeo no
 * Telegram com dois botões. «Publicar» passa-o a `approved` para a próxima janela das 20:30 de
 * Lisboa (um por dia) e o ig-publish publica-o no @ricardogarciapt. «Descartar» cancela-o.
 * Na vista «🧠 Hoje» aparece quantos estão à espera.
 *
 * O botão dele é o interruptor: nada deste criador sai sem passar por `decidirReelPorTelegram`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { chatDeAdminDoAmbiente } from '@/lib/telegram-admin-menu'
import { ARROBA, IG_ID } from '@/lib/carrossel-diario/tipos'
import { corrigirPtPt } from '@/lib/pt-pt'
import { CRIADOR_REELS_CLONE } from '@/lib/instagram/publish'
import { normalizarProjeto } from './projeto'

export const PREFIXO_REEL = 'reel:'
const HORA_JANELA = { h: 20, m: 30 } // Lisboa
const DISCLAIMER = 'Conteúdo educativo, não é aconselhamento financeiro. Resultados passados não garantem resultados futuros.'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Puro: lê o botão. */
export function lerBotaoReel(data: string): { acao: 'ok' | 'no'; postId: string } | null {
  const m = /^reel:(ok|no):([0-9a-f-]{36})$/i.exec(String(data ?? ''))
  return m ? { acao: m[1] as 'ok' | 'no', postId: m[2] } : null
}

/** Minutos de diferença entre Lisboa e UTC num instante (0 no inverno, 60 no verão). */
function desvioLisboaMin(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  )
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((local - Math.floor(ms / 60000) * 60000) / 60000)
}

/** Puro: a primeira janela das 20:30 de Lisboa estritamente depois de `depoisMs` (com 10 min de folga). */
export function proximaJanela(depoisMs: number): Date {
  const base = depoisMs + 10 * 60000
  for (let d = 0; d < 3; d++) {
    const dia = new Date(base + d * 86400000 + desvioLisboaMin(base) * 60000)
    const alvoUtc = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), HORA_JANELA.h, HORA_JANELA.m)
    const alvo = alvoUtc - desvioLisboaMin(alvoUtc) * 60000
    if (alvo > base) return new Date(alvo)
  }
  return new Date(base + 86400000)
}

/** Puro: a legenda do reel a partir do guião (CTA da palavra-chave, hashtags, disclaimer). */
export function legendaDoGuiao(g: Record<string, any>): string {
  const hashtags = (Array.isArray(g.hashtags) ? g.hashtags : []).slice(0, 8).map((h: string) => (String(h).startsWith('#') ? h : `#${h}`)).join(' ')
  const cta = g.palavra_chave ? `\n\nComenta «${g.palavra_chave}» e eu envio-te o próximo passo.` : ''
  const corpo = `${g.legenda || g.nicho || ''}${cta}\n\n${DISCLAIMER}${hashtags ? `\n\n${hashtags}` : ''}`.trim()
  return corrigirPtPt(corpo).texto.slice(0, 2200)
}

/**
 * Projecto do editor acabado de montar. Se é um reel do clone (o clip vem de um ativo da HeyGen
 * ligado a um guião), entra na fila como rascunho e o Ricardo recebe o pedido de aprovação.
 * Nunca lança; devolve o id do post criado (ou null).
 */
export async function rascunhoDoReelDoClone(db: SupabaseClient, projetoId: string): Promise<string | null> {
  try {
    const { data: pr } = await db.from('estudio_projetos').select('id, titulo, marca, projeto, video_url, post_id').eq('id', projetoId).maybeSingle()
    if (!pr || pr.post_id || pr.marca !== 'ricardo-garcia' || !pr.video_url) return null
    const p = normalizarProjeto(pr.projeto)
    const ref = p.clips.find((c) => c.fonte.tipo === 'ativo' && c.fonte.ref)?.fonte.ref
    if (!ref) return null
    const { data: ativo } = await db.from('estudio_ativos').select('peca_id, notas').eq('id', ref).maybeSingle()
    if (!ativo?.peca_id || !String(ativo.notas || '').startsWith('HeyGen')) return null
    const { data: peca } = await db.from('conteudo_magnetico_pecas').select('guiao').eq('id', ativo.peca_id).maybeSingle()
    const g = (peca?.guiao ?? {}) as Record<string, any>
    const video = String(pr.video_url).split('?')[0]

    const { data: post } = await db.from('social_scheduled_posts').insert({
      channel: 'instagram',
      ig_account_id: IG_ID.ricardo,
      ig_username: ARROBA.ricardo.slice(1),
      pillar: 'estudio',
      media_type: 'REELS',
      media_urls: [video],
      caption: legendaDoGuiao(g),
      scheduled_at: proximaJanela(Date.now()).toISOString(),
      status: 'draft',
      created_by: CRIADOR_REELS_CLONE,
    }).select('id, caption').single()
    if (!post) return null
    await db.from('estudio_projetos').update({ post_id: post.id }).eq('id', pr.id)
    await pedirAprovacaoReel({ postId: post.id, video, titulo: pr.titulo, legenda: post.caption || '' })
    return post.id
  } catch (e) {
    console.error('[reel-aprovacao] rascunho falhou', e)
    return null
  }
}

/** Puro: o texto e os botões do pedido. */
export function mensagemDoReel(p: { postId: string; titulo: string; legenda: string }) {
  return {
    texto:
      `🎬 <b>Reel do clone pronto para aprovares</b>\n<i>${esc(p.titulo)}</i>\n\n` +
      `<b>Legenda:</b>\n${esc(p.legenda.slice(0, 700))}\n\n` +
      `«Publicar» põe-no na próxima janela das 20:30 no @ricardogarciapt.`,
    teclado: {
      inline_keyboard: [[
        { text: '✅ Publicar', callback_data: `${PREFIXO_REEL}ok:${p.postId}` },
        { text: '🗑 Descartar', callback_data: `${PREFIXO_REEL}no:${p.postId}` },
      ]],
    },
  }
}

async function tg(metodo: string, corpo: Record<string, unknown>): Promise<boolean> {
  const bot = getMtmcopyBotToken()
  if (!bot) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${bot}/${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    })
    return r.ok
  } catch {
    return false
  }
}

/** Manda o vídeo com os botões; se o Telegram não aceitar o vídeo (>20 MB), manda o link. */
export async function pedirAprovacaoReel(p: { postId: string; video: string; titulo: string; legenda: string }, chat = chatDeAdminDoAmbiente()): Promise<void> {
  if (!chat) return
  const m = mensagemDoReel(p)
  const foi = await tg('sendVideo', { chat_id: chat, video: p.video, caption: m.texto.slice(0, 1024), parse_mode: 'HTML', reply_markup: m.teclado, supports_streaming: true })
  if (!foi) {
    await tg('sendMessage', { chat_id: chat, text: `${m.texto}\n\n▶️ <a href="${esc(p.video)}">Ver o vídeo</a>`, parse_mode: 'HTML', reply_markup: m.teclado })
  }
}

/** Reels à espera dele (para a vista «Hoje»). */
export async function contarReelsPorAprovar(db: SupabaseClient): Promise<number> {
  const { count } = await db.from('social_scheduled_posts').select('id', { count: 'exact', head: true })
    .eq('created_by', CRIADOR_REELS_CLONE).eq('status', 'draft')
  return count ?? 0
}

/** «admin:reels»: volta a mandar os pedidos que estão à espera. Devolve quantos mandou. */
export async function reenviarPendentes(db: SupabaseClient, chat: string): Promise<number> {
  const { data } = await db.from('social_scheduled_posts').select('id, media_urls, caption')
    .eq('created_by', CRIADOR_REELS_CLONE).eq('status', 'draft').order('created_at', { ascending: true }).limit(5)
  for (const r of data ?? []) {
    await pedirAprovacaoReel({ postId: r.id, video: (r.media_urls ?? [])[0] || '', titulo: 'Reel do clone', legenda: r.caption || '' }, chat)
  }
  return data?.length ?? 0
}

/** Aplica a decisão. Devolve o texto de confirmação para o chat. */
export async function decidirReelPorTelegram(data: string): Promise<string> {
  const b = lerBotaoReel(data)
  if (!b) return 'Botão desconhecido.'
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()
  if (b.acao === 'no') {
    const { data: r } = await db.from('social_scheduled_posts')
      .update({ status: 'cancelled', error: 'Descartado pelo Ricardo (Telegram).', updated_at: agora })
      .eq('id', b.postId).eq('created_by', CRIADOR_REELS_CLONE).eq('status', 'draft').select('id')
    return r?.length ? '🗑 Reel descartado.' : 'Este reel já não estava à espera.'
  }
  // Um por dia: a janela é a primeira 20:30 depois do último já aprovado.
  const { data: ult } = await db.from('social_scheduled_posts').select('scheduled_at')
    .eq('created_by', CRIADOR_REELS_CLONE).in('status', ['approved', 'publishing']).gt('scheduled_at', agora)
    .order('scheduled_at', { ascending: false }).limit(1)
  const depois = ult?.[0]?.scheduled_at ? Math.max(Date.now(), new Date(ult[0].scheduled_at).getTime()) : Date.now()
  const quando = proximaJanela(depois)
  const { data: r } = await db.from('social_scheduled_posts')
    .update({ status: 'approved', scheduled_at: quando.toISOString(), error: null, updated_at: agora })
    .eq('id', b.postId).eq('created_by', CRIADOR_REELS_CLONE).eq('status', 'draft').select('id')
  if (!r?.length) return 'Este reel já não estava à espera.'
  const dia = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(quando)
  return `✅ Aprovado. Sai no @ricardogarciapt ${dia}.`
}
