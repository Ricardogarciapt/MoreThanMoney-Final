import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { translateCaption } from '@/lib/lms-captions/translate'
import { normalizeCaptionLang } from '@/lib/lms-captions/constants'

// GET /api/live-sessions/streams/[id]/captions?since=<seq>&limit=<n>&lang=<code>
// Devolve cues após `since`. Se `lang` for pedido e faltar a tradução nesse idioma,
// traduz ON-DEMAND (cadeia Claude→OpenAI→Google) e CACHEIA na linha — assim suporta
// os 21 idiomas do site sem pré-traduzir tudo. Cada cue traz `text` já resolvido.

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
    const langRaw = url.searchParams.get('lang') || ''
    const lang = langRaw ? normalizeCaptionLang(langRaw) : ''

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

    const cues = (data ?? []) as Array<{
      seq: number
      source_language: string
      source_text: string
      translations: Record<string, string> | null
      t_start_ms: number | null
      t_end_ms: number | null
      is_final: boolean
      created_at: string
    }>

    // Tradução on-demand do idioma pedido (só cues finais que ainda não o têm).
    if (lang) {
      await Promise.all(
        cues.map(async (c) => {
          if (!c.is_final) return
          const src = normalizeCaptionLang(c.source_language)
          if (lang === src) return
          if (c.translations && c.translations[lang]) return
          const tr = await translateCaption(c.source_text, src, [lang])
          const val = tr[lang]
          if (val) {
            c.translations = { ...(c.translations || {}), [lang]: val }
            // cacheia na BD (merge) para os próximos espetadores do mesmo idioma
            await supabase
              .from('lms_stream_captions')
              .update({ translations: c.translations })
              .eq('stream_id', id)
              .eq('seq', c.seq)
          }
        }),
      )
    }

    const captions = cues.map((c) => ({
      ...c,
      // texto já resolvido no idioma pedido (ou origem se não houver/for a origem)
      text: lang && lang !== normalizeCaptionLang(c.source_language)
        ? c.translations?.[lang] || c.source_text
        : c.source_text,
    }))

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
