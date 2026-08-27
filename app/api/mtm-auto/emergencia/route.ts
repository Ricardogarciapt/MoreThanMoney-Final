import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

/**
 * Fechar tudo, já.
 *
 * Encaminha para o MTM Auto — é lá que a conta está e é lá que a regra vive. Está aqui porque um
 * botão de emergência que obriga a mudar de app não é um botão de emergência.
 */
export async function POST(request: NextRequest) {
  const { erro } = await autorizarMtmAuto(request)
  if (erro) return erro
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/emergencia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(55_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'O MTM Auto não respondeu a tempo.' }, { status: 504 })
  }
}
