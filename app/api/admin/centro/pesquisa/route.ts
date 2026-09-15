import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { pesquisar } from '@/lib/admin-centro/servidor/outros'

export const dynamic = 'force-dynamic'

/** GET ?q= → contas, utilizadores e estratégias para a paleta de comandos (sobre os loaders em cache). */
export const GET = soAdmin(async (_a: string, req: NextRequest) => NextResponse.json(await pesquisar(String(new URL(req.url).searchParams.get('q') ?? '').slice(0, 80))))
