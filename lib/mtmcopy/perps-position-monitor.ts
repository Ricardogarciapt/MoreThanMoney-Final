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
import type { BybitPosition } from '@/lib/bybit'
import { resolvedPerpsChatId } from '@/lib/telegram-channel-ids'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { getSiteOrigin } from '@/lib/site-url'
import { lifecycleMessage } from './signal-lifecycle'
import { estadoMudou, fotografiaEstado } from './estado-monitor'

const PERPS_CHAT_SLUG = 'cripto-perps'
const STATE_KEY = 'perps_monitor_state'

// A Bybit geo-bloqueia os IPs dos EUA (este cron corre em nodejs/iad1). As LEITURAS Bybit vão às rotas
// EDGE/fra1 (Frankfurt) — /api/bybit/positions e /api/bybit/closed-pnl — como o webhook faz na execução.
async function bybitGet(path: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = process.env.CRON_SECRET || ''
    const res = await fetch(`${getSiteOrigin()}${path}`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    return (await res.json().catch(() => null)) as Record<string, unknown> | null
  } catch {
    return null
  }
}
async function fetchOpenPositions(): Promise<{ ok: boolean; positions: BybitPosition[] }> {
  const j = await bybitGet('/api/bybit/positions')
  if (!j || j.ok !== true) return { ok: false, positions: [] }
  return { ok: true, positions: (j.positions as BybitPosition[]) ?? [] }
}
async function fetchLastClosed(symbol: string): Promise<{ pnl: number | null; entry: number | null; exit: number | null } | null> {
  const j = await bybitGet(`/api/bybit/closed-pnl?symbol=${encodeURIComponent(symbol)}`)
  const closed = j?.closed as { pnl?: number; entry?: number | null; exit?: number | null } | null | undefined
  if (!closed) return null
  return {
    pnl: typeof closed.pnl === 'number' ? closed.pnl : null,
    entry: typeof closed.entry === 'number' ? closed.entry : null,
    exit: typeof closed.exit === 'number' ? closed.exit : null,
  }
}

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

  const { ok, positions } = await fetchOpenPositions()
  if (!ok) return { ran: false, reason: 'getPositions falhou (fra1)', events, open: 0 }

  const state = await loadState()
  const estadoLido = fotografiaEstado(state)
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
    const fechado = await fetchLastClosed(symbol).catch(() => null)
    const pnl = fechado?.pnl ?? null
    const resultTxt = pnl != null ? `resultado ${pnl >= 0 ? '🟢 +' : '🔴 '}$${pnl.toFixed(2)}` : ''
    const dir: 'buy' | 'sell' | null = side === 'Buy' ? 'buy' : side === 'Sell' ? 'sell' : null
    // Pontos e percentagem entram pelo cabeçalho (signal-lifecycle.headline), a mesma via que
    // o ouro e o forex usam — os dólares ficam no corpo, porque só valem para a conta-mestre.
    const { text } = lifecycleMessage('closed', {
      symbol: sym,
      direction: dir,
      entry: fechado?.entry ?? state[k]?.entry ?? null,
      price: fechado?.exit ?? null,
      reason: resultTxt || null,
    })
    await postPerps(text)
    // Fecha as ordens T2T de quem aceitou este sinal (Aurum Flow). Faltava — os seguidores
    // do scanner de perpétuos ficavam com posições sem quem as encerrasse do lado da fonte.
    try {
      const { closeT2TFollowersForSignal } = await import('./t2t-lifecycle')
      await closeT2TFollowersForSignal({
        kind: 'close',
        chatSlug: PERPS_CHAT_SLUG,
        symbol: sym,
        direction: dir,
        label: 'Aurum Flow',
      })
    } catch (e) {
      console.warn('[perps-monitor] fecho T2T falhou:', e instanceof Error ? e.message : String(e))
    }
    delete state[k]
    events.push(`close ${k}`)
  }

  // Só grava se a passagem mudou alguma coisa (ver estado-monitor.ts).
  if (estadoMudou(estadoLido, state)) await saveState(state)
  return { ran: true, events, open: live.size }
}
