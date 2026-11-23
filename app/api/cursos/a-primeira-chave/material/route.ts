/**
 * GET /api/cursos/a-primeira-chave/material?l=pt|en|es|fr&p=guia|slides-N|caderno-N
 * Entrega um PDF do curso só a quem o comprou (ou admin). Sem acesso → página do produto.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { PRODUTO_SLUG, ficheiroDaPeca, podeAbrirCurso } from '@/lib/cursos/primeira-chave'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const lingua = req.nextUrl.searchParams.get('l') || 'pt'
  const peca = req.nextUrl.searchParams.get('p') || 'guia'
  const rel = ficheiroDaPeca(lingua, peca)
  if (!rel) return NextResponse.json({ error: 'Peça desconhecida' }, { status: 404 })
  if (!(await podeAbrirCurso(req))) {
    const volta = encodeURIComponent(`/cursos/a-primeira-chave`)
    return NextResponse.redirect(new URL(`/marketplace/${PRODUTO_SLUG}?next=${volta}`, req.url))
  }
  const ficheiro = path.join(process.cwd(), 'conteudo-privado', 'cursos', 'a-primeira-chave', rel)
  try {
    const { size } = await fs.stat(ficheiro)
    const corpo = Readable.toWeb(createReadStream(ficheiro)) as ReadableStream<Uint8Array>
    const nome = `A Primeira Chave - ${lingua.toUpperCase()} - ${peca}.pdf`
    return new NextResponse(corpo, {
      headers: {
        'Content-Length': String(size),
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nome}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Ficheiro em falta' }, { status: 404 })
  }
}
