import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarMotorReal } from '@/lib/gestao-real/servidor/painel'

export const dynamic = 'force-dynamic'

/** GET → motor em tempo real: batimento, lista live e sombra vs monitor (24 h). Só leitura. */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarMotorReal()))
