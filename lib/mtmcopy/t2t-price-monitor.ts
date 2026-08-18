/**
 * Monitor de PREÇO das posições Tap to Trade — gere em TEMPO REAL as ordens abertas nas contas dos
 * SEGUIDORES, sem depender de mensagens/eventos da fonte. É o que permite ao MTM Scanner (que só
 * emite ENTRADAS, nunca follow-ups) ter gestão completa: o motor lê o preço e decide.
 *
 * Por cada posição T2T aberta (mtmcopy_signal_log com broker_position_id):
 *   • ENTRY HIT  → confirma a abertura no chat (1ª vez que a vê preenchida)
 *   • PARCIAIS   → ao tocar cada TP do sinal fecha a % do split (default 50/30/20)
 *   • BE         → SL para entrada +N pips A FAVOR (nunca entrada seca) ao atingir ratio do risco,
 *                  e sempre no Exit 1
 *   • TRAILING   → arranca após o Exit 1, ancorado ao risco
 *   • FECHO      → quando a posição desaparece (TP/SL/manual) marca closed + publica o desfecho
 *
 * Estado em site_settings 't2t_monitor_state' (sem migração de schema). Idempotente.
 * Switch: exec-switch `t2t_price_monitor` (default ON). Corre no mesmo loop ~1s do VPS.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { parseSignal } from './signal-parser'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import {
  listOpenPositions,
  getMarketPrice,
  modifyPositionSlTp,
  closePositionById,
  type MetaApiPosition,
} from './metaapi'

const STATE_KEY = 't2t_monitor_state'
/** Split dos parciais quando o sinal traz vários TPs. */
const SPLIT = [50, 30, 20]
/** BE = entrada + N pips a favor (nunca entrada seca). */
const BE_BUFFER_PIPS = Number(process.env.T2T_BE_BUFFER_PIPS) || 5
/** BE protetor cedo: lucro ≥ ratio × risco. */
const EARLY_BE_RATIO = Number(process.env.T2T_EARLY_BE_RATIO) || 0.4

interface RowState {
  exitsDone: number
  beDone: boolean
  trailing: boolean
  announced: boolean
}
type StateMap = Record<string, RowState>

interface LogRow {
  id: string
  connection_id: string
  chat_message_id: string | null
  channel_key: string | null
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  raw_message: string | null
  broker_position_id: string | null
}

function pipSizeFor(symbol: string): number {
  return /xau|gold/i.test(symbol) ? 0.1 : /jpy/i.test(symbol) ? 0.01 : 0.0001
}
function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}
function symMatch(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return x === y || x.includes(y) || y.includes(x)
}
/** BE a favor: entrada ± buffer. */
function beTarget(entry: number, dir: 'buy' | 'sell', symbol: string): number {
  const buf = BE_BUFFER_PIPS * pipSizeFor(symbol)
  return dir === 'buy' ? entry + buf : entry - buf
}
/** Lista de TPs do sinal: raw_message (multi-TP) com fallback ao tp da linha. */
function tpLevels(row: LogRow): number[] {
  const fromRaw = row.raw_message ? parseSignal(row.raw_message)?.tp ?? [] : []
  const list = (fromRaw.length ? fromRaw : [row.tp]).filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0,
  )
  return list.slice(0, 3)
}

async function loadState(): Promise<StateMap> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', STATE_KEY).maybeSingle()
    const v = data?.value
    return v && typeof v === 'object' ? (v as StateMap) : {}
  } catch {
    return {}
  }
}
async function saveState(state: StateMap): Promise<void> {
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      { key: STATE_KEY, value: state, description: 'Estado do monitor de preço T2T', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

/** Publica no chat do sinal (thread na entrada) + push. Concisa e sem alvo/TP → nunca vira entrada T2T. */
async function postToChat(chatMessageId: string | null, slug: string | null, content: string): Promise<void> {
  if (!slug) return
  try {
    const insert: Record<string, unknown> = {
      channel_slug: slug, user_id: null, content, message_type: 'telegram_forward', notified: true,
    }
    if (chatMessageId) insert.reply_to_id = chatMessageId
    const { data } = await getSupabaseAdmin().from('chat_messages').insert(insert).select('id').single()
    await sendTelegramChannelPush({ slug, content, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[t2t-monitor] post erro:', e instanceof Error ? e.message : String(e))
  }
}

export async function runT2TPriceMonitor(): Promise<{
  ran: boolean
  reason?: string
  managed: number
  actions: string[]
}> {
  const actions: string[] = []
  const switches = await getExecSwitches()
  if (!switches.t2t_price_monitor) return { ran: false, reason: 'switch off', managed: 0, actions }

  const admin = getSupabaseAdmin()
  const { data: rows } = await admin
    .from('mtmcopy_signal_log')
    .select('id, connection_id, chat_message_id, channel_key, symbol, direction, entry, sl, tp, lot, raw_message, broker_position_id')
    .in('status', ['open', 'ok', 'active', 'filled'])
    .not('broker_position_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .limit(200)
  if (!rows?.length) return { ran: true, managed: 0, actions }

  // Conta MetaApi de cada conexão.
  const connIds = [...new Set(rows.map((r) => (r as LogRow).connection_id))]
  const { data: conns } = await admin.from('mtmcopy_connections').select('id, metaapi_account_id').in('id', connIds)
  const accById = new Map((conns ?? []).map((c) => [c.id as string, (c.metaapi_account_id as string | null) ?? null]))

  // Posições abertas por conta (1 chamada por conta, reutilizada).
  const posByAcc = new Map<string, MetaApiPosition[]>()
  const priceCache = new Map<string, number | null>()
  const state = await loadState()
  let managed = 0

  for (const raw of rows) {
    const row = raw as LogRow
    const accountId = accById.get(row.connection_id)
    if (!accountId || !row.symbol || !row.broker_position_id) continue
    const dir: 'buy' | 'sell' = row.direction === 'sell' ? 'sell' : 'buy'
    const st: RowState = state[row.id] ?? { exitsDone: 0, beDone: false, trailing: false, announced: false }

    try {
      if (!posByAcc.has(accountId)) posByAcc.set(accountId, await listOpenPositions(accountId))
      const positions = posByAcc.get(accountId) ?? []
      const pos = positions.find((p) => p.id === row.broker_position_id) ?? null

      // ── FECHO: a posição já não existe (TP/SL/manual) → fecha o registo + publica o desfecho.
      if (!pos) {
        await admin.from('mtmcopy_signal_log').update({ status: 'closed', detail: 'Fechada (monitor T2T)' }).eq('id', row.id)
        if (!st.announced) {
          // só anuncia uma vez por sinal (a 1ª conta que deteta)
          await postToChat(row.chat_message_id, row.channel_key, `🏁 Posição fechada · ${row.symbol} ${dir === 'buy' ? '🔵 COMPRA' : '🔴 VENDA'}`)
        }
        delete state[row.id]
        actions.push(`close ${row.symbol}`)
        continue
      }

      managed++
      const key = `${accountId}|${row.symbol}`
      if (!priceCache.has(key)) priceCache.set(key, await getMarketPrice(accountId, row.symbol))
      const price = priceCache.get(key) ?? null
      if (price == null || !(price > 0)) continue

      const entry = row.entry ?? pos.openPrice ?? null
      const sl = row.sl ?? null
      const tps = tpLevels(row)
      const pip = pipSizeFor(row.symbol)

      // ── ENTRY HIT: 1ª vez que vemos a posição preenchida → confirma no chat.
      if (!st.announced) {
        st.announced = true
        await postToChat(
          row.chat_message_id,
          row.channel_key,
          [
            `✅ ENTRY HIT · ${row.symbol} ${dir === 'buy' ? '🔵 COMPRA' : '🔴 VENDA'}`,
            entry ? `📈 Posição aberta @ ${entry}` : null,
            `Gestão automática por preço (parciais + break-even + trailing).`,
          ].filter(Boolean).join('\n'),
        )
        actions.push(`entry_hit ${row.symbol}`)
      }

      // ── PARCIAIS por PREÇO: fecha a % do split ao tocar cada TP.
      const nextLevel = st.exitsDone + 1
      const nextTp = tps[nextLevel - 1]
      const reached = nextTp != null && (dir === 'buy' ? price >= nextTp : price <= nextTp)
      if (reached && pos.volume && pos.volume > 0) {
        const pct = SPLIT[nextLevel - 1] ?? 100
        const isLast = nextLevel >= tps.length
        const vol = isLast ? pos.volume : roundLot((row.lot ?? pos.volume) * (pct / 100))
        const closeAll = isLast || vol >= pos.volume
        const r = await closePositionById(accountId, pos.id, closeAll ? undefined : vol)
        if (r.success) {
          st.exitsDone = nextLevel
          actions.push(`exit${nextLevel} ${row.symbol}`)
          await postToChat(
            row.chat_message_id, row.channel_key,
            closeAll
              ? `🏁 Alvo final · ${row.symbol} — posição fechada.`
              : `🎯 Parcial ${nextLevel} · ${row.symbol} — realizado ${pct}%. O resto corre com stop protegido.`,
          )
          if (closeAll) {
            await admin.from('mtmcopy_signal_log').update({ status: 'closed', detail: `Fechada no alvo ${nextLevel}` }).eq('id', row.id)
            delete state[row.id]
            continue
          }
          // Exit 1 → BE (+buffer) + trailing ancorado ao risco.
          if (nextLevel === 1 && entry && !st.trailing) {
            const riskPips = sl && entry ? Math.max(1, Math.round(Math.abs(entry - sl) / pip)) : 25
            await modifyPositionSlTp(accountId, pos.id, beTarget(entry, dir, row.symbol), undefined,
              { mode: 'threshold_pips', activationPips: 1, trailPips: riskPips }, row.symbol)
            st.beDone = true
            st.trailing = true
            await postToChat(row.chat_message_id, row.channel_key, `🔒 Break-even + trailing · ${row.symbol} — risco neutralizado.`)
            actions.push(`be_trail ${row.symbol}`)
          }
          state[row.id] = st
          continue
        }
      }

      // ── BE PROTETOR CEDO (antes do Exit 1): lucro ≥ ratio × risco → SL para entrada +buffer.
      if (!st.beDone && st.exitsDone === 0 && entry && sl) {
        const riskDist = Math.abs(entry - sl)
        const profit = dir === 'buy' ? price - entry : entry - price
        if (riskDist > 0 && profit >= EARLY_BE_RATIO * riskDist) {
          const r = await modifyPositionSlTp(accountId, pos.id, beTarget(entry, dir, row.symbol), undefined, undefined, row.symbol)
          if (r.success) {
            st.beDone = true
            actions.push(`early_be ${row.symbol}`)
            await postToChat(row.chat_message_id, row.channel_key, `🔒 Break-even · ${row.symbol} — stop movido para a entrada (+${BE_BUFFER_PIPS}p).`)
          }
        }
      }
      state[row.id] = st
    } catch (e) {
      console.warn('[t2t-monitor] erro na linha', row.id, e instanceof Error ? e.message : String(e))
    }
  }

  await saveState(state)
  return { ran: true, managed, actions }
}
