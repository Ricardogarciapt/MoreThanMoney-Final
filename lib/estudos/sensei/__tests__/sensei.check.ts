/**
 * MTM Sensei — verificações do porte (correr com `npx tsx lib/estudos/sensei/__tests__/sensei.check.ts`).
 *
 * O que fica trancado:
 *  1. ta.ema / ta.rsi batem com as tabelas de referência publicadas (StockCharts), que usam a mesma
 *     semente SMA que o pseudo-código oficial do Pine.
 *  2. O aquecimento (`na`) tem o comprimento do Pine: EMA em length−1, DEMA em 2·length−2,
 *     ATR/RSI em length, SMA de uma série com na à frente.
 *  3. Sem repaint: calcular com as velas até k dá os mesmos sinais que calcular com tudo e cortar em k.
 *  4. A última vela aberta nunca gera sinal (barstate.isconfirmed).
 *  5. HTF sem lookahead: uma vela do gráfico só vê a EMA HTF da vela HTF que já fechou.
 */
import * as ta from '../../comum/ta'
import { calcularSensei, dentroDaSessao } from '../motor'
import type { Vela } from '../tipos'

let ok = 0
let mau = 0
const check = (nome: string, cond: boolean, extra = '') => {
  if (cond) ok++
  else { mau++; console.log(`✗ ${nome} ${extra}`) }
}
const perto = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// ── 1. EMA 10 — tabela StockCharts ("Moving Averages - Simple and Exponential") ──
{
  const px = [22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29, 22.15, 22.39, 22.38, 22.61, 23.36, 24.05, 23.75, 23.83, 23.95, 23.63, 23.82, 23.87, 23.65, 23.19, 23.10, 23.33, 22.68, 23.10, 22.40, 22.17]
  const esperado = [22.22, 22.21, 22.24, 22.27, 22.33, 22.52, 22.80, 22.97, 23.13, 23.28, 23.34, 23.43, 23.51, 23.53, 23.47, 23.40, 23.39, 23.26, 23.23, 23.08, 22.92]
  const e = ta.ema(px, 10)
  check('ema: na antes de length-1', e.slice(0, 9).every(Number.isNaN))
  esperado.forEach((v, k) => check(`ema[${9 + k}]`, perto(e[9 + k], v, 0.006), `${e[9 + k]} vs ${v}`))
}

// ── 1b. RSI 14 — tabela StockCharts ("RSI") ──
{
  const px = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439]
  const esperado = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97]
  const r = ta.rsi(px, 14)
  check('rsi: na até à barra 14', r.slice(0, 14).every(Number.isNaN))
  esperado.forEach((v, k) => check(`rsi[${14 + k}]`, perto(r[14 + k], v, 0.02), `${r[14 + k]} vs ${v}`))
}

// ── 2. aquecimento e casos-limite ──
{
  const serie = Array.from({ length: 600 }, (_, i) => 100 + Math.sin(i / 7) * 5 + i * 0.01)
  const d = ta.dema(serie, 238)
  check('dema238: primeiro valor em 474', Number.isNaN(d[473]) && !Number.isNaN(d[474]))
  check('dema de série constante = constante', perto(ta.dema(new Array(100).fill(5), 10)[99], 5, 1e-12))
  const s = ta.sma([na(), 1, 2, 3, 4], 2)
  check('sma: na na janela dá na', Number.isNaN(s[1]) && s[2] === 1.5 && s[4] === 3.5)
  check('stdev populacional', perto(ta.stdev([2, 4, 4, 4, 5, 5, 7, 9], 8)[7], 2, 1e-12))
  const hi = [1, 3, 2, 5, 4]
  const lo = [0, 1, 1, 2, 3]
  const cl = [0.5, 2, 1.5, 4, 3.5]
  const tr = ta.trueRange(hi, lo, cl)
  check('tr: 1.ª barra = high-low', tr[0] === 1 && tr[3] === Math.max(3, 3.5, 0.5))
  const at = ta.atr(hi, lo, cl, 3)
  check('atr: semente SMA em length-1', Number.isNaN(at[1]) && perto(at[2], (1 + 2 + 1.5) / 3, 1e-12))
  check('highest', ta.highest(hi, 3)[4] === 5 && Number.isNaN(ta.highest(hi, 3)[1]))
  check('crossover', ta.crossover([1, 3], [2, 2], 1) && !ta.crossover([3, 3], [2, 2], 1))
  check('diferente com na é falso', !ta.diferente(na(), 0) && ta.diferente(1, 0))
  check('rsi: só subidas = 100', ta.rsi(Array.from({ length: 30 }, (_, i) => i), 14)[29] === 100)
}

// ── sessão ──
{
  const t = Date.UTC(2026, 8, 14, 7, 30) / 1000 // segunda 07:30 UTC
  check('sessão 0700-2000', dentroDaSessao(t, '0700-2000', 'UTC'))
  check('sessão 0800-2000 fora', !dentroDaSessao(t, '0800-2000', 'UTC'))
  check('sessão overnight 2200-0800', dentroDaSessao(t, '2200-0800', 'UTC'))
  check('sessão 0000-2400', dentroDaSessao(t, '0000-2400', 'UTC'))
  check('sessão dias :1 (domingo) fora à segunda', !dentroDaSessao(t, '0000-2400:1', 'UTC'))
  check('sessão Europe/Lisbon (+1)', dentroDaSessao(t, '0830-0900', 'Europe/Lisbon'))
}

// ── 3-5. motor: sem repaint, vela aberta, HTF ──
{
  // Passeio aleatório determinístico com volume — gera sinais suficientes para testar.
  let seed = 42
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const velas: Vela[] = []
  let p = 2000
  const t0 = Date.UTC(2026, 0, 5) / 1000
  for (let i = 0; i < 2500; i++) {
    const o = p
    const c = o + (rnd() - 0.48) * 4
    const hgh = Math.max(o, c) + rnd() * 2
    const low = Math.min(o, c) - rnd() * 2
    velas.push({ t: t0 + i * 900, o: +o.toFixed(2), h: +hgh.toFixed(2), l: +low.toFixed(2), c: +c.toFixed(2), v: Math.round(500 + rnd() * 1500) })
    p = c
  }
  const base = { simbolo: 'XAUUSD', useHTF: false, allowSell: true }
  const todas = calcularSensei(velas, base, { ultimaConfirmada: true })
  check('motor gera sinais no passeio aleatório', todas.sinais.length > 5, String(todas.sinais.length))
  let repinta = 0
  for (const k of [1200, 1700, 2100, 2499]) {
    const parcial = calcularSensei(velas.slice(0, k), base, { ultimaConfirmada: true })
    const a = JSON.stringify(parcial.sinais.map((s) => [s.barra, s.lado, s.texto, s.niveis]))
    const b = JSON.stringify(todas.sinais.filter((s) => s.barra < k).map((s) => [s.barra, s.lado, s.texto, s.niveis]))
    if (a !== b) repinta++
    const sp = parcial.series.bullScore
    if (sp.some((x, i) => x !== todas.series.bullScore[i])) repinta++
  }
  check('sem repaint (sinais e score iguais com menos velas)', repinta === 0)

  // A última vela, se aberta, nunca gera sinal
  const sinalBar = todas.sinais[todas.sinais.length - 1].barra
  const cortada = velas.slice(0, sinalBar + 1)
  const aberta = calcularSensei(cortada, base, { ultimaConfirmada: false })
  const fechada = calcularSensei(cortada, base, { ultimaConfirmada: true })
  check('vela aberta não gera sinal', !aberta.sinais.some((s) => s.barra === sinalBar) && fechada.sinais.some((s) => s.barra === sinalBar))

  // HTF: com velas H4 dadas, uma vela M15 às 04:00 (fecha 04:15) só vê a H4 das 00:00 (fechou às 04:00)
  const h4: Vela[] = [0, 1, 2, 3].map((k) => ({ t: t0 + k * 14400, o: 1, h: 1, l: 1, c: 10 + k, v: 1 }))
  const m15 = Array.from({ length: 64 }, (_, i) => ({ t: t0 + i * 900, o: 1, h: 1, l: 1, c: 1, v: 1 }))
  const r = calcularSensei(m15, { simbolo: 'XAUUSD', htfEmaLen: 1 }, { velasHTF: h4, ultimaConfirmada: true })
  check('htf: na antes de fechar a 1.ª H4', Number.isNaN(r.series.htfEma[14]))
  check('htf: última M15 da H4 já vê o fecho', r.series.htfEma[15] === 10)
  check('htf: 1.ª M15 da H4 seguinte vê a anterior', r.series.htfEma[16] === 10 && r.series.htfEma[31] === 11)
}

function na() { return Number.NaN }

console.log(`sensei.check: ${ok} ok, ${mau} falhas`)
if (mau > 0) process.exit(1)
