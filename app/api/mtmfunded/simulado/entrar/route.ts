import { NextRequest, NextResponse } from 'next/server'
import { verificarCredenciais, emitirSessao, lerSessao } from '@/lib/mtmfunded/simulado/credenciais'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { SERVIDOR_SIMULADO } from '@/lib/mtmfunded/simulado/motor'

export const dynamic = 'force-dynamic'

/**
 * ENTRAR NUMA CONTA SIMULADA com login + password, como no MetaTrader.
 *
 * POST { login, password, servidor? } → { token, modo, expira }
 *   · password master → modo `master` (negoceia)
 *   · password investor → modo `investor` (só vê)
 * GET com `Authorization: Bearer <token>` → a conta a que a sessão dá acesso.
 *
 * A sessão é da CONTA, não da pessoa: quem tem as credenciais entra, tenha ou não conta MTM —
 * é o que permite dar a password investor a alguém para acompanhar sem lhe dar mais nada.
 */

// Travão simples contra tentativas em série: uma espera fixa em cada falha torna a adivinhação
// lenta sem incomodar quem se enganou uma vez.
const ESPERA_FALHA_MS = 1200

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}))
  const login = String(corpo?.login ?? '').trim()
  const password = String(corpo?.password ?? '')
  const servidor = String(corpo?.servidor ?? SERVIDOR_SIMULADO).trim()

  if (servidor && servidor.toLowerCase() !== SERVIDOR_SIMULADO.toLowerCase()) {
    return NextResponse.json({ error: `servidor desconhecido — usa «${SERVIDOR_SIMULADO}»` }, { status: 400 })
  }

  const r = await verificarCredenciais(login, password)
  if (!r) {
    await new Promise((ok) => setTimeout(ok, ESPERA_FALHA_MS))
    return NextResponse.json({ error: 'login ou password errados' }, { status: 401 })
  }

  const { token, expira } = emitirSessao(r.accountId, r.modo)
  return NextResponse.json({ token, modo: r.modo, expira, servidor: SERVIDOR_SIMULADO })
}

export async function GET(request: NextRequest) {
  const sessao = lerSessao(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim())
  if (!sessao) return NextResponse.json({ error: 'sessão inválida ou expirada' }, { status: 401 })
  const { data: conta } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('id, tipo, estado, mt5_login, servidor, saldo_inicial, alavancagem, sim_saldo, sim_equity, sim_margem, metricas')
    .eq('id', sessao.accountId)
    .maybeSingle()
  if (!conta) return NextResponse.json({ error: 'conta não encontrada' }, { status: 404 })
  const { tipoCurto, estadoCurto } = await import('@/lib/mtmfunded/etiquetas')
  return NextResponse.json({
    modo: sessao.modo,
    conta: {
      ...conta,
      etiqueta: tipoCurto(conta.tipo as string, conta.metricas as Record<string, unknown>),
      estadoCurto: estadoCurto(conta.estado as string, conta.metricas as Record<string, unknown>),
    },
  })
}
