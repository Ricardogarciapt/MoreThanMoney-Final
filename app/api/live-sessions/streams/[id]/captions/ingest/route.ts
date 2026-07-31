import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { translateCaption } from '@/lib/lms-captions/translate'

// POST /api/live-sessions/streams/[id]/captions/ingest
// Chamado pelo trabalhador de captação no VPS (ffmpeg → OpenAI transcreve). Autenticado
// por segredo partilhado. Traduz o segmento (Claude) e grava o cue — o INSERT dispara
// o Supabase Realtime/CDC para o web; os clientes nativos leem pelo GET.
//
// Body: { seq, source_text, source_language?, t_start_ms?, t_end_ms?, is_final? }

const supabase = getSupabaseAdmin()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const secret = process.env.LMS_CAPTION_WORKER_SECRET
    if (!secret || req.headers.get('x-caption-secret') !== secret) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as {
      seq?: number
      source_text?: string
      source_language?: string
      t_start_ms?: number
      t_end_ms?: number
      is_final?: boolean
    }

    const seq = Number(body.seq)
    const text = (body.source_text || '').trim()
    if (!Number.isFinite(seq) || !text) {
      return NextResponse.json({ error: 'seq e source_text obrigatórios' }, { status: 400 })
    }

    // Idioma de origem: body → coluna do stream → idioma do educador → 'pt'.
    let source = (body.source_language || '').toLowerCase().slice(0, 2)
    if (!source) {
      const { data: st } = await supabase
        .from('lms_streams')
        .select('caption_source_language, educator:lms_educators(language)')
        .eq('id', id)
        .single()
      source =
        (st?.caption_source_language as string | null)?.toLowerCase().slice(0, 2) ||
        ((st?.educator as { language?: string } | null)?.language || 'pt').toLowerCase().slice(0, 2)
    }

    const isFinal = body.is_final !== false
    // Só traduzimos cues finais (os parciais mudam rápido e não vale a pena gastar tokens).
    const translations = isFinal ? await translateCaption(text, source) : {}

    const { error } = await supabase.from('lms_stream_captions').upsert(
      {
        stream_id: id,
        seq,
        source_language: source,
        source_text: text,
        translations,
        audio: {}, // nova transcrição deste seq → invalida qualquer TTS antigo (evita dobragem stale)
        is_final: isFinal,
        t_start_ms: Number.isFinite(body.t_start_ms as number) ? body.t_start_ms : null,
        t_end_ms: Number.isFinite(body.t_end_ms as number) ? body.t_end_ms : null,
      },
      { onConflict: 'stream_id,seq' },
    )

    if (error) {
      console.error('[captions] ingest upsert erro:', error)
      return NextResponse.json({ error: 'Erro ao gravar legenda' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, seq, source, translated: Object.keys(translations) })
  } catch (err) {
    console.error('[captions] ingest exceção:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
