import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sincronizarAulasNoGoogle } from '@/lib/agenda/aulas-google-servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O ESPELHO DAS AULAS NAS AGENDAS GOOGLE (17/11/2026, pedido do Ricardo).
 *
 * De hora a hora: lê o horário de aulas do site e acerta a agenda MTM (morethanmoneypt, todas as
 * aulas com o nome do educador; livres as de quem não é da casa) e a agenda de cada anfitrião que
 * é educador (a pessoal do Ricardo: as aulas dele, ocupado). Ver lib/agenda/aulas-google.ts.
 *
 * `?simular=1` devolve o que faria sem escrever nada.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const simular = new URL(req.url).searchParams.get('simular') === '1'
  try {
    const resultados = await sincronizarAulasNoGoogle({ simular })
    const erros = resultados.flatMap((r) => r.erros.map((e) => `${r.anfitriao}: ${e}`))
    if (erros.length) console.error('[agenda-aulas-google]', erros.slice(0, 20))
    return NextResponse.json({ ok: erros.length === 0, simular, resultados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[agenda-aulas-google] falhou:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
