import { NextRequest, NextResponse } from 'next/server'
import { quemNoEstudio } from '@/lib/estudio/acesso'

export const dynamic = 'force-dynamic'

/** Que separadores do /estudio esta pessoa vê (o admin vê todos). */
export async function GET(request: NextRequest) {
  const quem = await quemNoEstudio(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  return NextResponse.json({ ok: true, admin: quem.admin, areas: [...quem.areas] })
}
