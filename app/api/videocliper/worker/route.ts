import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
async function ficheiroDoDvr(dvrJobId: string | null, nome?: string | null): Promise<string | null> {
  /**
   * O nome escrito à mão ganha.
   *
   * Serve as gravações antigas, que estão no disco mas não têm linha em `lms_dvr_jobs`. O
   * caminho monta-se AQUI e não vem de fora: só o nome do ficheiro atravessa a fronteira, e
   * qualquer barra é retirada — um `../` num nome de ficheiro é um pedido para ler o resto da
   * máquina.
   */
  if (nome) {
    const limpo = nome.replace(/[^A-Za-z0-9._-]/g, '')
    if (limpo.endsWith('.mp4')) return `/mnt/dvr/${limpo}`
  }

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
      .select('id, origem, youtube_url, youtube_video_id, dvr_job_id, dvr_ficheiro, titulo')
      .eq('id', clip.job_id as string)
      .maybeSingle()

    const ficheiroLocal = await ficheiroDoDvr(job?.dvr_job_id as string | null, job?.dvr_ficheiro as string | null)

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
      caption: clip.caption,
      /**
       * O Short vai do VPS, não daqui.
       *
       * O site também sabe publicá-lo, mas para isso tinha de descarregar o MP4 da gaveta e
       * voltar a enviá-lo — um vídeo inteiro a atravessar uma função serverless com tecto de
       * memória e de tempo, por nada. O ficheiro já está na máquina que o cortou, e as
       * credenciais do YouTube também.
       *
       * O Instagram continua a sair do site: precisa de um endereço público para ir buscar o
       * Reel, e esse só existe depois de o clipe chegar à gaveta.
       */
      publicarYoutube: true,
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

  // ── 2. pré-visualizações dos clips propostos ──────────────────────────────
  //
  // Decidir quais clips valem a pena lendo só o texto é decidir às cegas. Logo a seguir à
  // análise, cada proposta ganha um frame e uma versão leve já com as legendas — o que se vê no
  // painel é o clipe, não a descrição dele.
  //
  // Um vídeo de cada vez, com todas as propostas dele: a fonte descarrega-se (ou abre-se do
  // disco) uma vez só em vez de dez.
  await db
    .from('videocliper_clips')
    .update({ preview_estado: null })
    .eq('preview_estado', 'a_fazer')
    .lt('updated_at', new Date(agora.getTime() - MINUTOS_ATE_DESISTIR * 60_000).toISOString())

  const { data: semPreview } = await db
    .from('videocliper_clips')
    .select('job_id')
    .is('preview_estado', null)
    .in('estado', ['proposto', 'rejeitado', 'erro'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (semPreview) {
    const jobId = semPreview.job_id as string
    const [{ data: jobP }, { data: clipsP }] = await Promise.all([
      db.from('videocliper_jobs')
        .select('id, origem, youtube_url, dvr_job_id, dvr_ficheiro')
        .eq('id', jobId).maybeSingle(),
      db.from('videocliper_clips')
        .select('id, inicio_seg, fim_seg, legendas')
        .eq('job_id', jobId)
        .is('preview_estado', null)
        .in('estado', ['proposto', 'rejeitado', 'erro'])
        .order('ordem')
        .limit(12),
    ])

    if (jobP && clipsP?.length) {
      await db.from('videocliper_clips')
        .update({ preview_estado: 'a_fazer', updated_at: agora.toISOString() })
        .in('id', clipsP.map((c) => c.id as string))

      return NextResponse.json({
        tipo: 'previews',
        jobId,
        youtubeUrl: jobP.youtube_url,
        ficheiroLocal: await ficheiroDoDvr(jobP.dvr_job_id as string | null, jobP.dvr_ficheiro as string | null),
        clips: clipsP.map((c) => ({
          clipId: c.id,
          inicioSeg: Number(c.inicio_seg),
          fimSeg: Number(c.fim_seg),
          legendas: c.legendas,
        })),
        // Metade da resolução final e as legendas à mesma proporção: o suficiente para decidir,
        // leve o bastante para abrir dez de seguida no telemóvel.
        estilo: {
          largura: 540,
          altura: 960,
          fonte: 'Montserrat Black',
          tamanho: 48,
          corBase: '#FFFFFF',
          corDestaque: '#FFD700',
          contorno: '#000000',
          contornoPx: 4,
          posicaoY: 0.68,
          palavrasPorEcra: 3,
        },
      })
    }
  }

  // ── 3. vídeos por processar ───────────────────────────────────────────────
  const { data: job } = await db
    .from('videocliper_jobs')
    .select('id, origem, youtube_url, youtube_video_id, dvr_job_id, dvr_ficheiro, titulo, idioma')
    .eq('estado', 'pedido')
    // À espera da ponte do Mac: o VPS não consegue descarregar do YouTube, e tentar só
    // transformava um vídeo por descarregar num erro.
    .or('ponte_estado.is.null,ponte_estado.eq.feito')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (!job) return NextResponse.json({ tipo: 'nada' })

  const ficheiroLocal = await ficheiroDoDvr(job.dvr_job_id as string | null, job.dvr_ficheiro as string | null)

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

  // ── um endereço para subir DIRETO para o storage ──────────────────────────
  //
  // Um vídeo não pode atravessar uma função da Vercel: o corpo tem tecto de 4,5 MB e um clipe
  // de 60s a 1080p passa muito disso. O worker pede aqui um endereço assinado e envia o
  // ficheiro ao Supabase sem passar pelo site; depois reporta o endereço público.
  if (resultado === 'upload-url') {
    const ext = String(corpo?.ext ?? '').replace(/[^a-z0-9]/g, '')
    if (!['mp4', 'jpg'].includes(ext)) return NextResponse.json({ error: 'extensão inválida' }, { status: 400 })
    const pasta = corpo?.pasta === 'previews' ? 'clips/previews' : 'clips'
    const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
    const bucket = db.storage.from('uploads')
    const { data, error } = await bucket.createSignedUploadUrl(caminho)
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'sem endereço' }, { status: 500 })
    return NextResponse.json({
      signedUrl: data.signedUrl,
      publicUrl: bucket.getPublicUrl(caminho).data.publicUrl,
    })
  }

  // ── pré-visualização pronta ───────────────────────────────────────────────
  if (resultado === 'preview') {
    const clipId = String(corpo?.clipId ?? '')
    if (!clipId) return NextResponse.json({ error: 'sem clipe' }, { status: 400 })
    if (corpo?.erro) {
      await db.from('videocliper_clips')
        .update({ preview_estado: 'erro', preview_erro: String(corpo.erro).slice(0, 300), updated_at: agora })
        .eq('id', clipId)
      return NextResponse.json({ ok: true })
    }
    const { error } = await db.from('videocliper_clips').update({
      preview_estado: 'feito',
      preview_url: String(corpo?.previewUrl ?? '') || null,
      thumbnail_url: String(corpo?.frameUrl ?? '') || null,
      preview_erro: null,
      updated_at: agora,
    }).eq('id', clipId)
    return NextResponse.json({ ok: !error, podeApagar: !error })
  }

  // ── clipe renderizado e já subido ─────────────────────────────────────────
  if (resultado === 'render') {
    const clipId = String(corpo?.clipId ?? '')
    const url = String(corpo?.videoUrl ?? '')
    if (!clipId || !url) return NextResponse.json({ error: 'sem URL do clipe' }, { status: 400 })

    await db.from('videocliper_clips').update({
      estado: 'renderizado',
      video_url: url,
      // Sem capa nova, fica o frame da pré-visualização em vez de a imagem desaparecer.
      ...(corpo?.thumbnailUrl ? { thumbnail_url: String(corpo.thumbnailUrl) } : {}),
      erro: null,
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

  // ── o Short, publicado pelo VPS ───────────────────────────────────────────
  if (resultado === 'youtube') {
    const clipId = String(corpo?.clipId ?? '')
    if (!clipId) return NextResponse.json({ error: 'sem clipe' }, { status: 400 })

    if (corpo?.erro) {
      // Falhar o YouTube não estraga o clipe: ele está na gaveta e o Reel sai na mesma. Fica o
      // registo, para se poder voltar a tentar sem procurar o que correu mal.
      await db.from('videocliper_clips')
        .update({ erro: String(corpo.erro).slice(0, 500), updated_at: agora })
        .eq('id', clipId)
      return NextResponse.json({ ok: true })
    }

    await db.from('videocliper_clips').update({
      youtube_short_id: String(corpo?.videoId ?? '') || null,
      youtube_short_url: String(corpo?.url ?? '') || null,
      estado: 'publicado',
      publicado_em: agora,
      erro: null,
      updated_at: agora,
    }).eq('id', clipId)

    return NextResponse.json({ ok: true })
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
