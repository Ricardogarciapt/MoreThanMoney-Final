import { NextRequest, NextResponse } from 'next/server'
import { linkDoDia, contarClique } from '@/lib/broker-links'
import { DESTINOS_CURTOS } from '@/lib/youtube/descricao'
import { getSiteOrigin } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ slug: string }> }

/**
 * /l/<nome> — os links curtos das descrições do YouTube (e de onde mais fizer falta).
 *
 * O destino vive em `DESTINOS_CURTOS`. Os que ficam no site levam `utm_source=youtube`, para o
 * registo que vier dali se distinguir do que vem do Instagram ou do Telegram. Um nome que não
 * existe cai no onboarding: um link partido numa descrição antiga ainda tem de levar a algum lado.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params
  const nome = String(slug ?? '').toLowerCase()

  if (nome === 'corretora') {
    const { url, id } = await linkDoDia()
    await contarClique(id)
    return NextResponse.redirect(url, { status: 302 })
  }

  const destino = DESTINOS_CURTOS[nome] ?? DESTINOS_CURTOS.registo
  if (/^https?:\/\//i.test(destino)) return NextResponse.redirect(destino, { status: 302 })

  const url = new URL(destino, getSiteOrigin())
  if (!url.pathname.endsWith('.pdf')) {
    url.searchParams.set('utm_source', request.nextUrl.searchParams.get('utm_source') || 'youtube')
    url.searchParams.set('utm_medium', 'descricao')
  }
  return NextResponse.redirect(url, { status: 302 })
}
