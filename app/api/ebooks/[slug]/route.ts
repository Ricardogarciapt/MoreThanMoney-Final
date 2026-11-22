/**
 * GET /api/ebooks/<slug>[?f=pdf][&t=link-assinado] — e-books em português.
 *
 * Entrega o e-book (versão interativa por omissão; PDF com ?f=pdf) só a quem tem a porta aberta:
 * comprou no marketplace (produto com o mesmo slug), é admin, ou traz um link assinado válido.
 * As versões EN/ES vivem em /api/ebooks-traducoes/<slug> (função própria, por causa do limite de
 * 250 MB da Vercel); um link antigo para aqui com -en/-es é reencaminhado para lá.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { partesEbook } from '@/lib/ebooks/acesso'
import { entregarEbook } from '@/lib/ebooks/entrega'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (partesEbook(slug).lingua !== 'pt') {
    return NextResponse.redirect(new URL(`/api/ebooks-traducoes/${slug}${req.nextUrl.search}`, req.url), 307)
  }
  return entregarEbook(req, slug, '/api/ebooks')
}
