import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'

// GET /api/live-sessions/captions/jobs
// Interno (segredo do worker). Lista sessões AO VIVO com legendas ligadas, incluindo a
// stream_key (necessária para o ffmpeg captar o HLS local no VPS). Nunca exposto ao público.

const supabase = getSupabaseAdmin()

export async function GET(req: NextRequest) {
  const secret = process.env.LMS_CAPTION_WORKER_SECRET
  if (!secret || req.headers.get('x-caption-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('lms_streams')
    .select('id, stream_key, caption_source_language, ingest_provider, educator:lms_educators(language)')
    .eq('is_live', true)
    .eq('captions_enabled', true)

  if (error) {
    console.error('[captions/jobs] erro:', error)
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }

  const jobs = (data ?? [])
    .filter((s) => s.stream_key) // sem stream_key não há HLS local para captar
    .map((s) => ({
      id: s.id,
      stream_key: s.stream_key,
      source_language:
        (s.caption_source_language as string | null)?.toLowerCase().slice(0, 2) ||
        ((s.educator as { language?: string } | null)?.language || 'pt').toLowerCase().slice(0, 2),
    }))

  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } })
}
