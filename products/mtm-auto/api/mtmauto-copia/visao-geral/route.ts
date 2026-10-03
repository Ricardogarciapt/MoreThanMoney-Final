import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { visaoGeral } from '@/lib/copia-contas/servidor/visao-geral'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** GET → saúde da cópia: entrega, CopyFactory, MetaApi, serviços do VPS, últimos erros. */
export const GET = soAdmin(async (_adminId: string, _req: NextRequest) => NextResponse.json(await visaoGeral()))
