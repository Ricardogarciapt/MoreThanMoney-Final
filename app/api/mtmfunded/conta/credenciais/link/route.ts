import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { abrirLink, emitirConcessao, repoSupabase } from '@/lib/mtmfunded/credenciais-link'
import { credenciaisDoDono, enviarCredenciaisDaConta, podePedirLink } from '@/lib/mtmfunded/credenciais-servico'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O LINK SEGURO DAS CREDENCIAIS (migração 091 · lib/mtmfunded/credenciais-link.ts).
 *
 *   POST { contaId }  → o DONO pede um link novo por email (3 por conta por hora).
 *   PUT  { token }    → abre um link: assinatura, prazo, dono = sessão, uso único. Devolve as
 *                       credenciais UMA vez e uma concessão de 10 min para «Gerar nova password».
 *
 * O token nunca vem no URL deste pedido: a página lê-o do fragmento (#t=) e manda-o no corpo.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(contaId)) return NextResponse.json({ error: 'conta inválida' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: conta } = await db.from('mtm_trading_accounts').select('id, motor').eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (conta.motor !== 'sim') return NextResponse.json({ error: 'Esta conta é da corretora — as credenciais vêm no email do MetaTrader.' }, { status: 409 })
  if (!(await podePedirLink(contaId, db))) {
    return NextResponse.json({ error: 'Já pediste 3 links na última hora. Vê a tua caixa de entrada (e o spam).' }, { status: 429 })
  }
  // O dono pediu-o: a conta da casa também recebe (é dele).
  const r = await enviarCredenciaisDaConta(contaId, 'pedido', { db, incluirCasa: true })
  if (!r.enviado) return NextResponse.json({ error: `Não foi possível enviar o email (${r.motivo ?? 'erro'}).` }, { status: 409 })
  return NextResponse.json({ ok: true, enviado: true })
}

export async function PUT(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  const body = await request.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  const r = await abrirLink(body?.token, userId, repoSupabase(db))
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status })

  const c = await credenciaisDoDono(r.accountId, userId as string, db)
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: c.status })
  const { data: conta } = await db.from('mtm_trading_accounts').select('id, tipo, metricas').eq('id', r.accountId).maybeSingle()
  const { tipoCurto } = await import('@/lib/mtmfunded/etiquetas')
  const { ok: _ok, ...resto } = c
  return NextResponse.json({
    ...resto,
    contaId: r.accountId,
    etiqueta: conta ? tipoCurto(String(conta.tipo), conta.metricas as Record<string, unknown> | null) : null,
    concessao: emitirConcessao(r.accountId, userId as string),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
