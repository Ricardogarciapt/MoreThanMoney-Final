import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { lerAuditoria } from '@/lib/admin-centro/servidor/outros'

export const dynamic = 'force-dynamic'

/** GET ?limite= → auditoria do Centro (095) + auditoria das contas MTM Funded (079), juntas. */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const limite = Math.min(500, Math.max(10, Number(new URL(req.url).searchParams.get('limite') ?? 150)))
  return NextResponse.json(await lerAuditoria(limite))
})
