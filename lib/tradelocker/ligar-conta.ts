/**
 * LIGAR UMA CONTA TRADELOCKER — o passo 2 do ligador, num só sítio.
 *
 * Usado pelas duas portas de entrada, para haver UMA linha por conta (mtmcopy_connections):
 *   · o ligador de contas (/api/mtmcopy/tradelocker, «As minhas contas», T2T);
 *   · o WebTrader (/api/webtrader/tradelocker/entrar) — a conta TradeLocker da corretora da pessoa,
 *     negociada através da MTM. Ligada no WebTrader aparece no ligador, e vice-versa.
 *
 * Antes de gravar procura-se a mesma conta (accountId + ambiente + servidor) já ligada ao
 * utilizador: `ligacaoTradeLockerRepetida` é a regra única de «já existe».
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos } from '@/lib/entitlements'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import { resolveMtmcopyUserLimits } from '@/lib/mtmcopy/account-limits'
import { canAddConnection } from '@/lib/mtmcopy/user-copy-context'
import { normalizeTelegramGroups } from '@/lib/mtmcopy/copy-methods'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'
import { autenticar, listarContas, TradeLockerError, type TLCredenciais } from './client'
import { guardarCredenciais, sessaoDaLigacao } from './ligacao'
import { ligacaoTradeLockerRepetida, type LinhaTradeLocker } from '@/lib/webtrader/tradelocker-ligar'

export type ResultadoLigarTL = { status: number; corpo: Record<string, unknown> }

/**
 * Grava a ligação (mt5_platform='tradelocker') + a password cifrada à parte e testa a conta.
 * Devolve o estado HTTP e o corpo da resposta do ligador — as duas rotas respondem igual.
 */
export async function ligarContaTradeLocker(
  userId: string,
  cred: TLCredenciais,
  accountId: string,
  body: Record<string, unknown>,
): Promise<ResultadoLigarTL> {
  const supabase = getSupabaseAdmin()
  const purpose = body.purpose === 'tap_to_trade' ? 'tap_to_trade' : 'mtmcopy'
  if (purpose === 'mtmcopy' && body.copy_method && body.copy_method !== 'telegram_group') {
    return {
      status: 400,
      corpo: { error: 'Contas TradeLocker só copiam por grupos de sinais. Estratégias e copy trader pessoal usam a CopyFactory, que é só MetaTrader.' },
    }
  }

  // Regra das contas (2026-09-15): TradeLocker NÃO passa pela MetaApi e por isso não conta para a
  // quota de contas MetaApi (lib/contas/quota-metaapi). A cópia automática (fora do Tap to Trade)
  // continua a precisar do direito ao MTM Auto.
  const [direitos, { data: doSite }] = await Promise.all([
    carregarDireitos(userId),
    supabase.from('mtmcopy_connections').select('*').eq('user_id', userId).neq('mt5_status', 'disconnected'),
  ])
  if (purpose !== 'tap_to_trade' && !direitos.admin && !direitos.copiaAutomatica) {
    return {
      status: 403,
      corpo: {
        error: 'A cópia automática precisa do MTM Auto (ou de seres Premium/VIP). No Tap to Trade continuas a poder aceitar sinais à mão.',
        code: 'sem_copia_automatica',
      },
    }
  }

  const { data: perfil } = await supabase.from('profiles').select('user_type, member_category').eq('id', userId).maybeSingle()
  const subscription = await getMtmcopySubscription(userId, perfil?.user_type)
  const grupos = normalizeTelegramGroups(body.telegram_groups, (body.telegram_group as never) ?? null)
  if (purpose === 'mtmcopy' && !grupos.length) {
    return { status: 400, corpo: { error: 'Escolhe pelo menos um grupo de sinais' } }
  }

  const repetida = ligacaoTradeLockerRepetida(doSite as LinhaTradeLocker[] | null, { accountId, env: cred.env, server: cred.server })
  if (repetida) {
    return { status: 409, corpo: { error: 'Esta conta TradeLocker já está ligada', code: 'ja_ligada', connection_id: String(repetida.id) } }
  }

  const limite = canAddConnection((doSite ?? []) as MTMcopierConnection[], 'telegram', 'slave', {
    isAdmin: subscription.reason === 'admin',
    limits: resolveMtmcopyUserLimits(perfil?.user_type, perfil?.member_category),
    copyMethod: 'telegram_group',
    purpose,
  })
  if (!limite.ok) return { status: 400, corpo: { error: limite.error } }

  // A conta escolhida pertence mesmo a este login? (accNum vem da lista, não do cliente)
  let accNum = String(body.accNum ?? body.acc_num ?? '').trim()
  try {
    const tokens = await autenticar(cred)
    const contas = await listarContas(cred.env, tokens.accessToken)
    const conta = contas.find((c) => c.id === accountId)
    if (!conta) return { status: 400, corpo: { error: 'Essa conta não pertence a este login TradeLocker.' } }
    accNum = conta.accNum
  } catch (e) {
    return erroTradeLocker(e)
  }

  const agora = new Date().toISOString()
  const n = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
  const payload: Record<string, unknown> = {
    user_id: userId,
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
    return { status: 500, corpo: { error: 'Erro ao criar ligação' } }
  }
  const guardado = await guardarCredenciais({ userId, mtmcopyConnectionId: ligacao.id, cred })
  if (!guardado.ok) {
    await supabase.from('mtmcopy_connections').delete().eq('id', ligacao.id)
    console.error('[tradelocker] guardar credenciais:', guardado.erro)
    return { status: 500, corpo: { error: 'Não foi possível guardar a ligação TradeLocker' } }
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
    return {
      status: 200,
      corpo: { success: true, status: 'connected', message: 'Conta TradeLocker ligada.', connection: final ?? ligacao, balance: estado.balance, equity: estado.equity },
    }
  } catch (e) {
    const mensagem = e instanceof TradeLockerError ? e.message : 'Não foi possível ler a conta TradeLocker'
    await supabase.from('mtmcopy_connections').update({ mt5_status: 'error', last_error: mensagem, tl_last_error: mensagem }).eq('id', ligacao.id)
    return { status: 502, corpo: { success: false, status: 'error', message: mensagem, error: mensagem, connection: { ...ligacao, mt5_status: 'error' } } }
  }
}

export function erroTradeLocker(e: unknown, fallback = 'Erro inesperado na TradeLocker'): ResultadoLigarTL {
  if (e instanceof TradeLockerError) {
    const status = e.codigo === 'credenciais' ? 400 : e.codigo === 'limite' ? 429 : 502
    return { status, corpo: { error: e.message, code: `tradelocker_${e.codigo}` } }
  }
  console.error('[tradelocker] erro:', e instanceof Error ? e.message : 'desconhecido')
  return { status: 500, corpo: { error: fallback } }
}
