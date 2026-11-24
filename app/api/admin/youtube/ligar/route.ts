import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { googleConfigurado } from '@/lib/agenda/google'
import { consentimentoYoutube } from '@/lib/youtube/ligacao'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/youtube/ligar — só admin. Manda ao Google para (re)ligar o canal do YouTube.
 * O regresso é o da agenda (/api/admin/agenda/google/retorno), que reconhece o state «youtube:…».
 * O segredo aleatório no cookie impede que alguém ligue o canal DELE à nossa conta.
 */
export const GET = soAdmin(async () => {
  if (!googleConfigurado()) return NextResponse.json({ error: 'Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no ambiente.' }, { status: 400 })
  const segredo = randomBytes(16).toString('hex')
  const r = NextResponse.redirect(consentimentoYoutube(segredo))
  r.cookies.set('agenda_google_state', segredo, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return r
})
