import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { uploadBufferToBucket } from '@/lib/instagram/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * ONDE O CLIPE CHEGA, vindo do VPS.
 *
 * Separada do balcão dos trabalhos porque é a única rota que recebe um ficheiro, e um corpo
 * multipart de dezenas de megabytes não tem nada que ver com as trocas de JSON que decidem o
 * estado.
 *
 * A RESPOSTA é o que autoriza o VPS a apagar. Enquanto ela não voltar com `podeApagar`, o
 * ficheiro fica lá — e é assim que se garante que nunca se perde um clipe entre o upload e a
 * escrita na base de dados, altura em que o excerto do vídeo original já não existe para o
 * refazer.
 */

/** 200 MB: um clipe de 60s a 1080p fica muito abaixo; acima disto é engano. */
const TAMANHO_MAXIMO = 200 * 1024 * 1024

export async function POST(request: NextRequest) {
  const esperado = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  if (!esperado || request.headers.get('x-caption-secret')?.trim() !== esperado) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'corpo ilegível' }, { status: 400 })

  const clipId = String(form.get('clipId') ?? '').trim()
  const video = form.get('video')
  if (!clipId || !(video instanceof File)) {
    return NextResponse.json({ error: 'sem clipe ou sem vídeo' }, { status: 400 })
  }
  if (video.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: `vídeo demasiado grande (${Math.round(video.size / 1024 / 1024)} MB)` }, { status: 413 })
  }

  const db = getSupabaseAdmin()
  const { data: clip } = await db
    .from('videocliper_clips').select('id, estado').eq('id', clipId).maybeSingle()
  if (!clip) return NextResponse.json({ error: 'clipe desconhecido' }, { status: 404 })

  try {
    const bytes = Buffer.from(new Uint8Array(await video.arrayBuffer()))
    const videoUrl = await uploadBufferToBucket(bytes, 'video/mp4', 'clips')

    let capaUrl: string | null = null
    const capa = form.get('capa')
    if (capa instanceof File) {
      // A capa é um luxo: falhar não pode travar um clipe que já está cortado e subido.
      capaUrl = await uploadBufferToBucket(
        Buffer.from(new Uint8Array(await capa.arrayBuffer())), 'image/jpeg', 'clips',
      ).catch(() => null)
    }

    const { error } = await db.from('videocliper_clips').update({
      estado: 'renderizado',
      video_url: videoUrl,
      thumbnail_url: capaUrl,
      erro: null,
      updated_at: new Date().toISOString(),
    }).eq('id', clipId)

    // Só se autoriza a apagar DEPOIS de a escrita ter corrido bem. Se ela falhou, o ficheiro
    // tem de continuar no VPS — é a única cópia que resta.
    if (error) {
      return NextResponse.json({ ok: false, podeApagar: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, podeApagar: true, videoUrl })
  } catch (e) {
    return NextResponse.json(
      { ok: false, podeApagar: false, error: e instanceof Error ? e.message : 'erro no upload' },
      { status: 500 },
    )
  }
}
