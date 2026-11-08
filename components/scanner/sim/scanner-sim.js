// Simulação ilustrativa de cada scanner MTM, para as animações 3D das landings e dos vídeos.
// Os preços são gerados (não são histórico real) e a lógica é uma versão simplificada da do
// script do TradingView: chega para mostrar o comportamento, não para reproduzir sinais reais.
// JS puro e sem dependências, para correr tanto no Next como na composição do vídeo.

// ───────────────────────── utilidades ─────────────────────────
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
}

/** Velas a partir de segmentos {len, drift, vol} (drift e vol em fração por vela). */
function makeCandles(seed, start, segments) {
  const r = rng(seed)
  const out = []
  let price = start
  for (const s of segments) {
    for (let k = 0; k < s.len; k++) {
      const o = price
      const c = o * (1 + s.drift + s.vol * gauss(r))
      const span = Math.abs(c - o) + o * s.vol * (0.35 + r() * 0.9)
      const h = Math.max(o, c) + span * r() * 0.6
      const l = Math.min(o, c) - span * r() * 0.6
      const v = (0.6 + r()) * (1 + (Math.abs(c - o) / (o * s.vol + 1e-9)) * 0.6) * (r() < 0.06 ? 3 : 1)
      out.push({ o, h, l, c, v })
      price = c
    }
  }
  return out
}

const ema = (src, len) => {
  const a = 2 / (len + 1)
  const out = []
  src.forEach((x, i) => out.push(i === 0 ? x : a * x + (1 - a) * out[i - 1]))
  return out
}
const dema = (src, len) => {
  const e1 = ema(src, len)
  const e2 = ema(e1, len)
  return e1.map((x, i) => 2 * x - e2[i])
}
const rma = (src, len) => {
  const out = []
  src.forEach((x, i) => out.push(i === 0 ? x : (out[i - 1] * (len - 1) + x) / len))
  return out
}
const trueRange = (cs) => cs.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - cs[i - 1].c), Math.abs(b.l - cs[i - 1].c))))
const atrOf = (cs, len) => rma(trueRange(cs), len)
const sma = (src, len) => src.map((_, i) => { const w = src.slice(Math.max(0, i - len + 1), i + 1); return w.reduce((s, x) => s + x, 0) / w.length })
const stdev = (src, len) => src.map((_, i) => {
  const w = src.slice(Math.max(0, i - len + 1), i + 1)
  const m = w.reduce((s, x) => s + x, 0) / w.length
  return Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / w.length)
})
function percentile(arr, p) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const k = (s.length - 1) * (p / 100)
  const f = Math.floor(k)
  return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f)
}
/** POC simplificado: preço de fecho da vela com mais volume nas últimas `len`. */
function poc(cs, len) {
  return cs.map((_, i) => {
    let best = -1
    let price = cs[i].c
    for (let k = Math.max(0, i - len + 1); k <= i; k++) if (cs[k].v > best) { best = cs[k].v; price = cs[k].c }
    return price
  })
}
/** Estrutura SMC simplificada (swings de `len`): devolve CHoCH com a linha quebrada. */
function structure(cs, len) {
  const events = []
  let os = 0
  let topy = NaN, topx = -1, btmy = NaN, btmx = -1
  let topCrossed = true, btmCrossed = true
  let swing = 0
  const trend = []
  for (let n = 0; n < cs.length; n++) {
    if (n >= len * 2) {
      const win = cs.slice(n - len + 1, n + 1)
      const upper = Math.max(...win.map((b) => b.h))
      const lower = Math.min(...win.map((b) => b.l))
      const prev = swing
      swing = cs[n - len].h > upper ? 0 : cs[n - len].l < lower ? 1 : swing
      if (swing === 0 && prev !== 0) { topy = cs[n - len].h; topx = n - len; topCrossed = false }
      if (swing === 1 && prev !== 1) { btmy = cs[n - len].l; btmx = n - len; btmCrossed = false }
    }
    const prevOs = os
    if (cs[n].c > topy && !topCrossed) { os = 1; topCrossed = true }
    if (cs[n].c < btmy && !btmCrossed) { os = 0; btmCrossed = true }
    if (os !== prevOs) events.push(os === 1 ? { i: n, from: topx, price: topy, bull: true } : { i: n, from: btmx, price: btmy, bull: false })
    trend.push(os)
  }
  return { events, trend }
}

const GOLD = '#d2a63c'
const GOLD_L = '#e9c46a'
const GREEN = '#22c58b'
const RED = '#ef4b5a'
const BLUE = '#4f8bff'
const GREY = '#9a9890'

/** Corta o aquecimento: os indicadores precisam de histórico, o ecrã só mostra as últimas N velas. */
function trim(sim, warm) {
  const cut = (i) => i - warm
  const N = sim.candles.length - warm
  const keep = (i) => i >= warm
  return {
    ...sim,
    candles: sim.candles.slice(warm),
    lines: sim.lines.map((l) => ({ ...l, pts: l.pts.slice(warm) })),
    areas: (sim.areas || []).map((a) => ({ ...a, upper: a.upper.slice(warm), lower: a.lower.slice(warm) })),
    zones: (sim.zones || []).filter((z) => z.i1 > warm).map((z) => ({ ...z, i0: Math.max(0, cut(z.i0)), i1: Math.min(N - 1, cut(z.i1)), reveal: Math.max(0, cut(z.reveal ?? z.i0)), to: z.to != null ? cut(z.to) : undefined })),
    segments: (sim.segments || []).filter((s) => keep(s.i1)).map((s) => ({ ...s, i0: Math.max(0, cut(s.i0)), i1: cut(s.i1) })),
    markers: (sim.markers || []).filter((m) => keep(m.i)).map((m) => ({ ...m, i: cut(m.i), to: m.to != null ? cut(m.to) : undefined })),
    groups: (sim.groups || []).filter((g) => keep(g.i0)).map((g) => ({ ...g, i0: cut(g.i0), items: g.items.map((it) => ({ ...it, from: it.from != null ? cut(it.from) : undefined, to: it.to != null ? cut(it.to) : undefined, until: it.until != null ? cut(it.until) : undefined })) })),
    alertGroups: (sim.alertGroups || []).filter((g) => keep(g.i0)).map((g) => ({ ...g, i0: cut(g.i0) })),
    panel: sim.panel ? { ...sim.panel, rows: sim.panel.rows.map((r) => ({ ...r, states: r.states.slice(warm) })) } : undefined,
    captions: (sim.captions || []).filter((c) => c.i >= warm).map((c) => ({ ...c, i: cut(c.i) })).sort((a, b) => a.i - b.i),
  }
}

// ───────────────────────── Gold Killer ─────────────────────────
// SuperTrend (ATR 10 × 3) sobre HLCC4; em cada viragem guarda o alvo e o drawdown da perna
// anterior em % da entrada e desenha os níveis por percentil (escala 80%, 4 níveis por lado).
function goldKiller() {
  const warm = 140
  const cs = makeCandles(7, 2310, [
    { len: 40, drift: 0.0012, vol: 0.0035 }, { len: 30, drift: -0.0015, vol: 0.004 }, { len: 40, drift: 0.0016, vol: 0.0035 },
    { len: 30, drift: -0.001, vol: 0.004 },
    { len: 28, drift: -0.0022, vol: 0.0038 }, { len: 34, drift: 0.0024, vol: 0.0035 }, { len: 22, drift: 0, vol: 0.003 },
    { len: 30, drift: -0.002, vol: 0.004 }, { len: 36, drift: 0.0026, vol: 0.0036 },
  ])
  const src = cs.map((b) => (b.h + b.l + 2 * b.c) / 4)
  const hl2 = cs.map((b) => (b.h + b.l) / 2)
  const atr = atrOf(cs, 10)
  const state = []
  const st = []
  let prevUp = 0, prevLo = 0
  for (let i = 0; i < cs.length; i++) {
    let up = src[i] + 3 * atr[i]
    let lo = src[i] - 3 * atr[i]
    if (i > 0) {
      lo = lo > prevLo || hl2[i - 1] < prevLo ? lo : prevLo
      up = up < prevUp || hl2[i - 1] > prevUp ? up : prevUp
    }
    let dir
    if (i === 0) dir = true
    else if (st[i - 1] === prevUp) dir = !(hl2[i] > up)
    else dir = hl2[i] < lo
    st.push(dir ? up : lo)
    state.push(dir)
    prevUp = up
    prevLo = lo
  }
  const ranks = [{ r: 80, a: 0.5 }, { r: 72, a: 0.38 }, { r: 60, a: 0.28 }, { r: 40, a: 0.2 }]
  const bull = { t: [], d: [] }, bear = { t: [], d: [] }
  let entry = cs[0].c
  let hi = [], lo = []
  const legs = []
  const markers = []
  for (let i = 1; i < cs.length; i++) {
    hi.push(cs[i].h); lo.push(cs[i].l)
    const flipBull = state[i] !== state[i - 1] && !state[i]
    const flipBear = state[i] !== state[i - 1] && state[i]
    if (flipBull) {
      bear.t.unshift(Math.min(...lo) / entry - 1); bear.d.unshift(Math.max(...hi) / entry - 1)
      hi = []; lo = []; entry = cs[i].c
      legs.push({ i, bull: true, entry })
      markers.push({ i, price: cs[i].l, text: 'BUY', color: GREEN, up: true })
    }
    if (flipBear) {
      bull.t.unshift(Math.max(...hi) / entry - 1); bull.d.unshift(Math.min(...lo) / entry - 1)
      hi = []; lo = []; entry = cs[i].c
      legs.push({ i, bull: false, entry })
      markers.push({ i, price: cs[i].h, text: 'SELL', color: RED, up: false })
    }
    if ((flipBull || flipBear) && legs.length) {
      const leg = legs[legs.length - 1]
      leg.levels = ranks.map(({ r, a }) => leg.bull
        ? { gain: entry * (1 + percentile(bull.t, r)), dd: entry * (1 + percentile(bull.d, 100 - r)), a }
        : { gain: entry * (1 + percentile(bear.t, 100 - r)), dd: entry * (1 + percentile(bear.d, r)), a })
    }
  }
  const zones = []
  const center = cs.map(() => null)
  legs.forEach((leg, k) => {
    const end = k + 1 < legs.length ? legs[k + 1].i : cs.length - 1
    for (let i = leg.i; i <= end; i++) center[i] = leg.entry
    ;(leg.levels || []).forEach((lv) => {
      if (!isFinite(lv.gain) || !isFinite(lv.dd)) return
      zones.push({ i0: leg.i, i1: end, top: Math.max(lv.gain, leg.entry), bot: Math.min(lv.gain, leg.entry), color: GREEN, opacity: lv.a * 0.13, edge: lv.gain })
      zones.push({ i0: leg.i, i1: end, top: Math.max(lv.dd, leg.entry), bot: Math.min(lv.dd, leg.entry), color: RED, opacity: lv.a * 0.13, edge: lv.dd })
    })
  })
  const shown = legs.filter((l) => l.i >= warm)
  // Alerta do script: entrada = linha central, SL = drawdown 50, TP1/2/3 = ganhos 50/75/100.
  const alertGroups = legs.filter((l) => l.levels && l.levels.every((v) => isFinite(v.gain) && isFinite(v.dd))).map((l) => ({
    i0: l.i,
    items: [
      { price: l.entry, color: GOLD_L, label: 'Entrada' },
      { price: l.levels[3].dd, color: RED, label: 'SL' },
      { price: l.levels[3].gain, color: GREEN, label: 'TP1' },
      { price: l.levels[2].gain, color: GREEN, label: 'TP2' },
      { price: l.levels[0].gain, color: GREEN, label: 'TP3' },
    ],
  }))
  const smooth = ema(ema(cs.map((b) => (b.h + b.l + b.c) / 3), 4), 4)
  const sim = {
    name: 'Gold Killer',
    candles: cs,
    alertGroups,
    lines: [
      { name: 'Linha central', color: GREY, width: 0.05, z: 0.25, step: true, pts: center },
      { name: 'SuperTrend', color: GOLD, width: 0.05, z: 0.24, step: true, pts: st, hidden3d: true },
      { name: 'Preço suavizado', color: GOLD_L, width: 0.05, z: 0.24, pts: smooth, hidden3d: true },
    ],
    zones,
    markers,
    captions: [
      { i: warm, text: 'O SuperTrend acompanha a tendência do ouro' },
      ...(shown[0] ? [{ i: shown[0].i, text: shown[0].bull ? 'Virou para alta: sinal de compra' : 'Virou para baixa: sinal de venda' }] : []),
      ...(shown[0] ? [{ i: shown[0].i + 6, text: 'Alvos (verde) e drawdowns (vermelho) por percentil das pernas anteriores' }] : []),
      ...(shown[1] ? [{ i: shown[1].i, text: 'Nova viragem: os níveis recalculam-se a partir da nova entrada' }] : []),
    ],
    legend: [{ color: GREEN, label: 'Níveis de alvo' }, { color: RED, label: 'Níveis de drawdown' }, { color: GREY, label: 'Entrada (linha central)' }],
  }
  return trim(sim, warm)
}

// ───────────────────────── Scanner MTM ─────────────────────────
// DEMA 15/50/238, POC de 14 velas e sinal B/S quando o fecho cruza o POC. Stop a 1 ATR e
// alvos a 1:2, 1:4 e 1:6. Estrutura de mercado com CHoCH.
function mtmScanner() {
  const warm = 260
  const cs = makeCandles(11, 1.0842, [
    { len: 160, drift: 0.0002, vol: 0.0012 }, { len: 100, drift: -0.0003, vol: 0.0013 },
    { len: 40, drift: 0.0011, vol: 0.0011 }, { len: 30, drift: -0.0004, vol: 0.0012 }, { len: 34, drift: 0.0012, vol: 0.0011 },
    { len: 26, drift: -0.0011, vol: 0.0012 }, { len: 30, drift: 0.0009, vol: 0.0011 },
  ])
  const close = cs.map((b) => b.c)
  const d15 = dema(close, 15), d50 = dema(close, 50), d238 = dema(close, 238)
  const p = poc(cs, 14)
  const atr = atrOf(cs, 14)
  const markers = []
  const groups = []
  for (let i = warm - 30; i < cs.length; i++) {
    const buy = close[i] > p[i] && close[i - 1] <= p[i - 1]
    const sell = close[i] < p[i] && close[i - 1] >= p[i - 1]
    if (!buy && !sell) continue
    // Só mostra os sinais com DEMA a favor, para o gráfico não ficar cheio de letras.
    if (buy && !(d15[i] > d50[i] && d50[i] > d238[i])) continue
    if (sell && !(d15[i] < d50[i] && d50[i] < d238[i])) continue
    markers.push({ i, price: buy ? cs[i].l : cs[i].h, text: buy ? 'B' : 'S', color: buy ? GREEN : RED, up: buy, small: true })
    const e = close[i], s = atr[i] * (buy ? -1 : 1)
    groups.push({
      i0: i,
      items: [
        { price: e, color: '#a77bff', label: 'Entrada' },
        { price: e + s, color: RED, label: 'Stop' },
        { price: e - s * 2, color: GREEN, label: 'TP1 1:2' },
        { price: e - s * 4, color: GREEN, label: 'TP2 1:4' },
        { price: e - s * 6, color: GREEN, label: 'TP3 1:6' },
      ],
    })
  }
  const st = structure(cs, 50)
  const segments = st.events.filter((e) => e.from > 0).map((e) => ({ i0: e.from, i1: e.i, price: e.price, color: e.bull ? GREEN : RED, dashed: true, label: 'CHoCH' }))
  const firstSig = markers.find((m) => m.i >= warm)
  return trim({
    name: 'Scanner MTM',
    candles: cs,
    lines: [
      { name: 'DEMA 15', color: BLUE, width: 0.05, z: 0.22, pts: d15 },
      { name: 'DEMA 50', color: GREEN, width: 0.05, z: 0.23, pts: d50 },
      { name: 'DEMA 238', color: '#ffce2b', width: 0.07, z: 0.24, pts: d238 },
      { name: 'POC', color: '#ff9a3c', width: 0.04, z: 0.26, step: true, pts: p },
    ],
    segments,
    markers,
    groups,
    captions: [
      { i: warm, text: 'Três DEMA (15, 50 e 238) mostram a tendência' },
      { i: warm + 12, text: 'A linha laranja é o POC: o preço com mais volume' },
      ...(firstSig ? [{ i: firstSig.i, text: 'O fecho cruza o POC: sinal de entrada' }] : []),
      ...(firstSig ? [{ i: firstSig.i + 4, text: 'Stop a 1 ATR e alvos a 1:2, 1:4 e 1:6' }] : []),
    ],
    legend: [{ color: BLUE, label: 'DEMA 15' }, { color: GREEN, label: 'DEMA 50' }, { color: '#ffce2b', label: 'DEMA 238' }, { color: '#ff9a3c', label: 'POC' }],
  }, warm)
}

// ───────────────────────── Aurum Flow · ORB ─────────────────────────
// Velas de 15 min. Caixas das sessões (Pre London, London, NYFX); a entrada é o rompimento da
// caixa a favor do regime, o stop fica na aresta oposta (com teto de risco) e há 4 alvos em R.
function aurumFlow() {
  const warm = 60
  const startHour = 12 // com warm = 60 velas de 15 min, a 1.ª vela visível abre às 03:00
  const cs = makeCandles(23, 2652, [
    { len: 72, drift: 0.0001, vol: 0.0012 },
    { len: 8, drift: 0.0002, vol: 0.0009 }, { len: 6, drift: 0.0, vol: 0.0011 }, { len: 6, drift: 0.0001, vol: 0.0012 },
    { len: 22, drift: 0.0016, vol: 0.0015 }, { len: 20, drift: -0.0004, vol: 0.0013 },
    { len: 8, drift: 0.0, vol: 0.0012 }, { len: 26, drift: -0.0017, vol: 0.0016 }, { len: 30, drift: 0.0002, vol: 0.0012 },
  ])
  const close = cs.map((b) => b.c)
  const atr = atrOf(cs, 14)
  const e50 = ema(close, 50)
  const hourAt = (i) => (startHour + i * 0.25) % 24
  const sessions = [{ name: 'PRE LONDON', a: 6, b: 7 }, { name: 'LONDON', a: 7, b: 8 }, { name: 'NYFX', a: 12.5, b: 13.5 }]
  const zones = []
  const markers = []
  const groups = []
  const captions = []
  for (let i = 1; i < cs.length; i++) {
    for (const s of sessions) {
      if (hourAt(i) !== s.a) continue
      const n = (s.b - s.a) * 4
      if (i + n >= cs.length) continue
      const win = cs.slice(i, i + n)
      const top = Math.max(...win.map((b) => b.h))
      const bot = Math.min(...win.map((b) => b.l))
      const end = Math.min(cs.length - 1, i + n + 40)
      zones.push({ i0: i, i1: end, top, bot, color: GOLD, opacity: 0.12, label: s.name, reveal: i, grow: i + n })
      for (let k = i + n; k < Math.min(cs.length, i + n + 120); k++) {
        const up = close[k] > top && close[k] > e50[k]
        const dn = close[k] < bot && close[k] < e50[k]
        if (!up && !dn) continue
        if (markers.some((m) => Math.abs(m.i - k) < 4)) break
        const e = close[k]
        let sl = up ? bot - 0.25 * atr[k] : top + 0.25 * atr[k]
        const cap = e * 0.035
        if (Math.abs(e - sl) > cap) sl = up ? e - cap : e + cap
        const R = e - sl
        markers.push({ i: k, price: up ? cs[k].l : cs[k].h, text: up ? 'ORB COMPRA' : 'ORB VENDA', color: up ? GREEN : RED, up })
        groups.push({
          i0: k,
          items: [
            { price: e, color: GOLD_L, label: 'Entrada' },
            { price: sl, color: RED, label: 'SL  −$10' },
            { price: e + R * 0.5, color: GREEN, label: 'TP1 0,5R  +$5' },
            { price: e + R * 1, color: GREEN, label: 'TP2 1R  +$10' },
            { price: e + R * 1.5, color: GREEN, label: 'TP3 1,5R  +$15' },
            { price: e + R * 2, color: GREEN, label: 'TP4 2R  +$20' },
          ],
        })
        if (k >= warm && captions.length < 4) {
          captions.push({ i: k, text: `Rompimento da caixa ${s.name} a favor da tendência` })
          captions.push({ i: k + 5, text: 'Stop na aresta oposta e 4 alvos em R, com o valor em $ para 1% de risco numa conta de 1000 USD' })
        }
        break
      }
    }
  }
  const firstBox = zones.find((z) => z.i0 >= warm)
  return trim({
    name: 'Aurum Flow',
    candles: cs,
    lines: [{ name: 'EMA de regime', color: '#7d7a72', width: 0.04, z: 0.2, pts: e50 }],
    zones,
    markers,
    groups,
    captions: [
      { i: warm, text: 'Velas de 15 minutos, no ouro ou num perpétuo cripto' },
      ...(firstBox ? [{ i: firstBox.i0, text: 'Abre a sessão: a caixa marca o máximo e o mínimo da range' }] : []),
      ...captions,
    ].sort((a, b) => a.i - b.i),
    legend: [{ color: GOLD, label: 'Caixas de sessão' }, { color: GREEN, label: 'Alvos TP1 a TP4' }, { color: RED, label: 'Stop' }],
  }, warm)
}

// ───────────────────────── TrendShot ─────────────────────────
// EMA 20/50/238 com sinal no cruzamento confirmado, tabela de tendência em 6 timeframes, POC,
// suporte e resistência por pivots e níveis TP1–TP4 (30%, 50%, 100% e 150% do stop).
function trendShot() {
  const warm = 260
  const cs = makeCandles(31, 42110, [
    { len: 180, drift: 0.0001, vol: 0.0016 }, { len: 80, drift: -0.0006, vol: 0.0017 },
    { len: 26, drift: -0.0012, vol: 0.0018 }, { len: 40, drift: 0.0018, vol: 0.0016 }, { len: 24, drift: 0.0001, vol: 0.0015 },
    { len: 30, drift: -0.0016, vol: 0.0018 }, { len: 40, drift: 0.0017, vol: 0.0016 },
  ])
  const close = cs.map((b) => b.c)
  const f = ema(close, 20), s = ema(close, 50), L = ema(close, 238)
  const atr = atrOf(cs, 14)
  const p = poc(cs, 30)
  const markers = []
  const groups = []
  for (let i = warm - 20; i < cs.length; i++) {
    const up = f[i] > s[i] && f[i - 1] <= s[i - 1]
    const dn = f[i] < s[i] && f[i - 1] >= s[i - 1]
    if (!up && !dn) continue
    markers.push({ i, price: up ? cs[i].l : cs[i].h, text: up ? 'BUY' : 'SELL', color: up ? GREEN : RED, up })
    const e = close[i], sl = atr[i] * 1.6 * (up ? -1 : 1)
    groups.push({
      i0: i,
      items: [
        { price: e, color: GOLD_L, label: 'Entrada' },
        { price: e + sl, color: RED, label: 'SL' },
        { price: e - sl * 0.3, color: GREEN, label: 'TP1' },
        { price: e - sl * 0.5, color: GREEN, label: 'TP2' },
        { price: e - sl * 1.0, color: GREEN, label: 'TP3' },
        { price: e - sl * 1.5, color: GREEN, label: 'TP4' },
      ],
    })
  }
  // Pivots → zonas de suporte e resistência (altura limitada pelo ATR).
  const zones = []
  const look = 12
  for (let i = warm - 40; i < cs.length - look; i++) {
    const win = cs.slice(i - look, i + look + 1)
    if (cs[i].h === Math.max(...win.map((b) => b.h))) zones.push({ i0: i, i1: Math.min(cs.length - 1, i + 70), top: cs[i].h, bot: cs[i].h - atr[i] * 0.5, color: RED, opacity: 0.16, reveal: i + look, label: 'R' })
    if (cs[i].l === Math.min(...win.map((b) => b.l))) zones.push({ i0: i, i1: Math.min(cs.length - 1, i + 70), top: cs[i].l + atr[i] * 0.5, bot: cs[i].l, color: GREEN, opacity: 0.16, reveal: i + look, label: 'S' })
  }
  // Tabela de tendência: EMA rápida contra lenta em séries reamostradas.
  const tfs = [['M1', 1], ['M5', 2], ['M15', 4], ['M30', 8], ['H1', 16], ['H4', 32]]
  const rows = tfs.map(([label, k]) => {
    const res = []
    for (let i = 0; i < cs.length; i += k) res.push(close[Math.min(cs.length - 1, i + k - 1)])
    const a = ema(res, 20), b = ema(res, 50)
    return { label, states: cs.map((_, i) => (a[Math.floor(i / k)] > b[Math.floor(i / k)] ? 'Alta' : 'Baixa')) }
  })
  rows.push({ label: 'POC', states: cs.map((_, i) => (close[i] > p[i] ? 'Acima' : 'Abaixo')) })
  const first = markers.find((m) => m.i >= warm)
  return trim({
    name: 'TrendShot',
    candles: cs,
    lines: [
      { name: 'EMA 20', color: BLUE, width: 0.05, z: 0.22, pts: f },
      { name: 'EMA 50', color: '#ff9a3c', width: 0.05, z: 0.23, pts: s },
      { name: 'EMA 238', color: GOLD, width: 0.07, z: 0.24, pts: L },
    ],
    zones,
    markers,
    groups,
    panel: { title: 'Tendência por timeframe', rows },
    captions: [
      { i: warm, text: 'EMAs de 20, 50 e 238 e uma tabela com a tendência em 6 timeframes' },
      { i: warm + 14, text: 'Zonas de suporte e resistência a partir dos pivots' },
      ...(first ? [{ i: first.i, text: 'Cruzamento confirmado das EMAs: sinal' }] : []),
      ...(first ? [{ i: first.i + 4, text: 'Entrada, stop e até quatro alvos projetados no gráfico' }] : []),
    ],
    legend: [{ color: BLUE, label: 'EMA 20' }, { color: '#ff9a3c', label: 'EMA 50' }, { color: GOLD, label: 'EMA 238' }],
  }, warm)
}

// ───────────────────────── Sensei ─────────────────────────
// Confluência: DEMA, POC, banda Sensei (89, 1σ), estrutura SMC, ADX anti-chop e fecho de vela.
// Só sinaliza quando todas concordam; 4 saídas em R e stop para breakeven depois da 1.ª.
function adx(cs, len) {
  const plus = [0], minus = [0]
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i].h - cs[i - 1].h, dn = cs[i - 1].l - cs[i].l
    plus.push(up > dn && up > 0 ? up : 0)
    minus.push(dn > up && dn > 0 ? dn : 0)
  }
  const tr = rma(trueRange(cs), len)
  const p = rma(plus, len).map((x, i) => (100 * x) / (tr[i] || 1))
  const m = rma(minus, len).map((x, i) => (100 * x) / (tr[i] || 1))
  return rma(p.map((x, i) => (100 * Math.abs(x - m[i])) / (x + m[i] || 1)), len)
}
function sensei() {
  const warm = 260
  const cs = makeCandles(47, 2398, [
    { len: 170, drift: 0.0001, vol: 0.0022 }, { len: 90, drift: -0.0007, vol: 0.0022 },
    { len: 30, drift: -0.0006, vol: 0.0022 }, { len: 22, drift: 0.0003, vol: 0.002 }, { len: 46, drift: 0.0024, vol: 0.0019 },
    { len: 22, drift: -0.0002, vol: 0.002 }, { len: 40, drift: 0.0019, vol: 0.0019 },
  ])
  const close = cs.map((b) => b.c)
  const d15 = dema(close, 15), d50 = dema(close, 50), d238 = dema(close, 238)
  const p = poc(cs, 14)
  const mid = ema(close, 89)
  const sd = stdev(close, 89)
  const up = mid.map((m, i) => m + sd[i]), lo = mid.map((m, i) => m - sd[i])
  const st = structure(cs, 30)
  const ax = adx(cs, 14)
  const atr = atrOf(cs, 14)
  const checks = [
    ['DEMA 15 acima da 50', (i) => d15[i] > d50[i]],
    ['DEMA 50 acima da 238', (i) => d50[i] > d238[i]],
    ['Preço acima do POC', (i) => close[i] > p[i]],
    ['Acima da banda Sensei', (i) => close[i] > mid[i]],
    ['Estrutura em alta (CHoCH)', (i) => st.trend[i] === 1],
    ['ADX acima de 15', (i) => ax[i] > 15],
  ]
  const rows = checks.map(([label, fn]) => ({ label, states: cs.map((_, i) => (fn(i) ? 'ok' : '–')) }))
  const markers = []
  const groups = []
  let was = true
  let firstSig = null
  for (let i = warm - 10; i < cs.length; i++) {
    const all = checks.every(([, fn]) => fn(i))
    if (all && !was && !groups.length) {
      const e = close[i], R = atr[i] * 1.5
      markers.push({ i, price: cs[i].l, text: 'SENSEI COMPRA', color: GREEN, up: true })
      // Primeira vela que toca o TP1: o stop passa para breakeven.
      let hit = null
      for (let k = i + 1; k < cs.length; k++) if (cs[k].h >= e + R * 1.5) { hit = k; break }
      groups.push({
        i0: i,
        items: [
          { price: e, color: GOLD_L, label: 'Entrada' },
          { price: e - R, color: RED, label: 'SL', to: hit ?? undefined },
          ...(hit ? [{ price: e, color: GOLD_L, label: 'SL em BE', from: hit }] : []),
          { price: e + R * 1.5, color: GREEN, label: 'Exit 1  1:1,5' },
          { price: e + R * 2.5, color: GREEN, label: 'Exit 2  1:2,5' },
          { price: e + R * 4, color: GREEN, label: 'Exit 3  1:4' },
          { price: e + R * 6, color: GREEN, label: 'Exit 4  1:6' },
        ],
      })
      firstSig = { i, hit }
    }
    was = all
  }
  const segments = st.events.filter((e) => e.from > warm - 60).map((e) => ({ i0: e.from, i1: e.i, price: e.price, color: e.bull ? GREEN : RED, dashed: true, label: e.bull ? 'CHoCH' : 'CHoCH' }))
  return trim({
    name: 'Sensei',
    candles: cs,
    lines: [
      { name: 'DEMA 15', color: BLUE, width: 0.045, z: 0.22, pts: d15 },
      { name: 'DEMA 50', color: GREEN, width: 0.045, z: 0.23, pts: d50 },
      { name: 'DEMA 238', color: '#ffce2b', width: 0.06, z: 0.24, pts: d238 },
      { name: 'POC', color: '#ff9a3c', width: 0.035, z: 0.26, step: true, pts: p },
    ],
    areas: [{ upper: up, lower: lo, color: GOLD, opacity: 0.1, z: 0.05 }],
    segments,
    markers,
    groups,
    panel: { title: 'Confirmações', rows },
    captions: [
      { i: warm, text: 'O Sensei junta várias leituras no mesmo gráfico' },
      { i: warm + 10, text: 'A nuvem dourada é a banda Sensei (média de 89 ± 1 desvio)' },
      ...(firstSig ? [{ i: firstSig.i - 6, text: 'As confirmações vão acendendo no painel' }] : []),
      ...(firstSig ? [{ i: firstSig.i, text: 'Todas de acordo: sinal Sensei' }] : []),
      ...(firstSig ? [{ i: firstSig.i + 2, text: 'Quatro saídas em R: 1:1,5, 1:2,5, 1:4 e 1:6' }] : []),
      ...(firstSig?.hit ? [{ i: firstSig.hit, text: 'Exit 1 tocado: o stop passa para breakeven' }] : []),
    ],
    legend: [{ color: GOLD, label: 'Banda Sensei' }, { color: '#ff9a3c', label: 'POC' }, { color: '#ffce2b', label: 'DEMA 238' }],
  }, warm)
}

// ───────────────────────── Premium Scanner ─────────────────────────
// Ouro em 15 min, nas sessões de Ásia, Londres e Nova Iorque. Cada vela vota a direção com 5
// critérios (abertura da sessão, há 1 h, há 4 h, EMA200, EMA9); com maioria, desenha a zona de
// entrada 4 $ em recuo, com 5 $ de largura, o stop 5 $ para lá dela e TP1–TP3 a 5, 10 e 15 $.
function premiumScanner() {
  const warm = 220
  const startHour = 0 // vela 0 abre às 00:00; com warm = 220 a 1.ª vela visível abre às 07:00 do 3.º dia
  const cs = makeCandles(61, 3985, [
    { len: 200, drift: 0.00002, vol: 0.0011 }, { len: 24, drift: -0.0001, vol: 0.001 },
    { len: 30, drift: 0.0005, vol: 0.0011 }, { len: 26, drift: 0.0, vol: 0.001 },
    { len: 40, drift: -0.0007, vol: 0.0011 }, { len: 40, drift: 0.0004, vol: 0.001 },
  ])
  const close = cs.map((b) => b.c)
  const e200 = ema(close, 200), e9 = ema(close, 9)
  const hourAt = (i) => (startHour + i * 0.25) % 24
  const sessions = [{ name: 'ÁSIA', a: 0, b: 6 }, { name: 'LONDRES', a: 7, b: 11 }, { name: 'NOVA IORQUE', a: 13, b: 16 }]
  const sessOf = (i) => sessions.find((s) => hourAt(i) >= s.a && hourAt(i) < s.b)
  // Abertura da sessão em curso para cada vela.
  const abertura = []
  for (let i = 0; i < cs.length; i++) {
    const s = sessOf(i)
    abertura.push(!s ? NaN : hourAt(i) === s.a || isNaN(abertura[i - 1] ?? NaN) ? cs[i].o : abertura[i - 1])
  }
  const checks = [
    ['Abertura da sessão', (i) => close[i] > abertura[i]],
    ['Há 1 h', (i) => close[i] > close[Math.max(0, i - 4)]],
    ['Há 4 h', (i) => close[i] > close[Math.max(0, i - 16)]],
    ['EMA200', (i) => close[i] > e200[i]],
    ['EMA9', (i) => close[i] > e9[i]],
  ]
  const rows = checks.map(([label, fn]) => ({ label, states: cs.map((_, i) => (sessOf(i) ? (fn(i) ? 'Alta' : 'Baixa') : '–')) }))
  const zones = []
  for (let i = 0; i < cs.length; i++) {
    const s = sessOf(i)
    if (!s || hourAt(i) !== s.a) continue
    const n = (s.b - s.a) * 4
    const win = cs.slice(i, Math.min(cs.length, i + n))
    zones.push({ i0: i, i1: Math.min(cs.length - 1, i + n - 1), top: Math.max(...win.map((b) => b.h)), bot: Math.min(...win.map((b) => b.l)), color: GOLD, opacity: 0.06, label: s.name, reveal: i, grow: i + n - 1 })
  }
  const markers = []
  const groups = []
  const usadas = new Set()
  for (let i = warm + 10; i < cs.length - 8; i++) {
    const s = sessOf(i)
    if (!s || hourAt(i) - s.a < 1) continue
    if (markers.length && i - markers[markers.length - 1].i < 16) continue
    const chave = `${s.name}-${Math.floor(i / 96)}`
    if (usadas.has(chave)) continue // na demonstração, um sinal por sessão
    const voto = checks.reduce((acc, [, fn]) => acc + (fn(i) ? 1 : -1), 0)
    if (Math.abs(voto) < 3) continue // maioria clara para a demonstração ler bem
    const up = voto > 0, sg = up ? 1 : -1
    const meio = close[i] - sg * 4
    const perto = meio + sg * 2.5, longe = meio - sg * 2.5
    const sl = longe - sg * 5
    const tps = [5, 10, 15].map((d) => perto + sg * d)
    // A ordem é limite: só conta se o preço voltar à zona na hora seguinte.
    let fill = null
    for (let k = i + 1; k <= Math.min(cs.length - 1, i + 4); k++) if (up ? cs[k].l <= perto : cs[k].h >= perto) { fill = k; break }
    if (fill == null) continue
    usadas.add(chave)
    let hit = null
    for (let k = fill + 1; k < Math.min(cs.length, fill + 60); k++) {
      if (up ? cs[k].l <= sl : cs[k].h >= sl) break
      if (up ? cs[k].h >= tps[0] : cs[k].l <= tps[0]) { hit = k; break }
    }
    markers.push({ i, price: up ? cs[i].l : cs[i].h, text: up ? 'PREMIUM COMPRA' : 'PREMIUM VENDA', color: up ? GREEN : RED, up })
    zones.push({ i0: i, i1: Math.min(cs.length - 1, i + 20), top: Math.max(perto, longe), bot: Math.min(perto, longe), color: GOLD_L, opacity: 0.28, reveal: i, entry: true })
    groups.push({
      i0: i,
      fill,
      items: [
        { price: meio, color: GOLD_L, label: 'Entrada' },
        { price: sl, color: RED, label: 'SL', to: hit ?? undefined },
        ...(hit ? [{ price: meio, color: GOLD_L, label: 'SL em BE', from: hit }] : []),
        { price: tps[0], color: GREEN, label: 'TP1  50%' },
        { price: tps[1], color: GREEN, label: 'TP2  25%' },
        { price: tps[2], color: GREEN, label: 'TP3  25%' },
      ],
    })
  }
  const first = groups.find((g) => g.i0 >= warm)
  const be = first?.items.find((it) => it.from != null)
  // Na demonstração tudo acontece em poucas velas: afasta as legendas para darem tempo de leitura.
  const espacar = (lista) => lista.reduce((acc, c) => [...acc, { ...c, i: acc.length ? Math.max(c.i, acc[acc.length - 1].i + 3) : c.i }], [])
  return trim({
    name: 'Premium Scanner',
    candles: cs,
    lines: [
      { name: 'EMA9', color: BLUE, width: 0.04, z: 0.22, pts: e9 },
      { name: 'EMA200', color: GOLD, width: 0.06, z: 0.24, pts: e200 },
    ],
    zones,
    markers,
    groups,
    panel: { title: 'Voto da direção', rows },
    captions: espacar([
      { i: warm, text: 'Ouro em 15 minutos, nas sessões de Ásia, Londres e Nova Iorque' },
      { i: warm + 5, text: 'Cada vela vota a direção com cinco critérios' },
      ...(first ? [{ i: first.i0, text: 'Maioria de acordo: sinal Premium' }] : []),
      ...(first ? [{ i: first.i0 + 1, text: 'Zona de entrada em recuo, stop e três alvos no gráfico' }] : []),
      ...(first && first.fill > first.i0 + 1 ? [{ i: first.fill, text: 'O preço volta à zona e a ordem entra' }] : []),
      ...(be && be.from > (first?.fill ?? 0) ? [{ i: be.from, text: 'TP1 tocado: o stop passa para a entrada' }] : []),
    ]),
    legend: [{ color: GOLD_L, label: 'Zona de entrada' }, { color: GOLD, label: 'EMA200' }, { color: BLUE, label: 'EMA9' }],
  }, warm)
}

// ───────────────────────── DEFY ─────────────────────────
// Bandas de exaustão (interior 1,382 · média 2 · exterior 2,618 desvios) à volta de uma média
// suave, nuvem rápida/lenta e níveis-chave. Uma ideia nasce quando o preço estica até às bandas,
// vira com uma vela forte que fecha para lá da vela anterior e junta pelo menos 6 confirmações.
// Plano fixo na vela de sinal: entrada no fecho, WARNING no extremo da vela, SL 1 ATR para lá e
// alvos a 1R, 2R e 3R.
function defy() {
  const warm = 240
  const cs = makeCandles(83, 1.0845, [
    { len: 200, drift: 0.0, vol: 0.0007 }, { len: 40, drift: 0.00012, vol: 0.0007 },
    { len: 36, drift: 0.0004, vol: 0.0008 }, { len: 34, drift: -0.0006, vol: 0.0008 },
    { len: 30, drift: 0.0005, vol: 0.0008 }, { len: 40, drift: -0.0001, vol: 0.0007 },
  ])
  const close = cs.map((b) => b.c)
  const hlc3 = cs.map((b) => (b.h + b.l + b.c) / 3)
  const len = 55
  const basis = ema(hlc3, len)
  const dev = ema(stdev(hlc3, len), 5)
  const band = (m) => basis.map((b, i) => b + dev[i] * m)
  const up1 = band(1.382), up2 = band(2), up3 = band(2.618)
  const lo1 = band(-1.382), lo2 = band(-2), lo3 = band(-2.618)
  const fast = ema(close, 8), slow = ema(close, 21)
  const atr = atrOf(cs, 14)
  const vAvg = sma(cs.map((b) => b.v), 20)
  const body = cs.map((b) => Math.abs(b.c - b.o))
  const bAvg = sma(body, 20)
  // Níveis-chave: pivots de 10 velas, espaçados entre si.
  const zones = []
  const look = 10
  for (let i = warm - 120; i < cs.length - look; i++) {
    const win = cs.slice(i - look, i + look + 1)
    const isH = cs[i].h === Math.max(...win.map((b) => b.h))
    const isL = cs[i].l === Math.min(...win.map((b) => b.l))
    if (!isH && !isL) continue
    const px = isH ? cs[i].h : cs[i].l
    if (zones.some((z) => Math.abs((z.top + z.bot) / 2 - px) < atr[i] * 2.5)) continue
    zones.push({ i0: i, i1: cs.length - 1, top: px + atr[i] * 0.25, bot: px - atr[i] * 0.25, color: isH ? RED : BLUE, opacity: 0.14, reveal: i + look, level: true })
  }
  const nearLevel = (i, px) => zones.some((z) => z.reveal <= i && px >= z.bot - atr[i] * 0.3 && px <= z.top + atr[i] * 0.3)
  const touch = (i, arr, dir) => { for (let k = Math.max(0, i - 5); k <= i; k++) if (dir > 0 ? cs[k].l <= arr[k] : cs[k].h >= arr[k]) return true; return false }
  const checksFor = (dir) => [
    ['Toque na banda interior', (i) => touch(i, dir > 0 ? lo1 : up1, dir)],
    ['Toque na banda média', (i) => touch(i, dir > 0 ? lo2 : up2, dir)],
    ['Toque na banda exterior', (i) => touch(i, dir > 0 ? lo3 : up3, dir)],
    ['Nível-chave por perto', (i) => nearLevel(i, dir > 0 ? cs[i].l : cs[i].h)],
    ['Vela forte a favor', (i) => (cs[i].c - cs[i].o) * dir > 0 && body[i] >= bAvg[i]],
    ['Volume acima da média', (i) => cs[i].v > vAvg[i]],
    ['Momento a virar', (i) => (close[i] - close[i - 3]) * dir > 0],
    ['Rejeição com pavio', (i) => (dir > 0 ? Math.min(cs[i].o, cs[i].c) - cs[i].l : cs[i].h - Math.max(cs[i].o, cs[i].c)) > body[i] * 0.4],
  ]
  const buyChecks = checksFor(1), sellChecks = checksFor(-1)
  const markers = []
  const groups = []
  let last = -99
  for (let i = warm - 40; i < cs.length - 2; i++) {
    if (i - last < 12) continue
    for (const dir of [1, -1]) {
      const breaks = dir > 0 ? cs[i].c > Math.max(cs[i - 1].h, cs[i - 2].h) : cs[i].c < Math.min(cs[i - 1].l, cs[i - 2].l)
      if (!breaks) continue
      const checks = dir > 0 ? buyChecks : sellChecks
      if (!checks[0][1](i)) continue // sem esticão até à banda interior não há ideia
      const n = checks.filter(([, fn]) => fn(i)).length
      const score = 3 + n
      if (score < 6) continue
      const stars = score >= 10 ? 3 : score >= 8 ? 2 : 1
      const e = close[i], w = dir > 0 ? cs[i].l : cs[i].h
      const sl = w - dir * atr[i]
      const R = Math.abs(e - sl)
      markers.push({ i, price: dir > 0 ? cs[i].l : cs[i].h, text: `+${score} ${'★'.repeat(stars)}`, color: dir > 0 ? BLUE : RED, up: dir > 0 })
      groups.push({
        i0: i,
        dir,
        items: [
          { price: e, color: GOLD_L, label: 'Entrada' },
          { price: w, color: '#ff9a3c', label: 'Warning' },
          { price: sl, color: RED, label: 'SL' },
          { price: e + dir * R, color: GREEN, label: 'TP1  1R' },
          { price: e + dir * R * 2, color: GREEN, label: 'TP2  2R' },
          { price: e + dir * R * 3, color: GREEN, label: 'TP3  3R' },
        ],
      })
      last = i
      break
    }
  }
  const rows = buyChecks.map(([label], k) => ({ label, states: cs.map((_, i) => (i > 2 && (buyChecks[k][1](i) || sellChecks[k][1](i)) ? 'ok' : '–')) }))
  const first = groups.find((g) => g.i0 >= warm)
  const second = groups.find((g) => first && g.i0 > first.i0)
  const espacar = (lista) => lista.reduce((acc, c) => [...acc, { ...c, i: acc.length ? Math.max(c.i, acc[acc.length - 1].i + 3) : c.i }], [])
  return trim({
    name: 'DEFY',
    candles: cs,
    lines: [
      { name: 'Centro', color: GREY, width: 0.03, z: 0.2, pts: basis },
      { name: 'Banda interior', color: RED, width: 0.03, z: 0.21, pts: up1 },
      { name: 'Banda interior baixa', color: BLUE, width: 0.03, z: 0.21, pts: lo1 },
      { name: 'Nuvem rápida', color: GOLD, width: 0.05, z: 0.23, pts: fast },
      { name: 'Nuvem lenta', color: GOLD_L, width: 0.035, z: 0.22, pts: slow },
    ],
    areas: [
      { upper: up3, lower: up2, color: RED, opacity: 0.22, z: 0.05 },
      { upper: lo2, lower: lo3, color: BLUE, opacity: 0.22, z: 0.05 },
    ],
    zones,
    markers,
    groups,
    panel: { title: 'Confirmações', rows },
    captions: espacar([
      { i: warm, text: 'Bandas de exaustão à volta de uma média suave' },
      { i: warm + 8, text: 'Níveis-chave: onde o preço já reagiu antes' },
      ...(first ? [{ i: first.i0 - 4, text: 'O preço estica até às bandas e as confirmações somam-se' }] : []),
      ...(first ? [{ i: first.i0, text: 'Vela forte a virar: nasce a ideia, com a pontuação e as estrelas' }] : []),
      ...(first ? [{ i: first.i0 + 2, text: 'Entrada, Warning, stop a 1 ATR e alvos a 1R, 2R e 3R' }] : []),
      ...(second ? [{ i: second.i0, text: 'Do outro lado, a mesma leitura dá a ideia contrária' }] : []),
    ]),
    legend: [{ color: RED, label: 'Bandas de cima' }, { color: BLUE, label: 'Bandas de baixo' }, { color: GOLD, label: 'Nuvem DEFY' }],
  }, warm)
}

// ───────────────────────── RocketNova ─────────────────────────
// EMA 20/50/238 com sinal no cruzamento confirmado, mas só com uma «estrela de lançamento» recente
// (mínimo de swing para a compra, máximo para a venda; Depth/Deviation/Backstep). Rocket Candle
// (corpo >= 1,2 ATR a fechar no extremo), pulso de volatilidade (ATR contra a média) e Trade Clock.
// Plano fixo na vela do sinal: Entry, SL e TP1–TP4 (30 %, 50 %, 100 % e 150 % do stop); depois do
// TP1 o stop passa para a entrada; um sinal contrário fecha a trade.
function rocketNova() {
  const warm = 260
  const cs = makeCandles(57, 2386, [
    { len: 190, drift: 0.0001, vol: 0.0015 }, { len: 60, drift: -0.0007, vol: 0.0016 },
    { len: 22, drift: -0.0013, vol: 0.0018 }, { len: 46, drift: 0.0017, vol: 0.0015 }, { len: 26, drift: 0.0001, vol: 0.0014 },
    { len: 28, drift: -0.0016, vol: 0.0017 }, { len: 44, drift: 0.0015, vol: 0.0015 },
  ])
  const close = cs.map((b) => b.c)
  const f = ema(close, 20), s = ema(close, 50), L = ema(close, 238)
  const atr = atrOf(cs, 14)
  const atrAvg = sma(atr, 100)
  const vAvg = sma(cs.map((b) => b.v), 20)
  // Estrelas: pivots com Depth 34 à esquerda e Backstep 8 à direita; Deviation 1,3 ATR face à estrela contrária.
  const depth = 34, back = 8
  const stars = []
  let lastHi = NaN, lastLo = NaN
  for (let i = depth; i < cs.length - back; i++) {
    const left = cs.slice(i - depth, i), right = cs.slice(i + 1, i + 1 + back)
    const isH = cs[i].h > Math.max(...left.map((b) => b.h), ...right.map((b) => b.h))
    const isL = cs[i].l < Math.min(...left.map((b) => b.l), ...right.map((b) => b.l))
    const dev = atr[i] * 1.3
    if (isH && (isNaN(lastLo) || cs[i].h - lastLo >= dev)) { stars.push({ i, reveal: i + back, price: cs[i].h, up: false }); lastHi = cs[i].h }
    if (isL && (isNaN(lastHi) || lastHi - cs[i].l >= dev)) { stars.push({ i, reveal: i + back, price: cs[i].l, up: true }); lastLo = cs[i].l }
  }
  const rocket = cs.map((b, i) => {
    const body = Math.abs(b.c - b.o), rng = b.h - b.l
    return rng > 0 && body >= atr[i] * 1.2 && (b.c > b.o ? b.h - b.c : b.c - b.l) <= rng * 0.3
  })
  const starOk = (i, up) => stars.some((st) => st.up === up && st.reveal <= i && i - st.reveal <= 40)
  const markers = stars.map((st) => ({ i: st.reveal, price: st.price, text: '✦', color: st.up ? GREEN : RED, up: st.up, small: true }))
  const groups = []
  let open = null
  for (let i = warm - 20; i < cs.length; i++) {
    const up = f[i] > s[i] && f[i - 1] <= s[i - 1]
    const dn = f[i] < s[i] && f[i - 1] >= s[i - 1]
    if (!up && !dn) continue
    if (!starOk(i, up)) continue
    const dir = up ? 1 : -1
    if (open && open.dir !== dir) open.exit = i // sinal contrário fecha a trade anterior
    markers.push({ i, price: up ? cs[i].l : cs[i].h, text: up ? 'BUY' : 'SELL', color: up ? GREEN : RED, up })
    const e = close[i], R = atr[i] * 1.6
    const sl = e - dir * R
    // Primeira vela que toca o TP1: o stop passa para a entrada.
    let hit = null
    for (let k = i + 1; k < cs.length; k++) if (dir > 0 ? cs[k].h >= e + R * 0.3 : cs[k].l <= e - R * 0.3) { hit = k; break }
    const g = {
      i0: i,
      dir,
      items: [
        { price: e, color: GOLD_L, label: 'Entrada' },
        { price: sl, color: RED, label: 'SL', to: hit ?? undefined },
        ...(hit ? [{ price: e, color: GOLD_L, label: 'SL em BE', from: hit }] : []),
        { price: e + dir * R * 0.3, color: GREEN, label: 'TP1' },
        { price: e + dir * R * 0.5, color: GREEN, label: 'TP2' },
        { price: e + dir * R * 1.0, color: GREEN, label: 'TP3' },
        { price: e + dir * R * 1.5, color: GREEN, label: 'TP4' },
      ],
    }
    groups.push(g)
    open = g
  }
  const rows = [
    { label: 'EMA 20 acima da 50', states: cs.map((_, i) => (f[i] > s[i] ? 'Alta' : 'Baixa')) },
    { label: 'Estrela de lançamento', states: cs.map((_, i) => (starOk(i, f[i] > s[i]) ? 'ok' : '–')) },
    { label: 'Rocket Candle', states: cs.map((_, i) => (rocket.slice(Math.max(0, i - 4), i + 1).some(Boolean) ? 'ok' : '–')) },
    { label: 'Volatility Pulse', states: cs.map((_, i) => (atr[i] >= atrAvg[i] * 1.3 ? 'Alta' : atr[i] <= atrAvg[i] * 0.7 ? 'Baixa' : 'Normal')) },
    { label: 'Trade Clock', states: cs.map((b, i) => (b.v < vAvg[i] * 0.5 ? 'Low Volume' : 'Good Volume')) },
  ]
  const first = groups.find((g) => g.i0 >= warm)
  const firstStar = markers.find((m) => m.small && m.i >= warm)
  return trim({
    name: 'RocketNova',
    candles: cs,
    rocket,
    lines: [
      { name: 'EMA 20', color: RED, width: 0.05, z: 0.22, pts: f },
      { name: 'EMA 50', color: BLUE, width: 0.05, z: 0.23, pts: s },
      { name: 'EMA 238', color: '#ff9a3c', width: 0.07, z: 0.24, pts: L },
    ],
    zones: [],
    markers,
    groups,
    panel: { title: 'RocketNova', rows },
    captions: [
      { i: warm, text: 'EMAs de 20, 50 e 238: a tendência em três horizontes' },
      ...(firstStar ? [{ i: firstStar.i, text: 'As estrelas marcam os máximos e mínimos de swing: a rampa de lançamento' }] : []),
      ...(first ? [{ i: first.i0, text: 'Cruzamento confirmado com estrela recente: sinal RocketNova' }] : []),
      ...(first ? [{ i: first.i0 + 3, text: 'Entrada, stop e TP1 a TP4 fixos na vela do sinal' }] : []),
      ...(first ? [{ i: first.i0 + 9, text: 'TP1 tocado: o stop passa para a entrada' }] : []),
    ],
    legend: [{ color: RED, label: 'EMA 20' }, { color: BLUE, label: 'EMA 50' }, { color: '#ff9a3c', label: 'EMA 238' }],
  }, warm)
}

// ───────────────────────── Quantum ─────────────────────────
// Seguidor de tendência com entradas em recuo (docs/pine/mtm-quantum.pine). Linha primária (EMA 269)
// azul/vermelha pela fase (duas velas do mesmo lado); seta grande na viragem; fita EMA 8/21; triângulo
// de recuo (toque na fita + fecho a favor); ponto de onda (Stoch RSI 14/5 a sair da zona 20/80 na
// direção da fase); bandas 2σ/3σ; painel de força (score 0–100). Gestão MTM: stop para lá do extremo
// do recuo, alvo a 2R.
function rsiOf(src, len) {
  const up = src.map((x, i) => (i === 0 ? 0 : Math.max(0, x - src[i - 1])))
  const dn = src.map((x, i) => (i === 0 ? 0 : Math.max(0, src[i - 1] - x)))
  const au = rma(up, len), ad = rma(dn, len)
  return au.map((u, i) => (ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])))
}
function quantum() {
  const warm = 300
  const cs = makeCandles(41, 1.6475, [
    { len: 150, drift: 0.00004, vol: 0.0009 }, { len: 100, drift: 0.00022, vol: 0.0009 },
    { len: 50, drift: 0.0006, vol: 0.0009 }, { len: 14, drift: -0.0007, vol: 0.001 }, { len: 34, drift: 0.0006, vol: 0.0009 },
    { len: 12, drift: -0.0008, vol: 0.001 }, { len: 30, drift: 0.0006, vol: 0.0009 },
    { len: 50, drift: -0.0008, vol: 0.0011 }, { len: 12, drift: 0.0007, vol: 0.001 }, { len: 36, drift: -0.0007, vol: 0.001 },
  ])
  const close = cs.map((b) => b.c)
  const prim = ema(close, 269)
  const e8 = ema(close, 8), e21 = ema(close, 21)
  const rsi = rsiOf(close, 14)
  const k = rsi.map((_, i) => { const w = rsi.slice(Math.max(0, i - 4), i + 1); const lo = Math.min(...w), hi = Math.max(...w); return hi === lo ? 50 : ((rsi[i] - lo) / (hi - lo)) * 100 })
  const bbB = sma(close, 20), bbD = stdev(close, 20)
  const bb1U = bbB.map((b, i) => b + 2 * bbD[i]), bb1L = bbB.map((b, i) => b - 2 * bbD[i])
  const bb2U = bbB.map((b, i) => b + 3 * bbD[i]), bb2L = bbB.map((b, i) => b - 3 * bbD[i])
  // Fase: duas velas seguidas do mesmo lado da linha primária.
  const fase = []
  let f = 0
  for (let i = 0; i < cs.length; i++) {
    if (i > 0 && close[i] > prim[i] && close[i - 1] > prim[i - 1]) f = 1
    if (i > 0 && close[i] < prim[i] && close[i - 1] < prim[i - 1]) f = -1
    fase.push(f)
  }
  // Painel de força: quatro «timeframes» aproximados por pares de médias mais longas.
  const pares = [[8, 21], [21, 55], [34, 89], [55, 144]].map(([a, b]) => [ema(close, a), ema(close, b)])
  const score = cs.map((_, i) => Math.round(50 + (50 / pares.length) * pares.reduce((s, [fa, sl]) => s + (close[i] > fa[i] ? 0.5 : -0.5) + (fa[i] > sl[i] ? 0.5 : -0.5), 0)))
  const touchUp = (i) => cs[i].l <= e21[i] || cs[i - 1].l <= e21[i - 1]
  const touchDn = (i) => cs[i].h >= e21[i] || cs[i - 1].h >= e21[i - 1]
  const markers = []
  const groups = []
  let lastEntry = -99
  for (let i = 2; i < cs.length; i++) {
    const bull = fase[i] === 1, bear = fase[i] === -1
    if (bull && fase[i - 1] !== 1) markers.push({ i, price: cs[i].l, text: '▲ Fase', color: BLUE, up: true })
    if (bear && fase[i - 1] !== -1) markers.push({ i, price: cs[i].h, text: '▼ Fase', color: RED, up: false })
    const pbUp = bull && touchUp(i) && close[i] > e8[i] && close[i] > cs[i].o
    const pbDn = bear && touchDn(i) && close[i] < e8[i] && close[i] < cs[i].o
    const dotUp = bull && k[i] > 20 && k[i - 1] <= 20
    const dotDn = bear && k[i] < 80 && k[i - 1] >= 80
    if (pbUp) markers.push({ i, price: cs[i].l, text: '▲', color: BLUE, up: true, small: true, kind: 'tri' })
    if (pbDn) markers.push({ i, price: cs[i].h, text: '▼', color: RED, up: false, small: true, kind: 'tri' })
    if (dotUp) markers.push({ i, price: cs[i].l, text: '●', color: BLUE, up: true, small: true, kind: 'dot' })
    if (dotDn) markers.push({ i, price: cs[i].h, text: '●', color: RED, up: false, small: true, kind: 'dot' })
    const entUp = (pbUp || dotUp) && score[i] > 60
    const entDn = (pbDn || dotDn) && score[i] <= 40
    if ((entUp || entDn) && i - lastEntry >= 14) {
      const dir = entUp ? 1 : -1
      const e = close[i]
      const sl = dir > 0 ? Math.min(...cs.slice(i - 9, i + 1).map((b) => b.l)) : Math.max(...cs.slice(i - 9, i + 1).map((b) => b.h))
      const R = Math.abs(e - sl)
      groups.push({ i0: i, dir, forte: dir > 0 ? pbUp && dotUp : pbDn && dotDn, items: [
        { price: e, color: GOLD_L, label: 'Entrada' },
        { price: sl, color: RED, label: 'SL' },
        { price: e + dir * R * 2, color: GREEN, label: 'Alvo 2R' },
      ] })
      lastEntry = i
    }
  }
  const primUp = prim.map((v, i) => (fase[i] === 1 ? v : null))
  const primDn = prim.map((v, i) => (fase[i] === -1 ? v : null))
  const rows = [
    { label: 'Fase', states: fase.map((v) => (v === 1 ? 'Alta' : v === -1 ? 'Baixa' : '–')) },
    { label: 'Score', states: score.map((v) => (v > 60 ? 'Alta' : v <= 40 ? 'Baixa' : '–')) },
    { label: 'Recuo à fita', states: cs.map((_, i) => (i > 1 && (fase[i] === 1 ? touchUp(i) : fase[i] === -1 ? touchDn(i) : false) ? 'ok' : '–')) },
    { label: 'Oscilador na zona', states: k.map((v, i) => ((fase[i] === 1 && v <= 20) || (fase[i] === -1 && v >= 80) ? 'ok' : '–')) },
    { label: 'Sinal de entrada', states: cs.map((_, i) => (markers.some((m) => m.small && m.i === i) ? 'ok' : '–')) },
  ]
  const flip = markers.find((m) => !m.small && m.i >= warm)
  const first = groups.find((g) => g.i0 >= warm)
  const forte = groups.find((g) => g.i0 >= warm && g.forte) || first
  const espacar = (lista) => [...lista].sort((a, b) => a.i - b.i).reduce((acc, c) => [...acc, { ...c, i: acc.length ? Math.max(c.i, acc[acc.length - 1].i + 3) : c.i }], [])
  return trim({
    name: 'Quantum',
    candles: cs,
    lines: [
      { name: 'Linha primária alta', color: BLUE, width: 0.08, z: 0.22, pts: primUp },
      { name: 'Linha primária baixa', color: RED, width: 0.08, z: 0.22, pts: primDn },
      { name: 'EMA 8', color: GOLD_L, width: 0.03, z: 0.23, pts: e8 },
      { name: 'EMA 21', color: GOLD, width: 0.03, z: 0.23, pts: e21 },
      { name: 'Banda superior', color: GREY, width: 0.03, z: 0.2, pts: bb1U },
      { name: 'Banda inferior', color: GREY, width: 0.03, z: 0.2, pts: bb1L },
    ],
    areas: [
      { upper: bb2U, lower: bb1U, color: GREY, opacity: 0.12, z: 0.05 },
      { upper: bb1L, lower: bb2L, color: GREY, opacity: 0.12, z: 0.05 },
    ],
    zones: [],
    markers,
    groups,
    panel: { title: 'Força', rows },
    captions: espacar([
      { i: warm, text: 'Linha primária: azul com o preço por cima, vermelha por baixo' },
      ...(flip ? [{ i: flip.i, text: 'A seta de fase marca o início da tendência' }] : []),
      ...(first ? [{ i: first.i0 - 4, text: 'O preço recua à fita e o oscilador entra na zona da direção' }] : []),
      ...(first ? [{ i: first.i0, text: 'Triângulo de recuo ou ponto de onda na cor da direção: a entrada' }] : []),
      ...(first ? [{ i: first.i0 + 2, text: 'Stop para lá do extremo do recuo e alvo a 2R' }] : []),
      ...(forte && forte !== first ? [{ i: forte.i0, text: 'Triângulo e ponto na mesma vela: a entrada mais forte' }] : []),
    ]),
    legend: [{ color: BLUE, label: 'Fase de alta' }, { color: RED, label: 'Fase de baixa' }, { color: GOLD, label: 'Fita 8/21' }],
  }, warm)
}

// ───────────────────────── Golden Zone ─────────────────────────
// Scalping de ouro em 5 minutos (docs/pine/golden-zone.pine). Níveis psicológicos de 5 em 5 $;
// zona de 1 $ centrada no nível; o visto amarelo aparece quando a vela fecha para lá da zona de ação
// a favor da tendência (EMA 50/200); no fecho da vela seguinte surgem Invalidação (−1,5 $), Saída 1 (+1,5 $)
// e Saída 2 (+3 $), com as linhas a começar na vela do visto. Bandeira branca na Saída 1. Cada visto novo apaga o anterior.
function goldenZone() {
  const warm = 220
  const STEP = 5, HALF = 0.5, RISK = 1.5
  const r2 = (x) => Math.round(x * 2) / 2
  const build = (seed) => {
    const cs = makeCandles(seed, 4052, [
      { len: 120, drift: 0.00002, vol: 0.00026 }, { len: 60, drift: 0.00008, vol: 0.00025 }, { len: 40, drift: -0.00006, vol: 0.00027 },
      { len: 50, drift: 0.0001, vol: 0.00026 }, { len: 14, drift: -0.00012, vol: 0.00027 }, { len: 40, drift: 0.00012, vol: 0.00026 },
      { len: 30, drift: -0.00004, vol: 0.00027 }, { len: 36, drift: 0.00009, vol: 0.00026 },
    ])
    const close = cs.map((b) => b.c)
    const e50 = ema(close, 50), e200 = ema(close, 200)
    const markers = [], zones = [], groups = [], sigs = []
    let sig = null
    const rows = { trend: [], broke: [], next: [], plan: [], flag: [] }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], up = e50[i] > e200[i]
      let broke = false, planned = false
      if (sig && sig.plan != null && !sig.closed && i > sig.plan) {
        const d = sig.dir
        if (sig.e1Hit == null && (d > 0 ? c.h >= sig.e1 : c.l <= sig.e1)) { sig.e1Hit = i; markers.push({ i, price: d > 0 ? c.h : c.l, text: '⚑', color: '#ffffff', fg: '#111', up: d > 0, small: true, kind: 'flag' }) }
        if (d > 0 ? c.h >= sig.e2 : c.l <= sig.e2) sig.closed = i
        else if (d > 0 ? c.l <= sig.inval : c.h >= sig.inval) { sig.closed = i; if (sig.e1Hit == null) markers.push({ i, price: d > 0 ? c.l : c.h, text: '⚑', color: '#ffffff', fg: '#111', up: d < 0, small: true, kind: 'flag' }) }
        // a caixa e as linhas acompanham a ideia desde o visto até ao fecho
        if (sig.closed != null) { sig.zoneBox.i1 = i; sig.group.items.forEach((it) => (it.until = it.until ?? i)) } else sig.zoneBox.i1 = i
      }
      // o plano completo surge no fecho da vela seguinte ao visto (as linhas começam na vela do visto)
      if (sig && sig.plan == null && i === sig.i + 1) {
        const d = sig.dir
        sig.plan = i; planned = true
        sig.group = { i0: i, dir: d, items: [
          { price: sig.zone, color: GREY, label: 'Zona de ação', from: sig.i },
          { price: sig.inval, color: RED, label: 'Invalidação', from: sig.i },
          { price: sig.e1, color: GREEN, label: 'Saída 1', from: sig.i },
          { price: sig.e2, color: GREEN, label: 'Saída 2', from: sig.i },
        ] }
        groups.push(sig.group)
        if (d > 0 ? c.h >= sig.e1 : c.l <= sig.e1) { sig.e1Hit = i; markers.push({ i, price: d > 0 ? c.h : c.l, text: '⚑', color: '#ffffff', fg: '#111', up: d > 0, small: true, kind: 'flag' }) }
        if (d > 0 ? c.h >= sig.e2 : c.l <= sig.e2) sig.closed = i
        else if (d > 0 ? c.l <= sig.inval : c.h >= sig.inval) { sig.closed = i; if (sig.e1Hit == null) markers.push({ i, price: d > 0 ? c.l : c.h, text: '⚑', color: '#ffffff', fg: '#111', up: d < 0, small: true, kind: 'flag' }) }
        if (sig.closed != null) sig.group.items.forEach((it) => (it.until = i))
        sig.zoneBox.i1 = i
      }
      if (i > 0) {
        const lb = Math.floor(c.c / STEP) * STEP, la = Math.ceil(c.c / STEP) * STEP
        const sigBuy = up && c.c > lb + HALF && close[i - 1] < lb - HALF
        const sigSell = !up && c.c < la - HALF && close[i - 1] > la + HALF
        if (sigBuy || sigSell) {
          const d = sigBuy ? 1 : -1, level = sigBuy ? lb : la
          if (sig) { sig.end = i; if (sig.group) sig.group.items.forEach((it) => (it.to = Math.min(it.to ?? i, i))); sig.zoneBox.i1 = Math.min(sig.zoneBox.i1, i); sig.zoneBox.to = i; markers.filter((m) => m.i >= sig.i && m.i < i).forEach((m) => (m.to = i)) }
          const zone = r2(level + d * HALF)
          sig = { i, dir: d, level, zone, inval: r2(zone - d * RISK), e1: r2(zone + d * RISK), e2: r2(zone + d * RISK * 2), plan: null, e1Hit: null, closed: null }
          sig.zoneBox = { i0: i, i1: i + 1, top: level + HALF, bot: level - HALF, color: GOLD_L, opacity: 0.3, reveal: i, label: 'Zona' }
          zones.push(sig.zoneBox)
          markers.push({ i, price: d > 0 ? c.h + 1.2 : c.l - 1.2, text: '✓', color: GOLD_L, fg: '#111', up: d > 0, kind: 'check' })
          sigs.push(sig); broke = true
        }
      }
      rows.trend.push(up ? 'Alta' : 'Baixa')
      rows.broke.push(broke ? 'ok' : '–')
      rows.next.push(planned ? 'ok' : '–')
      rows.plan.push(sig && sig.plan != null && !sig.closed ? 'ok' : '–')
      rows.flag.push(sig && sig.e1Hit != null ? 'ok' : '–')
    }
    return { cs, e50, e200, markers, zones, groups, sigs, rows }
  }
  // procura um exemplo completo depois do aquecimento: compra, plano na vela seguinte, Saída 1 e Saída 2
  let D = null, best = null
  for (let seed = 23; seed < 23 + 400; seed++) {
    const d = build(seed)
    const s = d.sigs.find((x, k) => x.i >= warm + 20 && x.dir > 0 && x.plan != null && x.e1Hit != null && x.closed != null && x.e1Hit - x.plan >= 2 && x.closed - x.e1Hit >= 2 && x.closed - x.i <= 40 && d.cs[x.closed].h >= x.e2 && x.i + 60 < d.cs.length && (d.sigs[k + 1]?.i ?? 1e9) > x.closed + 6)
    if (s) { D = d; best = s; break }
    if (!D) { D = d; best = d.sigs.find((x) => x.i >= warm) || d.sigs[0] }
  }
  const { cs, e50, e200, markers, zones, groups, rows } = D
  const lo = Math.floor(Math.min(...cs.slice(warm).map((b) => b.l)) / STEP) * STEP, hi = Math.ceil(Math.max(...cs.slice(warm).map((b) => b.h)) / STEP) * STEP
  const lines = [
    { name: 'EMA 50', color: BLUE, width: 0.03, z: 0.21, pts: e50 },
    { name: 'EMA 200', color: '#ff9a3c', width: 0.03, z: 0.21, pts: e200 },
  ]
  for (let p = lo; p <= hi; p += STEP) lines.push({ name: `Nível ${p}`, psy: true, color: GREY, width: 0.02, z: 0.2, pts: cs.map(() => p) })
  const s = best
  return trim({
    name: 'Golden Zone',
    candles: cs,
    lines,
    zones,
    markers,
    groups,
    panel: { title: 'Golden Zone', rows: [
      { label: 'Tendência (EMA 50/200)', states: rows.trend },
      { label: 'Nível rompido', states: rows.broke },
      { label: 'Vela seguinte fechada', states: rows.next },
      { label: 'Plano no gráfico', states: rows.plan },
      { label: 'Saída 1 tocada', states: rows.flag },
    ] },
    captions: [
      { i: warm, text: 'Níveis psicológicos de 5 em 5 $ no ouro, em 5 minutos' },
      ...(s ? [{ i: s.i, text: 'A vela fecha para lá do nível, a favor da tendência: visto amarelo e zona de 1 $' }] : []),
      ...(s && s.plan != null ? [{ i: s.plan, text: 'No fecho da vela seguinte, o plano: invalidação a 1,5 $, Saída 1 a +1,5 $ e Saída 2 a +3 $' }] : []),
      ...(s && s.e1Hit != null ? [{ i: s.e1Hit, text: 'Saída 1 tocada: a bandeira branca marca o trade pago' }] : []),
      ...(s && s.closed != null ? [{ i: s.closed, text: 'Saída 2: o plano fecha; o visto seguinte limpa o gráfico' }] : []),
    ],
    legend: [{ color: GOLD_L, label: 'Visto e zona' }, { color: GREEN, label: 'Saída 1 e Saída 2' }, { color: RED, label: 'Invalidação' }, { color: GREY, label: 'Níveis psicológicos' }],
    best: s ? { i: s.i - warm, plan: s.plan != null ? s.plan - warm : null, e1: s.e1Hit != null ? s.e1Hit - warm : null, closed: s.closed != null ? s.closed - warm : null } : null,
  }, warm)
}

// ───────────────────────── Cartões de pontos-chave ─────────────────────────
// Texto de cada cartão (vem do código Pine) e, à parte, o recorte da simulação que o ilustra.
export const CARD_TEXT = {
  'gold-killer': [
    { title: 'Viragem do SuperTrend', text: 'SuperTrend de ATR (10 × 3) sobre o preço. Quando a linha muda de lado, sai o sinal de compra ou de venda.' },
    { title: 'Alvos e drawdowns por percentil', text: 'Os níveis verdes e vermelhos saem do histórico: até onde o preço foi a favor e contra nas pernas anteriores.' },
    { title: 'Recalcula em cada viragem', text: 'Cada nova perna começa na linha central, a entrada, e os níveis desenham-se outra vez a partir dela.' },
    { title: 'Alerta com entrada, stop e alvos', text: 'O alerta leva a entrada, o stop no drawdown 50 e três alvos nos ganhos 50, 75 e 100, pronto para webhook.' },
    { title: 'Fonte de preço suavizada', text: 'Podes ler o fecho, o HLCC4 ou uma versão suavizada do preço, que corta o ruído das velas.' },
  ],
  'mtm-scanner': [
    { title: 'Três DEMA, três prazos', text: 'DEMA 15, 50 e 238: curto, médio e longo prazo. Quando estão alinhadas, a tendência está clara.' },
    { title: 'POC de volume', text: 'A linha laranja marca o preço com mais volume nas últimas velas: onde o mercado mais negociou.' },
    { title: 'Sinal no cruzamento do POC', text: 'Quando o fecho atravessa o POC, aparece o B ou o S no gráfico, com alerta.' },
    { title: 'Stop e alvos por ATR', text: 'Stop a 1 ATR da entrada e alvos a 2, 4 e 6 vezes esse risco, desenhados logo no sinal.' },
    { title: 'Estrutura de mercado', text: 'CHoCH quando a estrutura muda de lado, com BOS, inducements e sweeps por cima do preço.' },
  ],
  'aurum-flow': [
    { title: 'Caixas de sessão', text: 'Pre London, London e Nova Iorque: cada caixa guarda o máximo, o mínimo e a range da abertura.' },
    { title: 'Rompimento a favor', text: 'O sinal só sai quando o fecho rompe a caixa no sentido da tendência de fundo.' },
    { title: 'Stop na aresta oposta', text: 'O stop fica do outro lado da range, com uma folga de ATR e um teto de risco por trade.' },
    { title: 'Quatro alvos em R, em dólares', text: 'TP1 a TP4 em múltiplos do risco, com o valor em $ para o risco por trade que escolheste.' },
    { title: 'Regime obrigatório', text: 'Uma média de tendência filtra o lado: compras acima, vendas abaixo. Mercado parado não conta.' },
  ],
  trendshot: [
    { title: 'Cruzamento das EMAs', text: 'EMA 20, 50 e 238. O cruzamento confirmado no fecho da vela dá o sinal de compra ou venda.' },
    { title: 'Tendência em seis timeframes', text: 'A tabela mostra a tendência de vários timeframes ao mesmo tempo, sem mudares de gráfico.' },
    { title: 'Suporte e resistência', text: 'Zonas a partir dos pivots, com a altura limitada pelo ATR para não ocuparem o gráfico todo.' },
    { title: 'Entrada, stop e até quatro alvos', text: 'Depois do sinal, os níveis ficam fixos na zona da entrada: SL e TP1 a TP4.' },
    { title: 'Tendência de fundo', text: 'A EMA 238 mostra o lado do mercado. Operar a favor dela é a primeira regra.' },
  ],
  sensei: [
    { title: 'Painel de confirmações', text: 'Cada leitura acende no painel. O sinal só sai quando há confirmações suficientes.' },
    { title: 'Banda Sensei', text: 'Média de 89 com um desvio padrão: mostra se o preço está esticado ou dentro do normal.' },
    { title: 'Estrutura SMC', text: 'CHoCH, BOS, sweeps e order blocks: o motor de estrutura que lê quem está a mandar no mercado.' },
    { title: 'Quatro saídas em R', text: 'Saídas a 1:1,5, 1:2,5, 1:4 e 1:6, com níveis fixos na vela do sinal.' },
    { title: 'Stop para a entrada', text: 'Quando a primeira saída é tocada, o stop sobe para o preço de entrada.' },
  ],
  'premium-scanner': [
    { title: 'Voto de cinco critérios', text: 'O preço contra a abertura da sessão, contra há 1 h e há 4 h, e contra a EMA200 e a EMA9. A maioria dá a direção.' },
    { title: 'Três sessões do ouro', text: 'Ásia, Londres e Nova Iorque. Fora das sessões o scanner fica calado.' },
    { title: 'Entrada em recuo', text: 'A zona de entrada fica uns dólares contra o preço: esperas que o ouro volte a ti em vez de o perseguires.' },
    { title: 'Stop e três alvos fixos', text: 'Stop para lá da zona e TP1, TP2 e TP3 a 5, 10 e 15 $, com a parte que fecha em cada um.' },
    { title: 'Stop para a entrada', text: 'Quando o TP1 é tocado, o stop do resto passa para o preço de entrada.' },
  ],
  defy: [
    { title: 'Bandas de exaustão', text: 'Banda interior, média e exterior à volta de uma média suave. Quanto mais o preço estica, mais forte é a leitura.' },
    { title: 'Níveis-chave', text: 'Zonas onde o preço já reagiu antes, espaçadas entre si: possíveis pontos de inversão.' },
    { title: 'Confirmações e estrelas', text: 'Cada leitura soma um ponto. +6 dá uma estrela, +8 duas, +10 três. Com vela dourada, é King Idea.' },
    { title: 'Entrada, Warning e stop', text: 'Entrada no fecho ou a 50 % da vela. O Warning é o extremo da vela de sinal e o stop fica 1 ATR para lá.' },
    { title: 'Alvos em R', text: 'TP1, TP2 e TP3 a 1R, 2R e 3R, com a distância em pips. Há modos para scalp e para swing.' },
  ],
  rocketnova: [
    { title: 'Três médias, um cruzamento', text: 'EMA 20, 50 e 238. O sinal nasce quando a rápida cruza a lenta e a vela fecha, nunca antes.' },
    { title: 'Estrela de lançamento', text: 'Máximos e mínimos de swing por Depth, Deviation e Backstep. A compra exige uma estrela de mínimo recente; a venda, uma de máximo.' },
    { title: 'Rocket Candle e pulso', text: 'A vela de impulso pinta-se de amarelo. O Volatility Pulse compara o ATR com a média e o Trade Clock mostra sessão e volume.' },
    { title: 'Entrada, stop e quatro alvos', text: 'Stop fixo (100 pips, 200 no ouro) ou na última estrela. TP1 a TP4 a 30 %, 50 %, 100 % e 150 % do stop.' },
    { title: 'Gestão por alertas', text: 'Depois do TP1 o stop passa para a entrada. Um sinal contrário fecha a trade. Tudo sai por webhook com o mesmo id.' },
  ],
  'golden-zone': [
    { title: 'Níveis psicológicos', text: 'Linhas de 5 em 5 $ no ouro (4060, 4065, 4070). Dez à volta do preço. É nelas que o preço costuma reagir e é delas que nasce cada zona.' },
    { title: 'Visto amarelo e zona', text: 'Quando uma vela fecha para lá do nível a favor da tendência (EMA 50 sobre a 200), aparece o visto e a caixa amarela de 1 $ centrada no nível. A zona de ação é a aresta do lado do preço.' },
    { title: 'Plano na vela seguinte', text: 'No fecho da vela seguinte ao visto surgem os parâmetros: invalidação a 1,5 $ (150 pontos), Saída 1 a +1,5 $ e Saída 2 a +3 $. A entrada é tua: ordem limite na zona, quando o preço recua.' },
    { title: 'Saída 1 e bandeira branca', text: 'Ao tocar a Saída 1 aparece a bandeira branca: o trade pagou. A Saída 2 ou a invalidação fecham o plano, e o visto seguinte limpa o gráfico.' },
    { title: 'Confirmações e alertas', text: 'Tendência, suporte e resistência, padrão de vela e desequilíbrios, pela ordem do guia. Cada evento (visto, plano, Saída 1, Saída 2, invalidação) sai por alerta JSON para webhook.' },
  ],
  quantum: [
    { title: 'Linha primária e fase', text: 'Uma média longa (269) com brilho. Azul com o preço por cima, vermelha por baixo. Duas velas do mesmo lado mudam a fase e a seta grande marca o início.' },
    { title: 'Painel de força', text: 'Uma pontuação de 0 a 100 e uma seta por timeframe, de M1 a W1. Compra acima de 60, venda a 40 ou menos, 45 a 50 é neutro.' },
    { title: 'O recuo', text: 'O preço volta à fita (EMA 8 e 21) e o oscilador Stoch RSI entra na zona da direção: azul em baixo na compra, vermelha em cima na venda.' },
    { title: 'Triângulo e ponto', text: 'O triângulo nasce quando a vela fecha de volta a favor depois do toque na fita. O ponto nasce quando o oscilador sai da zona. Os dois na mesma vela é a entrada mais forte.' },
    { title: 'Gestão MTM', text: 'Stop para lá do extremo das últimas velas do recuo e alvo com pelo menos o dobro do risco. Os alertas saem por webhook com entrada, stop, alvo e score.' },
  ],
}

const around = (i, before, after, N) => [Math.max(0, i - before), Math.min(N - 1, i + after)]
const CARD_VIEWS = {
  'gold-killer': (s) => {
    const N = s.candles.length
    const m = s.markers
    const g = s.alertGroups[1] ?? s.alertGroups[0]
    return [
      { win: around(m[0]?.i ?? 40, 30, 22, N), layers: { candles: true, markers: true, lines: ['SuperTrend'] } },
      { win: around(m[1]?.i ?? 80, 8, 40, N), layers: { candles: true, zones: true, lines: ['Linha central'] } },
      { win: [Math.max(0, (m[0]?.i ?? 20) - 4), Math.min(N - 1, (m[2]?.i ?? N - 1) + 6)], layers: { candles: true, zones: true, markers: true, lines: ['Linha central'] } },
      { win: around(g?.i0 ?? 60, 6, 30, N), layers: { candles: true, groups: true, markers: true }, group: g },
      { win: [10, 80], layers: { candles: true, dimCandles: true, lines: ['Preço suavizado'] } },
    ]
  },
  'mtm-scanner': (s) => {
    const N = s.candles.length
    const g = s.groups[s.groups.length - 2] ?? s.groups[0]
    const seg = s.segments[0]
    return [
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, lines: ['DEMA 15', 'DEMA 50', 'DEMA 238'] } },
      { win: around(70, 40, 30, N), layers: { candles: true, lines: ['POC'] } },
      { win: around(g.i0, 25, 15, N), layers: { candles: true, lines: ['POC'], markers: true } },
      { win: around(g.i0, 10, 28, N), layers: { candles: true, groups: true, markers: true }, group: g },
      { win: seg ? [Math.max(0, seg.i0 - 10), Math.min(N - 1, seg.i1 + 15)] : [0, N - 1], layers: { candles: true, segments: true } },
    ]
  },
  'aurum-flow': (s) => {
    const N = s.candles.length
    const z = s.zones.filter((q) => q.label)
    const g = s.groups[s.groups.length - 1]
    const m = s.markers[s.markers.length - 1]
    return [
      { win: around(z[0]?.i0 ?? 10, 6, 40, N), layers: { candles: true, zones: (q) => !!q.label } },
      { win: around(m.i, 30, 10, N), layers: { candles: true, zones: (q) => !!q.label, markers: true } },
      { win: around(g.i0, 20, 16, N), layers: { candles: true, zones: (q) => !!q.label, groups: true }, group: { ...g, items: g.items.slice(0, 2) } },
      { win: around(g.i0, 8, 26, N), layers: { candles: true, groups: true }, group: g },
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, lines: ['EMA de regime'] } },
    ]
  },
  trendshot: (s) => {
    const N = s.candles.length
    const m = s.markers
    const g = s.groups[s.groups.length - 1]
    return [
      { win: around(m[0]?.i ?? 50, 30, 20, N), layers: { candles: true, markers: true, lines: ['EMA 20', 'EMA 50'] } },
      { win: [Math.max(0, N - 90), N - 1], layers: { candles: true, dimCandles: true, panel: true } },
      { win: [0, N - 1], layers: { candles: true, zones: true } },
      { win: around(g.i0, 10, 24, N), layers: { candles: true, groups: true, markers: true }, group: g },
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, lines: ['EMA 238'] } },
    ]
  },
  sensei: (s) => {
    const N = s.candles.length
    const g = s.groups[0]
    const seg = s.segments[s.segments.length - 1]
    const be = g.items.find((it) => it.from != null)
    return [
      { win: around(g.i0, 40, 6, N), layers: { candles: true, dimCandles: true, panel: true, markers: true } },
      { win: [0, N - 1], layers: { candles: true, areas: true } },
      { win: seg ? [Math.max(0, seg.i0 - 10), Math.min(N - 1, seg.i1 + 12)] : [0, N - 1], layers: { candles: true, segments: true } },
      { win: around(g.i0, 8, 22, N), layers: { candles: true, groups: true, markers: true }, group: { ...g, items: g.items.filter((it) => it.from == null).map((it) => ({ ...it, to: undefined })) } },
      { win: around(be?.from ?? g.i0 + 4, 10, 18, N), layers: { candles: true, groups: true }, group: g },
    ]
  },
  'premium-scanner': (s) => {
    const N = s.candles.length
    const g = s.groups[0]
    const be = g.items.find((it) => it.from != null)
    return [
      { win: around(g.i0, 40, 6, N), layers: { candles: true, dimCandles: true, panel: true, markers: true } },
      { win: [0, N - 1], layers: { candles: true, zones: (q) => !!q.label } },
      { win: around(g.i0, 12, 22, N), layers: { candles: true, zones: (q) => q.entry && q.i0 === g.i0, markers: true } },
      { win: around(g.i0, 8, 26, N), layers: { candles: true, groups: true, markers: true }, group: { ...g, items: g.items.filter((it) => it.from == null).map((it) => ({ ...it, to: undefined })) } },
      { win: around(be?.from ?? g.i0 + 4, 10, 18, N), layers: { candles: true, groups: true }, group: g },
    ]
  },
  defy: (s) => {
    const N = s.candles.length
    const g = s.groups.find((q) => q.i0 > 20) ?? s.groups[0]
    const m = s.markers.find((q) => q.i === g.i0)
    return [
      { win: [0, N - 1], layers: { candles: true, areas: true, lines: ['Centro', 'Banda interior', 'Banda interior baixa'] } },
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, zones: (q) => !!q.level } },
      { win: around(m?.i ?? g.i0, 40, 6, N), layers: { candles: true, dimCandles: true, panel: true, markers: true, areas: true } },
      { win: around(g.i0, 8, 22, N), layers: { candles: true, groups: true, markers: true }, group: { ...g, items: g.items.slice(0, 3) } },
      { win: around(g.i0, 8, 26, N), layers: { candles: true, groups: true, markers: true }, group: g },
    ]
  },
  rocketnova: (s) => {
    const N = s.candles.length
    const sig = s.markers.filter((m) => !m.small)
    const g = s.groups[s.groups.length - 1]
    const be = g.items.find((it) => it.from != null)
    return [
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, lines: ['EMA 20', 'EMA 50', 'EMA 238'] } },
      { win: around(sig[0]?.i ?? 50, 46, 10, N), layers: { candles: true, markers: true, lines: ['EMA 20', 'EMA 50'] } },
      { win: [Math.max(0, N - 90), N - 1], layers: { candles: true, dimCandles: true, panel: true } },
      { win: around(g.i0, 8, 24, N), layers: { candles: true, groups: true, markers: (m) => !m.small }, group: { ...g, items: g.items.filter((it) => it.from == null).map((it) => ({ ...it, to: undefined })) } },
      { win: around(be?.from ?? g.i0 + 4, 10, 18, N), layers: { candles: true, groups: true }, group: g },
    ]
  },
  'golden-zone': (s) => {
    const N = s.candles.length
    const b = s.best || { i: 40, plan: 46, e1: 52, closed: 58 }
    const g = s.groups.find((x) => x.i0 === b.plan) || s.groups[s.groups.length - 1]
    const psy = s.lines.filter((l) => l.psy).map((l) => l.name)
    return [
      { win: [Math.max(0, b.i - 70), Math.min(N - 1, b.i + 10)], layers: { candles: true, dimCandles: true, lines: psy } },
      { win: around(b.i, 26, 8, N), layers: { candles: true, zones: true, lines: [...psy, 'EMA 50', 'EMA 200'], markers: (m) => m.kind === 'check' } },
      { win: around(b.plan ?? b.i + 4, 16, 14, N), layers: { candles: true, zones: true, groups: true, markers: (m) => m.kind === 'check' }, group: g },
      { win: around(b.e1 ?? b.i + 10, 18, 16, N), layers: { candles: true, zones: true, groups: true, markers: true }, group: g },
      { win: around(b.i, 40, 30, N), layers: { candles: true, zones: true, groups: true, panel: true, lines: ['EMA 50', 'EMA 200'], markers: true }, group: g },
    ]
  },
  quantum: (s) => {
    const N = s.candles.length
    const flip = s.markers.find((m) => !m.small)
    const g = s.groups.find((x) => x.forte) || s.groups[s.groups.length - 1]
    return [
      { win: [0, N - 1], layers: { candles: true, dimCandles: true, lines: ['Linha primária alta', 'Linha primária baixa'], markers: (m) => !m.small } },
      { win: around(flip?.i ?? 40, 30, 40, N), layers: { candles: true, dimCandles: true, panel: true, lines: ['Linha primária alta', 'Linha primária baixa'] } },
      { win: around(g.i0, 30, 8, N), layers: { candles: true, lines: ['EMA 8', 'EMA 21', 'Banda superior', 'Banda inferior'], areas: true, markers: (m) => m.kind === 'dot' } },
      { win: around(g.i0, 16, 10, N), layers: { candles: true, lines: ['EMA 8', 'EMA 21'], markers: (m) => m.small } },
      { win: around(g.i0, 8, 24, N), layers: { candles: true, groups: true, markers: (m) => m.small }, group: g },
    ]
  },
}

/** Cartões de pontos-chave de um scanner: texto + recorte da simulação. */
export function scannerCards(slug) {
  const sim = simulate(slug)
  const views = CARD_VIEWS[slug](sim)
  return CARD_TEXT[slug].map((t, k) => ({ ...t, ...views[k] }))
}

const BUILDERS = { 'gold-killer': goldKiller, 'mtm-scanner': mtmScanner, 'aurum-flow': aurumFlow, trendshot: trendShot, sensei, 'premium-scanner': premiumScanner, defy, rocketnova: rocketNova, quantum, 'golden-zone': goldenZone }
const cache = {}
/** Simulação de um scanner pelo slug da landing. */
export function simulate(slug) {
  if (!cache[slug]) cache[slug] = BUILDERS[slug]()
  return cache[slug]
}
export const SIM_SLUGS = Object.keys(BUILDERS)
