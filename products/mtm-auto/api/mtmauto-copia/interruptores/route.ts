import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { db, lerInterruptores } from '@/lib/copia-contas/servidor/base'
import { PALAVRA_LIVE } from '@/lib/copia-contas/regras'

export const dynamic = 'force-dynamic'

/**
 * Interruptor GLOBAL da cópia entre contas.
 *   GET                                  → { globalLigado, liveDesbloqueado }
 *   PATCH { ligado: true, confirmacao }  → liga o motor EM SOMBRA (confirmacao «CONFIRMAR»)
 *   PATCH { ligado: false }              → desliga já (sem confirmação: parar é sempre permitido)
 *   PATCH { liveDesbloqueado: true }     → 423: fora do âmbito desta entrega (só se muda na base,
 *                                          por decisão do dono, depois de semanas em sombra)
 */
export const GET = soAdmin(async () => NextResponse.json(await lerInterruptores()))

export const PATCH = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (corpo.liveDesbloqueado !== undefined) {
    return NextResponse.json({ error: `O desbloqueio do modo live não se faz pelo painel nesta entrega. Mesmo depois, cada rota pede «${PALAVRA_LIVE}».` }, { status: 423 })
  }
  if (typeof corpo.ligado !== 'boolean') return NextResponse.json({ error: 'ligado (boolean) obrigatório' }, { status: 400 })
  if (corpo.ligado && String(corpo.confirmacao ?? '') !== 'CONFIRMAR') {
    return NextResponse.json({ error: 'Para ligar o motor (em sombra) escreve «CONFIRMAR».' }, { status: 400 })
  }
  const { error } = await db().from('site_settings').update({ value: { ligado: corpo.ligado, por: adminId, em: new Date().toISOString() } }).eq('key', 'copia_contas')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(await lerInterruptores())
})
