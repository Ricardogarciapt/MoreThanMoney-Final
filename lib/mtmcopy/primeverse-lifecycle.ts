/**
 * Ciclo de vida das ordens PrimeVerse no T2T — CANCEL / CLOSE do trader (kingfkg via PV insights).
 * Quando o trader cancela (ordem pendente) ou fecha (posição) uma trade:
 *   1) posta a mensagem EM THREAD (reply à chat_message do SETUP) no chat PrimeVerse;
 *   2) para CADA seguidor que aceitou o T2T desse setup (mtmcopy_signal_log pelo chat_message_id do
 *      setup): APAGA a ordem pendente E/OU FECHA a posição na conta dele (espelha o trader 1:1).
 *
 * Correlação: o setup foi postado por feedPrimeverseChat como uma chat_message com "📡 PrimeVerse" +
 * "emoji SÍMBOLO DIREÇÃO". Encontramos o setup mais recente desse símbolo/direção; o T2T está chaveado
 * pelo id dessa mensagem.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { cancelPendingOrdersForSymbol, listOpenPositions, closePositionById } from './metaapi'
import { symbolMatchesCanonical } from './symbol-resolver'

type Kind = 'cancel' | 'close'

/** Encontra a chat_message do SETUP PrimeVerse mais recente para este símbolo/direção (últimas 48h). */
async function findSetupMessage(
  chatSlug: string,
  symbol: string,
  direction: 'buy' | 'sell' | null,
): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('chat_messages')
    .select('id, content, created_at')
    .eq('channel_slug', chatSlug)
    .ilike('content', '%PrimeVerse%')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(30)
  if (!data?.length) return null
  const symU = symbol.toUpperCase()
  const dirRe = direction === 'buy' ? /\bBUY\b|🔵/i : direction === 'sell' ? /\bSELL\b|🔴/i : null
  for (const m of data) {
    const c = String((m as { content?: string }).content ?? '').toUpperCase()
    if (!c.includes(symU)) continue
    if (dirRe && !dirRe.test(c)) continue
    return { id: (m as { id: string }).id }
  }
  return null
}

/** Fecha/cancela a ordem T2T do símbolo numa conta (pendentes + abertas). */
async function closeFollowerOrder(accountId: string, symbol: string): Promise<{ cancelled: number; closed: number; errors: string[] }> {
  const out = { cancelled: 0, closed: 0, errors: [] as string[] }
  try {
    const pend = await cancelPendingOrdersForSymbol(accountId, symbol)
    out.cancelled = pend.cancelled
    out.errors.push(...pend.errors)
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    const positions = await listOpenPositions(accountId)
    for (const p of positions) {
      if (!symbolMatchesCanonical(p.symbol, symbol)) continue
      try {
        await closePositionById(accountId, p.id)
        out.closed++
      } catch (e) {
        out.errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e))
  }
  return out
}

/**
 * Trata um CANCEL/CLOSE do trader PrimeVerse: thread no chat + ação automática nas ordens T2T dos
 * seguidores desse setup. Idempotente por status do log (não re-fecha o que já está closed/cancelled).
 */
export async function handlePrimeverseCancelClose(opts: {
  kind: Kind
  chatSlug: string
  symbol: string
  direction: 'buy' | 'sell' | null
}): Promise<{ threaded: boolean; followers: number; cancelled: number; closed: number }> {
  const { kind, chatSlug, symbol, direction } = opts
  const supabase = getSupabaseAdmin()
  const sym = symbol.replace(/USDT$/, '')
  const dirTxt = direction === 'buy' ? '🔵 COMPRA' : direction === 'sell' ? '🔴 VENDA' : ''
  const verb = kind === 'cancel' ? '❌ Sinal CANCELADO' : '🏁 Posição FECHADA pelo trader'
  const line = [`${verb} · ${sym} ${dirTxt}`.trim(), `As ordens T2T deste sinal foram tratadas automaticamente.`].join('\n')

  const setup = await findSetupMessage(chatSlug, symbol, direction)

  // 1) Thread no chat (reply à mensagem do setup, se encontrada).
  let threaded = false
  try {
    const insert: Record<string, unknown> = {
      channel_slug: chatSlug,
      user_id: null,
      content: line,
      message_type: 'telegram_forward',
      notified: true,
    }
    if (setup?.id) insert.reply_to_id = setup.id
    const { data } = await supabase.from('chat_messages').insert(insert).select('id').single()
    threaded = !!setup?.id
    await sendTelegramChannelPush({ slug: chatSlug, content: line, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[pv-lifecycle] thread erro:', e instanceof Error ? e.message : String(e))
  }

  // 2) Ação automática nas ordens T2T dos seguidores desse setup.
  let followers = 0
  let cancelled = 0
  let closed = 0
  if (setup?.id) {
    const { data: logs } = await supabase
      .from('mtmcopy_signal_log')
      .select('id, user_id, connection_id, status')
      .eq('chat_message_id', setup.id)
      .in('status', ['ok', 'filled', 'active', 'open'])
    for (const log of logs ?? []) {
      const connId = (log as { connection_id: string }).connection_id
      const { data: conn } = await supabase
        .from('mtmcopy_connections')
        .select('metaapi_account_id')
        .eq('id', connId)
        .maybeSingle()
      const accId = (conn as { metaapi_account_id?: string } | null)?.metaapi_account_id
      if (!accId) continue
      followers++
      const r = await closeFollowerOrder(accId, symbol)
      cancelled += r.cancelled
      closed += r.closed
      await supabase
        .from('mtmcopy_signal_log')
        .update({ status: kind === 'cancel' ? 'cancelled' : 'closed', detail: `PrimeVerse ${kind} (trader)` })
        .eq('id', (log as { id: string }).id)
    }
  }

  return { threaded, followers, cancelled, closed }
}
