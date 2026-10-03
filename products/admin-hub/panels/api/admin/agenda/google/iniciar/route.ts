import { NextResponse, type NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { enderecoDeConsentimento, googleConfigurado } from '@/lib/agenda/google'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Manda o admin ao Google para autorizar a agenda de um anfitrião.
 *
 * O `state` leva o id do anfitrião E um segredo aleatório que fica num cookie. É esse par que
 * impede que alguém prepare um link de retorno e ligue a agenda DELE à nossa conta — sem isto, o
 * endereço de retorno aceitava qualquer código que lhe aparecesse à frente.
 */
export const GET = soAdmin(async (_a: string, request: NextRequest) => {
  if (!googleConfigurado()) {
    return NextResponse.json({ error: 'Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no ambiente.' }, { status: 400 })
  }
  const anfitriaoId = String(request.nextUrl.searchParams.get('anfitriao') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(anfitriaoId)) {
    return NextResponse.json({ error: 'anfitrião inválido' }, { status: 400 })
  }
  const segredo = randomBytes(16).toString('hex')
  const r = NextResponse.redirect(enderecoDeConsentimento(anfitriaoId, segredo))
  r.cookies.set('agenda_google_state', segredo, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return r
})
