import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { enviarConviteTorneio } from '@/lib/mtmfunded/envios'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O convite para o torneio, quando as inscrições abrem.
 *
 * A rota é só a porta: autentica o admin e passa o pedido. As regras — o ensaio por omissão, a
 * marca de quem já recebeu, a pausa entre emails — vivem em `lib/mtmfunded/envios`, porque
 * estes envios também se disparam à mão e o texto não pode existir em dois sítios.
 */
export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const opcoes = await request.json().catch(() => ({}))
  const r = await enviarConviteTorneio(opcoes)
  return NextResponse.json(r, { status: r.error ? 400 : 200 })
}
