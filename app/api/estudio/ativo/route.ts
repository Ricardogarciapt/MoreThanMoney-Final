import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const ANIMACOES = ['auto', 'sem', 'zoom_in', 'zoom_out', 'pan_esq', 'pan_dir', 'sobe']
import { quemPede } from '@/lib/conteudo-magnetico/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ESTÚDIO — ativos (fotos, vídeos, capturas, logos, áudios) para o editor usar nos guiões.
 *
 * POST   { nome, mime, tamanho, peca_id?, segmento? } → cria a linha e devolve URL assinado de upload
 *         (o browser sobe directo para o Storage; a Vercel nunca carrega o ficheiro).
 * PATCH  { id, estado?: 'pronto', peca_id?: string|null, segmento?: number|null, notas? }
 * DELETE ?id=…                                         → apaga o ficheiro e a linha.
 * GET    ?peca=…                                       → ativos (da peça, ou todos), com URL de leitura (1 h).
 *
 * Só admins (o estúdio é só do Ricardo). Bucket privado `estudio`, pasta ativos/.
 */
const BUCKET = 'estudio'
const MAX_BYTES = 200 * 1024 * 1024
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac',
}
const tipoDe = (mime: string) => (mime.startsWith('image/') ? 'imagem' : mime.startsWith('video/') ? 'video' : 'audio')
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)
const seg = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 30 ? (v as number) : null)

async function soAdmin(request: Request) {
  const quem = await quemPede(request)
  if (!quem) return { erro: NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 }) }
  if (!quem.admin) return { erro: NextResponse.json({ erro: 'O estúdio é só da casa.' }, { status: 403 }) }
  return { quem }
}

export async function POST(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  const mime = String(b.mime || '').split(';')[0].trim().toLowerCase()
  const ext = EXT[mime]
  if (!ext) return NextResponse.json({ erro: 'Formato não suportado (usa JPG, PNG, WEBP, HEIC, MP4, MOV, MP3, M4A ou WAV).' }, { status: 400 })
  const tamanho = Number(b.tamanho) || 0
  if (tamanho > MAX_BYTES) return NextResponse.json({ erro: 'Ficheiro acima de 200 MB.' }, { status: 400 })
  const nome = String(b.nome || 'ativo').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 120) || 'ativo'
  const caminho = `ativos/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`

  const db = getSupabaseAdmin()
  const { data: linha, error } = await db
    .from('estudio_ativos')
    .insert({
      user_id: quem!.userId,
      peca_id: uuid(b.peca_id),
      segmento: seg(b.segmento),
      tipo: tipoDe(mime),
      nome,
      caminho,
      mime,
      tamanho: tamanho || null,
    })
    .select('id')
    .single()
  if (error || !linha) return NextResponse.json({ erro: 'Não consegui registar o ativo.' }, { status: 500 })
  const { data: assinado, error: e2 } = await db.storage.from(BUCKET).createSignedUploadUrl(caminho)
  if (e2 || !assinado) return NextResponse.json({ erro: 'Não consegui preparar o upload.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: linha.id, upload_url: assinado.signedUrl })
}

export async function PATCH(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  if (!uuid(b.id)) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const upd: Record<string, unknown> = {}
  if (b.estado === 'pronto') upd.estado = 'pronto'
  if ('peca_id' in b) upd.peca_id = uuid(b.peca_id)
  if ('segmento' in b) upd.segmento = seg(b.segmento)
  if (typeof b.notas === 'string') upd.notas = b.notas.slice(0, 500)
  if (typeof b.animacao === 'string' && ANIMACOES.includes(b.animacao)) upd.animacao = b.animacao
  if (!Object.keys(upd).length) return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 400 })
  const { error } = await getSupabaseAdmin().from('estudio_ativos').update(upd).eq('id', b.id).eq('user_id', quem!.userId)
  if (error) return NextResponse.json({ erro: 'Não consegui guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const id = uuid(request.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: a } = await db.from('estudio_ativos').select('caminho').eq('id', id).eq('user_id', quem!.userId).maybeSingle()
  if (!a) return NextResponse.json({ erro: 'Ativo desconhecido.' }, { status: 404 })
  await db.storage.from(BUCKET).remove([a.caminho])
  await db.from('estudio_ativos').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const peca = uuid(request.nextUrl.searchParams.get('peca'))
  const db = getSupabaseAdmin()
  let q = db
    .from('estudio_ativos')
    .select('id, peca_id, segmento, tipo, nome, caminho, mime, tamanho, notas, animacao, criado_em')
    .eq('user_id', quem!.userId)
    .eq('estado', 'pronto')
    .order('criado_em', { ascending: false })
    .limit(100)
  if (peca) q = q.eq('peca_id', peca)
  const { data } = await q
  const linhas = data ?? []
  const urls = linhas.length ? (await db.storage.from(BUCKET).createSignedUrls(linhas.map((l) => l.caminho), 3600)).data ?? [] : []
  return NextResponse.json({ ok: true, ativos: linhas.map(({ caminho: _c, ...l }, i) => ({ ...l, url: urls[i]?.signedUrl ?? null })) })
}
