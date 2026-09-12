import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O BALCÃO DO WORKER DO VPS.
 *
 * O site não chama a VPS — a VPS é que pergunta ao site o que há para fazer. É o mesmo desenho
 * do DVR e existe por uma razão simples: a máquina que tem o ffmpeg e o disco está atrás de
 * NAT, sem porta aberta, e abrir uma para o mundo por causa disto seria a pior parte deste
 * sistema.
 *
 * GET  → reclama UM trabalho e devolve o que é preciso para o fazer.
 * POST → reporta o resultado.
 *
 * Autentica pelo mesmo segredo do worker das legendas. Um segundo segredo para a mesma máquina
 * seria mais uma coisa para rodar e mais uma para esquecer.
 */

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  if (!esperado) return false
  return request.headers.get('x-caption-secret')?.trim() === esperado
}

/**
 * O FICHEIRO NO DISCO DO VPS, quando a sessão é nossa.
 *
 * Uma gravação do DVR já está na máquina que vai cortar — em `/mnt/dvr`. Mandá-la ao YouTube
 * para a voltar a descarregar seria pagar duas viagens por um ficheiro que está ali ao lado, e
 * ainda por cima o YouTube recusa descargas do IP do datacenter («confirma que não és um robô»).
 *
 * Devolve `null` para vídeos que não são nossos: esses têm mesmo de ser descarregados.
 */
async function ficheiroDoDvr(dvrJobId: string | null): Promise<string | null> {
  if (!dvrJobId) return null
  const { data } = await getSupabaseAdmin()
    .from('lms_dvr_jobs')
    .select('base_file, multi_file')
    .eq('id', dvrJobId)
    .maybeSingle()
  // O `base_file` é o original; o `multi_file` leva as faixas dobradas e é maior sem servir para
  // nada aqui — o clipe leva o áudio de origem.
  return (data?.base_file as string) ?? (data?.multi_file as string) ?? null
}

/** Um trabalho reclamado há mais do que isto foi abandonado — a máquina morreu a meio. */
const MINUTOS_ATE_DESISTIR = 40

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()
  const quem = request.nextUrl.searchParams.get('worker') ?? 'vps'
  const agora = new Date()

  /**
   * Devolver trabalhos abandonados à fila.
   *
   * Um worker que morre a meio de um download deixa a linha presa em `a_descarregar` para
   * sempre, e o vídeo nunca mais é processado — sem erro nenhum, que é o modo de falhar mais
   * difícil de encontrar.
   */
  await db
    .from('videocliper_jobs')
    .update({ estado: 'pedido', reclamado_em: null, reclamado_por: null, progresso: null })
    .in('estado', ['a_descarregar', 'a_transcrever', 'a_analisar', 'a_render'])
    .lt('reclamado_em', new Date(agora.getTime() - MINUTOS_ATE_DESISTIR * 60_000).toISOString())

  // ── 1. clips aprovados à espera de corte ──────────────────────────────────
  //
  // Vem primeiro: um clipe aprovado é trabalho que alguém já decidiu que quer, e um vídeo novo
  // pode esperar. Se a ordem fosse ao contrário, uma tarde de análises deixava as aprovações
  // paradas atrás delas.
  const { data: clip } = await db
    .from('videocliper_clips')
    .select('id, job_id, ordem, titulo, inicio_seg, fim_seg, duracao_seg, legendas, caption, cta_palavra')
    .eq('estado', 'aprovado')
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (clip) {
    const { data: job } = await db
      .from('videocliper_jobs')
      .select('id, origem, youtube_url, youtube_video_id, dvr_job_id, titulo')
      .eq('id', clip.job_id as string)
      .maybeSingle()

    const ficheiroLocal = await ficheiroDoDvr(job?.dvr_job_id as string | null)

    await db.from('videocliper_clips')
      .update({ estado: 'a_render', updated_at: agora.toISOString() })
      .eq('id', clip.id)

    return NextResponse.json({
      tipo: 'render',
      clipId: clip.id,
      jobId: clip.job_id,
      origem: job?.origem,
      youtubeUrl: job?.youtube_url,
      dvrJobId: job?.dvr_job_id,
      // O caminho no disco do próprio VPS. Quando existe, não há descarga nenhuma a fazer —
      // o worker corta o ficheiro onde ele já está.
      ficheiroLocal,
      inicioSeg: Number(clip.inicio_seg),
      fimSeg: Number(clip.fim_seg),
      duracaoSeg: Number(clip.duracao_seg),
      legendas: clip.legendas,
      titulo: clip.titulo,
      /**
       * O ESTILO DAS LEGENDAS, mandado daqui e não escrito no worker.
       *
       * O worker sabe correr ffmpeg; não tem de saber a cor da marca. Com o estilo do lado do
       * site, mudá-lo é uma linha aqui em vez de um deploy numa máquina a que quase ninguém
       * acede — e os dois nunca ficam a discordar sobre qual é o amarelo certo.
       */
      estilo: {
        largura: 1080,
        altura: 1920,
        fonte: 'Montserrat Black',
        tamanho: 96,
        corBase: '#FFFFFF',
        corDestaque: '#FFD700',
        contorno: '#000000',
        contornoPx: 8,
        // Terço inferior, mas não encostado: o Instagram desenha a sua interface por cima dos
        // últimos ~15% do ecrã, e a legenda ficava debaixo dos botões.
        posicaoY: 0.68,
        palavrasPorEcra: 3,
      },
      // A regra do disco viaja COM o trabalho, para não depender de o worker se lembrar dela.
      apagarDepoisDeSubir: true,
    })
  }

  // ── 2. vídeos por processar ───────────────────────────────────────────────
  const { data: job } = await db
    .from('videocliper_jobs')
    .select('id, origem, youtube_url, youtube_video_id, dvr_job_id, titulo, idioma')
    .eq('estado', 'pedido')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (!job) return NextResponse.json({ tipo: 'nada' })

  const ficheiroLocal = await ficheiroDoDvr(job.dvr_job_id as string | null)

  await db.from('videocliper_jobs').update({
    estado: 'a_descarregar',
    reclamado_em: agora.toISOString(),
    reclamado_por: quem,
    progresso: 'a descarregar o vídeo',
    updated_at: agora.toISOString(),
  }).eq('id', job.id)

  return NextResponse.json({
    tipo: 'transcrever',
    jobId: job.id,
    origem: job.origem,
    youtubeUrl: job.youtube_url,
    dvrJobId: job.dvr_job_id,
    ficheiroLocal,
    titulo: job.titulo,
    idioma: job.idioma ?? 'pt',
    // `word` é o ponto todo: sem tempos por palavra não há legenda a acender palavra a palavra,
    // e o estilo que foi pedido deixa de ser possível.
    asr: { granularidade: 'word', modelo: 'whisper-large-v3-turbo' },
    apagarDepoisDeSubir: true,
  })
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()
  const corpo = await request.json().catch(() => ({}))
  const resultado = String(corpo?.resultado ?? '')
  const agora = new Date().toISOString()

  // ── progresso, para o painel não ficar mudo ───────────────────────────────
  if (resultado === 'progresso') {
    await db.from('videocliper_jobs')
      .update({ progresso: String(corpo?.progresso ?? '').slice(0, 200), updated_at: agora })
      .eq('id', String(corpo?.jobId ?? ''))
    return NextResponse.json({ ok: true })
  }

  // ── transcrição pronta → analisar ─────────────────────────────────────────
  if (resultado === 'transcricao') {
    const jobId = String(corpo?.jobId ?? '')
    const palavras = Array.isArray(corpo?.palavras) ? corpo.palavras : []
    if (!jobId || !palavras.length) {
      return NextResponse.json({ error: 'transcrição vazia' }, { status: 400 })
    }

    await db.from('videocliper_jobs').update({
      transcricao: palavras,
      duracao_seg: corpo?.duracaoSeg ?? null,
      titulo: corpo?.titulo ?? undefined,
      estado: 'a_analisar',
      progresso: 'a escolher os momentos',
      updated_at: agora,
    }).eq('id', jobId)

    /**
     * A análise corre AQUI e não no VPS.
     *
     * É uma chamada a um modelo, não trabalho de máquina: pô-la no worker obrigava a mandar a
     * chave da Anthropic para o VPS e a duplicar o prompt em dois sítios. O worker faz o que só
     * ele pode fazer — ffmpeg e disco.
     */
    try {
      const { analisarTranscricao, guardarPropostas } = await import('@/lib/videocliper/analise')
      const clips = await analisarTranscricao({ palavras, titulo: corpo?.titulo ?? null })
      const quantos = await guardarPropostas(jobId, clips, palavras)
      await db.from('videocliper_jobs')
        .update({ estado: 'pronto', progresso: `${quantos} clips propostos`, updated_at: agora })
        .eq('id', jobId)
      return NextResponse.json({ ok: true, clips: quantos })
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'erro na análise'
      await db.from('videocliper_jobs')
        .update({ estado: 'erro', erro, updated_at: agora }).eq('id', jobId)
      return NextResponse.json({ ok: false, error: erro }, { status: 500 })
    }
  }

  // ── clipe renderizado e já subido ─────────────────────────────────────────
  if (resultado === 'render') {
    const clipId = String(corpo?.clipId ?? '')
    const url = String(corpo?.videoUrl ?? '')
    if (!clipId || !url) return NextResponse.json({ error: 'sem URL do clipe' }, { status: 400 })

    await db.from('videocliper_clips').update({
      estado: 'renderizado',
      video_url: url,
      thumbnail_url: corpo?.thumbnailUrl ?? null,
      updated_at: agora,
    }).eq('id', clipId)

    /**
     * A confirmação de que o ficheiro pode sair do VPS.
     *
     * O worker só apaga depois de OUVIR isto. Apagar assim que o upload devolve 200, sem
     * confirmação de que a linha ficou gravada, era arriscar perder o clipe entre as duas
     * coisas — e o vídeo original pode já não existir para o voltar a cortar.
     */
    return NextResponse.json({ ok: true, podeApagar: true })
  }

  if (resultado === 'erro') {
    const clipId = corpo?.clipId ? String(corpo.clipId) : null
    const jobId = corpo?.jobId ? String(corpo.jobId) : null
    const erro = String(corpo?.erro ?? 'erro no worker').slice(0, 500)
    if (clipId) {
      await db.from('videocliper_clips').update({ estado: 'erro', erro, updated_at: agora }).eq('id', clipId)
    } else if (jobId) {
      await db.from('videocliper_jobs').update({ estado: 'erro', erro, updated_at: agora }).eq('id', jobId)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'resultado desconhecido' }, { status: 400 })
}
