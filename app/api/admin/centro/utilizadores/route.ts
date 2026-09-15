import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarUtilizadores } from '@/lib/admin-centro/servidor/outros'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 *   GET        → matriz de direitos MTM Auto + utilizadores (contas, quota, T2T, legado MTM Copy)
 *   GET ?id=   → um utilizador
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('id')
  const r = await carregarUtilizadores()
  if (id) {
    const u = r.utilizadores.find((x) => x.id === id) ?? null
    return NextResponse.json({ utilizador: u }, { status: u ? 200 : 404 })
  }
  return NextResponse.json(r)
})
