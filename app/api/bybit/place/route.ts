import { NextRequest, NextResponse } from "next/server"
import {
  toBybitSymbol,
  bybitConfigured,
  getBybitWallet,
  getBybitPositions,
  getBybitInstrumentInfo,
  getBybitFunding,
  fundingGate,
  fundingFavorMultiplier,
  buildQuickWinPlan,
  computeMasterQty,
  computeDynamicLeverage,
  placeBybitPerp,
} from "@/lib/bybit"

// Edge + fra1: a Bybit bloqueia IPs dos EUA (serverless Node corre em iad1). Só as Edge
// Functions respeitam preferredRegion na Vercel Pro → esta rota corre em Frankfurt (UE).
// É a PONTE: o webhook dos perps (Node/iad1) não alcança a Bybit e faz fetch para aqui.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

const DEFAULT_COST_PCT = 0.03 // margem por posição = 3% da equity
const DEFAULT_MAX_POSITIONS = 5 // nº máx de posições abertas em simultâneo
const DEFAULT_BASE_LEVERAGE = 10 // alavancagem no SL de referência
const DEFAULT_VOL_REF_PCT = 0.01 // SL 1% → base leverage
const DEFAULT_MAX_LEVERAGE = 20 // teto (também limitado pelo máx do símbolo)
const DEFAULT_MIN_LEVERAGE = 1
const DEFAULT_FUNDING_MAX_ADVERSE = 0.0005 // 0,05% por período — acima disto é funding forte
const DEFAULT_FUNDING_WINDOW_MIN = 15 // só bloqueia se o acerto for dentro de 15 min
const DEFAULT_QUICK_R = 0.5 // scalp de ganho rápido a meio-R (metade do risco)
const DEFAULT_QUICK_PCT = 0.004 // sem SL: scalp a 0,4% da entrada
const DEFAULT_QUICK_FRAC = 0.25 // fecha 25% da posição no scalp rápido
const DEFAULT_FUNDING_FAVOR_MIN = 0.0005 // 0,05%/período — favor mínimo p/ dar boost de size
const DEFAULT_FUNDING_FAVOR_BOOST = 0.2 // +20% de margem quando o funding paga-nos

/**
 * Coloca a ordem-MESTRE na Bybit (Copy Trading nativo replica p/ seguidores): entrada a
 * mercado + SL completo + TPs parciais (reduce-only). Faz o SIZING aqui (fra1) porque o
 * webhook em iad1 não lê a wallet. Gated por BYBIT_PERPS_EXEC_ENABLED.
 *   POST /api/bybit/place   Authorization: Bearer <CRON_SECRET>
 *   body: { symbol, side, entry, sl?, tps?: number[], partials?: number[],
 *           leverage?, riskPct?, costAbs?, qty? }
 * `tps` = [tp1,tp2,tp3]; se vier só `tp`, usa-se como nível único. `qty` direta salta o sizing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (process.env.BYBIT_PERPS_EXEC_ENABLED !== "true") {
    return NextResponse.json({ ok: false, skipped: true, reason: "BYBIT_PERPS_EXEC_ENABLED off" })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const symbol = toBybitSymbol(String(b.symbol || ""))
  if (!symbol) return NextResponse.json({ ok: false, error: "symbol em falta" }, { status: 400 })
  const side = String(b.side || "").toLowerCase() === "sell" ? "sell" : "buy"
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  const entry = num(b.entry) ?? num(b.price)
  const sl = num(b.sl)
  const takeProfits = Array.isArray(b.tps)
    ? (b.tps as unknown[]).map(num).filter((n): n is number => n != null && n > 0)
    : [num(b.tp)].filter((n): n is number => n != null && n > 0)
  const partials = Array.isArray(b.partials)
    ? (b.partials as unknown[]).map(num).filter((n): n is number => n != null && n > 0)
    : null
  const costPct = num(b.costPct) ?? (Number(process.env.BYBIT_COST_PCT) || DEFAULT_COST_PCT)
  const riskPct = num(b.riskPct) ?? (Number(process.env.BYBIT_RISK_PCT) || null) // teto opcional
  const costAbs = num(b.costAbs) ?? (Number(process.env.BYBIT_COST_ABS) || null) // teto opcional

  const [instrument, funding] = await Promise.all([getBybitInstrumentInfo(symbol), getBybitFunding(symbol)])

  // Gate de FUNDING — o "imposto silencioso" dos perps. Bloqueia só o pior caso: funding
  // adverso forte + acerto iminente (abriríamos a pagar a taxa logo, sem a posição correr).
  // ON por defeito; BYBIT_FUNDING_GATE_ENABLED=false desliga.
  const fg = fundingGate(side, funding, Date.now(), {
    maxAdverse: Number(process.env.BYBIT_FUNDING_MAX_ADVERSE) || DEFAULT_FUNDING_MAX_ADVERSE,
    windowMin: Number(process.env.BYBIT_FUNDING_WINDOW_MIN) || DEFAULT_FUNDING_WINDOW_MIN,
  })
  if (process.env.BYBIT_FUNDING_GATE_ENABLED !== "false" && fg.block) {
    return NextResponse.json({
      ok: false, skipped: true, reason: fg.reason,
      funding: { rate: fg.rate, adverse: fg.adverse, minsToFunding: fg.minsToFunding },
    })
  }

  // Boost de size quando o funding está A NOSSO FAVOR (vai pagar-nos): +margem à MESMA leverage
  // (mais size sem aproximar a liquidação). ON por defeito; BYBIT_FUNDING_FAVOR_ENABLED=false desliga.
  const favor =
    process.env.BYBIT_FUNDING_FAVOR_ENABLED !== "false"
      ? fundingFavorMultiplier(side, funding, {
          minFavor: Number(process.env.BYBIT_FUNDING_FAVOR_MIN) || DEFAULT_FUNDING_FAVOR_MIN,
          boostPct: Number(process.env.BYBIT_FUNDING_FAVOR_BOOST) || DEFAULT_FUNDING_FAVOR_BOOST,
        })
      : { mult: 1, favor: 0, reason: "off" }

  // Alavancagem dinâmica pela volatilidade (dist. do SL), base 10x, clampada ao máx do símbolo.
  // `leverage` no body força um valor fixo (testes).
  const baseLev = Number(process.env.BYBIT_BASE_LEVERAGE) || DEFAULT_BASE_LEVERAGE
  const refVol = Number(process.env.BYBIT_VOL_REF_PCT) || DEFAULT_VOL_REF_PCT
  const symbolMaxLev = instrument?.maxLeverage && instrument.maxLeverage > 0 ? instrument.maxLeverage : DEFAULT_MAX_LEVERAGE
  const maxLev = Math.min(Number(process.env.BYBIT_MAX_LEVERAGE) || DEFAULT_MAX_LEVERAGE, symbolMaxLev)
  const leverage =
    num(b.leverage) ??
    computeDynamicLeverage(entry ?? 0, sl, { base: baseLev, refVolPct: refVol, min: DEFAULT_MIN_LEVERAGE, max: maxLev })

  // qty: direta (testes) ou dimensionada (margem costPct × alavancagem).
  let qty = num(b.qty) ?? 0
  let sizing = "qty direta"
  if (!(qty > 0)) {
    if (!(entry != null && entry > 0)) {
      return NextResponse.json({ ok: false, error: "entry necessário para o sizing" }, { status: 400 })
    }
    // Saldo + posições abertas em paralelo (gates de risco antes de abrir).
    const [wallet, positions] = await Promise.all([getBybitWallet(), getBybitPositions()])
    const equity = wallet.equity
    if (!(equity != null && equity > 0)) {
      return NextResponse.json({ ok: false, error: "equity Bybit indisponível" }, { status: 502 })
    }

    // Cap de posições simultâneas — protege a margem (a lista de perps dispara muitos sinais).
    const maxPositions = Number(process.env.BYBIT_MAX_POSITIONS) || DEFAULT_MAX_POSITIONS
    if (positions.ok && positions.positions.length >= maxPositions) {
      return NextResponse.json({
        ok: false, skipped: true,
        reason: `cap de ${maxPositions} posições atingido (${positions.positions.length} abertas)`,
      })
    }

    // Margem efetiva = costPct × boost de funding-a-favor (1 se não houver favor/boost off).
    const effectiveCostPct = costPct * favor.mult

    // Skip se o saldo disponível não cobre a margem necessária (≈ costPct efetiva da equity).
    const requiredMargin = equity * effectiveCostPct
    if (wallet.available != null && wallet.available < requiredMargin) {
      return NextResponse.json({
        ok: false, skipped: true,
        reason: `saldo baixo: disponível $${wallet.available.toFixed(2)} < margem $${requiredMargin.toFixed(2)}`,
      })
    }

    const r = computeMasterQty({ equity, entry, sl, leverage, costPct: effectiveCostPct, riskPct, costAbs, instrument })
    qty = r.qty
    sizing = `equity $${equity.toFixed(2)} · ${positions.positions.length}/${maxPositions} pos · ${r.reason}${favor.mult !== 1 ? ` · ${favor.reason}` : ""}`
    if (!(qty > 0)) {
      return NextResponse.json({ ok: false, error: `qty=0 após sizing (${sizing})` }, { status: 422 })
    }
  }

  // Trailing: ao atingir a 1ª saída (Exit 1) → break-even + trailing stop nativo. ON por defeito.
  const trailing = typeof b.trailing === "boolean" ? b.trailing : process.env.BYBIT_TRAIL_ENABLED !== "false"

  // GANHO RÁPIDO: perna de scalp cedo que banca parte da posição no spike pós-sinal 1H e deixa o
  // resto correr a tendência (o trailing passa a ativar no scalp → BE mais cedo; liberta o cap de
  // posições p/ apanhar o próximo sinal). ON por defeito; só quando não há `partials` explícitas.
  const quickEnabled = process.env.BYBIT_QUICK_WIN_ENABLED !== "false" && partials == null
  const qw = quickEnabled
    ? buildQuickWinPlan(side, entry ?? 0, sl, takeProfits, {
        quickR: Number(process.env.BYBIT_QUICK_R) || DEFAULT_QUICK_R,
        quickPct: Number(process.env.BYBIT_QUICK_PCT) || DEFAULT_QUICK_PCT,
        quickFrac: Number(process.env.BYBIT_QUICK_FRAC) || DEFAULT_QUICK_FRAC,
      })
    : { takeProfits, partials: null as number[] | null, quickTp: null, reason: "quick-win off/partials manuais" }
  const finalTakeProfits = qw.quickTp != null ? qw.takeProfits : takeProfits
  const finalPartials = qw.quickTp != null ? qw.partials : partials

  const trade = await placeBybitPerp({
    symbol,
    side,
    qty,
    entry,
    leverage,
    stopLoss: sl,
    takeProfits: finalTakeProfits,
    partials: finalPartials,
    trailing,
    instrument,
  })

  return NextResponse.json({
    ok: trade.ok,
    retCode: trade.retCode,
    retMsg: trade.retMsg,
    orderId: trade.orderId,
    symbol,
    side,
    qty,
    leverage,
    slSet: trade.slSet,
    tpFinalSet: trade.tpFinalSet,
    trailingSet: trade.trailingSet,
    tps: trade.tps.map((t) => ({ price: t.price, qty: t.qty, ok: t.ok, err: t.ok ? undefined : t.retMsg })),
    sizing,
    funding: { rate: fg.rate, adverse: fg.adverse, minsToFunding: fg.minsToFunding },
    fundingFavor: favor.mult !== 1 ? { mult: favor.mult, favor: favor.favor } : null,
    quickWin: qw.quickTp != null ? { tp: qw.quickTp, reason: qw.reason } : null,
  })
}
