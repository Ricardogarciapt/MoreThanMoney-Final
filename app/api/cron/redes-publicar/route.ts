import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { enfileirar, publicarFila } from '@/lib/redes/espelho'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * De hora a hora: os reels novos do Instagram da marca entram na fila das redes novas (TikTok,
 * YouTube Shorts, LinkedIn) e sai no máximo um por conta. Sem contas ligadas não faz nada.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const novas = await enfileirar()
    const feitas = await publicarFila(3)
    return NextResponse.json({ ok: true, novas, feitas })
  } catch (e) {
    // Sem a migração 255 as tabelas não existem: responde sem rebentar o cron.
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) })
  }
}
