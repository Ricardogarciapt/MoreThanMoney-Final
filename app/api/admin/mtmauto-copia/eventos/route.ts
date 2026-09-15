import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { lerFiltro, listarEventos } from '@/lib/copia-contas/servidor/eventos'

export const dynamic = 'force-dynamic'

/** GET → registo unificado (cópia entre contas + copiador MTM Funded 068), com filtros. */
export const GET = soAdmin(async (_a: string, req: NextRequest) => NextResponse.json(await listarEventos(lerFiltro(req))))
