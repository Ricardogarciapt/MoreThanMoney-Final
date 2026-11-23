import { NextRequest, NextResponse } from 'next/server'
import { exigirSocial } from '@/lib/social-acesso'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * «Para aprovar» — a fila vista como o Ricardo a quer ver (23/11): cada peça com o CONTEXTO ao lado
 * (vídeo, capa, guião, funil, palavra-chave, de onde veio a ideia) e os botões que interessam.
 *
 * A fila antiga mostrava a legenda e o estado. Para um reel isso não chega: a decisão depende do
 * guião, do funil para onde manda e de a palavra-chave ter uma automação ligada. Esse contexto
 * vive em `estudio_projetos.projeto.cinematico`; aqui junta-se ao post pelo vídeo (ou post_id).
 *
 * GET  → { itens, contas, automacoes }
 * POST → { id, acao: 'aprovar'|'pausar'|'descartar'|'hora'|'legenda', valor? }
 */

const ESTADOS_VIVOS = ['draft', 'approved', 'reserva', 'processing', 'publishing', 'failed']

type Linha = {
  id: string
  ig_account_id: string
  ig_username: string | null
  pillar: string | null
  media_type: string
  media_urls: string[] | null
  caption: string | null
  scheduled_at: string
  status: string
  error: string | null
  created_by: string | null
  created_at: string
  reserva_de: string | null
  agente_motivo: string | null
}

function origemDe(criado: string | null): { tipo: string; nome: string } {
  const c = criado ?? ''
  if (c === 'estudio-clone:trend') return { tipo: 'trend', nome: 'Reel para música trend' }
  if (c.startsWith('estudio-clone')) return { tipo: 'reel', nome: 'Reel cinemático' }
  if (c.startsWith('carrossel-diario')) return { tipo: 'carrossel', nome: 'Carrossel diário' }
  if (c.startsWith('agente:')) return { tipo: 'agente', nome: `Agente ${c.slice(7)}` }
  if (c === 'sales-machine') return { tipo: 'agente', nome: 'Máquina de vendas' }
  return { tipo: 'manual', nome: c || 'Manual' }
}

/** Os rascunhos que alguém pôs de lado (pausas em massa, tectos diários) não são «à tua espera». */
function pausado(l: Linha): boolean {
  if (l.status !== 'draft') return false
  const e = l.error ?? ''
  return e.startsWith('pausa-') || e.startsWith('Tecto diário') || e.startsWith('Plano ')
}

export async function GET(request: NextRequest) {
  const negado = await exigirSocial(request)
  if (negado) return negado
  const sb = getSupabaseAdmin()

  const desde = new Date(Date.now() - 2 * 864e5).toISOString()
  const { data: posts, error } = await sb
    .from('social_scheduled_posts')
    .select(
      'id,ig_account_id,ig_username,pillar,media_type,media_urls,caption,scheduled_at,status,error,created_by,created_at,reserva_de,agente_motivo',
    )
    .or(`status.in.(${ESTADOS_VIVOS.join(',')}),and(status.eq.published,scheduled_at.gte.${desde})`)
    .order('scheduled_at', { ascending: true })
    .limit(400)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const linhas = (posts ?? []) as Linha[]

  // Contexto dos reels: projetos do estúdio dos últimos 21 dias, ligados pelo vídeo ou pelo post.
  const { data: projetos } = await sb
    .from('estudio_projetos')
    .select('id,titulo,video_url,post_id,projeto,criado_em')
    .gte('criado_em', new Date(Date.now() - 21 * 864e5).toISOString())
    .not('video_url', 'is', null)
    .limit(500)
  const porVideo = new Map<string, any>()
  const porPost = new Map<string, any>()
  for (const p of projetos ?? []) {
    if (p.video_url) porVideo.set(p.video_url, p)
    if (p.post_id) porPost.set(p.post_id, p)
  }

  // `valor` é uma lista («TRIAL,GRÁTIS,…»), como o funil do Instagram a lê (lib/instagram/funnel.ts).
  const { data: autos } = await sb
    .from('mtm_automacoes')
    .select('valor')
    .eq('ativa', true)
    .eq('canal', 'instagram_comentario')
  const automacoes = Array.from(
    new Set(
      (autos ?? []).flatMap((a: any) =>
        String(a.valor ?? '')
          .split(/[,;]/)
          .map((k) => k.trim().toUpperCase())
          .filter(Boolean),
      ),
    ),
  )

  const itens = linhas.map((l) => {
    const urls = l.media_urls ?? []
    const proj = porPost.get(l.id) ?? urls.map((u) => porVideo.get(u)).find(Boolean) ?? null
    const cin = (proj?.projeto?.cinematico ?? {}) as Record<string, any>
    const video = proj?.video_url ?? urls.find((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u)) ?? null
    const capa = cin.capa_url ?? urls.find((u) => u !== video && /\.(jpe?g|png|webp)(\?|$)/i.test(u)) ?? null
    const palavra = cin.palavra_chave ? String(cin.palavra_chave).toUpperCase() : null
    const origem = origemDe(l.created_by)
    return {
      id: l.id,
      conta: l.ig_username ?? l.ig_account_id,
      contaId: l.ig_account_id,
      tipoMedia: l.media_type,
      estado: l.status,
      pausado: pausado(l),
      hora: l.scheduled_at,
      legenda: l.caption ?? '',
      erro: l.error,
      reservaDe: l.reserva_de,
      motivo: l.agente_motivo,
      origem: origem.tipo,
      origemNome: origem.nome,
      media: urls,
      video,
      capa,
      contexto: proj
        ? {
            projetoId: proj.id,
            titulo: proj.titulo,
            tema: cin.nicho ?? null,
            gancho: cin.gancho ?? null,
            guiao: cin.texto ?? null,
            funil: cin.funil ?? null,
            palavraChave: palavra,
            automacaoLigada: palavra ? automacoes.includes(palavra) : null,
            tipo: cin.tipo ?? null,
            estilo: cin.estilo ?? null,
            molde: cin.molde ?? null,
            audio: cin.audio ?? null,
            ideia: cin.origem ?? null,
          }
        : null,
    }
  })

  return NextResponse.json({ ok: true, itens, automacoes })
}

export async function POST(request: NextRequest) {
  const negado = await exigirSocial(request)
  if (negado) return negado
  const sb = getSupabaseAdmin()

  const corpo = (await request.json().catch(() => ({}))) as { id?: string; acao?: string; valor?: string }
  const { id, acao, valor } = corpo
  if (!id || !acao) return NextResponse.json({ ok: false, error: 'Falta id ou acao' }, { status: 400 })

  const { data: atual } = await sb
    .from('social_scheduled_posts')
    .select('id,status,scheduled_at,created_by')
    .eq('id', id)
    .maybeSingle()
  if (!atual) return NextResponse.json({ ok: false, error: 'Post não encontrado' }, { status: 404 })
  if (['published', 'publishing'].includes(atual.status))
    return NextResponse.json({ ok: false, error: 'Já foi (ou está a ser) publicado' }, { status: 409 })

  const agora = new Date()
  const upd: Record<string, unknown> = { updated_at: agora.toISOString() }

  if (acao === 'aprovar') {
    if (atual.created_by === 'estudio-clone:trend')
      return NextResponse.json(
        { ok: false, error: 'Os reels trend publicas tu na app, com o áudio. Descarrega o vídeo.' },
        { status: 400 },
      )
    upd.status = 'approved'
    upd.approved_at = agora.toISOString()
    upd.approved_by = 'centro-social:aprovar'
    upd.error = null
    // Uma hora já passada faria o post sair já, fora da grelha: empurra 15 min para a frente.
    if (new Date(atual.scheduled_at).getTime() < agora.getTime())
      upd.scheduled_at = new Date(agora.getTime() + 15 * 60e3).toISOString()
  } else if (acao === 'pausar') {
    upd.status = 'draft'
    upd.approved_at = null
    upd.approved_by = null
    upd.error = 'pausa-ricardo (Centro Social)'
  } else if (acao === 'descartar') {
    upd.status = 'canceled'
    upd.error = 'Descartado no Centro Social'
  } else if (acao === 'hora') {
    const d = valor ? new Date(valor) : null
    if (!d || isNaN(d.getTime())) return NextResponse.json({ ok: false, error: 'Hora inválida' }, { status: 400 })
    upd.scheduled_at = d.toISOString()
  } else if (acao === 'legenda') {
    if (typeof valor !== 'string' || !valor.trim())
      return NextResponse.json({ ok: false, error: 'Legenda vazia' }, { status: 400 })
    upd.caption = valor
  } else {
    return NextResponse.json({ ok: false, error: 'Ação desconhecida' }, { status: 400 })
  }

  const { error } = await sb.from('social_scheduled_posts').update(upd).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
