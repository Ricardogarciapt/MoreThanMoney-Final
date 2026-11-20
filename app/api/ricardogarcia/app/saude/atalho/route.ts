// Recebe os passos e os minutos de exercício que o Atalho do iPhone lê da app Saúde.
// Autenticação: o token pessoal no link (?t=), que só serve para isto.
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { awardXp } from '@/lib/xp-service'
import { db } from '@/lib/ricardogarcia/app'
import { membroDoToken, numero, registarMovimento } from '@/lib/ricardogarcia/saude'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || ''
  if (!checkRateLimit('rg-atalho:' + token.slice(0, 12), 30, 60 * 60_000).allowed) return NextResponse.json({ ok: false, erro: 'Demasiados envios.' }, { status: 429 })
  const membro = await membroDoToken(token)
  if (!membro) return NextResponse.json({ ok: false, erro: 'Link inválido. Gera um novo na app.' }, { status: 401 })
  let b: any = {}
  const tipo = req.headers.get('content-type') || ''
  try {
    if (tipo.includes('json')) b = await req.json()
    else if (tipo.includes('form')) b = Object.fromEntries((await req.formData()).entries())
    else { const txt = await req.text(); try { b = JSON.parse(txt) } catch { b = Object.fromEntries(new URLSearchParams(txt)) } }
  } catch {}
  // Também aceita os valores no próprio link (?passos=&minutos=), o mais simples de montar no Atalho.
  const q = req.nextUrl.searchParams
  const passos = numero(b.passos ?? b.steps ?? q.get('passos')), minutos = numero(b.minutos ?? b.minutes ?? q.get('minutos'))
  const r = await registarMovimento(membro, passos, minutos, 'atalho')
  await db().from('rg_app_saude_ligacoes').update({ ultimo_sync: new Date().toISOString() }).eq('membro_id', membro).eq('fonte', 'atalho')
  if (r.xp) try { await awardXp(db(), membro, 'app_saude', { amount: r.xp, actionDescription: `Movimento (Atalho): ${r.dados.passos} passos, ${r.dados.minutos} min` }) } catch {}
  return NextResponse.json({ ok: true, passos: r.dados.passos, minutos: r.dados.minutos, xp: r.xp, mensagem: r.xp ? `+${r.xp} XP na Missão` : 'Movimento guardado na Missão' })
}
