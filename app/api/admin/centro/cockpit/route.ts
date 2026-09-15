import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { cockpit } from '@/lib/admin-centro/servidor/cockpit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** GET → saúde em tempo real (compõe loaders em cache 15–30 s; nenhuma chamada à MetaApi). Só admin. */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await cockpit(), { headers: { 'Cache-Control': 'no-store' } }))
