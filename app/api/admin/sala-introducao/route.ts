import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import {
  CAPA_SALA_INTRODUCAO,
  CHAVE_SALA_INTRODUCAO,
  PLAYLIST_YOUTUBE_INTRODUCAO,
  limparCacheSalaIntroducao,
} from '@/lib/lms-sala-introducao'
import { extrairIdPlaylist } from '@/lib/videos-intro'

/**
 * A sala «Introdução», editável a partir do /admin?tab=content.
 *
 * Não vive no painel das sessões (tab=education) porque esse painel é organizado por EDUCADOR — e
 * esta sala não tem educador nenhum. Ficaria invisível lá. Vive aqui, ao lado dos vídeos de
 * introdução, que é o assunto de que faz parte.
 */
export const runtime = 'nodejs'

const CAMPOS =
  'id, title, description, thumbnail_url, square_image_url, playlist_url, playlist_title, dvr_playlist_title, dvr_playlist_url, stream_key, nunca_ao_vivo'

export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('lms_streams')
      .select(CAMPOS)
      .eq('chave_sistema', CHAVE_SALA_INTRODUCAO)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      sala: data ?? null,
      capaPorOmissao: CAPA_SALA_INTRODUCAO,
      playlistGravacoes: PLAYLIST_YOUTUBE_INTRODUCAO,
    })
  } catch (erro: unknown) {
    return NextResponse.json({ error: (erro as Error)?.message || 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const corpo = await request.json().catch(() => ({}))
    const playlistUrl = String(corpo?.playlist_url || '').trim()

    // Um link de playlist que o leitor não consiga abrir não deve chegar a ser gravado: o aluno
    // via um cartão «Começa por aqui» que abria um quadrado preto.
    if (playlistUrl && !extrairIdPlaylist(playlistUrl)) {
      return NextResponse.json(
        { error: 'O link tem de ser uma playlist do YouTube (…/playlist?list=…).' },
        { status: 400 },
      )
    }

    const patch: Record<string, unknown> = {
      playlist_url: playlistUrl || null,
      playlist_title: String(corpo?.playlist_title || '').trim() || 'Como usar a MoreThanMoney',
      description: String(corpo?.description || '').trim() || null,
      dvr_playlist_title: String(corpo?.dvr_playlist_title || '').trim() || PLAYLIST_YOUTUBE_INTRODUCAO,
    }
    const capa = String(corpo?.capa || '').trim()
    if (capa) {
      patch.thumbnail_url = capa
      patch.square_image_url = capa
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('lms_streams')
      .update(patch)
      .eq('chave_sistema', CHAVE_SALA_INTRODUCAO)
      .select(CAMPOS)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) {
      return NextResponse.json(
        { error: 'A sala «Introdução» ainda não existe — falta aplicar a migração 100.' },
        { status: 404 },
      )
    }

    limparCacheSalaIntroducao()
    return NextResponse.json({ success: true, sala: data })
  } catch (erro: unknown) {
    return NextResponse.json({ error: (erro as Error)?.message || 'Erro interno' }, { status: 500 })
  }
}
