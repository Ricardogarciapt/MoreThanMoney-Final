/**
 * MTM Scanner — verificações do porte (correr com `npx tsx lib/estudos/mtmscanner/__tests__/mtmscanner.check.ts`).
 *
 * O que fica trancado:
 *  1. POC, fases, swings, estrutura (CHoCH/BOS/IDM/x) e sinais B/S com níveis são IGUAIS, barra a barra,
 *     a uma réplica ingénua escrita à letra do Pine: cada `var` com a sua história (x[k] por índice),
 *     ta.highest/lowest/ema/atr refeitos em ciclo, `na` com as comparações falsas do Pine.
 *  2. Casos à mão: POC com reset por bar_index e empate (fica o mais recente), contador 1..9 → 1,
 *     na do contador até o outro ramo, round_price a truncar.
 *  3. Sem repaint: calcular com velas até k dá os mesmos sinais/estrutura/POC que calcular com tudo.
 *  4. A vela aberta nunca dá sinal nem mexe na estrutura.
 *  5. Alerta: entry1/sl/tp do lado certo, TP1→TP3 a afastar-se, JSON só com valid_sc.
 */
import { calcularMTMScanner, fasesMTMScanner, pocMTMScanner, roundPrice, MAX_ESTRUTURA_MS } from '../motor'
import type { EventoEstruturaMS, InputsMTMScanner, Vela } from '../tipos'
import { INPUTS_MTMSCANNER_DEFAULT } from '../inputs'

let ok = 0
let mau = 0
const check = (nome: string, cond: boolean, extra = '') => {
  if (cond) ok++
  else { mau++; console.log(`✗ ${nome} ${extra}`) }
}
const mesmo = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b
const igual = (a: number, b: number, tol = 1e-9) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// ── velas de teste: passeio aleatório determinístico com volume ──
function passeio(n: number, seed0 = 7, t0 = Date.UTC(2026, 0, 5) / 1000): Vela[] {
  let seed = seed0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const out: Vela[] = []
  let p = 2000
  for (let i = 0; i < n; i++) {
    const o = p
    const c = o + (rnd() - 0.5) * 6
    // volume inteiro com empates frequentes (tick volume)
    out.push({ t: t0 + i * 900, o: +o.toFixed(2), h: +(Math.max(o, c) + rnd() * 3).toFixed(2), l: +(Math.min(o, c) - rnd() * 3).toFixed(2), c: +c.toFixed(2), v: Math.floor(rnd() * 40) + 1 })
    p = c
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Réplica ingénua, à letra do Pine
// ─────────────────────────────────────────────────────────────────────────────

const NA = NaN
const isna = (x: number) => Number.isNaN(x)
/** Série do Pine: guarda o valor final de cada barra; s(k) = x[k]. */
class Serie {
  v: number[] = []
  at(n: number, k = 0) { const j = n - k; return j >= 0 && j < this.v.length ? this.v[j] : NA }
}
const gt = (a: number, b: number) => !isna(a) && !isna(b) && a > b
const lt = (a: number, b: number) => !isna(a) && !isna(b) && a < b
const eq = (a: number, b: number) => !isna(a) && !isna(b) && a === b
const ne = (a: number, b: number) => !isna(a) && !isna(b) && a !== b
const bool = (x: number) => !isna(x) && x !== 0

function replica(velas: Vela[], inp: InputsMTMScanner, mintick: number, tfSeg: number) {
  const N = velas.length
  const H = velas.map((v) => v.h), L = velas.map((v) => v.l), C = velas.map((v) => v.c), V = velas.map((v) => v.v ?? NA)
  const x = (arr: number[], n: number, k: number) => (n - k >= 0 ? arr[n - k] : NA)

  // ta.ema com semente SMA, em ciclo
  const emaCiclo = (src: number[], len: number) => {
    const out: number[] = []
    for (let n = 0; n < N; n++) {
      const ant = n > 0 ? out[n - 1] : NA
      if (isna(ant)) {
        let s = 0, ok2 = n >= len - 1
        for (let k = 0; ok2 && k < len; k++) { if (isna(src[n - k])) ok2 = false; else s += src[n - k] }
        out.push(ok2 ? s / len : NA)
      } else out.push((2 / (len + 1)) * src[n] + (1 - 2 / (len + 1)) * ant)
    }
    return out
  }
  const demaCiclo = (len: number) => { const e1 = emaCiclo(C, len); const e2 = emaCiclo(e1, len); return e1.map((a, i) => 2 * a - e2[i]) }
  const d15 = demaCiclo(15), d50 = demaCiclo(50), d238 = demaCiclo(238)
  const atrCiclo: number[] = []
  {
    const tr = velas.map((v, n) => (n === 0 ? v.h - v.l : Math.max(v.h - v.l, Math.abs(v.h - C[n - 1]), Math.abs(v.l - C[n - 1]))))
    for (let n = 0; n < N; n++) {
      if (n < inp.atrPeriod - 1) atrCiclo.push(NA)
      else if (n === inp.atrPeriod - 1) atrCiclo.push(tr.slice(0, inp.atrPeriod).reduce((a, b) => a + b, 0) / inp.atrPeriod)
      else atrCiclo.push((atrCiclo[n - 1] * (inp.atrPeriod - 1) + tr[n]) / inp.atrPeriod)
    }
  }

  // estado var
  let highestVolPrice = NA, highestVol = 0
  const pocS = new Serie()
  const S = { bSC: NA, sSC: NA }
  const bS = new Serie(), sS = new Serie()
  let position: string | null = null
  let tp1 = NA, tp2 = NA, tp3 = NA, sl = NA, entry1 = NA

  // swings(len) — duas instâncias com os seus var
  const inst = (len: number) => ({ len, os: new Serie(), osVar: 0, topx: NA, btmx: NA, top: [] as number[], btm: [] as number[], tx: [] as number[], bx: [] as number[] })
  const A = inst(inp.len), B = inst(inp.shortLen)
  const correrSwings = (s: ReturnType<typeof inst>, n: number) => {
    let upper = -Infinity, lower = Infinity
    if (n < s.len - 1) { upper = NA; lower = NA }
    else for (let k = 0; k < s.len; k++) { upper = Math.max(upper, H[n - k]); lower = Math.min(lower, L[n - k]) }
    const os1 = s.os.at(n, 1) // os[1]: na na barra 0
    const os = gt(x(H, n, s.len), upper) ? 0 : lt(x(L, n, s.len), lower) ? 1 : os1
    s.osVar = os
    s.os.v.push(os)
    const top = eq(os, 0) && ne(os1, 0) ? x(H, n, s.len) : NA
    s.topx = eq(os, 0) && ne(os1, 0) ? n - s.len : s.topx
    const btm = eq(os, 1) && ne(os1, 1) ? x(L, n, s.len) : NA
    s.btmx = eq(os, 1) && ne(os1, 1) ? n - s.len : s.btmx
    s.top.push(top); s.btm.push(btm); s.tx.push(s.topx); s.bx.push(s.btmx)
    return [top, s.topx, btm, s.btmx]
  }

  const osS = new Serie()
  let os = 0
  let top_crossed = false, btm_crossed = false
  const maxS = new Serie(), minS = new Serie()
  let max = NA, min = NA, max_x1 = NA, min_x1 = NA
  let topy = NA, btmy = NA
  let stop_crossed = false, sbtm_crossed = false
  const stopS: number[] = [], sbtmS: number[] = []
  const fixnan = (arr: number[]) => { for (let k = arr.length - 1; k >= 0; k--) if (!isna(arr[k])) return arr[k]; return NA }

  const eventos: Array<[string, number, number, number, number, number]> = []
  const sinais: Array<[number, string, number, number, number, number, number]> = []

  for (let n = 0; n < N; n++) {
    const close = C[n], high = H[n], low = L[n]
    if (n % inp.lengthPOC === 0) { highestVol = 0; highestVolPrice = NA }
    for (let i = 0; i <= inp.lengthPOC - 1; i++) {
      if (gt(x(V, n, i), highestVol)) { highestVol = x(V, n, i); highestVolPrice = x(C, n, i) }
    }
    pocS.v.push(highestVolPrice)
    const isBuy = gt(close, pocS.at(n)) && !gt(x(C, n, 1), pocS.at(n, 1)) && !isna(x(C, n, 1)) && !isna(pocS.at(n, 1))
    const isSell = lt(close, pocS.at(n)) && !lt(x(C, n, 1), pocS.at(n, 1)) && !isna(x(C, n, 1)) && !isna(pocS.at(n, 1))

    const con = lt(close, x(C, n, 4))
    if (con) { S.bSC = eq(S.bSC, 9) ? 1 : S.bSC + 1; S.sSC = 0 }
    else { S.sSC = eq(S.sSC, 9) ? 1 : S.sSC + 1; S.bSC = 0 }
    bS.v.push(S.bSC); sS.v.push(S.sSC)

    if (isBuy) position = 'BUY'
    else if (isSell) position = 'SELL'
    const rp = (p: number) => (isna(p) ? NA : Math.trunc(p / mintick) * mintick)
    if (position === 'BUY' || position === 'SELL') {
      entry1 = rp(inp.use_cstm_entry ? inp.custom_entry : close)
      if (inp.useATR) {
        const d = atrCiclo[n] * inp.atrMultiplierSL
        if (position === 'BUY') { sl = rp(entry1 - d); tp1 = rp(entry1 + d * inp.tp1RR); tp2 = rp(entry1 + d * inp.tp2RR); tp3 = rp(entry1 + d * inp.tp3RR) }
        else { sl = rp(entry1 + d); tp1 = rp(entry1 - d * inp.tp1RR); tp2 = rp(entry1 - d * inp.tp2RR); tp3 = rp(entry1 - d * inp.tp3RR) }
      } else if (inp.use_TPs) {
        if (position === 'BUY') { tp1 = rp(entry1 * (1 + inp.tp1x / 100)); tp2 = rp(entry1 * (1 + inp.tp2x / 100)); tp3 = rp(entry1 * (1 + inp.tp3x / 100)); sl = rp(entry1 * (1 - inp.slx / 100)) }
        else { tp1 = rp(entry1 * (1 - inp.tp1x / 100)); tp2 = rp(entry1 * (1 - inp.tp2x / 100)); tp3 = rp(entry1 * (1 - inp.tp3x / 100)); sl = rp(entry1 * (1 + inp.slx / 100)) }
      }
    }
    if (isBuy || isSell) sinais.push([n, isBuy ? 'BUY' : 'SELL', entry1, sl, tp1, tp2, tp3])

    const [top, topx, btm, btmx] = correrSwings(A, n)
    const [stop, stopx, sbtm, sbtmx] = correrSwings(B, n)
    void d15; void d50; void d238; void tfSeg

    if (bool(top)) { topy = top; top_crossed = false }
    if (bool(btm)) { btmy = btm; btm_crossed = false }
    if (gt(close, topy) && !top_crossed) { os = 1; top_crossed = true }
    if (lt(close, btmy) && !btm_crossed) { os = 0; btm_crossed = true }
    const os1 = osS.at(n, 1)
    osS.v.push(os)
    if (ne(os, os1)) {
      max = high; min = low; max_x1 = n; min_x1 = n; stop_crossed = false; sbtm_crossed = false
      if (os === 1 && inp.showChoch) eventos.push(['CHoCH+', topx, n, topy, Math.trunc((n + topx) / 2), 0])
      else if (inp.showChoch) eventos.push(['CHoCH-', btmx, n, btmy, Math.trunc((n + btmx) / 2), 0])
    }
    stopS.push(stop); sbtmS.push(sbtm)
    const stopy = fixnan(stopS), sbtmy = fixnan(sbtmS)
    if (lt(low, sbtmy) && !sbtm_crossed && os === 1 && ne(sbtmy, btmy)) {
      if (inp.showIdm) eventos.push(['IDM+', sbtmx, n, sbtmy, Math.trunc((n + sbtmx) / 2), 0])
      sbtm_crossed = true
    }
    if (gt(close, max) && sbtm_crossed && os === 1) {
      if (inp.showBos) eventos.push(['BOS+', max_x1, n, max, Math.trunc((n + max_x1) / 2), 0])
      sbtm_crossed = false
    }
    if (gt(high, stopy) && !stop_crossed && os === 0 && ne(stopy, topy)) {
      if (inp.showIdm) eventos.push(['IDM-', stopx, n, stopy, Math.trunc((n + stopx) / 2), 0])
      stop_crossed = true
    }
    if (lt(close, min) && stop_crossed && os === 0) {
      if (inp.showBos) eventos.push(['BOS-', min_x1, n, min, Math.trunc((n + min_x1) / 2), 0])
      stop_crossed = false
    }
    if (gt(high, max) && lt(close, max) && os === 1 && gt(n - max_x1, 1) && inp.showSweeps) eventos.push(['x+', max_x1, n, max, Math.trunc((n + max_x1) / 2), 0])
    if (lt(low, min) && gt(close, min) && os === 0 && gt(n - min_x1, 1) && inp.showSweeps) eventos.push(['x-', min_x1, n, min, Math.trunc((n + min_x1) / 2), 0])
    max = isna(max) ? NA : Math.max(high, max)
    min = isna(min) ? NA : Math.min(low, min)
    const max1 = maxS.at(n, 1), min1 = minS.at(n, 1)
    maxS.v.push(max); minS.v.push(min)
    if (gt(max, max1)) max_x1 = n
    if (lt(min, min1)) min_x1 = n
  }
  return { poc: pocS.v, bSC: bS.v, sSC: sS.v, sinais, eventos, sw: A, ssw: B, fim: { os, max, min, max_x1, min_x1, topy, btmy } }
}

const tipoChave = (e: EventoEstruturaMS) => `${e.tipo === 'SWEEP' ? 'x' : e.tipo}${e.lado === 'bull' ? '+' : '-'}`

for (const [nome, extra, n0] of [
  ['defaults', {}, 3000],
  ['POC 9, swings 20/4, % TPs', { lengthPOC: 9, len: 20, shortLen: 4, useATR: false }, 2500],
  ['POC 21, ATR 7×1.5, RR 1/2/3', { lengthPOC: 21, atrPeriod: 7, atrMultiplierSL: 1.5, tp1RR: 1, tp2RR: 2, tp3RR: 3 }, 2000],
] as const) {
  const velas = passeio(n0, nome.length * 13 + 5)
  const inp = { ...INPUTS_MTMSCANNER_DEFAULT, ...extra }
  const r = calcularMTMScanner(velas, { ...inp, mintick: 0.01, tfSegundos: 900 }, { ultimaConfirmada: true })
  const p = replica(velas, inp, 0.01, 900)
  let dif = 0, primeira = ''
  const cmp = (a: number, b: number, o: string) => { if (!mesmo(a, b)) { dif++; if (!primeira) primeira = `${o}: ${a} vs ${b}` } }
  for (let i = 0; i < velas.length; i++) {
    cmp(r.series.poc[i], p.poc[i], `poc[${i}]`)
    cmp(r.series.bSC[i], p.bSC[i], `bSC[${i}]`)
    cmp(r.series.sSC[i], p.sSC[i], `sSC[${i}]`)
  }
  check(`POC + fases = réplica (${nome})`, dif === 0, `${dif} diferenças; ${primeira}`)

  const sm = JSON.stringify(r.sinais.map((s) => [s.barra, s.lado, s.entry, s.sl, s.tp1, s.tp2, s.tp3]))
  const sp = JSON.stringify(p.sinais)
  check(`sinais B/S + níveis = réplica (${nome})`, sm === sp, `${r.sinais.length} vs ${p.sinais.length}`)
  check(`há sinais suficientes (${nome})`, r.sinais.length > 20, String(r.sinais.length))

  // swings (círculos com offset -len)
  const swRep = p.sw.top.flatMap((t, i) => (Number.isNaN(t) ? [] : [[i - inp.len, t, 1]])).concat(p.sw.btm.flatMap((b, i) => (Number.isNaN(b) ? [] : [[i - inp.len, b, 0]])))
  const swMot = r.swings.map((s) => [s.barra, s.preco, s.alto ? 1 : 0])
  const ord = (a: number[][]) => JSON.stringify(a.filter((q) => q[0] >= 0).sort((x, y) => x[0] - y[0] || x[2] - y[2]))
  check(`swings(len) = réplica (${nome})`, ord(swMot) === ord(swRep), `${swMot.length} vs ${swRep.length}`)
  const tx = p.ssw.tx
  check(`swings(shortLen) com história própria (${nome})`, tx.some((q) => !Number.isNaN(q)) && p.sw.tx.some((q) => !Number.isNaN(q)))

  // estrutura: os últimos MAX_ESTRUTURA_MS eventos do histórico
  const hist = r.estrutura.filter((e) => !e.extensao)
  const rep = p.eventos.filter((e) => [e[1], e[2], e[3]].every(Number.isFinite)).slice(-MAX_ESTRUTURA_MS)
  const a = JSON.stringify(hist.map((e) => [tipoChave(e), e.barraInicio, e.barraFim, e.preco, e.barraEtiqueta]))
  const b = JSON.stringify(rep.map((e) => e.slice(0, 5)))
  check(`estrutura CHoCH/BOS/IDM/x = réplica (${nome})`, a === b, `\n  motor ${a.slice(0, 300)}\n  répl. ${b.slice(0, 300)}`)
  const tipos = new Set(p.eventos.map((e) => e[0].replace(/[+-]/, '')))
  check(`estrutura tem os 4 tipos (${nome})`, ['CHoCH', 'BOS', 'IDM', 'x'].every((t) => tipos.has(t)), [...tipos].join(','))
  // extensões: preço/barra do estado final
  const ext = r.estrutura.filter((e) => e.extensao)
  const u = p.fim
  const bosExt = ext.find((e) => e.tipo === 'BOS')
  check(`extensão BOS no estado final (${nome})`, !!bosExt && (u.os === 1 ? igual(bosExt.preco, u.max) && bosExt.barraInicio === u.max_x1 : igual(bosExt.preco, u.min) && bosExt.barraInicio === u.min_x1), JSON.stringify(bosExt))
  check(`extensão CHoCH do lado oposto (${nome})`, ext.some((e) => e.tipo === 'CHoCH' && e.preco === (u.os === 1 ? u.btmy : u.topy)))
}

// ── 2. casos à mão ──
{
  //            0  1  2  3  4  5  6  7   8
  const vol = [5, 9, 9, 3, 1, 2, 2, 50, 4]
  const c = [10, 11, 12, 13, 14, 15, 16, 17, 18]
  const poc = pocMTMScanner(c, vol, 4)
  // barra 0: reset, v=5 → 10 | 1: 9>5 → 11 | 2: i=0 v9 não > 9; i=1 v9 não → 11 | 3: → 11
  // barra 4: reset (4%4) → i=0 1, i=1 3, i=2 9, i=3 9 → fica 12 (o mais recente dos empatados)
  // barra 5,6: 2 não > 9 → 12 | barra 7: 50 → 17 | barra 8: reset → i=0 4, i=1 50 → 17
  check('POC à mão', JSON.stringify(poc) === JSON.stringify([10, 11, 11, 11, 12, 12, 12, 17, 17]), JSON.stringify(poc))
  const semVol = pocMTMScanner([1, 2, 3], [0, 0, 0], 2)
  check('POC sem volume = na', semVol.every(Number.isNaN))

  // fases: descer 14 barras seguidas
  const desce = Array.from({ length: 20 }, (_, i) => 100 - i)
  const f = fasesMTMScanner(desce)
  check('fases: barras 0-3 sem con → bSC 0, sSC na', f.bSC.slice(0, 4).every((x) => x === 0) && f.sSC.slice(0, 4).every(Number.isNaN), JSON.stringify(f.sSC.slice(0, 5)))
  check('fases: 1..9 e volta a 1', JSON.stringify(f.bSC.slice(4, 15)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2]), JSON.stringify(f.bSC.slice(4, 15)))
  check('fases: sSC fica 0 durante con', f.sSC.slice(4).every((x) => x === 0))

  check('round_price trunca', roundPrice(2345.679, 0.01) === Math.trunc(2345.679 / 0.01) * 0.01 && roundPrice(2345.679, 0.01) < 2345.68 && Number.isNaN(roundPrice(NaN, 0.01)))
}

// ── 3-5. sem repaint, vela aberta, alerta ──
{
  const velas = passeio(3000, 99)
  const inp = { mintick: 0.01, tfSegundos: 900 }
  const todas = calcularMTMScanner(velas, inp, { ultimaConfirmada: true })
  let repinta = 0
  for (const k of [900, 1600, 2200, 2999]) {
    const parcial = calcularMTMScanner(velas.slice(0, k), inp, { ultimaConfirmada: true })
    if (JSON.stringify(parcial.sinais) !== JSON.stringify(todas.sinais.filter((s) => s.barra < k))) repinta++
    for (let i = 0; i < k; i++) if (!mesmo(parcial.series.poc[i], todas.series.poc[i]) || !mesmo(parcial.series.bSC[i], todas.series.bSC[i])) { repinta++; break }
    // estrutura histórica confirmada até k−1 não muda (comparar sem o corte das 42)
    const evK = parcial.estrutura.filter((e) => !e.extensao).map((e) => JSON.stringify(e))
    const evT = new Set(todas.estrutura.filter((e) => !e.extensao).map((e) => JSON.stringify(e)))
    const recentes = evK.filter((e) => JSON.parse(e).barra >= todas.estrutura.filter((x) => !x.extensao)[0].barra)
    if (recentes.some((e) => !evT.has(e))) repinta++
  }
  check('sem repaint (sinais, POC, fases, estrutura)', repinta === 0)

  const s = todas.sinais[todas.sinais.length - 1]
  const cortada = velas.slice(0, s.barra + 1)
  const aberta = calcularMTMScanner(cortada, inp, { ultimaConfirmada: false })
  const fechada = calcularMTMScanner(cortada, inp, { ultimaConfirmada: true })
  check('vela aberta não dá sinal', !aberta.sinais.some((x) => x.barra === s.barra) && fechada.sinais.some((x) => x.barra === s.barra))
  check('vela aberta sem estrutura nem contador', !aberta.estrutura.some((e) => e.barra === s.barra && !e.extensao) && Number.isNaN(aberta.series.bSC[s.barra]) && aberta.ultima!.provisoria)
  check('vela aberta repete o POC', aberta.series.poc[s.barra] === aberta.series.poc[s.barra - 1])

  const validos = todas.sinais.filter((x) => x.valido)
  check('alerta só com valid_sc', todas.sinais.every((x) => (x.alerta != null) === x.valido))
  check('SL/TP1 do lado certo', validos.every((x) => (x.lado === 'BUY' ? x.sl < x.entry && x.tp1 > x.entry : x.sl > x.entry && x.tp1 < x.entry)))
  check('TP1→TP3 a afastar-se', validos.every((x) => (x.lado === 'BUY' ? x.tp1 <= x.tp2 && x.tp2 <= x.tp3 : x.tp1 >= x.tp2 && x.tp2 >= x.tp3)))
  check('entrada = fecho truncado ao tick', validos.every((x) => x.entry === roundPrice(velas[x.barra].c, 0.01)))
  // B/S NÃO alternam sempre: o POC pode ser o fecho da própria vela (close == POC), e o `<=` do
  // ta.crossover deixa repetir o lado. Só se exige que uma repetição tenha passado por um empate.
  check('B/S repetidos só depois de close == POC', todas.sinais.every((x, i) => {
    if (i === 0 || x.lado !== todas.sinais[i - 1].lado) return true
    for (let k = todas.sinais[i - 1].barra; k < x.barra; k++) if (velas[k].c === todas.series.poc[k]) return true
    return false
  }))
  const cx = todas.caixa!
  const ult = todas.sinais.at(-1)!
  check('caixa: última vela, direção do último sinal', cx.lado === ult.lado && cx.entry === roundPrice(velas.at(-1)!.c, 0.01) && cx.barraInicio === velas.length - 2 && cx.barraFim === velas.length - 1 + 8 && cx.tps.length === 3, JSON.stringify(cx))
  const json = JSON.stringify(ult.alerta)
  check('JSON do alerta com os campos do Pine', /"strategy":"MTMScanner".*"action":"(buy|sell)".*"entry":.*"sl":.*"tp1":.*"tp2":.*"tp3":.*"confirmations":\{"DEMA 15>50":(true|false),"DEMA 50>238":(true|false),"Acima POC":(true|false)\}/.test(json), json)
}

console.log(`mtmscanner.check: ${ok} ok, ${mau} falhas`)
if (mau > 0) process.exit(1)
