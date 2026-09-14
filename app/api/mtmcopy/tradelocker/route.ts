import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos, pareceDemo, podeLigarConta, type ContaLigada } from '@/lib/entitlements'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import { resolveMtmcopyUserLimits } from '@/lib/mtmcopy/account-limits'
import { canAddConnection } from '@/lib/mtmcopy/user-copy-context'
import { normalizeTelegramGroups } from '@/lib/mtmcopy/copy-methods'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { cifraDisponivel } from '@/lib/mtmfunded/credenciais'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'
import { autenticar, listarContas, TradeLockerError, type TLCredenciais } from '@/lib/tradelocker/client'
import {
  emitirBilhete,
  envValido,
  guardarCredenciais,
  lerBilhete,
  ligacaoEhDemo,
  sessaoDaLigacao,
} from '@/lib/tradelocker/ligacao'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Ligar uma conta TradeLocker ao Tap to Trade ou ao MTM Copy.
 *
 * Dois passos, porque um login TradeLocker dá acesso a VÁRIAS contas (uma por corretora/plano):
 *
 *   1) POST { email, password, server, env }
 *        → { ticket, accounts: [{ id, accNum, name, currency, status, balance }] }
 *      O `ticket` são as credenciais cifradas (10 min). Nada é gravado neste passo.
 *
 *   2) POST { ticket, accountId, accNum, purpose: 'tap_to_trade'|'mtmcopy', ...definições }
 *        → { success, connection, balance, equity }
 *      Valida a regra das contas (1 real + 1 demo por produto, extras), testa a conta com /state,
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

function erro(e: unknown, fallback = 'Erro inesperado na TradeLocker') {
  if (e instanceof TradeLockerError) {
    const status = e.codigo === 'credenciais' ? 400 : e.codigo === 'limite' ? 429 : 502
    return NextResponse.json({ error: e.message, code: `tradelocker_${e.codigo}` }, { status })
  }
  console.error('[tradelocker] erro:', e instanceof Error ? e.message : 'desconhecido')
  return NextResponse.json({ error: fallback }, { status: 500 })
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
  const purpose = body.purpose === 'tap_to_trade' ? 'tap_to_trade' : 'mtmcopy'
  if (purpose === 'mtmcopy' && body.copy_method && body.copy_method !== 'telegram_group') {
    return NextResponse.json(
      { error: 'Contas TradeLocker só copiam por grupos de sinais. Estratégias e copy trader pessoal usam a CopyFactory, que é só MetaTrader.' },
      { status: 400 },
    )
  }

  // Regra das contas — a mesma do MT5 (lib/entitlements), com a demo decidida pelo ambiente.
  const superficie = purpose === 'tap_to_trade' ? ('t2t' as const) : ('mtmcopy' as const)
  const [direitos, { data: doSite }, { data: doAuto }] = await Promise.all([
    carregarDireitos(user.id),
    supabase.from('mtmcopy_connections').select('*').eq('user_id', user.id).neq('mt5_status', 'disconnected'),
    supabase.from('mtmauto_accounts').select('demo').eq('user_id', user.id),
  ])
  const ligadas: ContaLigada[] = [
    ...(doSite ?? []).map((c) => ({
      superficie: c.purpose === 'tap_to_trade' || c.t2t_enabled === true ? ('t2t' as const) : ('mtmcopy' as const),
      demo: ligacaoEhDemo(c, pareceDemo),
    })),
    ...(doAuto ?? []).map((c) => ({ superficie: 'mtmauto' as const, demo: Boolean(c.demo) })),
  ]
  const veredicto = podeLigarConta(direitos, superficie, cred.env === 'demo', ligadas)
  if (!veredicto.ok) {
    return NextResponse.json(
      { error: veredicto.erro, code: veredicto.codigo, preco_eur: veredicto.precoEur },
      { status: veredicto.codigo === 'conta_extra' ? 402 : 403 },
    )
  }

  const { data: perfil } = await supabase.from('profiles').select('user_type, member_category').eq('id', user.id).maybeSingle()
  const subscription = await getMtmcopySubscription(user.id, perfil?.user_type)
  const grupos = normalizeTelegramGroups(body.telegram_groups, (body.telegram_group as never) ?? null)
  if (purpose === 'mtmcopy' && !grupos.length) {
    return NextResponse.json({ error: 'Escolhe pelo menos um grupo de sinais' }, { status: 400 })
  }
  const limite = canAddConnection((doSite ?? []) as MTMcopierConnection[], 'telegram', 'slave', {
    isAdmin: subscription.reason === 'admin',
    limits: resolveMtmcopyUserLimits(perfil?.user_type, perfil?.member_category),
    copyMethod: 'telegram_group',
    purpose,
  })
  if (!limite.ok) return NextResponse.json({ error: limite.error }, { status: 400 })

  const repetida = (doSite ?? []).find(
    (c) => c.mt5_platform === 'tradelocker' && String(c.tl_account_id) === accountId && c.tl_env === cred.env &&
      String(c.tl_server ?? '').toLowerCase() === cred.server.toLowerCase(),
  )
  if (repetida) return NextResponse.json({ error: 'Esta conta TradeLocker já está ligada' }, { status: 409 })

  // A conta escolhida pertence mesmo a este login? (accNum vem da lista, não do cliente)
  let accNum = String(body.accNum ?? body.acc_num ?? '').trim()
  try {
    const tokens = await autenticar(cred)
    const contas = await listarContas(cred.env, tokens.accessToken)
    const conta = contas.find((c) => c.id === accountId)
    if (!conta) return NextResponse.json({ error: 'Essa conta não pertence a este login TradeLocker.' }, { status: 400 })
    accNum = conta.accNum
  } catch (e) {
    return erro(e)
  }

  const agora = new Date().toISOString()
  const n = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
  const payload: Record<string, unknown> = {
    user_id: user.id,
    account_role: 'slave',
    sender_mode: 'telegram',
    copy_method: 'telegram_group',
    purpose,
    mt5_platform: 'tradelocker',
    // mt5_login fica vazio de propósito: os fluxos MetaApi (reprovisão, CopyFactory) só tocam em
    // ligações com login MT5 / metaapi_account_id — assim nunca apanham uma conta TradeLocker.
    mt5_login: null,
    mt5_login_last4: accountId.slice(-4),
    mt5_server: `${cred.server} · TradeLocker${cred.env === 'demo' ? ' Demo' : ''}`,
    mt5_status: 'pending',
    telegram_status: purpose === 'mtmcopy' ? 'connected' : 'pending',
    telegram_groups: grupos,
    telegram_group: grupos[0] ?? null,
    account_label: String(body.account_label ?? '').trim() || null,
    is_active: subscription.active, // igual ao provision MT5
    tl_server: cred.server,
    tl_env: cred.env,
    tl_account_id: accountId,
    tl_acc_num: accNum,
    updated_at: agora,
  }
  for (const k of ['lot_mode', 'symbols_whitelist', 't2t_lot_mode'] as const) if (body[k] !== undefined) payload[k] = body[k]
  for (const k of ['lot_value', 'max_risk_percent', 'exit_pct_tp1', 'exit_pct_tp2', 'exit_pct_tp3', 't2t_lot_value'] as const) {
    const v = n(body[k])
    if (v !== undefined) payload[k] = v
  }
  for (const k of ['copy_sl', 'copy_tp', 'reverse_signals'] as const) if (typeof body[k] === 'boolean') payload[k] = body[k]
  if (purpose === 'tap_to_trade' && payload.lot_mode === undefined) {
    payload.lot_mode = 'risk_percent'
    payload.lot_value = payload.lot_value ?? 1
  }

  const { data: ligacao, error: insErr } = await supabase.from('mtmcopy_connections').insert(payload).select().single()
  if (insErr || !ligacao) {
    console.error('[tradelocker] insert ligação:', insErr?.message)
    return NextResponse.json({ error: 'Erro ao criar ligação' }, { status: 500 })
  }
  const guardado = await guardarCredenciais({ userId: user.id, mtmcopyConnectionId: ligacao.id, cred })
  if (!guardado.ok) {
    await supabase.from('mtmcopy_connections').delete().eq('id', ligacao.id)
    console.error('[tradelocker] guardar credenciais:', guardado.erro)
    return NextResponse.json({ error: 'Não foi possível guardar a ligação TradeLocker' }, { status: 500 })
  }

  // Teste real: ler o estado da conta escolhida.
  const { sessao } = await sessaoDaLigacao(ligacao)
  try {
    const estado = await sessao!.estado()
    const { data: final } = await supabase
      .from('mtmcopy_connections')
      .update({ mt5_status: 'connected', last_error: null, tl_last_error: null, tl_connected_at: new Date().toISOString(), baseline_balance: estado.balance })
      .eq('id', ligacao.id)
      .select()
      .single()
    invalidateCopyConnectionsCache()
    return NextResponse.json({
      success: true,
      status: 'connected',
      message: 'Conta TradeLocker ligada.',
      connection: final ?? ligacao,
      balance: estado.balance,
      equity: estado.equity,
    })
  } catch (e) {
    const mensagem = e instanceof TradeLockerError ? e.message : 'Não foi possível ler a conta TradeLocker'
    await supabase.from('mtmcopy_connections').update({ mt5_status: 'error', last_error: mensagem, tl_last_error: mensagem }).eq('id', ligacao.id)
    return NextResponse.json({ success: false, status: 'error', message: mensagem, error: mensagem, connection: { ...ligacao, mt5_status: 'error' } }, { status: 502 })
  }
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
