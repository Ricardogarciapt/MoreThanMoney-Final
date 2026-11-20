import { NextResponse } from 'next/server'
import { paginaPublica } from '@/lib/ricardogarcia/pagina'

export const dynamic = 'force-dynamic'

// Público: secções, links e produtos ligados da página do Ricardo.
export async function GET() {
  try {
    const dados = await paginaPublica()
    return NextResponse.json(dados, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } })
  } catch {
    return NextResponse.json({ seccoes: [], produtos: [] }, { status: 200 })
  }
}
