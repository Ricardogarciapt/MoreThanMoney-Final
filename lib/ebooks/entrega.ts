/**
 * Entrega de um e-book, partilhada pelas rotas /api/ebooks/<slug> (PT) e /api/ebooks-traducoes/<slug> (EN/ES).
 * Estão em rotas separadas para que cada função leve só os seus ficheiros e fique abaixo dos 250 MB da Vercel.
 *
 * Entrega o e-book (versão interativa por omissão; PDF com ?f=pdf) só a quem tem a porta aberta:
 * comprou no marketplace (produto com o mesmo slug), é admin, ou traz um link assinado válido.
 * Os ficheiros estão em conteudo-privado/ (não em public/) e nunca ficam em cache partilhada.
 */
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { ehEbook, partesEbook, verificarEbook } from '@/lib/ebooks/acesso'
import { temAcessoAoProduto } from '@/lib/marketplace/regras'
import { comprasDoMembro } from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

// Nome do ficheiro descarregado: título e autor, em vez do slug.
const NOMES: Record<string, string> = {
  'destrui-tudo-e-ainda-bem': 'Destruí Tudo. E Ainda Bem. - Ricardo Garcia',
  'a-primeira-chave': 'A Primeira Chave - Ruben Pereira',
  'so-as-maos': 'Só as Mãos - Maria Costa',
  'o-metodo-frio': 'O Método Frio - Ricardo Garcia',
  'a-decisao-que-adias': 'A Decisão Que Adias - Liliana Salgueiro',
  'destrui-tudo-e-ainda-bem-en': "I Destroyed It All. And I'm Glad. - Ricardo Garcia",
  'destrui-tudo-e-ainda-bem-es': 'Lo Destruí Todo. Y Menos Mal. - Ricardo Garcia',
  'a-primeira-chave-en': 'The First Key - Ruben Pereira',
  'a-primeira-chave-es': 'La Primera Llave - Ruben Pereira',
  'a-primeira-chave-fr': 'La Première Clé - Ruben Pereira',
  'so-as-maos-en': 'Just the Hands - Maria Costa',
  'so-as-maos-es': 'Solo las Manos - Maria Costa',
  'o-metodo-frio-en': 'The Cold Method - Ricardo Garcia',
  'o-metodo-frio-es': 'El Método Frío - Ricardo Garcia',
}
const disposicao = (slug: string) => {
  const nome = NOMES[slug] ?? slug
  const ascii = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .-]/g, '').replace(/\s+/g, ' ').trim()
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(nome)}.pdf`
}

async function podeAbrir(req: NextRequest, slug: string): Promise<boolean> {
  // Um livro é um só produto: quem comprou (ou tem link) da versão PT abre também a EN e a ES.
  const { base } = partesEbook(slug)
  const t = req.nextUrl.searchParams.get('t')
  if (verificarEbook(t, slug) || verificarEbook(t, base)) return true
  const sessao = await sessaoDoMembro(req)
  if (!sessao) return false
  const { data: produto } = await getSupabaseAdmin().from('marketplace_produtos').select('id').eq('slug', base).maybeSingle()
  if (!produto) return false
  const compras = await comprasDoMembro(sessao.userId)
  return temAcessoAoProduto(compras, produto.id as string, new Date().toISOString(), sessao.perfil)
}

export async function entregarEbook(req: NextRequest, slug: string, rota: string) {
  if (!ehEbook(slug)) return NextResponse.json({ error: 'E-book não encontrado' }, { status: 404 })

  if (!(await podeAbrir(req, slug))) {
    const volta = encodeURIComponent(`${rota}/${slug}${req.nextUrl.search}`)
    return NextResponse.redirect(new URL(`/marketplace/${partesEbook(slug).base}?ebook=sem-acesso&next=${volta}`, req.url))
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
