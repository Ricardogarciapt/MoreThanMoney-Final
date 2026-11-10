import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { marcasPermitidas } from '@/lib/conteudo-magnetico/marcas'
import { normalizarCortes, normalizarEstilo } from '@/lib/estudio/texto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ESTÚDIO — takes gravados no telemóvel a ler o guião.
 *
 * POST  { peca_id?, marca, mime, duracao_s } → cria a linha e devolve um URL assinado de upload
 *        (o browser sobe o vídeo directo para o Storage; a Vercel nunca carrega o ficheiro).
 * PATCH { id, estado?, notas?, cortes?, estilo? } → confirma o upload (estado 'bruto'), marca o take,
 *        guarda os cortes feitos pelo texto e o estilo (legenda, música). accao 'retranscrever' repete.
 * PATCH { id, accao: 'cancelar' }            → tira o take da fila: volta a 'bruto' e cancela o rascunho
 *                                              do Instagram que ainda não saiu.
 * PUT   { id }                               → duplica o take (cópia do ficheiro, estado 'bruto'), para
 *                                              uma segunda edição com outro guião ou outros ativos.
 * DELETE ?id=…                               → apaga o take: ficheiro bruto, reel editado e rascunho na fila.
 * GET                                        → últimos takes, com URL assinado de leitura (1 h).
 *
 * Só admins: é material da casa (cara e voz do Ricardo).
 */
const BUCKET = 'estudio'
const MIMES = ['video/webm', 'video/mp4', 'video/quicktime']
const ESTADOS = ['bruto', 'escolhido', 'editado', 'publicado', 'descartado']
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

/** Cancela o rascunho/agendado do Instagram deste take, se ainda não saiu. Devolve se cancelou. */
async function cancelarPost(db: ReturnType<typeof getSupabaseAdmin>, postId: string | null): Promise<boolean> {
  if (!postId) return false
  const { data } = await db
    .from('social_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', postId)
    .in('status', ['draft', 'approved'])
    .select('id')
  return !!data?.length
}

// Equipa do estúdio (backoffice → acessos): biblioteca partilhada, sem filtro por autor.
async function soAdmin(request: Request) {
  return exigirEstudio(request, 'gravar', 'editor')
}

export async function POST(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  const marca = String(b.marca || '')
  if (!marcasPermitidas(true).includes(marca as never) || marca === 'propria') {
    return NextResponse.json({ erro: 'Marca inválida.' }, { status: 400 })
  }
  const mimeBase = String(b.mime || '').split(';')[0].trim()
  if (!MIMES.includes(mimeBase)) return NextResponse.json({ erro: 'Formato de vídeo não suportado.' }, { status: 400 })
  const ext = mimeBase === 'video/webm' ? 'webm' : mimeBase === 'video/quicktime' ? 'mov' : 'mp4'
  const pecaId = typeof b.peca_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.peca_id) ? b.peca_id : null
  const caminho = `${marca}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`

  const db = getSupabaseAdmin()
  const { data: linha, error } = await db
    .from('estudio_gravacoes')
    .insert({
      user_id: quem!.userId,
      peca_id: pecaId,
      marca,
      caminho,
      mime: mimeBase,
      duracao_s: Number(b.duracao_s) > 0 ? Math.round(Number(b.duracao_s) * 10) / 10 : null,
    })
    .select('id')
    .single()
  if (error || !linha) return NextResponse.json({ erro: 'Não consegui registar o take.' }, { status: 500 })

  const { data: assinado, error: e2 } = await db.storage.from(BUCKET).createSignedUploadUrl(caminho)
  if (e2 || !assinado) return NextResponse.json({ erro: 'Não consegui preparar o upload.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: linha.id, upload_url: assinado.signedUrl })
}

export async function PATCH(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  if (b.accao === 'cancelar') {
    const db = getSupabaseAdmin()
    const { data: t } = await db.from('estudio_gravacoes').select('id, estado, post_id').eq('id', b.id).maybeSingle()
    if (!t) return NextResponse.json({ erro: 'Take desconhecido.' }, { status: 404 })
    const cancelouPost = await cancelarPost(db, t.post_id)
    await db.from('estudio_gravacoes').update({ estado: 'bruto', reclamado_em: null, post_id: null, notas: 'cancelado no estúdio' }).eq('id', t.id)
    return NextResponse.json({ ok: true, cancelou_post: cancelouPost })
  }
  const upd: Record<string, unknown> = {}
  if ('peca_id' in b) upd.peca_id = uuid(b.peca_id)
  if ('cortes' in b) upd.cortes = normalizarCortes(b.cortes)
  if ('estilo' in b) upd.estilo = normalizarEstilo(b.estilo)
  if (b.accao === 'retranscrever') upd.transcricao_estado = null
  if (ESTADOS.includes(b.estado)) upd.estado = b.estado
  if (typeof b.notas === 'string') upd.notas = b.notas.slice(0, 1000)
  if (!Object.keys(upd).length) return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from('estudio_gravacoes')
    .update(upd)
    .eq('id', b.id)
  if (error) return NextResponse.json({ erro: 'Não consegui guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PUT(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  const id = uuid(b.id)
  if (!id) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: t } = await db
    .from('estudio_gravacoes')
    .select('peca_id, marca, caminho, mime, duracao_s, transcricao, transcricao_estado, cortes, estilo')
    .eq('id', id)
    .maybeSingle()
  if (!t) return NextResponse.json({ erro: 'Take desconhecido.' }, { status: 404 })
  const caminho = t.caminho.replace(/[^/]+(\.[a-z0-9]+)$/i, `${crypto.randomUUID()}$1`)
  const { error: e1 } = await db.storage.from(BUCKET).copy(t.caminho, caminho)
  if (e1) return NextResponse.json({ erro: 'Não consegui copiar o vídeo.' }, { status: 500 })
  const { data: novo, error } = await db
    .from('estudio_gravacoes')
    .insert({
      user_id: quem!.userId,
      peca_id: t.peca_id,
      marca: t.marca,
      caminho,
      mime: t.mime,
      duracao_s: t.duracao_s,
      estado: 'bruto',
      origem_id: id,
      notas: 'cópia',
      transcricao: t.transcricao,
      transcricao_estado: t.transcricao_estado === 'pronta' ? 'pronta' : null,
      cortes: t.cortes,
      estilo: t.estilo,
    })
    .select('id')
    .single()
  if (error || !novo) return NextResponse.json({ erro: 'Não consegui registar a cópia.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: novo.id })
}

export async function DELETE(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const id = uuid(request.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: t } = await db
    .from('estudio_gravacoes')
    .select('id, marca, caminho, estado, post_id')
    .eq('id', id)
    .maybeSingle()
  if (!t) return NextResponse.json({ erro: 'Take desconhecido.' }, { status: 404 })
  if (t.estado === 'publicado') return NextResponse.json({ erro: 'Este já saiu no Instagram: apaga-o lá.' }, { status: 409 })
  await cancelarPost(db, t.post_id)
  await db.storage.from(BUCKET).remove([t.caminho])
  await db.storage.from('uploads').remove([`estudio/${t.marca}/${t.id}.mp4`])
  await db.from('estudio_gravacoes').delete().eq('id', t.id)
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('estudio_gravacoes')
    .select('id, peca_id, marca, caminho, mime, duracao_s, estado, notas, editado_url, post_id, transcricao, transcricao_estado, cortes, estilo, criado_em')
    .not('estado', 'in', '(a_subir,descartado)')
    .order('criado_em', { ascending: false })
    .limit(30)
  const linhas = data ?? []
  const urls = linhas.length
    ? (await db.storage.from(BUCKET).createSignedUrls(linhas.map((l) => l.caminho), 3600)).data ?? []
    : []
  return NextResponse.json({
    ok: true,
    takes: linhas.map((l, i) => ({ ...l, url: urls[i]?.signedUrl ?? null })),
  })
}
