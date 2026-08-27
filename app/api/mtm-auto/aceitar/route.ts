import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

/**
 * Aceitar um sinal do MTM Auto a partir da app-mobile.
 *
 * Encaminha para o MTM Auto, que faz o trabalho todo: dimensiona pelo risco da conta, verifica a
 * janela de aceitação (5 minutos, e nunca depois de a trade sair da zona), abre SÓ na conta de
 * quem aceitou, e regista. Uma segunda implementação deste caminho seria uma segunda lista de
 * verificações — e a que fica para trás é sempre a que está longe do dinheiro.
 */
export async function POST(request: NextRequest) {
  const { erro } = await autorizarMtmAuto(request)
  if (erro) return erro

  const corpo = (await request.json().catch(() => ({}))) as { signalId?: string }
  if (!corpo.signalId) return NextResponse.json({ error: 'signalId obrigatório' }, { status: 400 })

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalId: corpo.signalId }),
      signal: AbortSignal.timeout(55_000),
    })
    const j = await r.json().catch(() => ({}))
    return NextResponse.json(j, { status: r.status })
  } catch {
    return NextResponse.json({ error: 'O MTM Auto não respondeu a tempo.' }, { status: 504 })
  }
}
