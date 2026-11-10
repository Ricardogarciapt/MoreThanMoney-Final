import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { ARROBA, IG_ID } from '@/lib/carrossel-diario/tipos'
import { corrigirPtPt } from '@/lib/pt-pt'

// O editor do Mac entra com o CRON_SECRET ou, como o cortador, com o segredo dos workers.
function autorizado(request: NextRequest): boolean {
  if (ehMotor(request)) return true
  const w = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  return !!w && request.headers.get('x-caption-secret') === w
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTOR DO ESTÚDIO — o editor que corre no Mac (services/estudio-editor) fala só com esta rota.
 *
 * GET  → reclama o take «escolhido» mais antigo (passa a 'a_editar') e devolve: URL assinado para
 *        descarregar o bruto, o guião (texto, legenda, palavra-chave, marca) e um URL assinado para
 *        subir o MP4 editado no bucket público `uploads` (o Instagram precisa de URL público).
 *        Inclui os segmentos do guião e os ATIVOS ligados à peça (fotos/vídeos/áudios do separador
 *        «Ativos»), cada um com URL assinado de 1 h.
 * POST { id, ok, erro? } → fecha o trabalho. Com ok: estado 'editado' e o reel entra na fila do
 *        Instagram como RASCUNHO (o AG-OPERADOR aprova pelas regras da casa). Sem ok: volta a
 *        'escolhido' com a nota do erro.
 *
 * Autenticação: Bearer CRON_SECRET (o mesmo do motor do Conteúdo Magnético).
 */
const PERFIL = { 'ricardo-garcia': 'ricardo', morethanmoney: 'mtm' } as const

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()

  // Um take preso em 'a_editar' há mais de 30 min (o Mac caiu) volta a ser reclamável.
  await db
    .from('estudio_gravacoes')
    .update({ estado: 'escolhido' })
    .eq('estado', 'a_editar')
    .lt('reclamado_em', new Date(Date.now() - 30 * 60_000).toISOString())

  const { data: cand } = await db
    .from('estudio_gravacoes')
    .select('id, peca_id, marca, caminho, mime, duracao_s')
    .eq('estado', 'escolhido')
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!cand) return NextResponse.json({ ok: true, trabalho: null })

  // Reclamar de forma atómica: só ganha quem ainda o encontrar em 'escolhido'.
  const { data: meu } = await db
    .from('estudio_gravacoes')
    .update({ estado: 'a_editar', reclamado_em: new Date().toISOString() })
    .eq('id', cand.id)
    .eq('estado', 'escolhido')
    .select('id')
    .maybeSingle()
  if (!meu) return NextResponse.json({ ok: true, trabalho: null })

  const { data: peca } = cand.peca_id
    ? await db.from('conteudo_magnetico_pecas').select('guiao').eq('id', cand.peca_id).maybeSingle()
    : { data: null }
  const g = (peca?.guiao ?? {}) as Record<string, any>

  const { data: bruto } = await db.storage.from('estudio').createSignedUrl(cand.caminho, 3600)
  const destino = `estudio/${cand.marca}/${cand.id}.mp4`
  const { data: subida } = await db.storage.from('uploads').createSignedUploadUrl(destino, { upsert: true })
  if (!bruto || !subida) {
    await db.from('estudio_gravacoes').update({ estado: 'escolhido', notas: 'motor: falhou a preparar URLs' }).eq('id', cand.id)
    return NextResponse.json({ erro: 'Não consegui preparar os URLs.' }, { status: 500 })
  }

  // Ativos que o Ricardo ligou a este guião (separador «Ativos» do /estudio), com URL de 1 h.
  const { data: ativosBrutos } = cand.peca_id
    ? await db
        .from('estudio_ativos')
        .select('tipo, nome, segmento, caminho, mime')
        .eq('peca_id', cand.peca_id)
        .eq('estado', 'pronto')
        .order('criado_em', { ascending: true })
        .limit(30)
    : { data: [] as { tipo: string; nome: string; segmento: number | null; caminho: string; mime: string }[] }
  const listaAtivos = ativosBrutos ?? []
  const urlsAtivos = listaAtivos.length
    ? (await db.storage.from('estudio').createSignedUrls(listaAtivos.map((a) => a.caminho), 3600)).data ?? []
    : []
  const ativos = listaAtivos
    .map((a, i) => ({ tipo: a.tipo, nome: a.nome, segmento: a.segmento, mime: a.mime, url: urlsAtivos[i]?.signedUrl ?? null }))
    .filter((a) => a.url)
  const segmentos = Array.isArray(g.reel?.segmentos)
    ? g.reel.segmentos.map((s: any) => ({
        fala: s.fala ?? '',
        texto_ecra: s.texto_ecra ?? null,
        visual: s.visual ?? null,
        b_roll_busca: s.b_roll_busca ?? null,
        zoom: s.zoom ?? null,
      }))
    : []

  return NextResponse.json({
    ok: true,
    trabalho: {
      id: cand.id,
      marca: cand.marca,
      duracao_s: cand.duracao_s,
      bruto_url: bruto.signedUrl,
      bruto_mime: cand.mime,
      subir_url: subida.signedUrl,
      guiao: {
        tema: g.nicho ?? null,
        palavra_chave: g.palavra_chave ?? null,
        legenda: g.legenda ?? null,
        hashtags: Array.isArray(g.hashtags) ? g.hashtags : [],
        falas: segmentos.map((s: { fala: string }) => s.fala),
        segmentos,
      },
      ativos,
    },
  })
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: t } = await db
    .from('estudio_gravacoes')
    .select('id, peca_id, marca, estado')
    .eq('id', b.id)
    .maybeSingle()
  if (!t || t.estado !== 'a_editar') return NextResponse.json({ erro: 'Trabalho desconhecido ou já fechado.' }, { status: 409 })

  if (!b.ok) {
    await db
      .from('estudio_gravacoes')
      .update({ estado: 'escolhido', notas: `motor: ${String(b.erro || 'erro').slice(0, 500)}` })
      .eq('id', t.id)
    return NextResponse.json({ ok: true })
  }

  const url = db.storage.from('uploads').getPublicUrl(`estudio/${t.marca}/${t.id}.mp4`).data.publicUrl
  const perfil = PERFIL[t.marca as keyof typeof PERFIL]
  const { data: peca } = t.peca_id
    ? await db.from('conteudo_magnetico_pecas').select('guiao').eq('id', t.peca_id).maybeSingle()
    : { data: null }
  const g = (peca?.guiao ?? {}) as Record<string, any>
  const hashtags = (Array.isArray(g.hashtags) ? g.hashtags : []).slice(0, 8).map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const cta = g.palavra_chave ? `\n\nComenta «${g.palavra_chave}» e eu envio-te o próximo passo.` : ''
  const legenda = corrigirPtPt(`${g.legenda || g.nicho || ''}${cta}${hashtags ? `\n\n${hashtags}` : ''}`.trim()).texto.slice(0, 2200)

  let postId: string | null = null
  if (perfil) {
    const { data: post } = await db
      .from('social_scheduled_posts')
      .insert({
        channel: 'instagram',
        ig_account_id: IG_ID[perfil],
        ig_username: ARROBA[perfil].slice(1),
        pillar: 'estudio',
        media_type: 'REELS',
        media_urls: [url],
        caption: legenda,
        scheduled_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
        status: 'draft',
        created_by: 'estudio:editor-mac',
      })
      .select('id')
      .maybeSingle()
    postId = post?.id ?? null
  }

  await db
    .from('estudio_gravacoes')
    .update({ estado: 'editado', editado_url: url, post_id: postId, notas: postId ? `fila IG: ${postId}` : null })
    .eq('id', t.id)
  return NextResponse.json({ ok: true, editado_url: url, post_id: postId })
}
