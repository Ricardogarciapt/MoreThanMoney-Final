import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarFunded } from '@/lib/admin-centro/servidor/outros'

export const dynamic = 'force-dynamic'

/** GET → programas, contas MTM Funded por estado, seguidoras e equidade da casa. As acções são as de /api/admin/mtmfunded. */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarFunded()))
