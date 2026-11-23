import { NextRequest, NextResponse } from 'next/server'
import { falar } from '@/lib/voz'
import { ehSegmento, guiao } from '@/lib/funis-narracao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/narracao?s=<segmento>&ag=<agente> — a narração da demo das páginas /f/* na voz do
 * Ricardo (`lib/voz`). Só fala guiões fixos de `lib/funis-narracao.ts` (nenhum texto vem do
 * pedido), por isso o custo é limitado: cada combinação gera-se uma vez e fica na cache do storage.
 */
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('s') ?? ''
  if (!ehSegmento(s)) return NextResponse.json({ erro: 'segmento desconhecido' }, { status: 404 })
  const texto = guiao(s, req.nextUrl.searchParams.get('ag')).join(' ')
  const r = await falar(texto, { cache: getSupabaseAdmin(), formato: 'mp3' })
  if (!r.ok) {
    console.warn('[narracao] sem voz:', r.motivo, r.detalhe)
    return NextResponse.json({ erro: 'voz indisponível' }, { status: 503 })
  }
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      'content-type': r.contentType,
      'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
    },
  })
}
