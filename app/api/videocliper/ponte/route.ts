import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * A PONTE DO MAC — descargas do YouTube por um IP de casa.
 *
 * O YouTube recusa o IP do servidor da AWS («confirma que não és um robô»). Um agente no Mac do
 * Ricardo pergunta aqui se há vídeos à espera, descarrega-os com o yt-dlp e copia o ficheiro
 * para o disco do VPS. Depois diz o nome do ficheiro, e o vídeo segue o caminho normal — como
 * uma gravação do DVR, cortada do disco sem descarga nenhuma.
 *
 * GET  → reclama UM vídeo pendente.
 * POST → { jobId, ficheiro } quando está no VPS, ou { jobId, erro }.
 *
 * Mesmo segredo do worker do VPS.
 */

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  return Boolean(esperado) && request.headers.get('x-caption-secret')?.trim() === esperado
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  const agora = new Date()

  // Um Mac que adormece a meio deixa o vídeo preso; ao fim de 30 min volta à fila.
  await db.from('videocliper_jobs')
    .update({ ponte_estado: 'pendente', ponte_reclamado_em: null })
    .eq('ponte_estado', 'a_descarregar')
    .lt('ponte_reclamado_em', new Date(agora.getTime() - 30 * 60_000).toISOString())

  const { data: job } = await db
    .from('videocliper_jobs')
    .select('id, youtube_url')
    .eq('ponte_estado', 'pendente')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!job) return NextResponse.json({ tipo: 'nada' })

  await db.from('videocliper_jobs').update({
    ponte_estado: 'a_descarregar',
    ponte_reclamado_em: agora.toISOString(),
    progresso: 'a descarregar pelo Mac',
    updated_at: agora.toISOString(),
  }).eq('id', job.id)

  return NextResponse.json({ tipo: 'descarregar', jobId: job.id, url: job.youtube_url })
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  const corpo = await request.json().catch(() => ({}))
  const jobId = String(corpo?.jobId ?? '')
  if (!jobId) return NextResponse.json({ error: 'sem vídeo' }, { status: 400 })
  const agora = new Date().toISOString()

  if (corpo?.erro) {
    await db.from('videocliper_jobs').update({
      ponte_estado: 'erro',
      estado: 'erro',
      erro: `ponte do Mac: ${String(corpo.erro).slice(0, 400)}`,
      updated_at: agora,
    }).eq('id', jobId)
    return NextResponse.json({ ok: true })
  }

  // Só o NOME atravessa a fronteira; o caminho monta-o o worker do VPS debaixo de /mnt/dvr.
  const ficheiro = String(corpo?.ficheiro ?? '').replace(/[^A-Za-z0-9._-]/g, '')
  if (!ficheiro.endsWith('.mp4')) return NextResponse.json({ error: 'ficheiro inválido' }, { status: 400 })

  const titulo = String(corpo?.titulo ?? '').trim().slice(0, 200)
  const { data: atual } = await db.from('videocliper_jobs').select('titulo').eq('id', jobId).maybeSingle()

  await db.from('videocliper_jobs').update({
    ponte_estado: 'feito',
    dvr_ficheiro: ficheiro,
    ...(titulo && !atual?.titulo ? { titulo } : {}),
    progresso: 'no VPS — à espera de transcrição',
    updated_at: agora,
  }).eq('id', jobId)
  return NextResponse.json({ ok: true })
}
