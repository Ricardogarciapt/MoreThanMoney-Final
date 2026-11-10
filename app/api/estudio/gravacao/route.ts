import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { quemPede } from '@/lib/conteudo-magnetico/acesso'
import { marcasPermitidas } from '@/lib/conteudo-magnetico/marcas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ESTÚDIO — takes gravados no telemóvel a ler o guião.
 *
 * POST  { peca_id?, marca, mime, duracao_s } → cria a linha e devolve um URL assinado de upload
 *        (o browser sobe o vídeo directo para o Storage; a Vercel nunca carrega o ficheiro).
 * PATCH { id, estado?, notas? }              → confirma o upload (estado 'bruto') ou marca o take.
 * GET                                        → últimos takes, com URL assinado de leitura (1 h).
 *
 * Só admins: é material da casa (cara e voz do Ricardo).
 */
const BUCKET = 'estudio'
const MIMES = ['video/webm', 'video/mp4', 'video/quicktime']
const ESTADOS = ['bruto', 'escolhido', 'editado', 'publicado', 'descartado']

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
  const upd: Record<string, unknown> = {}
  if (ESTADOS.includes(b.estado)) upd.estado = b.estado
  if (typeof b.notas === 'string') upd.notas = b.notas.slice(0, 1000)
  if (!Object.keys(upd).length) return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from('estudio_gravacoes')
    .update(upd)
    .eq('id', b.id)
    .eq('user_id', quem!.userId)
  if (error) return NextResponse.json({ erro: 'Não consegui guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('estudio_gravacoes')
    .select('id, peca_id, marca, caminho, mime, duracao_s, estado, notas, criado_em')
    .eq('user_id', quem!.userId)
    .neq('estado', 'a_subir')
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
