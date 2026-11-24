import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'
import { backfillLinkPreviews } from '@/lib/social/link-preview'
import { correrCicloSkool } from '@/lib/skool/ciclo'
import { correrCanaisYoutube } from '@/lib/social/canais-youtube'
import { correrBomDiaAida, bomDiaSkool } from '@/lib/aida/bom-dia'

/**
 * Backfill das thumbnails de link nos posts do feed (pedido do dono a 05/10/2026).
 * Olha para os últimos 200 posts com URL e sem `link_preview` e trata no máximo 20 por
 * corrida (de hora a hora) — rate limit para não martelar sites alheios nem esgotar o
 * tempo da função. Também apanha posts cujo site estava em baixo na hora da publicação.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const resultado = await backfillLinkPreviews(getSupabaseAdmin(), fetchLinkPreview, {
      janela: 200,
      maximo: 20,
    })
    // Ciclo do Skool encadeado aqui (vercel.json no tecto de 100 crons). Nunca deixa cair o backfill.
    const skool = await correrCicloSkool().catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : String(e) }))
    // Canais de YouTube curados → feed da app (24/11). Erro nunca derruba o backfill nem o Skool.
    const canaisYoutube = await correrCanaisYoutube(getSupabaseAdmin()).catch((e) => [{ erro: e instanceof Error ? e.message : String(e) }])
    // Bom dia da AIDA às 07h de Lisboa, uma vez por dia (24/11). Nunca derruba o resto.
    const bomDia = await correrBomDiaAida(getSupabaseAdmin())
    const bomDiaNoSkool = await bomDiaSkool(getSupabaseAdmin())
    return NextResponse.json({ ok: true, ...resultado, skool, canaisYoutube, bomDia, bomDiaNoSkool })
  } catch (e) {
    console.error('[cron/social-link-preview]', e)
    return NextResponse.json({ error: 'Erro no backfill' }, { status: 500 })
  }
}
