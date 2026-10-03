import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { lerEstrategias, resyncLigacoes } from '@/lib/copia-contas/servidor/estrategias'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 *   GET                 → estratégias com seguidores por plataforma e divergências
 *   POST { ids: [] }    → re-sync CopyFactory das ligações do site (máx. 25), com releitura
 */
export const GET = soAdmin(async () => NextResponse.json(await lerEstrategias()))

export const POST = soAdmin(async (_a: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : []
  if (!ids.length) return NextResponse.json({ error: 'ids obrigatórios' }, { status: 400 })
  return NextResponse.json({ resultados: await resyncLigacoes(ids) })
})
