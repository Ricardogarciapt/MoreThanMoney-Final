/**
 * Avaliador de estado dos Alertas MTM.
 * Lê os alertas abertos (pending/active) em `tradingview_signals`, obtém o preço
 * atual de cada ativo e escala o `trade_status` para exit_1/2/3 (win) ou loss.
 * Só progride o estado (nunca reverte um win para loss) e ignora tickers sem
 * fonte de preço fiável. Não cria variáveis de ambiente novas.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { fetchYahooQuote } from "@/lib/yahoo-market"
import { fetchBinanceSpotUsd } from "@/lib/crypto-usd"
import { notifySignalOutcome } from "@/lib/mtm-alerts/notify-outcome"

const CRYPTO_BASES = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "AVAX", "LINK",
  "DOT", "MATIC", "TRX", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "TON",
])
const FOREX_CODES = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"])
const YAHOO_MAP: Record<string, string> = {
  XAUUSD: "GC=F", GOLD: "GC=F", XAGUSD: "SI=F", SILVER: "SI=F",
  USOIL: "CL=F", WTIUSD: "CL=F", UKOIL: "BZ=F",
  US30: "^DJI", DJI: "^DJI", DOWJONES: "^DJI",
  US100: "^NDX", NAS100: "^NDX", NDX: "^NDX", USTEC: "^NDX",
  US500: "^GSPC", SPX500: "^GSPC", SPX: "^GSPC",
  GER40: "^GDAXI", DAX: "^GDAXI", DE40: "^GDAXI",
  UK100: "^FTSE", FTSE: "^FTSE", JP225: "^N225",
}

/** Resolve o preço atual de um ticker de webhook para várias classes de ativo. */
export async function resolveCurrentPrice(ticker: string | null): Promise<number | null> {
  if (!ticker) return null
  const norm = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "")
  const clean = norm.replace(/\.P$/i, "").replace(/[^A-Z0-9]/g, "")

  // Cripto: perp (.P), pares *USDT, ou bases conhecidas terminadas em USD
  const cryptoBase = clean.replace(/USDT?$/i, "")
  const isCrypto = /USDT$/i.test(clean) || /\.P$/i.test(norm) || CRYPTO_BASES.has(cryptoBase)
  if (isCrypto) {
    const spot = await fetchBinanceSpotUsd(`${cryptoBase}USDT`)
    if (spot != null) return spot
  }

  // Mapa direto Yahoo (metais, índices, petróleo)
  if (YAHOO_MAP[clean]) {
    const q = await fetchYahooQuote(YAHOO_MAP[clean])
    return q.price
  }

  // Forex 6 letras (par de moedas)
  if (clean.length === 6 && FOREX_CODES.has(clean.slice(0, 3)) && FOREX_CODES.has(clean.slice(3, 6))) {
    const q = await fetchYahooQuote(`${clean}=X`)
    return q.price
  }

  // Ações / restantes → Yahoo tal como está
  const q = await fetchYahooQuote(clean)
  return q.price
}

/** Perp cripto? (o scanner de perps manda tickers tipo LDOUSDT.P). */
function isBybitPerp(ticker: string | null): boolean {
  if (!ticker) return false
  const t = ticker.toUpperCase()
  return /\.P$/i.test(t) || /USDT$/i.test(t.replace(/[^A-Z0-9]/g, ""))
}

/** Símbolo Bybit linear a partir do ticker do webhook (LDOUSDT.P → LDOUSDT). */
function bybitSymbol(ticker: string): string {
  return ticker.toUpperCase().replace(/\.P$/i, "").replace(/[^A-Z0-9]/g, "")
}

type Candle = { hi: number; lo: number }

/**
 * Velas 15m públicas da Bybit (linear) desde `sinceMs`, em ordem cronológica. Cache por-run.
 * A Bybit geo-bloqueia os IPs dos EUA e este avaliador corre em node/iad1 → a chamada DIRETA
 * a api.bybit.com falha (velas vazias → tudo ficava pending). Quando há `origin`, vai buscar
 * as velas à rota interna edge/fra1 `/api/bybit/klines` (contorna o geo-bloqueio). Sem origin
 * (ex.: correr em fra1/local) tenta a Bybit diretamente.
 */
async function fetchBybitPath(
  symbol: string,
  sinceMs: number,
  cache: Map<string, Candle[]>,
  ctx?: { origin?: string | null; secret?: string | null },
): Promise<Candle[]> {
  if (cache.has(symbol)) return cache.get(symbol)!
  const out: Candle[] = []
  try {
    const end = Date.now()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    let list: string[][] = []
    if (ctx?.origin && ctx?.secret) {
      // Via edge/fra1 interna (contorna geo-bloqueio da Bybit no iad1)
      const res = await fetch(
        `${ctx.origin}/api/bybit/klines?symbol=${encodeURIComponent(symbol)}&since=${sinceMs}&interval=15`,
        { headers: { authorization: `Bearer ${ctx.secret}` }, signal: ctrl.signal },
      )
      const j = await res.json()
      // A rota já devolve {candles:[{hi,lo}]} em ordem cronológica.
      const cs = (j?.candles ?? []) as { hi: number; lo: number }[]
      clearTimeout(t)
      for (const c of cs) if (Number.isFinite(c.hi) && Number.isFinite(c.lo)) out.push({ hi: c.hi, lo: c.lo })
      cache.set(symbol, out)
      return out
    }
    // Fallback: Bybit direta (só resolve se a região não estiver geo-bloqueada)
    const url =
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}` +
      `&interval=15&start=${sinceMs}&end=${end}&limit=1000`
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    const j = await res.json()
    list = j?.result?.list ?? []
    for (const row of list.slice().reverse()) {
      const hi = Number(row[2])
      const lo = Number(row[3])
      if (Number.isFinite(hi) && Number.isFinite(lo)) out.push({ hi, lo })
    }
  } catch {
    /* fail-open: sem velas → devolve vazio, o alerta fica pending (não resolve à toa) */
  }
  cache.set(symbol, out)
  return out
}

type Status = "pending" | "active" | "be" | "exit_1" | "exit_2" | "exit_3" | "exit_4" | "loss" | "discarded" | "closed"
const RANK: Record<string, number> = { pending: 0, active: 1, be: 1, exit_1: 2, exit_2: 3, exit_3: 4, exit_4: 5, closed: 6 }
const isWin = (s: string | null) => Boolean(s && (s.startsWith("exit_") || s === "closed"))

/** Estado candidato a partir do preço atual vs. entrada/SL/TPs. */
function candidateStatus(dir: "buy" | "sell", price: number, entry: number | null, sl: number | null, tps: number[]): Status | null {
  const sorted = [...tps].filter((n) => Number.isFinite(n))
  // TPs por ordem de proximidade à entrada na direção do trade
  sorted.sort((a, b) => (dir === "buy" ? a - b : b - a))
  const tpHit = (i: number) => sorted[i] != null && (dir === "buy" ? price >= sorted[i] : price <= sorted[i])
  const slHit = sl != null && (dir === "buy" ? price <= sl : price >= sl)

  if (sorted.length >= 3 && tpHit(2)) return "exit_3"
  if (sorted.length >= 2 && tpHit(1)) return "exit_2"
  if (sorted.length >= 1 && tpHit(0)) return "exit_1"
  if (slHit) return "loss"
  if (entry != null && (dir === "buy" ? price >= entry : price <= entry)) return "active"
  return null
}

/**
 * Avaliação por CAMINHO (path-based) para perps: percorre as velas desde a entrada e resolve
 * pelo que aconteceu (TP ou SL a bater primeiro), não pelo preço atual — o snapshot perdia
 * TP/SL que bateram e reverteram (por isso 346/348 ficavam pending). Entrada a mercado →
 * considera-se ativada na 1ª vela. Um win (exit_n) nunca é revertido para loss.
 */
function evaluatePerpPath(
  dir: "buy" | "sell",
  sl: number | null,
  tps: number[],
  candles: Candle[],
): Status | null {
  if (!candles.length) return null
  const sorted = [...new Set(tps)].filter((n) => Number.isFinite(n))
  sorted.sort((a, b) => (dir === "buy" ? a - b : b - a))
  let rank = 0 // 0 = sem win; 1..n = exit_1..n
  for (const c of candles) {
    const slHit = sl != null && (dir === "buy" ? c.lo <= sl : c.hi >= sl)
    let hiIdx = -1
    for (let i = 0; i < sorted.length; i++) {
      const hit = dir === "buy" ? c.hi >= sorted[i] : c.lo <= sorted[i]
      if (hit) hiIdx = i
    }
    if (rank === 0) {
      // Antes de qualquer TP: SL nesta vela = loss (se TP e SL na mesma vela, conservador = loss).
      if (slHit) return "loss"
      if (hiIdx >= 0) rank = hiIdx + 1
    } else {
      // Já há win → só escala; SL depois de TP não reverte (BE protege).
      if (hiIdx + 1 > rank) rank = hiIdx + 1
    }
    if (sorted.length > 0 && rank >= sorted.length) break
  }
  if (rank === 0) return null // ainda aberto (nem TP nem SL) → mantém pending
  return `exit_${Math.min(rank, 4)}` as Status
}

export async function evaluateOpenAlerts(
  limit = 300,
  ctx?: { origin?: string | null; secret?: string | null },
): Promise<{ scanned: number; updated: number; skipped: number; expired: number }> {
  const admin = getSupabaseAdmin()
  const cols = "id, ticker, action, price, sl, tp, raw_payload, trade_status, signal_kind, chat_message_id, received_at"
  const openStatus = "trade_status.is.null,trade_status.in.(pending,active,be,exit_1,exit_2,exit_3)"
  const openKind = "signal_kind.is.null,signal_kind.eq.entry"

  // PASSAGEM 1 — PERPS primeiro (avaliação path-based via velas Bybit, resolvível). Tem orçamento
  // PRÓPRIO para não ser esfomeada pelo enorme backlog de não-perps (que usam snapshot e muitas
  // vezes não resolvem, ficando a re-aparecer no topo da fila ascendente).
  const { data: perpRows } = await admin
    .from("tradingview_signals")
    .select(cols)
    .or(openStatus)
    .or(openKind)
    .or("ticker.ilike.%USDT%,ticker.ilike.%.P")
    .order("received_at", { ascending: true })
    .limit(Math.max(limit, 500))

  // PASSAGEM 0 — EXPIRAR o que já não é resolúvel. Sem isto, a fila ascendente ficava presa:
  // os mais antigos são avaliados por SNAPSHOT (preço de agora), quase nunca resolvem, e voltavam
  // ao topo da fila em cada passagem — o orçamento de 300 gastava-se sempre nos mesmos e os
  // sinais RECENTES nunca chegavam a ser avaliados. Era por isso que havia milhares de pendentes.
  const expiryDays = Number(process.env.ALERTS_EXPIRY_DAYS) || 14
  const expiryCutoff = new Date(Date.now() - expiryDays * 86_400_000).toISOString()
  let expired = 0
  try {
    const { data: velhos } = await admin
      .from("tradingview_signals")
      .update({ trade_status: "expired" })
      .or("trade_status.is.null,trade_status.eq.pending")
      .or(openKind)
      .lt("received_at", expiryCutoff)
      .select("id")
    expired = velhos?.length ?? 0
  } catch (e) {
    console.warn("[alerts] expiração falhou:", e instanceof Error ? e.message : String(e))
  }

  // PASSAGEM 2 — restantes (snapshot). DESCENDENTE: os recentes primeiro, que são os que ainda
  // podem resolver e os únicos que interessam para notificar. Os velhos saem pela expiração.
  const { data: otherRows } = await admin
    .from("tradingview_signals")
    .select(cols)
    .or(openStatus)
    .or(openKind)
    .order("received_at", { ascending: false })
    .limit(limit)

  let updated = 0
  let skipped = 0
  // Perps primeiro; dedup por id (um perp já processado na passagem 1 não repete).
  const seen = new Set<string>()
  const list = [...(perpRows ?? []), ...(otherRows ?? [])].filter((r) => {
    const id = String((r as { id: string }).id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  const klineCache = new Map<string, Candle[]>()

  for (const r of list) {
    const a = String(r.action ?? "").toLowerCase()
    const dir: "buy" | "sell" | null = /buy|long|compra/.test(a) ? "buy" : /sell|short|venda/.test(a) ? "sell" : null
    if (!dir) { skipped++; continue }

    const raw = (r.raw_payload && typeof r.raw_payload === "object" ? r.raw_payload : {}) as Record<string, unknown>
    const nn = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
    const entry = nn(r.price) ?? nn(raw.entry) ?? nn(raw.entry_price)
    const sl = nn(r.sl) ?? nn(raw.sl) ?? nn(raw.stop_loss) ?? nn(raw.stop)
    const tps = [
      nn(r.tp), nn(raw.tp1), nn(raw.tp2), nn(raw.tp3), nn(raw.tp4),
      nn(raw.exit1), nn(raw.exit2), nn(raw.exit3),
    ].filter((n): n is number => n != null)

    // Perps: avaliação por CAMINHO (velas Bybit desde a entrada) — resolve TP/SL que bateram
    // e reverteram, que o snapshot de preço perdia. Restantes ativos: snapshot como antes.
    let cand: Status | null
    if (isBybitPerp(r.ticker)) {
      const sinceMs = (r as { received_at?: string | null }).received_at
        ? Date.parse((r as { received_at: string }).received_at)
        : NaN
      if (!Number.isFinite(sinceMs)) { skipped++; continue }
      const candles = await fetchBybitPath(bybitSymbol(r.ticker!), sinceMs, klineCache, ctx)
      cand = evaluatePerpPath(dir, sl, [...new Set(tps)], candles)
    } else {
      const price = await resolveCurrentPrice(r.ticker)
      if (price == null) { skipped++; continue }
      cand = candidateStatus(dir, price, entry, sl, [...new Set(tps)])
    }
    if (!cand) continue

    const cur = r.trade_status as string | null
    // Nunca reverter um win para loss; só progride o rank.
    let finalCand: Status = cand
    if (cand === "loss") {
      if (isWin(cur)) continue
      // SL atingido mas o sinal NUNCA foi ativado (ainda pending/sem estado) → DESCARTADO,
      // não é um loss real (a trade não chegou a abrir). NOTA: perps entram a MERCADO (ativam
      // sempre na 1ª vela via path-eval) → SL é loss real, não descartado.
      const activated = cur === "active" || cur === "be" || String(cur ?? "").startsWith("exit_")
      if (!activated && !isBybitPerp(r.ticker)) finalCand = "discarded"
    } else if ((RANK[cand] ?? 1) <= (RANK[cur ?? "active"] ?? 1)) {
      continue
    }
    if (finalCand === cur) continue

    const { error } = await admin.from("tradingview_signals").update({ trade_status: finalCand }).eq("id", r.id)
    if (!error) {
      updated++
      // Notifica seguidores + T2T só em LOSS real (ativado) ou TP — nunca em descartado.
      // GUARDA: só notifica sinais RECENTES (<36h). Resolver backlog antigo (dias) apenas
      // atualiza o estado em silêncio — não dispara notificações históricas em massa.
      const recvMs = r.received_at ? Date.parse(String(r.received_at)) : NaN
      const fresh = Number.isFinite(recvMs) && Date.now() - recvMs < 36 * 3600 * 1000
      // O DESCARTE passa a contar como desfecho: a ideia morreu antes de abrir e quem a aceitou
      // no Tap to Trade fica com uma ordem pendente inútil. Antes só notificávamos loss/TP.
      if (fresh && (finalCand === "loss" || finalCand === "discarded" || finalCand.startsWith("exit_"))) {
        await notifySignalOutcome({
          entryId: r.id,
          chatMessageId: (r as { chat_message_id?: string | null }).chat_message_id ?? null,
          ticker: r.ticker,
          status: finalCand,
        })
      }
      // Descarte e stop fecham as ordens T2T de quem aceitou (apaga pendentes, fecha abertas).
      if (fresh && (finalCand === "discarded" || finalCand === "loss")) {
        try {
          const { closeT2TFollowersForSignal } = await import("@/lib/mtmcopy/t2t-lifecycle")
          const chatSlug = (r as { chat_channel_slug?: string | null }).chat_channel_slug
          if (chatSlug && r.ticker) {
            await closeT2TFollowersForSignal({
              kind: finalCand === "discarded" ? "discard" : "close",
              chatSlug,
              symbol: r.ticker,
              direction: dir === "buy" || dir === "sell" ? dir : null,
              label: "Alertas MTM",
            })
          }
        } catch (e) {
          console.warn("[alerts] fecho T2T falhou:", e instanceof Error ? e.message : String(e))
        }
      }
    }
  }

  return { scanned: list.length, updated, skipped, expired }
}
