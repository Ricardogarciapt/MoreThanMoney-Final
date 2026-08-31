import { NextResponse } from 'next/server'
import { gerarGuiaSensei } from '@/lib/sensei-ea-guia'
import { lerMetricasProviderSensei } from '@/lib/sensei-provider-metricas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O guia em PDF. Aberto: quem está a decidir precisa de o ler antes de pagar.
 *
 * Os números vêm da mesma leitura que a página de vendas usa — assim o PDF que o cliente
 * guarda não diz uma coisa e o site outra.
 */
export async function GET() {
  try {
    const metricas = await lerMetricasProviderSensei().catch(() => null)
    const pdf = await gerarGuiaSensei(metricas)
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
