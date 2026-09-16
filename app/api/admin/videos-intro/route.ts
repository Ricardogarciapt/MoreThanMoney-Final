import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { destinoPorId, destinosComVideoIntro } from '@/lib/navegacao'
import {
  classificarUrlIntro,
  lerVideosIntroTodos,
  limparCacheVideosIntro,
  textoBotao,
} from '@/lib/videos-intro'

/**
 * Gestor dos vídeos «Aprende a usar …» (/admin?tab=content).
 *
 * A lista de destinos vem do registo da navbar (lib/navegacao.ts) e não da base de dados: a base
 * de dados só guarda o que o admin escreveu sobre um destino. Um destino que desapareça da navbar
 * deixa de ter botão sem ser preciso limpar nada.
 */
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const guardados = await lerVideosIntroTodos()
    const porDestino = new Map(guardados.map((l) => [l.destino, l]))

    const destinos = destinosComVideoIntro().map((d) => {
      const l = porDestino.get(d.id)
      return {
        id: d.id,
        href: d.href,
        rotuloPt: d.rotuloPt,
        grupo: d.grupo,
        url: l?.url ?? '',
        tipo: l?.tipo ?? null,
        rotulo: l?.rotulo ?? '',
        ativo: l?.ativo ?? false,
        textoBotao: textoBotao(d.id, l?.rotulo ?? null),
      }
    })

    return NextResponse.json({ success: true, destinos })
  } catch (erro: unknown) {
    return NextResponse.json({ error: (erro as Error)?.message || 'Erro interno' }, { status: 500 })
  }
}

/** Grava (ou atualiza) um destino. Um pedido = um destino. */
export async function PUT(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const corpo = await request.json().catch(() => ({}))
    const destinoId = String(corpo?.destino || '').trim()
    const url = String(corpo?.url || '').trim()
    const rotulo = String(corpo?.rotulo || '').trim()
    const ativo = Boolean(corpo?.ativo)

    if (!destinoPorId(destinoId)) {
      return NextResponse.json({ error: 'Destino desconhecido.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Sem link não há nada para guardar: apagar é mais honesto do que deixar uma linha vazia
    // ligada a um botão que abriria um leitor preto.
    if (!url) {
      await supabase.from('mtm_videos_intro').delete().eq('destino', destinoId)
      limparCacheVideosIntro()
      return NextResponse.json({ success: true, removido: true })
    }

    const classificado = classificarUrlIntro(url)
    if (!classificado.ok) {
      return NextResponse.json({ error: classificado.erro }, { status: 400 })
    }

    const { error } = await supabase.from('mtm_videos_intro').upsert(
      {
        destino: destinoId,
        tipo: classificado.tipo,
        url,
        rotulo: rotulo || null,
        ativo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'destino' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    limparCacheVideosIntro()
    return NextResponse.json({
      success: true,
      tipo: classificado.tipo,
      textoBotao: textoBotao(destinoId, rotulo || null),
    })
  } catch (erro: unknown) {
    return NextResponse.json({ error: (erro as Error)?.message || 'Erro interno' }, { status: 500 })
  }
}
