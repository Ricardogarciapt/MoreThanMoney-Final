import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

/**
 * As estratégias do MTM Auto — o catálogo com o histórico real de cada uma, e o que a pessoa segue.
 *
 * Encaminha para o MTM Auto com o mesmo token. É lá que o catálogo é filtrado por equipa, que o
 * desempenho é calculado e que a subscrição é gravada; reescrever isso deste lado era criar uma
 * segunda versão do mesmo, que um dia mostraria estratégias que a equipa da pessoa não tem.
 */
export async function GET(request: NextRequest) {
  const { erro } = await autorizarMtmAuto(request)
  if (erro) return erro
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/providers`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'O MTM Auto não respondeu.', providers: [] }, { status: 502 })
  }
}

/**
 * Seguir ou deixar de seguir uma estratégia.
 *
 * O `autoAceitar` é forçado a FALSO daqui: escolher o que se segue é do cliente, mas ligar a
 * cópia automática é a parte paga e faz-se na app MTM Auto. Deixar passar este campo seria dar
 * de graça, por uma segunda porta, exactamente aquilo que a primeira não deixa.
 */
export async function POST(request: NextRequest) {
  const { erro } = await autorizarMtmAuto(request)
  if (erro) return erro
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/providers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corpo, autoAceitar: false }),
      signal: AbortSignal.timeout(25_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'O MTM Auto não respondeu.' }, { status: 502 })
  }
}
