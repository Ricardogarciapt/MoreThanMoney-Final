import { NextRequest, NextResponse } from 'next/server'
import { fecharEspelhosFunded } from '@/lib/mtmauto/espelho-funded-correr'

/**
 * Fecha as execuções do MTM Auto que ficaram `pending` à espera do espelho numa conta MTM Funded.
 * Sem isto ninguém as visita — ver o cabeçalho de `lib/mtmauto/espelho-funded.ts`.
 *
 * `?dry=1` mostra o que faria sem tocar em nada.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const s = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const doVercel = req.headers.get('x-vercel-cron') != null
  if (!doVercel && (!s || auth !== `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const seco = req.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json({ ok: true, seco, ...(await fecharEspelhosFunded({ seco })) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
