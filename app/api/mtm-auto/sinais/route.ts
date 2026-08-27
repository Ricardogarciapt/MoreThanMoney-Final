import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Onde vive o MTM Auto. É ele que manda: aqui só se encaminha. */
const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

/**
 * Os sinais Tap to Trade do MTM Auto, vistos de dentro da app-mobile.
 *
 * NÃO se reimplementa nada: encaminha-se o pedido para o MTM Auto com o MESMO token. As duas
 * apps partilham o Supabase, por isso o token de quem está autenticado aqui vale lá. Reescrever
 * a leitura dos sinais deste lado seria criar uma segunda versão da mesma lógica — e um dia uma
 * das duas deixaria de conhecer uma regra que a outra aprendeu (a janela de aceitação, por
 * exemplo, que é onde isto se paga caro).
 */
export async function GET(request: NextRequest) {
  const { erro } = await autorizarMtmAuto(request)
  if (erro) return erro

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/signals`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = await r.json().catch(() => ({}))
    return NextResponse.json(j, { status: r.status })
  } catch {
    return NextResponse.json({ error: 'O MTM Auto não respondeu.', sinais: [] }, { status: 502 })
  }
}
