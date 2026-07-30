import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'

// GET /api/live-sessions/streams/[id]/captions?since=<seq>&limit=<n>
// Devolve cues de legenda após `since` (para os clientes nativos que fazem polling;
// o web usa Supabase Realtime/CDC na tabela). Dados públicos dentro da app.

const supabase = getSupabaseAdmin()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const since = Number.parseInt(url.searchParams.get('since') || '0', 10) || 0
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '40', 10) || 40, 100)

    const { data, error } = await supabase
      .from('lms_stream_captions')
      .select('seq, source_language, source_text, translations, t_start_ms, t_end_ms, is_final, created_at')
      .eq('stream_id', id)
      .gt('seq', since)
      .order('seq', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[captions] GET erro:', error)
      return NextResponse.json({ error: 'Erro ao obter legendas' }, { status: 500 })
    }

    const captions = data ?? []
    const latestSeq = captions.length ? captions[captions.length - 1].seq : since
    return NextResponse.json(
      { captions, latestSeq },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[captions] GET exceção:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
