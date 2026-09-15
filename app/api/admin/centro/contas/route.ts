import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarContas } from '@/lib/admin-centro/servidor/contas'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 *   GET            → todas as contas (estado guardado, sem MetaApi)
 *   GET ?ref=      → uma conta (para a gaveta); posições ao vivo continuam em /api/admin/mtmauto-copia/contas?vista=
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const ref = new URL(req.url).searchParams.get('ref')
  const r = await carregarContas()
  if (ref) {
    const conta = r.contas.find((c) => c.ref === ref) ?? null
    return NextResponse.json({ conta, mesmoDono: conta?.userId ? r.contas.filter((c) => c.userId === conta.userId && c.ref !== ref) : [] }, { status: conta ? 200 : 404 })
  }
  return NextResponse.json(r)
})
