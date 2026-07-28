import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { fetchLotSizingContext, placeOrdersSequential, type OrderRequest } from "./metaapi"
import { getPremiumZoneConfig, priceInZone, type PremiumZoneConfig } from "./premium-zone-config"

/**
 * Monitor da ENTRADA POR ZONA + REAÇÃO do Premium.
 *
 * Lê os pendentes (mtmcopy_premium_pending, status='pending'), expira os antigos, cancela os
 * que rompem o SL antes de entrar, e dispara a entrada quando um gatilho de servidor acontece:
 *   C) reconfirmação — preço entrou na zona e reage na direção do sinal
 *   B) toque         — preço só toca na zona (rede final)
 * (A) reação TradingView é disparada pelo webhook via triggerPremiumZoneByReaction().
 *
 * mode 'shadow' → marca o que TERIA feito (não abre ordem). 'live' → abre a mercado.
 */

type PendingRow = {
  id: string
  account_id: string
  symbol: string
  direction: "buy" | "sell"
  zone_low: number
  zone_high: number
  entry: number | null
  sl: number | null
  tp: number[] | null
  exit_pct_tp1: number | null
  exit_pct_tp2: number | null
  exit_pct_tp3: number | null
  lot: number | null
  equity: number | null
  comment: string | null
  mode: "shadow" | "live"
  status: string
  touched_zone: boolean
  last_price: number | null
  expires_at: string
}

/**
 * Descarta entradas de zona PENDENTES quando chega um "close"/exit do Telegram para esse
 * símbolo. Se a trade nunca abriu (estava fora da zona à espera de reação) e o sinal já
 * mandou fechar, não faz sentido continuar a aguardar a ativação — cancela o pendente.
 * Idempotente (só atua em status='pending'). Sem symbolHint → cancela todos os pendentes.
 */
export async function cancelPremiumPendingOnClose(
  symbolHint: string | null,
  reason = "close recebido antes de entrar",
): Promise<number> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from("mtmcopy_premium_pending")
    .select("id, symbol")
    .eq("status", "pending")
  const rows = (data ?? []) as { id: string; symbol: string }[]
  if (!rows.length) return 0

  const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z]/g, "")
  const target = norm(symbolHint || "")
  const ids = rows
    .filter((r) => {
      if (!target) return true
      const s = norm(r.symbol)
      return s === target || s.startsWith(target) || target.startsWith(s)
    })
    .map((r) => r.id)
  if (!ids.length) return 0

  await admin
    .from("mtmcopy_premium_pending")
    .update({ status: "cancelled", note: reason })
    .in("id", ids)
    .eq("status", "pending")
  return ids.length
}

/** Dispara a entrada de um pendente (partilhado entre poller server-side e webhook TradingView). */
export async function firePendingEntry(
  row: PendingRow,
  source: "tv_reaction" | "server_reconfirm" | "server_touch",
  price: number,
): Promise<{ ok: boolean; detail: string }> {
  const supabase = getSupabaseAdmin()

  // SHADOW: regista o que teria feito, sem abrir nada.
  if (row.mode === "shadow") {
    await supabase
      .from("mtmcopy_premium_pending")
      .update({
        status: "shadow_entered",
        trigger_source: source,
        trigger_price: price,
        entered_at: new Date().toISOString(),
        note: `SOMBRA: teria entrado ${row.direction} @ ${price} (${source}) vs sinal @ ${row.entry ?? "?"}`,
      })
      .eq("id", row.id)
      .eq("status", "pending") // idempotente: só o 1.º gatilho ganha
    return { ok: true, detail: `shadow ${source} @ ${price}` }
  }

  // LIVE: abre a mercado com o lote/SL/comment guardados (TP null — parciais pelo price-monitor).
  const req: OrderRequest = {
    accountId: row.account_id,
    symbol: row.symbol,
    direction: row.direction,
    volume: row.lot ?? 0,
    orderType: "market",
    openPrice: null,
    stopLoss: row.sl ?? null,
    takeProfit: null,
    comment: row.comment ?? "MTM-PREMIUM",
  }

  // Claim idempotente: só avança se ESTA chamada mudar o estado de 'pending'.
  const { data: claimed } = await supabase
    .from("mtmcopy_premium_pending")
    .update({ status: "entered", trigger_source: source, trigger_price: price, entered_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()
  if (!claimed) return { ok: false, detail: "já processado por outro gatilho" }

  try {
    const [r] = await placeOrdersSequential(row.account_id, [req])
    if (!r?.success) {
      await supabase
        .from("mtmcopy_premium_pending")
        .update({ status: "error", note: `Falha ao abrir: ${r?.error ?? "sem resposta MetaAPI"}` })
        .eq("id", row.id)
      return { ok: false, detail: r?.error ?? "sem resposta MetaAPI" }
    }
    const tps = Array.isArray(row.tp) ? row.tp : []
    await supabase.from("mtmcopy_premium_active").insert({
      account_id: row.account_id,
      symbol: row.symbol,
      direction: row.direction,
      entry: price,
      sl: row.sl ?? null,
      tp1: tps[0] ?? null,
      tp2: tps[1] ?? null,
      tp3: tps[2] ?? null,
      exit_pct_tp1: row.exit_pct_tp1,
      exit_pct_tp2: row.exit_pct_tp2,
      exit_pct_tp3: row.exit_pct_tp3,
      original_lot: row.lot,
      small_account: false,
      exits_done: 0,
      trailing_started: false,
      status: "open",
    })
    await supabase
      .from("mtmcopy_premium_pending")
      .update({ broker_position_id: r.orderId ?? null, note: `Entrou ${row.direction} @ ${price} (${source}) · #${r.orderId ?? "?"}` })
      .eq("id", row.id)
    return { ok: true, detail: `live ${source} @ ${price} · #${r.orderId ?? "?"}` }
  } catch (e) {
    await supabase
      .from("mtmcopy_premium_pending")
      .update({ status: "error", note: `Erro fatal: ${e instanceof Error ? e.message : String(e)}` })
      .eq("id", row.id)
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

/** Reação vinda do webhook TradingView (gatilho A) — casa o pendente por símbolo+direção. */
export async function triggerPremiumZoneByReaction(
  symbol: string,
  direction: "buy" | "sell",
  price: number,
): Promise<{ fired: number }> {
  const cfg = await getPremiumZoneConfig()
  if (cfg.mode === "off" || !cfg.trig_tv) return { fired: 0 }
  const supabase = getSupabaseAdmin()
  const up = symbol.toUpperCase().trim()
  const { data } = await supabase
    .from("mtmcopy_premium_pending")
    .select("*")
    .eq("status", "pending")
    .eq("direction", direction)
    .order("created_at", { ascending: true })
  const rows = ((data ?? []) as PendingRow[]).filter(
    (r) => r.symbol.toUpperCase().trim() === up || up.includes(r.symbol.toUpperCase().replace(/USD$/, "")),
  )
  let fired = 0
  for (const row of rows) {
    // A reação só vale se o preço estiver dentro (ou muito perto) da zona.
    if (!priceInZone(price, row.zone_low, row.zone_high, 0.001)) continue
    const res = await firePendingEntry(row, "tv_reaction", price)
    if (res.ok) fired++
  }
  return { fired }
}

/** Cron (1 min): expira, cancela ao romper SL, e avalia gatilhos C/B server-side. */
export async function runPremiumZoneMonitor(): Promise<{ checked: number; fired: number; expired: number; cancelled: number }> {
  const cfg: PremiumZoneConfig = await getPremiumZoneConfig()
  if (cfg.mode === "off") return { checked: 0, fired: 0, expired: 0, cancelled: 0 }
  const supabase = getSupabaseAdmin()

  const nowIso = new Date().toISOString()
  // Expira os pendentes antigos.
  const { data: expiredRows } = await supabase
    .from("mtmcopy_premium_pending")
    .update({ status: "expired", note: "Expirou sem gatilho válido" })
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("id")
  const expired = expiredRows?.length ?? 0

  const { data } = await supabase
    .from("mtmcopy_premium_pending")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
  const rows = (data ?? []) as PendingRow[]

  let fired = 0
  let cancelled = 0
  // Agrupa por conta+símbolo para minimizar consultas de preço.
  const priceCache = new Map<string, number | null>()

  for (const row of rows) {
    const cacheKey = `${row.account_id}|${row.symbol}|${row.direction}`
    let price = priceCache.get(cacheKey) ?? null
    if (price == null) {
      try {
        const ctx = await fetchLotSizingContext(row.account_id, row.symbol, row.direction)
        price = ctx?.marketPrice ?? null
      } catch {
        price = null
      }
      priceCache.set(cacheKey, price)
    }
    if (price == null || !(price > 0)) continue

    // Cancelar ao romper o SL antes de entrar (segurança).
    if (cfg.cancel_on_sl_break && row.sl != null && row.sl > 0) {
      const broke = row.direction === "buy" ? price <= row.sl : price >= row.sl
      if (broke) {
        await supabase
          .from("mtmcopy_premium_pending")
          .update({ status: "cancelled", trigger_price: price, note: `Cancelado: rompeu SL (${row.sl}) antes de entrar` })
          .eq("id", row.id)
          .eq("status", "pending")
        cancelled++
        continue
      }
    }

    const inZone = priceInZone(price, row.zone_low, row.zone_high)
    const nowTouched = row.touched_zone || inZone

    // C) Reconfirmação: já tocou na zona, ainda dentro, e o preço reage na direção do sinal.
    const reacted =
      cfg.trig_reconfirm &&
      nowTouched &&
      inZone &&
      row.last_price != null &&
      (row.direction === "buy" ? price >= row.last_price : price <= row.last_price)

    // B) Toque: só estar dentro da zona.
    const touch = cfg.trig_touch && inZone

    if (reacted || touch) {
      const res = await firePendingEntry(row, reacted ? "server_reconfirm" : "server_touch", price)
      if (res.ok) fired++
      continue
    }

    // Sem gatilho → atualiza estado para o próximo ciclo.
    await supabase
      .from("mtmcopy_premium_pending")
      .update({ touched_zone: nowTouched, last_price: price })
      .eq("id", row.id)
      .eq("status", "pending")
  }

  return { checked: rows.length, fired, expired, cancelled }
}
