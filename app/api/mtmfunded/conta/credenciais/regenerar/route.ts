import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { concessaoValida } from '@/lib/mtmfunded/credenciais-link'
import { confirmarPasswordMtm, enviarCredenciaisDaConta, gerarNovasPasswords } from '@/lib/mtmfunded/credenciais-servico'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * «GERAR NOVA PASSWORD» — o dono troca a master e a investor de uma conta simulada.
 *
 * Prova de que é mesmo o dono, uma de duas: `password` da conta MTM (re-autenticação) OU a
 * `concessao` de 10 min que o link seguro devolveu ao ser aberto. As passwords novas vêm UMA vez
 * nesta resposta; o email que sai a seguir avisa da mudança e leva um link — nunca as passwords.
 * As sessões abertas com a password antiga (entrar com login+password no WebTrader) caducam sozinhas
 * em 12 h; a investor antiga deixa de entrar logo.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(contaId)) return NextResponse.json({ error: 'conta inválida' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: conta } = await db.from('mtm_trading_accounts').select('id, motor, mt5_login, servidor')
    .eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (conta.motor !== 'sim') return NextResponse.json({ error: 'A password de uma conta da corretora muda-se no MetaTrader.' }, { status: 409 })
  if (!conta.mt5_login) return NextResponse.json({ error: 'Conta ainda sem login.' }, { status: 409 })

  if (!concessaoValida(body?.concessao, contaId, userId)) {
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password) return NextResponse.json({ error: 'Confirma a password da tua conta MTM', reautenticar: true }, { status: 428 })
    const r = await confirmarPasswordMtm(userId, password)
    if (r === 'sem_password') {
      return NextResponse.json({ error: 'Pede o link seguro por email e gera a password a partir dele.', reautenticar: true, semPassword: true }, { status: 428 })
    }
    if (r !== 'ok') return NextResponse.json({ error: 'Password da conta MTM errada', reautenticar: true }, { status: 401 })
  }

  let novas: { password: string; investor: string }
  try {
    novas = await gerarNovasPasswords({ id: contaId }, db)
  } catch {
    return NextResponse.json({ error: 'Não foi possível gerar as passwords novas' }, { status: 500 })
  }
  await enviarCredenciaisDaConta(contaId, 'regeneracao', { db, incluirCasa: true })
  return NextResponse.json(
    { login: conta.mt5_login, servidor: conta.servidor ?? 'MTM Funded', password: novas.password, investor: novas.investor },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
