/** Procura de negócio para ligar a uma chamada: GET ?q=nome. Só devolve o que está no teu âmbito. */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { procurarNegocios } from '@/lib/backoffice-procura'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ negocios: [] })
  const negocios = await procurarNegocios(ctx, q)
  return NextResponse.json({ negocios: negocios ?? [] })
}
