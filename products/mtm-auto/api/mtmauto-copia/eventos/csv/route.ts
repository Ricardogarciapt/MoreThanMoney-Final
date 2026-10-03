import { NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { COLUNAS_CSV, lerFiltro, listarEventos } from '@/lib/copia-contas/servidor/eventos'
import { paraCsv } from '@/lib/copia-contas/csv'

export const dynamic = 'force-dynamic'

/** GET → o mesmo registo em CSV (descarga feita pelo servidor, «;» para o Excel PT). Máx. 2000 linhas. */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const f = { ...lerFiltro(req), limite: 2000 }
  const { eventos } = await listarEventos(f)
  const csv = paraCsv(COLUNAS_CSV, eventos as unknown as Record<string, unknown>[])
  const nome = `copia-eventos-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' },
  })
})
