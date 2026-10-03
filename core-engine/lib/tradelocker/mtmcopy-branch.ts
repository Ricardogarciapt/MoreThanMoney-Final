/**
 * Ramos TradeLocker dos fluxos MTM Copy (sinais por grupo Telegram) e da gestão T2T.
 *
 * Chamados de lib/mtmcopy/processor.ts SÓ quando a ligação é `mt5_platform = 'tradelocker'`.
 * O caminho MT5 não passa por aqui. Os logs vão para as MESMAS tabelas (mtmcopy_signal_log,
 * mtmcopy_connections) com o prefixo "[TradeLocker]" no detalhe, para se distinguir a plataforma
 * sem mudar o esquema do log.
 *
 * O que NÃO há na TradeLocker (e fica dito na UI): CopyFactory (métodos "estratégia" e
 * "copy trader pessoal") e o monitor de preço do Premium. Aqui a conta abre com SL + TP1 e as
 * mensagens de gestão do canal (TP hit, BE, mover SL, fechar) aplicam-se por mensagem.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'
import type { ParsedManagement, ParsedSignal } from '@/lib/mtmcopy/signal-parser'
import type { MtmcopyChannelKey } from '@/lib/mtmcopy/channel-context'
import { countExecutedToday, logMtmcopySignal, markConnectionStatus } from '@/lib/mtmcopy/db'
import { getLotSizingSkipReason, signalForRiskSizing } from '@/lib/mtmcopy/lot-sizing'
import { channelSymbolSkipReason } from '@/lib/mtmcopy/signal-rules'
import { isMarketOpen } from '@/lib/mtmcopy/market-hours'
import { T2T_SENDER_TO_CHAT, tapToTradeEnabledChannels } from '@/lib/mtmcopy/tap-to-trade-channels'
import { aplicarGestaoTL, colocarOrdemTL, contextoTL, loteTL } from './executor'
import { sessaoDaLigacao } from './ligacao'

const TAG = '[TradeLocker]'

export async function processarSinalDirectoTradeLocker(p: {
  conn: MTMcopierConnection
  signal: ParsedSignal
  raw: string
  telegramMessageId?: number
  channel: MtmcopyChannelKey
  aiPrefix: string
}) {
  const { conn, signal, raw, telegramMessageId, channel, aiPrefix } = p
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const base = { user_id: conn.user_id, connection_id: conn.id, symbol: signal.symbol, raw_message: raw }

  const maxDaily = Number(process.env.MTMCOPY_MAX_DAILY_TRADES) || 30
  const executedToday = await countExecutedToday(conn.id)
  if (executedToday >= maxDaily) {
    await logMtmcopySignal({ ...base, direction: signal.direction, status: 'skipped', detail: `${TAG} Limite diário de operações atingido (${executedToday}/${maxDaily})` })
    return
  }
  const canalSkip = channelSymbolSkipReason(channel, signal.symbol)
  if (canalSkip) {
    await logMtmcopySignal({ ...base, direction: signal.direction, status: 'skipped', detail: `${TAG} ${canalSkip}` })
    return
  }
  const mh = isMarketOpen(signal.symbol!)
  if (!mh.open) {
    await logMtmcopySignal({ ...base, direction: signal.direction, status: 'skipped', detail: `${TAG} mercado fechado (${mh.reason}) ${tgRef}`.trim() })
    return
  }

  const { sessao, erro } = await sessaoDaLigacao(conn)
  if (!sessao) {
    await logMtmcopySignal({ ...base, direction: signal.direction, status: 'error', detail: `${TAG} ${erro} ${tgRef}`.trim() })
    await markConnectionStatus(conn.id, { mt5_status: 'error', last_error: erro ?? 'TradeLocker sem sessão' })
    return
  }

  const direction = conn.reverse_signals ? (signal.direction === 'buy' ? 'sell' : 'buy') : signal.direction!
  const ctx = await contextoTL(sessao, signal.symbol!, direction)
  if (!ctx.instrumento) {
    await logMtmcopySignal({ ...base, direction, status: 'error', detail: `${TAG} ${ctx.erro ?? 'instrumento indisponível'} ${tgRef}`.trim() })
    return
  }
  const riskSignal = signalForRiskSizing(signal, ctx.marketPrice)
  const lot = loteTL(conn, riskSignal, ctx)
  const skip = getLotSizingSkipReason(conn, signal, ctx.equity ?? ctx.balance, lot, ctx.marketPrice)
  if (skip) {
    await logMtmcopySignal({ ...base, direction, status: 'skipped', detail: `${TAG} ${skip}` })
    return
  }

  await logMtmcopySignal({
    ...base, channel_key: channel, telegram_message_id: telegramMessageId ?? null, direction,
    entry: signal.entry, sl: signal.sl, tp: signal.tp[0] ?? null, lot, status: 'received',
    detail: `${TAG} ${aiPrefix}A abrir ${signal.symbol} ${direction} · lote ${lot} ${tgRef}`.trim(),
  })

  const result = await colocarOrdemTL(sessao, {
    symbol: signal.symbol!,
    direction,
    volume: lot,
    orderType: signal.orderType === 'limit' && signal.entry ? 'limit' : 'market',
    openPrice: signal.entry,
    stopLoss: conn.copy_sl ? signal.sl : null,
    takeProfit: conn.copy_tp ? signal.tp[0] ?? null : null,
  }, ctx)

  await logMtmcopySignal({
    ...base, direction, entry: signal.entry, sl: signal.sl, tp: signal.tp[0] ?? null, lot: result.qty ?? lot,
    status: result.success ? 'executed' : 'error',
    detail: result.success
      ? `${TAG} ${aiPrefix}Ordem #${result.orderId}${result.positionId ? ` · posição ${result.positionId}` : ''} · ${result.brokerSymbol ?? signal.symbol} ${tgRef}`.trim()
      : `${TAG} ${aiPrefix}${result.error} ${tgRef}`.trim(),
  })
  await markConnectionStatus(conn.id, {
    telegram_status: 'connected',
    last_signal_at: new Date().toISOString(),
    ...(result.success ? { mt5_status: 'connected', last_error: null } : { last_error: result.error ?? 'Erro na execução' }),
  })
  await getSupabaseAdmin()
    .from('mtmcopy_connections')
    .update({ tl_last_error: result.success ? null : result.error ?? 'Erro' })
    .eq('id', conn.id)
    .then(undefined, () => {})
}

function saidasDe(conn: Pick<MTMcopierConnection, 'exit_pct_tp1' | 'exit_pct_tp2' | 'exit_pct_tp3'>) {
  return { tp1: Number(conn.exit_pct_tp1 ?? 33), tp2: Number(conn.exit_pct_tp2 ?? 33), tp3: Number(conn.exit_pct_tp3 ?? 34) }
}

/** Gestão de canal para um subscritor MTM Copy TradeLocker — substitui o ramo MetaApi do loop. */
export async function gestaoSubscritorTradeLocker(p: {
  conn: MTMcopierConnection
  management: ParsedManagement
  raw: string
  refs: string
}) {
  const { conn, management, raw, refs } = p
  let status: 'executed' | 'skipped' | 'error' = 'skipped'
  let detalhe = ''
  const { sessao, erro } = await sessaoDaLigacao(conn)
  if (!sessao) {
    status = 'error'
    detalhe = erro ?? 'sem sessão'
  } else {
    const r = await aplicarGestaoTL(sessao, management, saidasDe(conn))
    if (r.errors.length && !r.updated && !r.closed) { status = 'error'; detalhe = r.errors[0] }
    else if (r.updated || r.closed) { status = 'executed'; detalhe = `${r.updated} SL · ${r.closed} fechadas` }
    else detalhe = 'sem posições deste símbolo'
  }
  await logMtmcopySignal({
    user_id: conn.user_id,
    connection_id: conn.id,
    symbol: management.symbol,
    direction: null,
    status,
    detail: `${TAG} Gestão: ${management.type}${management.tpLevel ? ` TP${management.tpLevel}` : ''} · ${detalhe} ${refs}`.trim(),
    raw_message: raw,
  })
}

/**
 * Gestão do mestre estendida às posições Tap to Trade abertas em contas TradeLocker (o
 * equivalente de openT2TRowsForManagement, que só conhece contas MetaApi).
 */
export async function gestaoT2TTradeLocker(channel: string, management: ParsedManagement): Promise<number> {
  const slugs = T2T_SENDER_TO_CHAT[channel] ?? []
  if (!slugs.length) return 0
  const ativos = await tapToTradeEnabledChannels()
  const canais = ativos ? slugs.filter((s) => ativos.has(s)) : slugs
  if (!canais.length) return 0

  const db = getSupabaseAdmin()
  const { data: rows } = await db
    .from('mtmcopy_signal_log')
    .select('id, connection_id, symbol, broker_position_id')
    .eq('status', 'open')
    .not('broker_position_id', 'is', null)
    .in('channel_key', canais)
    .limit(500)
  if (!rows?.length) return 0
  const ids = [...new Set(rows.map((r) => r.connection_id as string))]
  const { data: conns } = await db
    .from('mtmcopy_connections')
    .select('id, mt5_platform, tl_account_id, tl_acc_num, exit_pct_tp1, exit_pct_tp2, exit_pct_tp3')
    .in('id', ids)
    .eq('mt5_platform', 'tradelocker')
  if (!conns?.length) return 0

  let aplicadas = 0
  for (const c of conns) {
    const posicoes = rows
      .filter((r) => r.connection_id === c.id)
      .map((r) => String(r.broker_position_id))
    const { sessao } = await sessaoDaLigacao(c as never)
    if (!sessao) continue
    const r = await aplicarGestaoTL(sessao, management, saidasDe(c as never), posicoes)
    aplicadas += r.updated + r.closed
    // Posições que deixaram de existir na conta → marca a linha como fechada.
    if (r.closed) {
      const vivas = new Set((await sessao.posicoes().catch(() => [])).map((x) => x.id))
      const fechadas = rows.filter((x) => x.connection_id === c.id && !vivas.has(String(x.broker_position_id))).map((x) => x.id)
      if (fechadas.length) await db.from('mtmcopy_signal_log').update({ status: 'closed' }).in('id', fechadas)
    }
  }
  return aplicadas
}
