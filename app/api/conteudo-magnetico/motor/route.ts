import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A porta do MOTOR de render (Bearer CRON_SECRET). O motor não tem chaves da Supabase: tudo
 * passa por aqui.
 *
 * GET  ?motor=vps  → reclama o próximo trabalho e devolve-o com um URL ASSINADO para subir o MP4
 *                    directamente ao Storage (um reel passa os 4,5 MB que a Vercel aceita num corpo).
 * POST {id, estado:'pronto'|'erro', erro?} → fecha o trabalho.
 */
const BUCKET = 'uploads'
const caminho = (id: string) => `conteudo-magnetico/${id}.mp4`

export async function GET(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  const motor = (request.nextUrl.searchParams.get('motor') || 'motor').slice(0, 40)
  const db = getSupabaseAdmin()
  const { data, error } = await db.rpc('conteudo_magnetico_reclamar', { p_motor: motor })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  const job = Array.isArray(data) ? data[0] : data
  if (!job) return NextResponse.json({ ok: true, trabalho: null })

  const { data: assinado, error: e2 } = await db.storage.from(BUCKET).createSignedUploadUrl(caminho(job.id), { upsert: true })
  if (e2 || !assinado) {
    await db.from('conteudo_magnetico_renders').update({ estado: 'na_fila' }).eq('id', job.id)
    return NextResponse.json({ erro: e2?.message || 'sem URL de upload' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, trabalho: job, upload: { url: assinado.signedUrl } })
}

export async function POST(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  const id = String(b.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'id inválido' }, { status: 400 })
  const db = getSupabaseAdmin()
  if (b.estado === 'pronto') {
    const { data } = db.storage.from(BUCKET).getPublicUrl(caminho(id))
    await db
      .from('conteudo_magnetico_renders')
      .update({ estado: 'pronto', video_url: data.publicUrl, erro: null, terminado_em: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true, video_url: data.publicUrl })
  }
  // Erro: volta à fila enquanto houver tentativas (a função de reclamar corta às 3).
  const { data: job } = await db.from('conteudo_magnetico_renders').select('tentativas').eq('id', id).maybeSingle()
  const definitivo = (job?.tentativas ?? 3) >= 3
  await db
    .from('conteudo_magnetico_renders')
    .update({
      estado: definitivo ? 'erro' : 'na_fila',
      erro: String(b.erro || 'falhou').slice(0, 500),
      terminado_em: definitivo ? new Date().toISOString() : null,
    })
    .eq('id', id)
  return NextResponse.json({ ok: true })
}
