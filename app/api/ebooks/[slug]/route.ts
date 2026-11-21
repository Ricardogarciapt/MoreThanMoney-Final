/**
 * GET /api/ebooks/<slug>[?f=pdf][&t=link-assinado]
 *
 * Entrega o e-book (versão interativa por omissão; PDF com ?f=pdf) só a quem tem a porta aberta:
 * comprou no marketplace (produto com o mesmo slug), é admin, ou traz um link assinado válido.
 * Os ficheiros estão em conteudo-privado/ (não em public/) e nunca ficam em cache partilhada.
 */
import { NextResponse, type NextRequest } from 'next/server'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { ehEbook, verificarEbook } from '@/lib/ebooks/acesso'
import { temAcessoAoProduto } from '@/lib/marketplace/regras'
import { comprasDoMembro } from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

// Nome do ficheiro descarregado: título e autor, em vez do slug.
const NOMES: Record<string, string> = {
  'destrui-tudo-e-ainda-bem': 'Destruí Tudo. E Ainda Bem. - Ricardo Garcia',
  'a-primeira-chave': 'A Primeira Chave - Ruben Pereira',
  'so-as-maos': 'Só as Mãos - Maria Costa',
}
const disposicao = (slug: string) => {
  const nome = NOMES[slug] ?? slug
  const ascii = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .-]/g, '').replace(/\s+/g, ' ').trim()
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(nome)}.pdf`
}
export const runtime = 'nodejs'

async function podeAbrir(req: NextRequest, slug: string): Promise<boolean> {
  if (verificarEbook(req.nextUrl.searchParams.get('t'), slug)) return true
  const sessao = await sessaoDoMembro(req)
  if (!sessao) return false
  const { data: produto } = await getSupabaseAdmin().from('marketplace_produtos').select('id').eq('slug', slug).maybeSingle()
  if (!produto) return false
  const compras = await comprasDoMembro(sessao.userId)
  return temAcessoAoProduto(compras, produto.id as string, new Date().toISOString(), sessao.perfil)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!ehEbook(slug)) return NextResponse.json({ error: 'E-book não encontrado' }, { status: 404 })

  if (!(await podeAbrir(req, slug))) {
    const volta = encodeURIComponent(`/api/ebooks/${slug}${req.nextUrl.search}`)
    return NextResponse.redirect(new URL(`/marketplace/${slug}?ebook=sem-acesso&next=${volta}`, req.url))
  }

  const pdf = req.nextUrl.searchParams.get('f') === 'pdf'
  const ficheiro = path.join(process.cwd(), 'conteudo-privado', 'ebooks', slug, `${slug}.${pdf ? 'pdf' : 'html'}`)
  try {
    // em stream: os PDFs ilustrados passam os 4,5 MB de resposta de uma função quando vão de uma só vez
    const { size } = await fs.stat(ficheiro)
    const corpo = Readable.toWeb(createReadStream(ficheiro)) as ReadableStream<Uint8Array>
    return new NextResponse(corpo, {
      headers: {
        'Content-Length': String(size),
        'Content-Type': pdf ? 'application/pdf' : 'text/html; charset=utf-8',
        'Content-Disposition': pdf ? disposicao(slug) : 'inline',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Ficheiro indisponível' }, { status: 500 })
  }
}
