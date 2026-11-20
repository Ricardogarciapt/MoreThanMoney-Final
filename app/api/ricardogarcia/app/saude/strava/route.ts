// Liga o Strava à app do Ricardo (OAuth). Sem código: manda para o Strava. Com código: guarda e volta à app.
import { NextRequest, NextResponse } from 'next/server'
import { awardXp } from '@/lib/xp-service'
import { db, membroDaSessao } from '@/lib/ricardogarcia/app'
import { ligarStrava, membroDoEstado, sincronizarStrava, urlAutorizarStrava } from '@/lib/ricardogarcia/saude'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origem = req.nextUrl.origin
  const voltar = (q: string) => NextResponse.redirect(`${origem}/ricardogarcia/app?saude=${q}`)
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) return voltar('strava_off')
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    if (req.nextUrl.searchParams.get('error')) return voltar('strava_recusado')
    const m = await membroDaSessao(req)
    if (!m) return NextResponse.redirect(`${origem}/ricardogarcia/app?entrar=1`)
    return NextResponse.redirect(urlAutorizarStrava(origem, m.id))
  }
  const membro = membroDoEstado(req.nextUrl.searchParams.get('state') || '')
  if (!membro || !(await ligarStrava(membro, code))) return voltar('strava_erro')
  const r = await sincronizarStrava(membro)
  if (r?.xp) try { await awardXp(db(), membro, 'app_saude', { amount: r.xp, actionDescription: `Movimento (Strava): ${r.dados.minutos} min` }) } catch {}
  return voltar('strava_ok')
}
