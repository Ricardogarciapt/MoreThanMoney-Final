/**
 * Monitor de POSIÇÃO dos Perpétuos (Bybit) — acompanha a posição-MESTRE do Copy Trading em tempo real
 * e publica o ciclo de vida no chat "Ideias de Perpétuos Cripto" (app) + Telegram dos perps:
 *   • Entry Hit  → posição aberta (o mercado chegou à entrada e a ordem-mestre encheu)
 *   • Parcial    → size reduziu num TP (o resto corre)
 *   • Break-even → SL movido para a entrada (risco neutralizado)
 *   • Fecho      → posição fechada, com o RESULTADO ($) do último fecho
 *
 * NÃO gere as saídas (essas já são NATIVAS da Bybit: TP1-4 reduceOnly + SL + trailing postos na ordem).
 * É só um DETETOR/NOTIFICADOR — como o price-monitor do Sensei/Premium, mas sobre a posição Bybit.
 * Idempotente por estado guardado em site_settings 'perps_monitor_state'. Switch: perps_position_monitor
 * (default ON). Corre a cada poucos segundos (cron + loop VPS), à imagem do premium-price-monitor.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { getMtmcopyBotToken } from './telegram-bot'
import { bybitConfigured, getBybitPositions, getBybitLastClosedPnl, type BybitPosition } from '@/lib/bybit'
import { resolvedPerpsChatId } from '@/lib/telegram-channel-ids'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'

const PERPS_CHAT_SLUG = 'cripto-perps'
const STATE_KEY = 'perps_monitor_state'

interface PosState {
  size: number
  sl: number | null
  entry: number
  bePosted: boolean
  openedAt: string
}
type StateMap = Record<string, PosState>

function keyOf(p: { symbol: string; side: string }): string {
  return `${p.symbol}|${p.side}`
}
function dirLabel(side: string): string {
  return /buy/i.test(side) ? '🔵 COMPRA' : '🔴 VENDA'
}
/** SL ≈ entrada (break-even). Tolerância 0.06% do preço (cobre spread/arredondamento). */
function isBreakEven(sl: number | null, entry: number): boolean {
  if (sl == null || !(entry > 0)) return false
  return Math.abs(sl - entry) <= entry * 0.0006
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
      { key: STATE_KEY, value: state, description: 'Estado do monitor de posição dos perpétuos', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

/** Publica uma linha de acompanhamento: chat da app (cripto-perps) + push + Telegram dos perps.
 *  Concisa e SEM alvo "TP"/🎯 nem marcador PrimeVerse → nunca vira entrada Tap to Trade. */
async function postPerps(content: string): Promise<void> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .insert({ channel_slug: PERPS_CHAT_SLUG, user_id: null, content, message_type: 'telegram_forward', notified: true })
      .select('id')
      .single()
    await sendTelegramChannelPush({ slug: PERPS_CHAT_SLUG, content, chatMessageId: data?.id as string }).catch(() => {})
    // Telegram do grupo dos perpétuos (se configurado).
    const chatId = resolvedPerpsChatId()
    const token = getMtmcopyBotToken()
    if (chatId && token) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: content, disable_web_page_preview: true }),
      }).catch(() => {})
    }
  } catch (e) {
    console.warn('[perps-monitor] post erro:', e instanceof Error ? e.message : String(e))
  }
}

export async function runPerpsPositionMonitor(): Promise<{
  ran: boolean
  reason?: string
  events: string[]
  open: number
}> {
  const events: string[] = []
  const switches = await getExecSwitches()
  if (!switches.perps_position_monitor) return { ran: false, reason: 'switch off', events, open: 0 }
  if (!bybitConfigured()) return { ran: false, reason: 'bybit não configurada', events, open: 0 }

  const { ok, positions } = await getBybitPositions()
  if (!ok) return { ran: false, reason: 'getPositions falhou', events, open: 0 }

  const state = await loadState()
  const live = new Map<string, BybitPosition>()
  for (const p of positions) if (p.symbol && p.side) live.set(keyOf(p), p)

  // 1) Abertas + evolução (parcial / BE)
  for (const [k, p] of live) {
    const prev = state[k]
    const sym = p.symbol.replace(/USDT$/, '')
    if (!prev) {
      await postPerps(
        [
          `✅ ENTRY HIT · ${sym} ${dirLabel(p.side)}`,
          `📈 Posição aberta @ ${p.avgPrice}`,
          p.stopLoss != null ? `🛑 SL: ${p.stopLoss}` : null,
          `Gestão automática por preço (parciais + break-even).`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      state[k] = { size: p.size, sl: p.stopLoss, entry: p.avgPrice, bePosted: isBreakEven(p.stopLoss, p.avgPrice), openedAt: new Date().toISOString() }
      events.push(`open ${k}`)
      continue
    }
    // Parcial: size caiu ≥2% face ao anterior conhecido.
    if (p.size < prev.size * 0.98) {
      const realizedPct = Math.min(99, Math.round((1 - p.size / prev.size) * 100))
      await postPerps(`🎯 Parcial · ${sym} ${dirLabel(p.side)} — realizado ~${realizedPct}%. O resto corre com stop protegido.`)
      prev.size = p.size
      events.push(`partial ${k}`)
    }
    // Break-even: SL passou a ≈ entrada.
    if (!prev.bePosted && isBreakEven(p.stopLoss, prev.entry)) {
      await postPerps(`🔒 Break-even · ${sym} ${dirLabel(p.side)} — stop movido para a entrada. Risco neutralizado.`)
      prev.bePosted = true
      events.push(`be ${k}`)
    }
    prev.sl = p.stopLoss
    state[k] = prev
  }

  // 2) Fechos: chaves em estado que já não estão abertas → posição fechada + resultado.
  for (const k of Object.keys(state)) {
    if (live.has(k)) continue
    const [symbol, side] = k.split('|')
    const sym = symbol.replace(/USDT$/, '')
    const closed = await getBybitLastClosedPnl(symbol).catch(() => null)
    const pnl = closed?.pnl ?? null
    const resultTxt = pnl != null ? ` — resultado ${pnl >= 0 ? '🟢 +' : '🔴 '}$${pnl.toFixed(2)}` : ''
    await postPerps(`🏁 Posição fechada · ${sym} ${dirLabel(side)}${resultTxt}`)
    delete state[k]
    events.push(`close ${k}`)
  }

  await saveState(state)
  return { ran: true, events, open: live.size }
}
