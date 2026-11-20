import { NextRequest, NextResponse } from 'next/server'
import { db, hoje, missoesDoDia } from '@/lib/ricardogarcia/app'
import { enviarPush } from '@/lib/ricardogarcia/push'

/**
 * Push diário da app Missão. ?tipo=missao (manhã): a missão do dia está pronta.
 * ?tipo=serie (fim do dia): só a quem tem série de 2+ dias e ainda não fez nada hoje.
 * Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const tipo = req.nextUrl.searchParams.get('tipo') === 'serie' ? 'serie' : 'missao'
  const { data: comToken } = await db().from('rg_app_push').select('membro_id')
  const ids = [...new Set((comToken || []).map(x => x.membro_id))]
  if (!ids.length) return NextResponse.json({ ok: true, tipo, enviados: 0 })
  const { data: membros } = await db().from('rg_app_membros').select('id, nome, sequencia, ultimo_dia').eq('estado', 'ativo').in('id', ids)
  const dia = hoje()
  let enviados = 0
  if (tipo === 'missao') {
    const ms = await missoesDoDia(dia)
    const titulo = ms[0]?.titulo ? `Hoje: ${ms[0].titulo}` : 'A missão de hoje está pronta'
    enviados = await enviarPush((membros || []).map(m => m.id), 'missao', { titulo: '🎖️ Missão do dia', corpo: `${titulo}. ${ms.length} missões à tua espera.`, url: '/ricardogarcia/app?intro=1', tag: 'missao-' + dia })
  } else {
    const alvo = (membros || []).filter(m => (m.sequencia || 0) >= 2 && m.ultimo_dia !== dia)
    for (const m of alvo) {
      enviados += await enviarPush([m.id], 'serie', { titulo: `🔥 ${m.sequencia} dias seguidos`, corpo: 'Ainda vais a tempo de não perder a série. Uma missão chega.', url: '/ricardogarcia/app', tag: 'serie-' + dia })
    }
  }
  return NextResponse.json({ ok: true, tipo, enviados })
}
