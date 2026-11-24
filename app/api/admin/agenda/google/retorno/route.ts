import { NextResponse, type NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { guardarConsentimento } from '@/lib/agenda/google'
import { ESTADO_PREFIXO, guardarLigacaoYoutube } from '@/lib/youtube/ligacao'

export const dynamic = 'force-dynamic'

/**
 * O regresso do Google. Continua fechado a admins: o `state` prova que o pedido saiu daqui, mas não
 * prova QUEM o fez — e ligar uma agenda a uma conta nossa é uma acção de administração.
 */
export const GET = soAdmin(async (_a: string, request: NextRequest) => {
  const p = request.nextUrl.searchParams
  const destino = new URL('/admin?tab=agenda', request.url)

  const erro = p.get('error')
  if (erro) {
    destino.searchParams.set('google', `recusado: ${erro}`)
    return NextResponse.redirect(destino)
  }

  const [anfitriaoId, segredo] = String(p.get('state') ?? '').split(':')
  const esperado = request.cookies.get('agenda_google_state')?.value
  if (!anfitriaoId || !segredo || segredo !== esperado) {
    destino.searchParams.set('google', 'o pedido não bateu certo — tenta ligar outra vez')
    return NextResponse.redirect(destino)
  }

  // O mesmo regresso serve a ligação do YouTube (state «youtube:…»), para não registar outro endereço no Google.
  if (anfitriaoId === ESTADO_PREFIXO) {
    const volta = new URL('/admin', request.url)
    try {
      const { canal } = await guardarLigacaoYoutube(String(p.get('code') ?? ''))
      volta.searchParams.set('youtube', `ligado${canal ? `: ${canal}` : ''}`)
    } catch (e) {
      volta.searchParams.set('youtube', e instanceof Error ? e.message.slice(0, 200) : 'falhou')
    }
    const r = NextResponse.redirect(volta)
    r.cookies.delete('agenda_google_state')
    return r
  }

  try {
    const { email } = await guardarConsentimento(anfitriaoId, String(p.get('code') ?? ''))
    destino.searchParams.set('google', `ligado${email ? `: ${email}` : ''}`)
  } catch (e) {
    destino.searchParams.set('google', e instanceof Error ? e.message.slice(0, 200) : 'falhou')
  }
  const r = NextResponse.redirect(destino)
  r.cookies.delete('agenda_google_state')
  return r
})
