import { NextResponse } from 'next/server'
import { linkDoDia, contarClique } from '@/lib/broker-links'

export const dynamic = 'force-dynamic'

/**
 * /abrir-conta — o único endereço de "abrir conta na corretora" que deve andar por aí.
 *
 * É este que vai para o site, para o Telegram, para as apps e para os funis. Assim, mudar de IB,
 * acrescentar um, ou corrigir um link partido é uma edição no painel — e não uma caça a links
 * espalhados por vinte sítios, alguns deles já impressos em imagens.
 */
export async function GET() {
  const { url, id } = await linkDoDia()
  await contarClique(id)
  return NextResponse.redirect(url, { status: 302 })
}
