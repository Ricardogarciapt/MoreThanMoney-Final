import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ESTILO_POR_OMISSAO, estiloValido } from '@/lib/videocliper/estilos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    const BASE_JOB = 'id, origem, youtube_url, titulo, duracao_seg, estado, erro, progresso, idioma, created_at'
    const BASE_CLIPS = 'id, ordem, titulo, hook, score, porque, inicio_seg, fim_seg, duracao_seg, caption, cta_palavra, estado, erro, video_url, thumbnail_url, ig_permalink, youtube_short_url, legendas, preview_url, preview_estado, preview_erro, broll'
    const ler = (novas: boolean) => Promise.all([
      db.from('videocliper_jobs').select(novas ? `${BASE_JOB}, estilo` : BASE_JOB).eq('id', jobId).maybeSingle(),
      db.from('videocliper_clips').select(novas ? `${BASE_CLIPS}, estilo, enfase` : BASE_CLIPS).eq('job_id', jobId).order('ordem'),
    ])
    let [{ data: job, error: e1 }, { data: clips, error: e2 }] = await ler(true)
    // Antes da migração 066 as colunas novas não existem: o painel abre na mesma, com o estilo por omissão.
    if (e1 || e2) [{ data: job, error: e1 }, { data: clips, error: e2 }] = await ler(false)
    if (!job) return NextResponse.json({ erro: 'vídeo não encontrado' }, { status: 404 })
    return NextResponse.json({
      job: { estilo: ESTILO_POR_OMISSAO, ...(job as unknown as Record<string, unknown>) },
      clips: clips ?? [],
    })
  }

  // A lista não traz a transcrição: são milhares de palavras por vídeo, e o que o ecrã mostra é
  // o título e o estado.
  const { data: jobs } = await db
    .from('videocliper_jobs')
    .select('id, origem, youtube_url, titulo, duracao_seg, estado, erro, progresso, ponte_estado, created_at')
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

  // ── apagar um clipe, ou um vídeo inteiro com os clips dele ────────────────
  //
  // Apaga também os ficheiros no storage (pré-visualização, frame, clipe cortado): uma linha
  // apagada com o MP4 esquecido no bucket é espaço pago por nada. O que já saiu para o
  // Instagram ou o YouTube fica lá — isto não despublica.
  if (accao === 'apagar_clip' || accao === 'apagar_job') {
    const campo = accao === 'apagar_clip' ? 'id' : 'job_id'
    const alvo = String(accao === 'apagar_clip' ? corpo?.clipId ?? '' : corpo?.jobId ?? '')
    if (!alvo) return NextResponse.json({ erro: 'nada para apagar' }, { status: 400 })

    const { data: clips } = await db
      .from('videocliper_clips')
      .select('id, estado, video_url, thumbnail_url, preview_url')
      .eq(campo, alvo)

    // A cortar no VPS: apagar agora deixava o worker a subir um ficheiro para uma linha que já
    // não existe.
    if ((clips ?? []).some((c) => c.estado === 'a_render')) {
      return NextResponse.json({ erro: 'há um clipe a ser cortado agora — espera que acabe' }, { status: 409 })
    }

    const MARCA = '/storage/v1/object/public/uploads/'
    const caminhos = (clips ?? [])
      .flatMap((c) => [c.video_url, c.thumbnail_url, c.preview_url])
      .filter((u): u is string => typeof u === 'string' && u.includes(MARCA))
      .map((u) => decodeURIComponent(u.split(MARCA)[1].split('?')[0]))
    if (caminhos.length) await db.storage.from('uploads').remove(caminhos).catch(() => undefined)

    await db.from('videocliper_clips').delete().eq(campo, alvo)
    if (accao === 'apagar_job') {
      const { data: job } = await db.from('videocliper_jobs').select('estado').eq('id', alvo).maybeSingle()
      if (job && ['a_descarregar', 'a_transcrever'].includes(job.estado as string)) {
        return NextResponse.json({ erro: 'o vídeo está a ser processado no VPS — espera que acabe' }, { status: 409 })
      }
      await db.from('videocliper_jobs').delete().eq('id', alvo)
    }
    return NextResponse.json({ ok: true, ficheiros: caminhos.length })
  }

  // ── mudar o estilo visual de um vídeo ─────────────────────────────────────
  //
  // Vale para o que ainda não foi cortado: as pré-visualizações dos clips por cortar voltam à
  // fila e saem com o estilo novo. Um clipe já cortado tem o estilo queimado no ficheiro — mudar
  // o vídeo não o recorta às escondidas.
  if (accao === 'estilo') {
    const jobId = String(corpo?.jobId ?? '')
    const estilo = corpo?.estilo
    if (!jobId || !estiloValido(estilo)) return NextResponse.json({ erro: 'estilo desconhecido' }, { status: 400 })
    const { error } = await db.from('videocliper_jobs')
      .update({ estilo, updated_at: new Date().toISOString() }).eq('id', jobId)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

    const { data: clips } = await db
      .from('videocliper_clips')
      .select('id, preview_url, thumbnail_url')
      .eq('job_id', jobId)
      .in('estado', ['proposto', 'rejeitado', 'erro'])
    const MARCA = '/storage/v1/object/public/uploads/'
    const velhos = (clips ?? [])
      .flatMap((c) => [c.preview_url, c.thumbnail_url])
      .filter((u): u is string => typeof u === 'string' && u.includes(MARCA))
      .map((u) => decodeURIComponent(u.split(MARCA)[1].split('?')[0]))
    if (clips?.length) {
      await db.from('videocliper_clips').update({
        preview_estado: null, preview_url: null, thumbnail_url: null, preview_erro: null,
        updated_at: new Date().toISOString(),
      }).in('id', clips.map((c) => c.id as string))
    }
    if (velhos.length) await db.storage.from('uploads').remove(velhos).catch(() => undefined)
    return NextResponse.json({ ok: true, previews: clips?.length ?? 0 })
  }

  // ── tirar o B-roll a um clipe (fica só a cara) ────────────────────────────
  if (accao === 'broll_limpar') {
    const clipId = String(corpo?.clipId ?? '')
    const { data: c } = await db.from('videocliper_clips').select('estado').eq('id', clipId).maybeSingle()
    if (!c) return NextResponse.json({ erro: 'clipe desconhecido' }, { status: 404 })
    if (!['proposto', 'rejeitado', 'erro'].includes(c.estado as string)) {
      return NextResponse.json({ erro: 'este clipe já foi cortado — o B-roll está no ficheiro' }, { status: 409 })
    }
    await db.from('videocliper_clips').update({
      broll: [], preview_estado: null, preview_url: null, thumbnail_url: null, updated_at: new Date().toISOString(),
    }).eq('id', clipId)
    return NextResponse.json({ ok: true })
  }

  // ── rever as legendas dos clips ainda por cortar ─────────────────────────
  //
  // Refaz as legendas a partir da transcrição e passa-as pela revisão; as pré-visualizações
  // voltam a ser geradas com o texto novo. Clips já cortados não mudam: a legenda está queimada
  // no ficheiro, e recortá-los sem ninguém pedir era gastar máquina às escondidas.
  if (accao === 'rever_legendas') {
    const jobId = String(corpo?.jobId ?? '')
    const { data: job } = await db.from('videocliper_jobs').select('transcricao').eq('id', jobId).maybeSingle()
    if (!Array.isArray(job?.transcricao)) return NextResponse.json({ erro: 'vídeo sem transcrição' }, { status: 400 })
    const { data: clips } = await db
      .from('videocliper_clips')
      .select('id, titulo, hook, inicio_seg, fim_seg, preview_url, thumbnail_url')
      .eq('job_id', jobId)
      .in('estado', ['proposto', 'rejeitado', 'erro'])

    const { legendasDoClipe } = await import('@/lib/videocliper/analise')
    const { reverPalavras } = await import('@/lib/videocliper/revisao')
    const MARCA = '/storage/v1/object/public/uploads/'
    const velhos: string[] = []

    await Promise.all((clips ?? []).map(async (c) => {
      const legendas = await reverPalavras(
        legendasDoClipe(job!.transcricao as never, Number(c.inicio_seg), Number(c.fim_seg)),
        `${c.titulo} — ${c.hook ?? ''}`,
      )
      for (const u of [c.preview_url, c.thumbnail_url]) {
        if (typeof u === 'string' && u.includes(MARCA)) velhos.push(decodeURIComponent(u.split(MARCA)[1].split('?')[0]))
      }
      await db.from('videocliper_clips').update({
        legendas,
        preview_estado: null, preview_url: null, thumbnail_url: null, preview_erro: null,
        updated_at: new Date().toISOString(),
      }).eq('id', c.id)
    }))
    if (velhos.length) await db.storage.from('uploads').remove(velhos).catch(() => undefined)
    return NextResponse.json({ ok: true, revistos: clips?.length ?? 0 })
  }

  // ── pôr um vídeo na fila ──────────────────────────────────────────────────
  if (accao === 'clipar') {
    const url = String(corpo?.url ?? '').trim()

    /**
     * UMA GRAVAÇÃO NOSSA, pelo nome do ficheiro.
     *
     * O disco do VPS tem gigabytes de sessões gravadas que a base de dados desconhece — o DVR
     * gravou-as antes de haver `lms_dvr_jobs` a acompanhá-las. O material existe, a ferramenta
     * existe, e não se encontravam.
     *
     * O YouTube também não serve de ponte: recusa descargas do IP do datacenter. Mas o ficheiro
     * está NA MESMA MÁQUINA que corta — é só preciso saber o nome.
     *
     * Aceita-se só o NOME, nunca um caminho: o worker resolve-o debaixo de /mnt/dvr. Deixar
     * passar um caminho era deixar alguém pedir qualquer ficheiro da máquina.
     */
    if (!url.startsWith('http')) {
      const ficheiro = url.replace(/[^A-Za-z0-9._-]/g, '')
      if (!ficheiro.endsWith('.mp4')) {
        return NextResponse.json(
          { erro: 'dá-me o link do YouTube, ou o nome do ficheiro do DVR (termina em .mp4)' },
          { status: 400 },
        )
      }
      const { data, error } = await db.from('videocliper_jobs').insert({
        origem: 'dvr',
        titulo: String(corpo?.titulo ?? '').trim() || ficheiro.replace(/\.mp4$/, ''),
        dvr_ficheiro: ficheiro,
        estado: 'pedido',
        criado_por: 'admin',
      }).select('id').single()
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, jobId: data.id })
    }

    /**
     * QUALQUER LINK DE VÍDEO, não só o YouTube.
     *
     * Um `.mp4` directo — de uma gaveta, de um Drive partilhado, do nosso próprio DVR público —
     * puxa-se com um pedido normal, sem extractor pelo meio e sem nada que se possa partir.
     * Vimeo, Twitch, TikTok e companhia passam pelo extractor e funcionam de primeira.
     *
     * O YouTube é o caso difícil: recusa o IP do datacenter, e só passa com cookies. Por isso
     * NÃO se exige aqui que o link seja dele — exigi-lo fechava a porta a todos os outros, que
     * funcionam.
     */
    const videoId = idDoYoutube(url)

    // O mesmo vídeo não se analisa duas vezes: a transcrição custa dinheiro e a análise custa
    // mais. Devolve-se o que já existe em vez de um erro de duplicado.
    const { data: ja } = videoId
      ? await db.from('videocliper_jobs').select('id, estado').eq('youtube_video_id', videoId).maybeSingle()
      : await db.from('videocliper_jobs').select('id, estado').eq('youtube_url', url).maybeSingle()
    // YouTube recusa o IP do servidor; o vídeo passa pela PONTE do Mac (IP de casa), que o
    // descarrega e o põe no disco do VPS. Outros sites continuam a ir direto ao VPS.
    const pelaPonte = Boolean(videoId)

    if (ja) {
      // Pedir outra vez um vídeo que falhou é pedir para tentar de novo.
      if (ja.estado === 'erro') {
        await db.from('videocliper_jobs').update({
          estado: 'pedido', erro: null, progresso: null, reclamado_em: null, reclamado_por: null,
          ...(pelaPonte ? { ponte_estado: 'pendente', ponte_reclamado_em: null } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', ja.id)
        return NextResponse.json({ ok: true, jobId: ja.id, repetido: true })
      }
      return NextResponse.json({ ok: true, jobId: ja.id, jaExistia: true, estado: ja.estado })
    }

    const { data, error } = await db.from('videocliper_jobs').insert({
      origem: 'youtube',
      youtube_url: url,
      youtube_video_id: videoId,
      titulo: String(corpo?.titulo ?? '').trim() || null,
      estado: 'pedido',
      ponte_estado: pelaPonte ? 'pendente' : null,
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
