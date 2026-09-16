import { NextResponse } from 'next/server'
import { lerVideosIntroAtivos } from '@/lib/videos-intro'
import { lerSalaIntroducao } from '@/lib/lms-sala-introducao'

/**
 * O que o site precisa de saber sobre introduções, num pedido só.
 *
 * Devolve (a) os vídeos «Aprende a usar …» que estão ligados e (b) o curso de introdução da sala
 * «Introdução». É público de propósito: o botão tem de aparecer a quem ainda não fez login — é
 * precisamente essa a pessoa que não sabe usar isto.
 *
 * Ambas as leituras estão em cache de 5 minutos no servidor (lib/…); o cabeçalho abaixo põe outra
 * camada na CDN. O Supabase vê no máximo duas queries indexadas por cada 5 minutos, por instância.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [videos, sala] = await Promise.all([lerVideosIntroAtivos(), lerSalaIntroducao()])

  return NextResponse.json(
    {
      videos,
      curso: sala
        ? {
            salaId: sala.id,
            titulo: sala.playlistTitulo,
            capa: sala.capa,
            descricao: sala.descricao,
            playlistUrl: sala.playlistUrl,
          }
        : null,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    },
  )
}
