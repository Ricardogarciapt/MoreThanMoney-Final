/**
 * GET /api/ebooks-traducoes/<slug>[?f=pdf][&t=link-assinado] — e-books em inglês e espanhol.
 * Mesmas regras de acesso que /api/ebooks/<slug>; função separada para caber nos 250 MB da Vercel.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { partesEbook } from '@/lib/ebooks/acesso'
import { entregarEbook } from '@/lib/ebooks/entrega'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// diferente da rota PT de propósito: a Vercel não junta as duas na mesma função
export const maxDuration = 31

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (partesEbook(slug).lingua === 'pt') {
    return NextResponse.redirect(new URL(`/api/ebooks/${slug}${req.nextUrl.search}`, req.url), 307)
  }
  return entregarEbook(req, slug, '/api/ebooks-traducoes')
}
