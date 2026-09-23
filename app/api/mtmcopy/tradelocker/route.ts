import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { cifraDisponivel } from '@/lib/mtmfunded/credenciais'
import { autenticar, listarContas, type TLCredenciais } from '@/lib/tradelocker/client'
import { emitirBilhete, envValido, lerBilhete, sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { erroTradeLocker, ligarContaTradeLocker } from '@/lib/tradelocker/ligar-conta'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Ligar uma conta TradeLocker (a conta da corretora da pessoa) — «As minhas contas» / Tap to Trade.
 * O WebTrader liga pelo MESMO passo 2 (lib/tradelocker/ligar-conta.ts): uma linha por conta.
 *
 * Dois passos, porque um login TradeLocker dá acesso a VÁRIAS contas (uma por corretora/plano):
 *
 *   1) POST { email, password, server, env }
 *        → { ticket, accounts: [{ id, accNum, name, currency, status, balance }] }
 *      O `ticket` são as credenciais cifradas (10 min). Nada é gravado neste passo.
 *
 *   2) POST { ticket, accountId, accNum, purpose: 'tap_to_trade'|'mtmcopy', ...definições }
 *        → { success, connection, balance, equity }
 *      Não conta para a quota MetaApi (TradeLocker não é MetaApi), testa a conta com /state,
 *      grava a ligação (mt5_platform='tradelocker') e a password cifrada à parte.
 *
 *   GET ?id=<connectionId>  → { balance, equity, positions } (estado ao vivo)
 *   DELETE ?id=<connectionId> → remove a ligação (as credenciais caem em cascata)
 *
 * A password nunca é escrita em logs nem devolvida.
 */

const supabase = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) return null
  return user
}

function erro(e: unknown, fallback?: string) {
  const r = erroTradeLocker(e, fallback)
  return NextResponse.json(r.corpo, { status: r.status })
}

function credenciaisDoCorpo(b: Record<string, unknown>): TLCredenciais | null {
  const email = String(b.email ?? '').trim()
  const password = String(b.password ?? '')
  const server = String(b.server ?? '').trim()
  const env = envValido(String(b.env ?? '').toLowerCase())
  if (!email || !password || !server || !env) return null
  return { email, password, server, env }
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  if (!cifraDisponivel()) {
    return NextResponse.json({ error: 'Ligação TradeLocker indisponível no servidor (cifra por configurar).' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const accountId = String(body.accountId ?? body.account_id ?? '').trim()

  // ── Passo 1: login + lista de contas ────────────────────────────────────────────────────
  if (!accountId) {
    const cred = credenciaisDoCorpo(body)
    if (!cred) {
      return NextResponse.json({ error: 'Preenche email, password, servidor e escolhe Live ou Demo.' }, { status: 400 })
    }
    try {
      const tokens = await autenticar(cred)
      const contas = await listarContas(cred.env, tokens.accessToken)
      if (!contas.length) {
        return NextResponse.json({ error: 'Login aceite, mas este utilizador não tem contas neste servidor/ambiente.' }, { status: 404 })
      }
      return NextResponse.json({
        ticket: emitirBilhete(cred),
        env: cred.env,
        server: cred.server,
        accounts: contas.map((c) => ({ id: c.id, accNum: c.accNum, name: c.name, currency: c.currency, status: c.status, balance: c.accountBalance })),
      })
    } catch (e) {
      return erro(e)
    }
  }

  // ── Passo 2: escolher a conta e gravar ──────────────────────────────────────────────────
  const cred = lerBilhete(body.ticket as string) ?? credenciaisDoCorpo(body)
  if (!cred) {
    return NextResponse.json({ error: 'A sessão de ligação expirou. Volta a introduzir o login TradeLocker.', code: 'ticket_expired' }, { status: 400 })
  }
  // `accountId: 'todas'` → liga de uma vez todas as contas deste login (a maioria das pessoas tem
  // mais do que uma, e repetir o login por cada uma era o que fazia ficarem por ligar).
  if (accountId === 'todas') {
    const { ligarTodasAsContasTradeLocker } = await import('@/lib/tradelocker/ligar-conta')
    const r = await ligarTodasAsContasTradeLocker(user.id, cred, body)
    return NextResponse.json(r.corpo, { status: r.status })
  }
  // Passo 2 partilhado com o WebTrader (lib/tradelocker/ligar-conta): uma linha por conta.
  const r = await ligarContaTradeLocker(user.id, cred, accountId, body)
  return NextResponse.json(r.corpo, { status: r.status })
}

async function ligacaoDoUtilizador(userId: string, id: string | null) {
  if (!id) return null
  const { data } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('mt5_platform', 'tradelocker')
    .maybeSingle()
  return data
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const conn = await ligacaoDoUtilizador(user.id, new URL(request.url).searchParams.get('id'))
  if (!conn) return NextResponse.json({ error: 'Conta TradeLocker não encontrada' }, { status: 404 })
  const { sessao, erro: e1 } = await sessaoDaLigacao(conn)
  if (!sessao) return NextResponse.json({ error: e1 }, { status: 409 })
  try {
    const [estado, posicoes] = await Promise.all([sessao.estado(), sessao.posicoes()])
    return NextResponse.json({ balance: estado.balance, equity: estado.equity, positions: posicoes.length, env: conn.tl_env, server: conn.tl_server })
  } catch (e) {
    return erro(e)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const conn = await ligacaoDoUtilizador(user.id, new URL(request.url).searchParams.get('id'))
  if (!conn) return NextResponse.json({ error: 'Conta TradeLocker não encontrada' }, { status: 404 })
  const { error } = await supabase.from('mtmcopy_connections').delete().eq('id', conn.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Erro ao remover conta' }, { status: 500 })
  invalidateCopyConnectionsCache()
  return NextResponse.json({ success: true })
}
