import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarCopia } from '@/lib/admin-centro/servidor/outros'

export const dynamic = 'force-dynamic'

/** GET → KPIs da cópia entre contas (sombra vs live, pretendidas vs reais, latência). A gestão das rotas é /api/admin/mtmauto-copia/rotas. */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarCopia()))
