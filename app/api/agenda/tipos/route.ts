import { NextResponse } from 'next/server'
import { tiposActivos, tipoPublico } from '@/lib/agenda/servidor'

export const dynamic = 'force-dynamic'

/**
 * Os assuntos que se podem marcar. Rota ABERTA — quem marca uma chamada quase nunca tem conta.
 *
 * Devolve `tipoPublico` e não a linha: a linha traz os ids dos anfitriões, o estado do pipeline em
 * que o negócio nasce e o pack que se espera vender. Nada disso é da conta de quem está a marcar, e
 * «o teu lead vale um Premium» é exactamente o género de coisa que não se põe num JSON público.
 */
export async function GET() {
  try {
    return NextResponse.json({ tipos: (await tiposActivos()).map(tipoPublico) })
  } catch (e) {
    console.error('[agenda] tipos:', e)
    return NextResponse.json({ tipos: [] }, { status: 200 })
  }
}
