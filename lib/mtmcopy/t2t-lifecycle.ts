/**
 * Ciclo de vida GENÉRICO das ordens Tap to Trade — quando a FONTE de um sinal fecha/cancela a trade
 * (fecho discricionário, sem gatilho de preço), espelha isso nas ordens T2T de quem seguiu esse sinal:
 *   1) posta EM THREAD (reply à chat_message da entrada) no chat da fonte + push;
 *   2) para cada seguidor com T2T aceite desse sinal (mtmcopy_signal_log pelo chat_message_id da
 *      entrada) APAGA a ordem pendente E/OU FECHA a posição na conta dele (espelha a fonte 1:1).
 *
 * As saídas por TP/SL já fecham sozinhas (a ordem do seguidor leva SL/TP) — isto trata só do fecho
 * MANUAL da fonte. Usado por PrimeVerse (relay), Premium (mensagem de gestão), Sensei (follow-up do
 * webhook), Forex Swings e GoldKiller. Idempotente por status do log.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { cancelPendingOrdersForSymbol, listOpenPositions, closePositionById } from './metaapi'
import { symbolMatchesCanonical } from './symbol-resolver'
import { getExecSwitches } from './exec-switches'

export type T2TCloseKind = 'cancel' | 'close'

const OPEN_LOG_STATUSES = ['ok', 'filled', 'active', 'open']

/**
 * Encontra a chat_message da ENTRADA T2T mais recente para este símbolo/direção no canal, PREFERINDO
 * a que ainda tem aceitações T2T vivas (para não fechar o sinal errado quando há vários do mesmo par).
 * `sourceMatch` (opcional) restringe à assinatura da fonte no conteúdo (ex.: /PrimeVerse/i).
 */
async function findEntryMessageWithFollowers(
  chatSlug: string,
  symbol: string,
  direction: 'buy' | 'sell' | null,
  sourceMatch?: RegExp,
): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('chat_messages')
    .select('id, content, created_at')
    .eq('channel_slug', chatSlug)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(60)
  if (!data?.length) return null
  const symU = symbol.toUpperCase()
  const dirRe = direction === 'buy' ? /\bBUY\b|COMPRA|🔵|🟢/i : direction === 'sell' ? /\bSELL\b|VENDA|🔴/i : null
  const candidates: string[] = []
  for (const m of data) {
    const raw = String((m as { content?: string }).content ?? '')
    const c = raw.toUpperCase()
    if (!c.includes(symU)) continue
    if (dirRe && !dirRe.test(raw)) continue
    if (sourceMatch && !sourceMatch.test(raw)) continue
    candidates.push((m as { id: string }).id)
  }
  if (!candidates.length) return null
  // Preferir a entrada (mais recente) que ainda tem aceitações T2T vivas.
  const { data: logs } = await supabase
    .from('mtmcopy_signal_log')
    .select('chat_message_id')
    .in('chat_message_id', candidates)
    .in('status', OPEN_LOG_STATUSES)
  const withFollowers = new Set((logs ?? []).map((l) => (l as { chat_message_id: string }).chat_message_id))
  for (const id of candidates) if (withFollowers.has(id)) return { id } // candidates já vem do mais recente
  return { id: candidates[0] } // nenhuma com seguidores vivos → a mais recente (só faz thread)
}

/** Fecha/cancela a ordem T2T do símbolo numa conta (pendentes + abertas). */
async function closeFollowerOrder(accountId: string, symbol: string): Promise<{ cancelled: number; closed: number }> {
  const out = { cancelled: 0, closed: 0 }
  try {
    const pend = await cancelPendingOrdersForSymbol(accountId, symbol)
    out.cancelled = pend.cancelled
  } catch { /* ignora */ }
  try {
    const positions = await listOpenPositions(accountId)
    for (const p of positions) {
      if (!symbolMatchesCanonical(p.symbol, symbol)) continue
      try { await closePositionById(accountId, p.id); out.closed++ } catch { /* ignora */ }
    }
  } catch { /* ignora */ }
  return out
}

/**
 * Espelha um CANCEL/CLOSE da fonte nas ordens T2T dos seguidores desse sinal. Genérico por fonte.
 */
export async function closeT2TFollowersForSignal(opts: {
  kind: T2TCloseKind
  chatSlug: string
  symbol: string
  direction: 'buy' | 'sell' | null
  /** Etiqueta da fonte para o texto (ex.: 'PrimeVerse', 'Premium', 'Sensei'). */
  label: string
  /** Assinatura da fonte no conteúdo da entrada (opcional; ex.: /PrimeVerse/i). */
  sourceMatch?: RegExp
}): Promise<{ threaded: boolean; followers: number; cancelled: number; closed: number }> {
  const { kind, chatSlug, symbol, direction, label, sourceMatch } = opts
  // Kill-switch único (default ON). Off → não toca em ordens nem posta.
  const switches = await getExecSwitches()
  if (!switches.t2t_auto_close) return { threaded: false, followers: 0, cancelled: 0, closed: 0 }
  const supabase = getSupabaseAdmin()
  const sym = symbol.replace(/USDT$/, '')
  const dirTxt = direction === 'buy' ? '🔵 COMPRA' : direction === 'sell' ? '🔴 VENDA' : ''
  const verb = kind === 'cancel' ? '❌ Sinal CANCELADO' : '🏁 Posição FECHADA pela fonte'
  const line = [`${verb} · ${sym} ${dirTxt}`.replace(/\s+$/, ''), `As ordens T2T deste sinal (${label}) foram tratadas automaticamente.`].join('\n')

  const entry = await findEntryMessageWithFollowers(chatSlug, symbol, direction, sourceMatch)

  // 1) Thread no chat (reply à entrada, se encontrada).
  let threaded = false
  try {
    const insert: Record<string, unknown> = { channel_slug: chatSlug, user_id: null, content: line, message_type: 'telegram_forward', notified: true }
    if (entry?.id) insert.reply_to_id = entry.id
    const { data } = await supabase.from('chat_messages').insert(insert).select('id').single()
    threaded = !!entry?.id
    await sendTelegramChannelPush({ slug: chatSlug, content: line, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn(`[t2t-lifecycle] thread erro (${label}):`, e instanceof Error ? e.message : String(e))
  }

  // 2) Ação automática nas ordens T2T dos seguidores desse sinal.
  let followers = 0, cancelled = 0, closed = 0
  if (entry?.id) {
    const { data: logs } = await supabase
      .from('mtmcopy_signal_log')
      .select('id, connection_id')
      .eq('chat_message_id', entry.id)
      .in('status', OPEN_LOG_STATUSES)
    for (const log of logs ?? []) {
      const connId = (log as { connection_id: string }).connection_id
      const { data: conn } = await supabase.from('mtmcopy_connections').select('metaapi_account_id').eq('id', connId).maybeSingle()
      const accId = (conn as { metaapi_account_id?: string } | null)?.metaapi_account_id
      if (!accId) continue
      followers++
      const r = await closeFollowerOrder(accId, symbol)
      cancelled += r.cancelled
      closed += r.closed
      await supabase.from('mtmcopy_signal_log')
        .update({ status: kind === 'cancel' ? 'cancelled' : 'closed', detail: `${label} ${kind} (fonte)` })
        .eq('id', (log as { id: string }).id)
    }
  }
  return { threaded, followers, cancelled, closed }
}
