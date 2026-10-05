import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'
import { backfillLinkPreviews } from '@/lib/social/link-preview'

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
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    console.error('[cron/social-link-preview]', e)
    return NextResponse.json({ error: 'Erro no backfill' }, { status: 500 })
  }
}
