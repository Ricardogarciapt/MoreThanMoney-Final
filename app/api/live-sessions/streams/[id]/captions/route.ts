import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { translateCaption } from '@/lib/lms-captions/translate'
import { synthesizeToStorage } from '@/lib/lms-captions/tts'
import { normalizeCaptionLang } from '@/lib/lms-captions/constants'
import { podeVerReproducaoDaSala } from '@/lib/perfil-ui'
import { criarLeitorDeEspectador } from '@/lib/live-acesso-servidor'

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
    const wantAudio = url.searchParams.get('audio') === '1' // dobragem na voz clonada

    // As legendas e a dobragem SÃO a aula (texto e áudio na voz do educador): mesma regra da
    // reprodução — `free` pública, o resto pelo nível da sala, a equipa vê sempre. Sem isto a sala
    // Premium ficava legível e audível por quem nem tem conta (e cada pedido gastava tradução/TTS).
    //
    // O caption-worker do VPS lê esta rota SEM sessão, só para saber o último `seq` (e continuar a
    // numeração depois de um reinício). Para não o partir, quem não tem acesso e não pede idioma
    // recebe a numeração sem conteúdo nenhum. Com o segredo do worker conta como equipa.
    const { data: sala } = await supabase.from('lms_streams').select('access_tier').eq('id', id).maybeSingle()
    const tier = (sala as { access_tier?: string | null } | null)?.access_tier ?? null
    const segredoWorker = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
    let permitido =
      podeVerReproducaoDaSala(null, tier) ||
      Boolean(segredoWorker && req.headers.get('x-caption-secret') === segredoWorker)
    if (!permitido) {
      const quem = await criarLeitorDeEspectador(req)()
      permitido = podeVerReproducaoDaSala(quem.perfil, tier, { equipa: quem.equipa })
    }
    if (!permitido && (lang || wantAudio)) {
      return NextResponse.json({ error: 'Sem acesso a esta sala', captions: [], latestSeq: since }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('lms_stream_captions')
      .select('seq, source_language, source_text, translations, audio, t_start_ms, t_end_ms, is_final, created_at')
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
      audio: Record<string, string> | null
      t_start_ms: number | null
      t_end_ms: number | null
      is_final: boolean
      created_at: string
    }>

    // Sem acesso: só a numeração (é o que o caption-worker precisa), sem texto nem áudio.
    if (!permitido) {
      const latestSeq = cues.length ? cues[cues.length - 1].seq : since
      return NextResponse.json(
        { captions: cues.map((c) => ({ seq: c.seq })), latestSeq },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

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

    // Dobragem: gera TTS (voz clonada) do texto resolvido, on-demand, cacheado no storage.
    // Só para idioma != origem (o PT original usa o áudio real do stream).
    if (wantAudio && lang) {
      // voz do educador deste stream (default = Ricardo, tratado na lib)
      const { data: st } = await supabase
        .from('lms_streams')
        .select('educator:lms_educators(fish_voice_id)')
        .eq('id', id)
        .single()
      const voiceId =
        ((st?.educator as { fish_voice_id?: string } | null)?.fish_voice_id || undefined) as
          | string
          | undefined
      await Promise.all(
        cues.map(async (c) => {
          if (!c.is_final) return
          const src = normalizeCaptionLang(c.source_language)
          if (lang === src) return
          if (c.audio && c.audio[lang]) return
          const t = c.translations?.[lang] || ''
          if (!t) return
          const audioUrl = await synthesizeToStorage(supabase, t, `${id}/${c.seq}-${lang}.mp3`, voiceId)
          if (audioUrl) {
            c.audio = { ...(c.audio || {}), [lang]: audioUrl }
            await supabase
              .from('lms_stream_captions')
              .update({ audio: c.audio })
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
      // URL do áudio dobrado (voz clonada) no idioma pedido, se existir
      audioUrl: lang && lang !== normalizeCaptionLang(c.source_language) ? c.audio?.[lang] || null : null,
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
