import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { normalizarPalavras } from '@/lib/estudio/texto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTOR DO ESTÚDIO · transcrição. O editor do Mac (services/estudio-editor) transcreve cada take
 * com o Whisper local, para o Ricardo poder editar o vídeo pelo texto no /estudio.
 *
 * GET  → reclama o take mais antigo ainda sem transcrição e devolve { id, bruto_url, mime }.
 * POST { id, palavras: [{ w, ini, fim }] } → guarda (estado 'pronta');  { id, erro } → 'falhou'.
 */
function autorizado(request: NextRequest): boolean {
  if (ehMotor(request)) return true
  const w = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  return !!w && request.headers.get('x-caption-secret') === w
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  // Reclamações com mais de 20 min (o Mac caiu) voltam à fila.
  await db
    .from('estudio_gravacoes')
    .update({ transcricao_estado: null })
    .eq('transcricao_estado', 'a_transcrever')
    .lt('transcricao_reclamada_em', new Date(Date.now() - 20 * 60_000).toISOString())

  const { data: cand } = await db
    .from('estudio_gravacoes')
    .select('id, caminho, mime')
    .is('transcricao_estado', null)
    .in('estado', ['bruto', 'escolhido'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!cand) return NextResponse.json({ ok: true, trabalho: null })
  const { data: meu } = await db
    .from('estudio_gravacoes')
    .update({ transcricao_estado: 'a_transcrever', transcricao_reclamada_em: new Date().toISOString() })
    .eq('id', cand.id)
    .is('transcricao_estado', null)
    .select('id')
    .maybeSingle()
  if (!meu) return NextResponse.json({ ok: true, trabalho: null })
  const { data: url } = await db.storage.from('estudio').createSignedUrl(cand.caminho, 3600)
  if (!url) {
    await db.from('estudio_gravacoes').update({ transcricao_estado: null }).eq('id', cand.id)
    return NextResponse.json({ erro: 'Não consegui preparar o URL.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, trabalho: { id: cand.id, bruto_url: url.signedUrl, mime: cand.mime } })
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const palavras = normalizarPalavras(b.palavras)
  const upd = palavras.length
    ? { transcricao: { palavras, lingua: typeof b.lingua === 'string' ? b.lingua.slice(0, 8) : 'pt' }, transcricao_estado: 'pronta' }
    : { transcricao_estado: 'falhou', notas: `transcrição: ${String(b.erro || 'sem palavras').slice(0, 300)}` }
  const { error } = await db.from('estudio_gravacoes').update(upd).eq('id', b.id).eq('transcricao_estado', 'a_transcrever')
  if (error) return NextResponse.json({ erro: 'Não consegui guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true, palavras: palavras.length })
}
