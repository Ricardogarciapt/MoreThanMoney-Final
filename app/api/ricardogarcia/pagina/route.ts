import { NextResponse } from 'next/server'
import { paginaPublica, paginaEmIngles } from '@/lib/ricardogarcia/pagina'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Público: secções, links e produtos ligados da página do Ricardo. ?lang=en devolve tudo em inglês.
export async function GET(req: Request) {
  try {
    const en = new URL(req.url).searchParams.get('lang') === 'en'
    let dados = await paginaPublica()
    if (en) dados = await paginaEmIngles(dados)
    return NextResponse.json(dados, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } })
  } catch {
    return NextResponse.json({ seccoes: [], produtos: [] }, { status: 200 })
  }
}
