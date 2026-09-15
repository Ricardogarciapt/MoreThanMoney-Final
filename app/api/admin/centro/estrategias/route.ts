import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarEstrategias } from '@/lib/admin-centro/servidor/estrategias'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** GET → estratégias: fonte mestre/espelho + veredicto, seguidores por plataforma, desempenho 30 d, divergências. */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarEstrategias()))
