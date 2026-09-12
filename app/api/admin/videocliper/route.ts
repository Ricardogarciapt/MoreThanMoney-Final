import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O PAINEL DO VIDEOCLIPER: pedir, ver, aprovar.
 *
 * O trabalho pesado não passa por aqui — corre no VPS, que faz poll ao `/api/videocliper/worker`.
 * Esta rota só mexe em estado: um vídeo entra na fila, dez clips aparecem propostos, e alguém
 * decide quais valem a pena.
 *
 * A aprovação é humana de propósito, e continua a ser mesmo quando o modelo acerta. Um clipe é
 * a cara da marca durante quinze segundos; o custo de publicar um mau é maior do que o de olhar
 * para dez durante um minuto.
 */

/** Tira o id de um link do YouTube, venha ele em que forma vier. */
function idDoYoutube(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  return m?.[1] ?? null
}

export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const jobId = req.nextUrl.searchParams.get('job')

  if (jobId) {
    const [{ data: job }, { data: clips }] = await Promise.all([
      db.from('videocliper_jobs')
        .select('id, origem, youtube_url, titulo, duracao_seg, estado, erro, progresso, idioma, created_at')
        .eq('id', jobId).maybeSingle(),
      db.from('videocliper_clips')
        .select('id, ordem, titulo, hook, score, porque, inicio_seg, fim_seg, duracao_seg, caption, cta_palavra, estado, erro, video_url, thumbnail_url, ig_permalink, youtube_short_url')
        .eq('job_id', jobId).order('ordem'),
    ])
    if (!job) return NextResponse.json({ erro: 'vídeo não encontrado' }, { status: 404 })
    return NextResponse.json({ job, clips: clips ?? [] })
  }

  // A lista não traz a transcrição: são milhares de palavras por vídeo, e o que o ecrã mostra é
  // o título e o estado.
  const { data: jobs } = await db
    .from('videocliper_jobs')
    .select('id, origem, youtube_url, titulo, duracao_seg, estado, erro, progresso, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  const ids = (jobs ?? []).map((j) => j.id)
  const { data: contagens } = ids.length
    ? await db.from('videocliper_clips').select('job_id, estado').in('job_id', ids)
    : { data: [] as Array<{ job_id: string; estado: string }> }

  return NextResponse.json({
    jobs: (jobs ?? []).map((j) => {
      const meus = (contagens ?? []).filter((c) => c.job_id === j.id)
      return {
        ...j,
        clips: meus.length,
        publicados: meus.filter((c) => c.estado === 'publicado').length,
        aprovados: meus.filter((c) => ['aprovado', 'a_render', 'renderizado', 'agendado'].includes(c.estado)).length,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const corpo = await req.json().catch(() => ({}))
  const accao = String(corpo?.accao ?? '')

  // ── pôr um vídeo na fila ──────────────────────────────────────────────────
  if (accao === 'clipar') {
    const url = String(corpo?.url ?? '').trim()
    const videoId = idDoYoutube(url)
    if (!videoId) {
      return NextResponse.json({ erro: 'isso não parece um link do YouTube' }, { status: 400 })
    }

    // O mesmo vídeo não se analisa duas vezes: a transcrição custa dinheiro e a análise custa
    // mais. Devolve-se o que já existe em vez de um erro de duplicado.
    const { data: ja } = await db
      .from('videocliper_jobs').select('id, estado').eq('youtube_video_id', videoId).maybeSingle()
    if (ja) return NextResponse.json({ ok: true, jobId: ja.id, jaExistia: true, estado: ja.estado })

    const { data, error } = await db.from('videocliper_jobs').insert({
      origem: 'youtube',
      youtube_url: url,
      youtube_video_id: videoId,
      titulo: String(corpo?.titulo ?? '').trim() || null,
      estado: 'pedido',
      criado_por: 'admin',
    }).select('id').single()
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, jobId: data.id })
  }

  // ── aprovar / rejeitar um clipe ───────────────────────────────────────────
  if (accao === 'aprovar' || accao === 'rejeitar') {
    const clipId = String(corpo?.clipId ?? '')
    if (!clipId) return NextResponse.json({ erro: 'sem clipe' }, { status: 400 })

    const novo = accao === 'aprovar' ? 'aprovado' : 'rejeitado'
    const { error } = await db.from('videocliper_clips')
      .update({ estado: novo, erro: null, updated_at: new Date().toISOString() })
      .eq('id', clipId)
      // Só se mexe no que ainda não foi cortado: reaprovar um clipe já a renderizar punha o
      // worker a cortá-lo duas vezes.
      .in('estado', ['proposto', 'rejeitado', 'erro'])
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      nota: accao === 'aprovar' ? 'na fila de corte — o VPS apanha-o na próxima passagem' : null,
    })
  }

  // ── editar a legenda antes de publicar ────────────────────────────────────
  if (accao === 'legenda') {
    const clipId = String(corpo?.clipId ?? '')
    const caption = String(corpo?.caption ?? '').trim()
    if (!clipId || !caption) return NextResponse.json({ erro: 'sem legenda' }, { status: 400 })
    await db.from('videocliper_clips')
      .update({ caption, updated_at: new Date().toISOString() }).eq('id', clipId)
    return NextResponse.json({ ok: true })
  }

  // ── publicar um clipe já cortado ──────────────────────────────────────────
  if (accao === 'publicar') {
    const clipId = String(corpo?.clipId ?? '')
    const destinos = Array.isArray(corpo?.destinos) ? corpo.destinos.map(String) : ['instagram', 'youtube']
    const { publicarClipe } = await import('@/lib/videocliper/publicar')
    const r = await publicarClipe(clipId, destinos as Array<'instagram' | 'youtube'>)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  // ── voltar a analisar, quando os clips não prestaram ──────────────────────
  if (accao === 'reanalisar') {
    const jobId = String(corpo?.jobId ?? '')
    const { data: job } = await db
      .from('videocliper_jobs').select('id, transcricao, titulo').eq('id', jobId).maybeSingle()
    if (!job?.transcricao) {
      return NextResponse.json({ erro: 'esse vídeo ainda não tem transcrição' }, { status: 400 })
    }
    try {
      const { analisarTranscricao, guardarPropostas } = await import('@/lib/videocliper/analise')
      const palavras = job.transcricao as Array<{ palavra: string; inicio: number; fim: number }>
      const clips = await analisarTranscricao({ palavras, titulo: job.titulo as string })
      const n = await guardarPropostas(jobId, clips, palavras)
      return NextResponse.json({ ok: true, clips: n })
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro' }, { status: 500 })
    }
  }

  return NextResponse.json({ erro: 'acção desconhecida' }, { status: 400 })
}
