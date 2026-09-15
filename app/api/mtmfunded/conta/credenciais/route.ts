import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { confirmarPasswordMtm, credenciaisDoDono } from '@/lib/mtmfunded/credenciais-servico'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/**
 * A password da conta, para o DONO da conta — «Mostrar» no painel e no WebTrader.
 *
 * · A conta procura-se PELO DONO no mesmo select (lib/mtmfunded/credenciais-servico.ts): um id alheio
 *   dá 404, igual a um id que não existe.
 * · POST e não GET: uma password num URL fica no histórico, nos registos e no Referer.
 * · CONTAS SIMULADAS (servidor «MTM Funded»): pedem RE-AUTENTICAÇÃO — `password` da conta MTM no
 *   corpo. Sem ela, 428 `{ reautenticar: true }`; a quem não tem password (entrou com Google ou
 *   PrimeVerse) o ecrã oferece o link seguro por email (…/credenciais/link). Uma sessão aberta num
 *   telemóvel emprestado não chega para ler a password.
 * · Contas da corretora (torneios antigos, fila MT5): como sempre, com a sessão.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(contaId)) return NextResponse.json({ error: 'contaId em falta' }, { status: 400 })

  const { data: conta } = await getSupabaseAdmin().from('mtm_trading_accounts').select('id, motor')
    .eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  if (conta.motor === 'sim') {
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password) return NextResponse.json({ error: 'Confirma a password da tua conta MTM', reautenticar: true }, { status: 428 })
    const r = await confirmarPasswordMtm(userId, password)
    if (r === 'sem_password') {
      return NextResponse.json({ error: 'A tua conta MTM entra com Google/PrimeVerse — pede o link seguro por email.', reautenticar: true, semPassword: true }, { status: 428 })
    }
    if (r !== 'ok') return NextResponse.json({ error: 'Password da conta MTM errada', reautenticar: true }, { status: 401 })
  }

  const c = await credenciaisDoDono(contaId, userId)
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: c.status })
  const { ok: _ok, ...resto } = c
  return NextResponse.json(resto, { headers: { 'Cache-Control': 'no-store' } })
}
