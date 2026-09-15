import { NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { listarProvidersPorEquipa } from '@/lib/copia-contas/servidor/providers-equipas'

export const dynamic = 'force-dynamic'

/** GET → providers (contas de estratégia) agrupados por equipa MTM Auto. Só leitura; sem tokens. */
export const GET = soAdmin(async () => NextResponse.json(await listarProvidersPorEquipa()))
