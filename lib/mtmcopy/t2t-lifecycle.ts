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
import { lifecycleMessage, logStatusFor, type SignalEvent } from './signal-lifecycle'

/**
 * O que a fonte fez ao sinal. 'discard' e 'targets_hit' cobrem as ideias que morreram antes de
 * abrir — a mensagem sai como "Ideia descartada", tal como o fecho sai como "Posição fechada".
 */
export type T2TCloseKind = 'cancel' | 'close' | 'discard' | 'targets_hit'

const KIND_TO_EVENT: Record<T2TCloseKind, SignalEvent> = {
  cancel: 'cancelled',
  close: 'closed',
  discard: 'discarded',
  targets_hit: 'targets_before_entry',
}

// 'following' = perpétuo seguido sem ordem na conta do cliente (ver t2tMode). Conta como
// aberto para efeitos de desfecho: o cliente tem de saber quando a posição-mestre fecha.
const OPEN_LOG_STATUSES = ['ok', 'filled', 'active', 'open', 'following']

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
async function closeFollowerOrder(
  accountId: string,
  symbol: string,
  /** Só apaga pendentes e deixa as posições abertas — usado quando a fonte leva SL: a posição
   *  do seguidor fecha pelo SL dela, ao preço dela, e não deve ser fechada à força por nós. */
  pendingOnly = false,
): Promise<{ cancelled: number; closed: number }> {
  const out = { cancelled: 0, closed: 0 }
  try {
    const pend = await cancelPendingOrdersForSymbol(accountId, symbol)
    out.cancelled = pend.cancelled
  } catch { /* ignora */ }
  if (pendingOnly) return out
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
  /** Só apagar ordens pendentes, deixando as posições abertas a fechar pelo SL/TP delas. */
  pendingOnly?: boolean
}): Promise<{ threaded: boolean; followers: number; cancelled: number; closed: number }> {
  const { kind, chatSlug, symbol, direction, label, sourceMatch } = opts
  // Kill-switch único (default ON). Off → não toca em ordens nem posta.
  const switches = await getExecSwitches()
  if (!switches.t2t_auto_close) return { threaded: false, followers: 0, cancelled: 0, closed: 0 }
  const supabase = getSupabaseAdmin()
  const sym = symbol.replace(/USDT$/, '')
  const event = KIND_TO_EVENT[kind]
  // Texto canónico — o mesmo que o motor de preço usa para o mesmo acontecimento.
  const { text: line } = lifecycleMessage(event, { symbol: sym, direction, source: label })

  const entry = await findEntryMessageWithFollowers(chatSlug, symbol, direction, sourceMatch)

  // 1) Thread no chat (reply à entrada, se encontrada) — IDEMPOTENTE: se o MESMO anúncio já
  //    foi publicado neste canal nos últimos 60 min, não repete (evita spam/loop quando o mesmo
  //    desfecho é detetado por mais do que um caminho ou em ticks sucessivos). Janela CURTA de
  //    propósito: dois fechos LEGÍTIMOS do mesmo par/direção no mesmo dia (ex.: PrimeVerse) têm
  //    de continuar a anunciar-se — só duplicados quase-simultâneos são suprimidos.
  let threaded = false
  try {
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: dup } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', chatSlug)
      .eq('content', line)
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle()
    if (!dup) {
      const insert: Record<string, unknown> = { channel_slug: chatSlug, user_id: null, content: line, message_type: 'telegram_forward', notified: true }
      if (entry?.id) insert.reply_to_id = entry.id
      const { data } = await supabase.from('chat_messages').insert(insert).select('id').single()
      threaded = !!entry?.id
      await sendTelegramChannelPush({ slug: chatSlug, content: line, chatMessageId: data?.id as string }).catch(() => {})
    }
  } catch (e) {
    console.warn(`[t2t-lifecycle] thread erro (${label}):`, e instanceof Error ? e.message : String(e))
  }

  // 2) Ação automática nas ordens T2T dos seguidores desse sinal.
  const r = entry?.id
    ? await closeFollowersByMessage(entry.id, symbol, event, `${label} ${kind} (fonte)`, opts.pendingOnly === true)
    : { followers: 0, cancelled: 0, closed: 0 }
  return { threaded, ...r }
}

/**
 * Fecha as ordens T2T de todos os seguidores de UMA mensagem de entrada concreta.
 * Usado quando já sabemos o `chat_message_id` (motor de alertas, motor de preço) — é mais
 * preciso do que procurar a entrada por símbolo/direção.
 */
export async function closeFollowersByMessage(
  chatMessageId: string,
  symbol: string,
  event: SignalEvent,
  detail: string,
  pendingOnly = false,
): Promise<{ followers: number; cancelled: number; closed: number }> {
  const supabase = getSupabaseAdmin()
  let followers = 0, cancelled = 0, closed = 0
  const { data: logs } = await supabase
    .from('mtmcopy_signal_log')
    .select('id, connection_id')
    .eq('chat_message_id', chatMessageId)
    .in('status', OPEN_LOG_STATUSES)
  for (const log of logs ?? []) {
    const connId = (log as { connection_id: string | null }).connection_id
    // Sem ligação = seguidor de perpétuo: não há ordem para fechar na conta dele, mas a linha
    // TEM de ser marcada, senão o sinal fica eternamente "a seguir" na lista dele.
    // (Antes: `if (!accId) continue` saltava a linha inteira e o estado nunca mudava.)
    if (!connId) {
      followers++
      await supabase.from('mtmcopy_signal_log')
        .update({ status: logStatusFor(event), detail })
        .eq('id', (log as { id: string }).id)
      continue
    }
    const { data: conn } = await supabase.from('mtmcopy_connections').select('metaapi_account_id').eq('id', connId).maybeSingle()
    const accId = (conn as { metaapi_account_id?: string } | null)?.metaapi_account_id
    if (!accId) continue
    followers++
    const r = await closeFollowerOrder(accId, symbol, pendingOnly)
    cancelled += r.cancelled
    closed += r.closed
    await supabase.from('mtmcopy_signal_log')
      .update({ status: logStatusFor(event), detail })
      .eq('id', (log as { id: string }).id)
  }
  return { followers, cancelled, closed }
}

/**
 * Publica o evento terminal em thread na mensagem de entrada E fecha as ordens dos seguidores.
 * Atalho para quem já tem o `chat_message_id` (motor de alertas).
 */
export async function announceAndCloseByMessage(opts: {
  chatMessageId: string
  chatSlug: string
  symbol: string
  direction: 'buy' | 'sell' | null
  event: SignalEvent
  label: string
  reason?: string | null
}): Promise<{ followers: number; cancelled: number; closed: number }> {
  const switches = await getExecSwitches()
  if (!switches.t2t_auto_close) return { followers: 0, cancelled: 0, closed: 0 }
  const supabase = getSupabaseAdmin()
  const { text } = lifecycleMessage(opts.event, {
    symbol: opts.symbol.replace(/USDT$/, ''),
    direction: opts.direction,
    source: opts.label,
    reason: opts.reason ?? null,
  })
  try {
    // Idempotente: o mesmo anúncio em thread na mesma entrada não se repete (anti-loop/spam).
    const { data: dup } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', opts.chatSlug)
      .eq('reply_to_id', opts.chatMessageId)
      .eq('content', text)
      .limit(1)
      .maybeSingle()
    if (!dup) {
      const { data } = await supabase
        .from('chat_messages')
        .insert({
          channel_slug: opts.chatSlug,
          user_id: null,
          content: text,
          message_type: 'telegram_forward',
          notified: true,
          reply_to_id: opts.chatMessageId,
        })
        .select('id')
        .single()
      await sendTelegramChannelPush({ slug: opts.chatSlug, content: text, chatMessageId: data?.id as string }).catch(() => {})
    }
  } catch (e) {
    console.warn('[t2t-lifecycle] thread erro:', e instanceof Error ? e.message : String(e))
  }
  return closeFollowersByMessage(opts.chatMessageId, opts.symbol, opts.event, `${opts.label} ${opts.event}`)
}
