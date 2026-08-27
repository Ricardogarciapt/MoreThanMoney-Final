import { NextRequest, NextResponse } from 'next/server'
import { guardarDefinicoes } from '@/lib/mtm-auto-bridge'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'

export const dynamic = 'force-dynamic'

/**
 * Guarda os limites de risco de uma conta MTM Auto a partir da app-mobile.
 *
 * O que NÃO passa por aqui é a cópia automática — a lista de campos aceites está em
 * `lib/mtm-auto-bridge.ts` e não a inclui. Ligar a cópia é onde se paga por ela.
 */
export async function POST(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const contaId = String(corpo.contaId ?? '').trim()
  if (!contaId) return NextResponse.json({ error: 'contaId obrigatório' }, { status: 400 })

  if ('copiaAtiva' in corpo) {
    return NextResponse.json(
      {
        error: 'A cópia automática liga-se na app MTM Auto ou no MTM Copy.',
        code: 'copia_fora_daqui',
      },
      { status: 403 },
    )
  }

  const r = await guardarDefinicoes(userId!, contaId, corpo)
  if (!r.ok) return NextResponse.json({ error: r.erro ?? 'Não foi possível guardar.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
