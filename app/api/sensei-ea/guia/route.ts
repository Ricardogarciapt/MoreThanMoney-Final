import { NextResponse } from 'next/server'
import { gerarGuiaSensei } from '@/lib/sensei-ea-guia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** O guia em PDF da página de vendas. Aberto: quem está a decidir precisa de o ler antes de pagar. */
export async function GET() {
  try {
    const pdf = await gerarGuiaSensei()
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="MTM-Sensei-EA-Guia.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('[SENSEI-EA] Erro a gerar o guia:', e)
    return NextResponse.json({ error: 'Não foi possível gerar o guia' }, { status: 500 })
  }
}
