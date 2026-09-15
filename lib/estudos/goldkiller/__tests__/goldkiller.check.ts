/**
 * MTM GoldKiller — verificações do porte (correr com `npx tsx lib/estudos/goldkiller/__tests__/goldkiller.check.ts`).
 *
 * O que fica trancado:
 *  1. array.percentile_linear_interpolation / avg / stdev: casos à mão.
 *  2. Supertrend: aquecimento igual ao Pine (banda de baixo a 0 e de cima a na com nz, 1.º valor no
 *     ATR, direção inicial = baixa).
 *  3. O motor (UM estado partilhado, percentis de cópias ordenadas em cache) é IGUAL, barra a barra,
 *     a uma implementação ingénua escrita à letra do Pine: SEIS instâncias de target_percent, cada uma
 *     com os seus arrays de highs/lows, array.min/max, includes, unshift, pop e sort a cada barra.
 *  4. Dedupe assimétrico: numa série periódica as pernas de alta repetidas não entram; as de baixa sim.
 *  5. `show`: -4 mostra 100/90/75/50 e esconde 25; 5 mostra tudo; 0 nada.
 *  6. Sem repaint: calcular com velas até k dá os mesmos sinais e níveis que calcular com tudo e cortar.
 *  7. A vela aberta nunca dá sinal e repete os níveis da última fechada.
 */
import * as ta from '../../comum/ta'
import { calcularGoldKiller, niveisVisiveis, supertrendGK } from '../motor'
import type { InputsGoldKiller, Vela } from '../tipos'
import { INPUTS_GOLDKILLER_DEFAULT } from '../inputs'

let ok = 0
let mau = 0
const check = (nome: string, cond: boolean, extra = '') => {
  if (cond) ok++
  else { mau++; console.log(`✗ ${nome} ${extra}`) }
}
const igual = (a: number, b: number, tol = 1e-9) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// ── 1. array.* ──
{
  check('percentil 40 de [15,20,35,40,50] = 29', igual(ta.percentilLinear([50, 15, 40, 20, 35], 40), 29))
  check('percentil 0 = mínimo, 100 = máximo', ta.percentilLinear([3, 1, 2], 0) === 1 && ta.percentilLinear([3, 1, 2], 100) === 3)
  check('percentil 50 de 4 = média dos do meio', igual(ta.percentilLinear([1, 2, 3, 4], 50), 2.5))
  check('percentil de vazio = na', Number.isNaN(ta.percentilLinear([], 50)))
  check('percentil de 1 elemento', ta.percentilLinear([7], 80) === 7)
  check('avg', igual(ta.mediaArray([1, 2, 3, 6]), 3) && Number.isNaN(ta.mediaArray([])))
  check('stdev populacional', igual(ta.desvioArray([2, 4, 4, 4, 5, 5, 7, 9]), 2) && ta.desvioArray([5]) === 0)
  check('hlcc4', ta.hlcc4(4, 2, 3) === 3)
}

// ── velas de teste: passeio aleatório determinístico ──
function passeio(n: number, seed0 = 7, t0 = Date.UTC(2026, 0, 5) / 1000): Vela[] {
  let seed = seed0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const out: Vela[] = []
  let p = 2000
  for (let i = 0; i < n; i++) {
    const o = p
    const c = o + (rnd() - 0.5) * 6
    out.push({ t: t0 + i * 900, o: +o.toFixed(2), h: +(Math.max(o, c) + rnd() * 3).toFixed(2), l: +(Math.min(o, c) - rnd() * 3).toFixed(2), c: +c.toFixed(2), v: 1 })
    p = c
  }
  return out
}

// ── 2. Supertrend: aquecimento ──
{
  const velas = passeio(40)
  const src = velas.map((v) => ta.hlcc4(v.h, v.l, v.c))
  const s = supertrendGK(velas, src, 3, 10)
  check('st: na antes do ATR (barras 0-8)', s.valor.slice(1, 9).every(Number.isNaN), JSON.stringify(s.valor.slice(0, 10)))
  check('st: barra 0 = 0 (nz da banda de cima)', s.valor[0] === 0)
  check('st: 1.º valor na barra 9 = banda de cima', igual(s.valor[9], src[9] + 3 * s.atr[9]))
  check('st: direção inicial baixa', s.baixa.slice(0, 11).every((x) => x === true) || s.baixa.slice(0, 10).every((x) => x))
}

// ── 3. implementação ingénua, à letra do Pine ──
interface Risco { gain: number; drawdown: number; average_gain: number; average_drawdown: number; gain_stdev: number; drawdown_stdev: number; entry: number }

function ingenuo(velas: Vela[], inp: InputsGoldKiller) {
  const N = velas.length
  const H = velas.map((v) => v.h), L = velas.map((v) => v.l), C = velas.map((v) => v.c)
  const hl2 = velas.map((v) => (v.h + v.l) / 2)
  const src = velas.map((v) => (v.h + v.l + v.c + v.c) / 4)
  // ta.atr = rma(tr(true), len) escrito à mão
  const tr = velas.map((v, i) => (i === 0 ? v.h - v.l : Math.max(v.h - v.l, Math.abs(v.h - C[i - 1]), Math.abs(v.l - C[i - 1]))))
  const atr: number[] = []
  for (let i = 0; i < N; i++) {
    if (i < inp.atr - 1) atr.push(NaN)
    else if (i === inp.atr - 1) atr.push(tr.slice(0, inp.atr).reduce((a, b) => a + b, 0) / inp.atr)
    else atr.push((atr[i - 1] * (inp.atr - 1) + tr[i]) / inp.atr)
  }
  const nz = (x: number) => (Number.isNaN(x) ? 0 : x)
  const lowerS: number[] = [], upperS: number[] = [], stS: number[] = [], stateS: boolean[] = []
  // seis instâncias de target_percent + uma de value_percent
  const inst = () => ({ bullT: [] as number[], bearT: [] as number[], bullD: [] as number[], bearD: [] as number[], hi: [] as number[], lo: [] as number[], entry: NaN, iniciado: false })
  const escala = inp.scale / 100
  const chamadas = [inp.rank, 25 * escala, 50 * escala, 75 * escala, 90 * escala, 100 * escala].map((rank) => ({ rank, s: inst() }))
  const pct = (a: number, b: number) => (a - b) / b
  const addp = (s: number, p: number) => s * (1 + p)
  const pli = (a: number[], p: number) => {
    if (!a.length) return NaN
    const o = a.slice().sort((x, y) => x - y)
    const pos = (p / 100) * (o.length - 1)
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return o[lo] + (o[hi] - o[lo]) * (pos - lo)
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const sd = (a: number[]) => { if (!a.length) return NaN; const m = avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) }
  const out = { entrada: [] as number[], g: [[], [], [], [], [], []] as number[][], d: [[], [], [], [], [], []] as number[][], sinais: [] as Array<[number, string]> }
  for (let i = 0; i < N; i++) {
    let upper = src[i] + inp.mult * atr[i]
    let lower = src[i] - inp.mult * atr[i]
    const pl = nz(i > 0 ? lowerS[i - 1] : NaN)
    const pu = nz(i > 0 ? upperS[i - 1] : NaN)
    const hl2p = i > 0 ? hl2[i - 1] : NaN
    lower = lower > pl || hl2p < pl ? lower : pl
    upper = upper < pu || hl2p > pu ? upper : pu
    const pst = i > 0 ? stS[i - 1] : NaN
    let dir: boolean
    if (Number.isNaN(i > 0 ? atr[i - 1] : NaN)) dir = true
    else if (pst === pu) dir = !(hl2[i] > upper)
    else dir = hl2[i] < lower
    lowerS.push(lower); upperS.push(upper); stS.push(!dir ? lower : upper); stateS.push(dir)
    const state = dir
    const flag = (direcao: boolean) => {
      const prev = i > 0 ? stateS[i - 1] : undefined
      const changed = prev !== undefined && state !== prev
      return direcao ? changed && !state : changed && state
    }
    chamadas.forEach(({ rank, s }, k) => {
      s.hi.push(H[i]); s.lo.push(L[i])
      if (!s.iniciado) { s.entry = C[i]; s.iniciado = true }
      if (flag(true)) {
        const t = pct(Math.min(...s.lo), s.entry), dd = pct(Math.max(...s.hi), s.entry)
        if (!s.bearT.includes(t) && inp.unique) s.bearT.unshift(t); else s.bearT.unshift(t)
        if (!s.bearD.includes(dd) && inp.unique) s.bearD.unshift(dd); else s.bearD.unshift(dd)
        s.lo = []; s.hi = []; s.entry = C[i]
      }
      if (flag(false)) {
        const t = pct(Math.max(...s.hi), s.entry), dd = pct(Math.min(...s.lo), s.entry)
        if (!s.bullT.includes(t)) s.bullT.unshift(t)
        if (!s.bullD.includes(dd)) s.bullD.unshift(dd)
        s.hi = []; s.lo = []; s.entry = C[i]
      }
      if (s.bullT.length > inp.window && inp.window > 0) { s.bullT.pop(); s.bullD.pop() }
      if (s.bearT.length > inp.window && inp.window > 0) { s.bearT.pop(); s.bearD.pop() }
      const r: Risco = state
        ? { gain: addp(s.entry, pli(s.bearT, 100 - rank)), drawdown: addp(s.entry, pli(s.bearD, rank)), average_gain: addp(s.entry, avg(s.bearT)), average_drawdown: addp(s.entry, avg(s.bearD)), gain_stdev: sd(s.bearT), drawdown_stdev: sd(s.bearD), entry: s.entry }
        : { gain: addp(s.entry, pli(s.bullT, rank)), drawdown: addp(s.entry, pli(s.bullD, 100 - rank)), average_gain: addp(s.entry, avg(s.bullT)), average_drawdown: addp(s.entry, avg(s.bullD)), gain_stdev: sd(s.bullT), drawdown_stdev: sd(s.bullD), entry: s.entry }
      out.g[k].push(r.gain); out.d[k].push(r.drawdown)
      if (k === 1) out.entrada.push(r.entry)
    })
    if (flag(true)) out.sinais.push([i, 'BUY'])
    if (flag(false)) out.sinais.push([i, 'SELL'])
  }
  return out
}

for (const [nome, extra] of [['defaults', {}], ['window 12 + unique', { window: 12, unique: true }], ['show 5 scale 100 mult 2 atr 7', { show: 5, scale: 100, mult: 2, atr: 7 }]] as const) {
  const velas = passeio(1500, nome.length * 31)
  const inp = { ...INPUTS_GOLDKILLER_DEFAULT, ...extra }
  const r = calcularGoldKiller(velas, inp, { ultimaConfirmada: true })
  const n = ingenuo(velas, inp)
  let dif = 0
  let primeira = ''
  const pcts = [25, 50, 75, 90, 100] as const
  for (let i = 0; i < velas.length; i++) {
    const pares: Array<[number, number, string]> = [[r.series.entrada[i], n.entrada[i], 'entrada']]
    pcts.forEach((p, k) => { pares.push([r.series.ganho[`p${p}`][i], n.g[k + 1][i], `g${p}`], [r.series.perda[`p${p}`][i], n.d[k + 1][i], `d${p}`]) })
    for (const [a, b, c] of pares) if (!igual(a, b)) { dif++; if (!primeira) primeira = `barra ${i} ${c}: ${a} vs ${b}` }
  }
  check(`motor = ingénuo de 6 instâncias (${nome})`, dif === 0, `${dif} diferenças; ${primeira}`)
  check(`sinais = ingénuo (${nome})`, JSON.stringify(r.sinais.map((s) => [s.barra, s.lado])) === JSON.stringify(n.sinais), `${r.sinais.length} vs ${n.sinais.length}`)
  check(`há pernas suficientes (${nome})`, r.sinais.length > 8, String(r.sinais.length))
}

// ── 4. dedupe assimétrico (série periódica: pernas iguais) ──
{
  const velas: Vela[] = []
  const t0 = Date.UTC(2026, 0, 5) / 1000
  for (let i = 0; i < 1200; i++) {
    const fase = i % 60
    const c = fase < 30 ? 2000 + fase * 2 : 2060 - (fase - 30) * 2
    velas.push({ t: t0 + i * 900, o: c, h: c + 1, l: c - 1, c, v: 1 })
  }
  const r = calcularGoldKiller(velas, {}, { ultimaConfirmada: true })
  const u = r.ultima!
  check('periódica: vira', r.sinais.length > 20, String(r.sinais.length))
  check('periódica: pernas de alta deduplicadas, de baixa não', u.pernasAlta <= 3 && u.pernasBaixa >= 15, `alta ${u.pernasAlta} baixa ${u.pernasBaixa}`)
}

// ── 5. show ──
{
  const v = niveisVisiveis(-4)
  check('show -4 → 100/90/75/50 sim, 25 não', v.p100 && v.p90 && v.p75 && v.p50 && !v.p25)
  check('show 5 → tudo', Object.values(niveisVisiveis(5)).every(Boolean))
  check('show 0 → nada', !Object.values(niveisVisiveis(0)).some(Boolean))
  check('show 1 → só 25', niveisVisiveis(1).p25 && !niveisVisiveis(1).p50)
}

// ── 6-7. sem repaint + vela aberta ──
{
  const velas = passeio(2500, 99)
  const todas = calcularGoldKiller(velas, {}, { ultimaConfirmada: true })
  let repinta = 0
  for (const k of [900, 1600, 2200, 2499]) {
    const parcial = calcularGoldKiller(velas.slice(0, k), {}, { ultimaConfirmada: true })
    const a = JSON.stringify(parcial.sinais)
    const b = JSON.stringify(todas.sinais.filter((s) => s.barra < k))
    if (a !== b) repinta++
    for (let i = 0; i < k; i++) if (!igual(parcial.series.ganho.p75[i], todas.series.ganho.p75[i]) || !igual(parcial.series.perda.p50[i], todas.series.perda.p50[i])) { repinta++; break }
  }
  check('sem repaint (sinais e níveis iguais com menos velas)', repinta === 0)

  const s = todas.sinais[todas.sinais.length - 1]
  const cortada = velas.slice(0, s.barra + 1)
  const aberta = calcularGoldKiller(cortada, {}, { ultimaConfirmada: false })
  const fechada = calcularGoldKiller(cortada, {}, { ultimaConfirmada: true })
  check('vela aberta não dá sinal', !aberta.sinais.some((x) => x.barra === s.barra) && fechada.sinais.some((x) => x.barra === s.barra))
  const j = s.barra - 1
  check('vela aberta repete os níveis da fechada', aberta.series.ganho.p50[s.barra] === aberta.series.ganho.p50[j] && aberta.ultima!.provisoria && aberta.series.baixa[s.barra] === aberta.series.baixa[j])
  check('alerta: entrada = center, SL = drawdown 50, TPs = gain 50/75/100', s.valido && s.alerta != null && s.entry === todas.series.entrada[s.barra] && s.sl === todas.series.perda.p50[s.barra] && s.tp3 === todas.series.ganho.p100[s.barra])
  check('alerta: SL do lado certo', s.lado === 'BUY' ? s.sl < s.entry && s.tp1 > s.entry : s.sl > s.entry && s.tp1 < s.entry, JSON.stringify(s))
  check('alvos por ordem (TP1 ≤ TP2 ≤ TP3 afastando-se)', s.lado === 'BUY' ? s.tp1 <= s.tp2 && s.tp2 <= s.tp3 : s.tp1 >= s.tp2 && s.tp2 >= s.tp3)
}

console.log(`goldkiller.check: ${ok} ok, ${mau} falhas`)
if (mau > 0) process.exit(1)
