import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { emCache } from '@/lib/admin-centro/cache'
import { desempenhoDoCatalogo, lerCatalogoMtmAuto } from '@/lib/mtmauto/desempenho-do-catalogo'
import { resumo90d } from '@/lib/mestres/painel'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET → as métricas de 90 dias de cada estratégia TAL COMO a MTM Auto as mostra aos clientes
 * (`/api/auto/providers`, contas reais, parciais pesadas; simuladas à parte e só quando não há reais).
 * Lido com o token do próprio admin, em cache 10 min. É o número publicado — o «ideias 30 d» do
 * Centro (mtmauto_signals, tudo-ou-nada) fica como diagnóstico interno.
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ porProvider: {}, lido: false, motivo: 'sem token de sessão para ler o catálogo da MTM Auto' })
  try {
    const r = await emCache('centro:catalogo90d', 600_000, async () => {
      const cat = await lerCatalogoMtmAuto(token)
      if (!cat) throw new Error('a MTM Auto não respondeu')
      return Object.fromEntries(cat.map((p) => [p.id, resumo90d(desempenhoDoCatalogo(p))]))
    })
    return NextResponse.json({ porProvider: r.v, lido: true, velho: r.velho, lidaEm: new Date(r.lidoEm).toISOString() })
  } catch (e) {
    return NextResponse.json({ porProvider: {}, lido: false, motivo: e instanceof Error ? e.message : String(e) })
  }
})
