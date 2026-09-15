import { NextRequest, NextResponse } from 'next/server'
import { reconciliarPosicoes } from '@/lib/mtmcopy/reconciliacao'
import { emSegundoPlano } from '@/lib/mtmcopy/metaapi-quota'

/**
 * Compara o que temos por aberto com o que a corretora tem mesmo, e fecha o que já lá não está.
 * `?dry=1` mostra o que faria sem tocar em nada.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const s = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const doVercel = req.headers.get('x-vercel-cron') != null
  if (!doVercel && (!s || auth !== `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const seco = req.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json({ ok: true, ...(await emSegundoPlano(() => reconciliarPosicoes({ seco }))) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
