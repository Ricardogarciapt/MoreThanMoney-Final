import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CAPTION_INTERNAL_MARK, publicCaption } from '@/lib/instagram/publish'
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import type { SupabaseClient } from '@supabase/supabase-js'
import { marcarConteudo } from '@/lib/agentes/marca-conteudo'
import { AG } from '@/lib/agentes/codigos'

/**
 * REPOST / AMPLIFICAÇÃO: @ricardogarciapt republica (com VOZ PESSOAL do Ricardo) os posts que
 * a marca @morethanmoney.pt acabou de publicar. Reutiliza a mesma imagem (é um repost) e escreve
 * uma legenda em 1.ª pessoa que remata a apontar para @morethanmoney.pt. Autónomo, sem browser.
 *
 * Dedup: cada post de marca é republicado UMA vez (pillar 'repost:<brand_post_id>' no post do Ricardo).
 * Autopilot: site_settings.content_autopilot { ricardo: true } → entra 'approved' (publica sem toque);
 * senão fica 'draft'. Bearer CRON_SECRET (ou x-vercel-cron).
 */

const IG_MTM = '17841474872672009' // @morethanmoney.pt
const IG_RIC = '17841405656956716' // @ricardogarciapt
const LOOKBACK_H = Number(process.env.REPOST_LOOKBACK_H || 72)
const MAX_PER_RUN = Number(process.env.REPOST_MAX || 2)

const SYSTEM = `És o Ricardo (Ricardo Subtil Garcia), fundador da MoreThanMoney, a escrever no TEU Instagram pessoal @ricardogarciapt.
Vais AMPLIFICAR, com as TUAS palavras e na 1.ª pessoa, uma publicação da marca. NÃO copies a legenda da marca — reage a ela como pessoa real.
Estilo: humano, direto, 40–90 palavras, no máx. 1–2 emojis, 2–4 hashtags. Termina a mandar ver o @morethanmoney.pt (onde está a app grátis, o trial e a equipa).
REGRAS: nunca prometas lucros (é educação, não aconselhamento). Sem links de pagamento. Responde em português de Portugal.
Devolve APENAS a legenda final (texto puro, sem aspas, sem JSON).`

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth === `Bearer ${secret}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

/** A porta única da IA. Injectável para a guarda provar o caso mau sem rede nem base. */
export type ChamarIA = typeof chamarIA

/**
 * A legenda pessoal. Se a cadeia INTEIRA falhar, LANÇA `ErroIA`: o post de marca fica por
 * republicar (volta a ser apanhado na próxima passagem) e NÃO entra linha nenhuma em
 * `social_scheduled_posts`. Não há legenda de reserva — uma legenda inventada no Instagram pessoal
 * de uma pessoa real é exactamente o que não pode sair.
 */
export async function personalCaption(brandCaption: string, chamar: ChamarIA = chamarIA): Promise<string> {
  const r = await chamar({
    tarefa: 'content-repost',
    sistema: SYSTEM,
    mensagens: [{ role: 'user', content: `Publicação da marca a amplificar:\n"""${brandCaption.slice(0, 800)}"""` }],
    maxTokens: 500,
    // `CONTENT_DRAFT_PREFERENCIA` substitui o antigo `CONTENT_DRAFT_MODEL` (ver content-draft).
    preferencia: process.env.CONTENT_DRAFT_PREFERENCIA?.trim() === 'rapido' ? 'rapido' : 'qualidade',
    timeoutMs: 25_000,
  })
  return r.texto.trim()
}

/** Dependências injectáveis — para a guarda correr o GET com base falsa e IA a falhar. */
export type DepsContentRepost = {
  supabase: () => Pick<SupabaseClient, 'from'>
  chamar: ChamarIA
}

export const DEPS_REAIS: DepsContentRepost = { supabase: () => getSupabaseAdmin(), chamar: chamarIA }

export async function correrContentRepost(req: NextRequest, deps: DepsContentRepost) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // DESLIGADO. Este cron existia para republicar conteúdo da marca no Instagram PESSOAL do
  // Ricardo. Encheu o perfil dele com posts da máquina de vendas — é a conta pessoal de uma
  // pessoa real, e o que sai dali é decisão dela. Fica aqui, inerte, para o histórico; só volta
  // a correr se alguém puser REPOST_TO_PERSONAL=1 de propósito.
  if (process.env.REPOST_TO_PERSONAL !== '1') {
    return NextResponse.json({ ok: true, reposted: 0, reason: 'desligado: a conta pessoal não recebe automação' })
  }

  const supabase = deps.supabase()
  const sinceIso = new Date(Date.now() - LOOKBACK_H * 3600 * 1000).toISOString()

  // Posts de marca publicados recentemente, com imagem.
  const { data: brandPosts } = await supabase
    .from('social_scheduled_posts')
    .select('id, caption, media_urls, published_media_id, created_at, agente_codigo')
    .eq('ig_account_id', IG_MTM)
    .eq('status', 'published')
    .gte('updated_at', sinceIso)
    .order('updated_at', { ascending: false })
    .limit(10)
  if (!brandPosts?.length) return NextResponse.json({ ok: true, reposted: 0, reason: 'sem posts de marca recentes' })

  // Já republicados? (pillar repost:<id> nos posts do Ricardo).
  const { data: existing } = await supabase
    .from('social_scheduled_posts')
    .select('pillar')
    .eq('ig_account_id', IG_RIC)
    .like('pillar', 'repost:%')
  const done = new Set((existing ?? []).map((r) => String(r.pillar).replace('repost:', '')))

  // Autopilot do Ricardo.
  const { data: apRow } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
  const autopilot = Boolean((apRow?.value as { ricardo?: boolean } | null)?.ricardo)

  const rows: any[] = []
  const now = Date.now()
  // Se a cadeia de IA falhar por inteiro, pára-se o lote (não vale a pena bater 5 fornecedores por
  // cada post) e diz-se porquê na resposta — fica no livro `ia_chamadas` e no log do cron.
  let iaIndisponivel: string | null = null
  for (const bp of brandPosts) {
    if (rows.length >= MAX_PER_RUN) break
    if (done.has(String(bp.id))) continue
    const img = (bp.media_urls || []).filter(Boolean)[0]
    if (!img) continue // sem imagem não republica
    let personal: string
    try {
      personal = await personalCaption(publicCaption(bp.caption || ''), deps.chamar)
    } catch (e) {
      iaIndisponivel = mensagemIndisponivel(e)
      console.error('[content-repost] sem legenda, nada escrito:', iaIndisponivel)
      break
    }
    if (!personal) continue
    /**
     * O CRÉDITO DE UM REPOST É DE QUEM ESCREVEU O ORIGINAL.
     *
     * Passa-se o código do post de marca como EXPLÍCITO em vez de deixar o pilar decidir, porque
     * o pilar de um repost é `repost:<uuid>` e nunca vai estar no mapa de pilares. Sem isto, um
     * post que o @ricardogarciapt amplifica — e que pode trazer mais gente do que o original —
     * ficava por atribuir, e o agente que fez o trabalho não via nada disso.
     *
     * O original sem código (todos os de antes de 01/10) devolve `codigo_invalido`/por atribuir,
     * com o motivo escrito. Não se inventa um dono para o repost.
     */
    // 06/10: o original sem código (anterior a 01/10) deixa de dar um repost por atribuir — sai
    // assinado pelo AG-SOCIAL, que é quem republica. Um original COM código continua a ganhar.
    const marca = marcarConteudo({ legenda: personal, codigoExplicito: bp.agente_codigo || AG.SOCIAL })
    const when = new Date(now + (rows.length + 1) * 3 * 3600 * 1000) // escalona +3h cada
    const status = autopilot ? 'approved' : 'draft'
    rows.push({
      channel: 'instagram',
      ig_account_id: IG_RIC,
      ig_username: 'ricardogarciapt',
      media_type: 'IMAGE',
      media_urls: [img],
      caption:
        `${marca.legenda}\n\n${CAPTION_INTERNAL_MARK}\n` +
        `🔁 Repost automático de @morethanmoney.pt (post ${bp.id}).\n` +
        `📊 Agente (herdado do original): ${marca.codigo ?? `por atribuir (${marca.motivo})`}\n` +
        `🤖 ${status === 'approved' ? 'Auto-publicado pela máquina de vendas.' : 'Rascunho — revê e aprova.'}`,
      pillar: `repost:${bp.id}`,
      scheduled_at: when.toISOString(),
      status,
      created_by: 'sales-machine',
      agente_codigo: marca.codigo,
      agente_motivo: marca.motivo ?? null,
      agente_links_marcados: marca.marcados,
      ...(status === 'approved' ? { approved_by: 'sales-machine', approved_at: new Date().toISOString() } : {}),
    })
  }

  // Sem legenda nenhuma e com a IA em baixo: 500 honesto, zero linhas escritas.
  if (!rows.length && iaIndisponivel) return NextResponse.json({ ok: false, reposted: 0, error: iaIndisponivel }, { status: 500 })
  if (!rows.length) return NextResponse.json({ ok: true, reposted: 0, reason: 'nada novo para republicar' })
  // As legendas que a IA chegou a escrever são reais e entram; o que ficou por fazer diz-se.
  const { data, error } = await supabase.from('social_scheduled_posts').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reposted: data?.length ?? 0, autopilot, ...(iaIndisponivel ? { iaIndisponivel } : {}) })
}
