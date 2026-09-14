/**
 * Banco de ensaio do MTM GoldKiller (porte TS) com velas REAIS.
 *
 *   npx tsx scripts/estudos/goldkiller-check.ts [--tv <pasta com CSV do TradingView>]
 *
 * 1. Lê XAUUSD M15 / M5 / H1 pelo MESMO helper da rota do WebTrader (lib/mtmfunded/simulado/velas.ts →
 *    obterVelas: MetaApi, resolução do nome do símbolo, paginação até 5000).
 * 2. Imprime a linha de estado, os níveis da última vela, as últimas viragens com o alerta, e
 *    verifica no real: sem repaint (cortes), SL/TP do lado certo, alvos por ordem, tempo de cálculo.
 * 3. Com --tv, corre sobre os CSV do TradingView (OANDA:XAUUSD, exportados pelo MCP tradingview:
 *    OANDAXAUUSD_15m.csv, _5m, _1h) e compara as duas fontes na janela comum: viragens iguais e
 *    diferença dos níveis. E mede quanto os níveis dependem do tamanho do histórico (window = 0).
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { ResultadoGoldKiller, Vela } from '../../lib/estudos/goldkiller'

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'na')
let falhas = 0
const exigir = (nome: string, ok: boolean, extra = '') => { if (!ok) { falhas++; console.log(`   ✗ ${nome} ${extra}`) } else console.log(`   ✓ ${nome}`) }

async function main() {
  const { calcularGoldKiller, linhaDeEstadoGK } = await import('../../lib/estudos/goldkiller')
  const { obterVelas } = await import('../../lib/mtmfunded/simulado/velas')
  const tvDir = process.argv.includes('--tv') ? process.argv[process.argv.indexOf('--tv') + 1] : null

  const imprimir = (nome: string, velas: Vela[], r: ResultadoGoldKiller) => {
    const u = r.ultima!
    console.log(`\n══ ${nome}: ${velas.length} velas ${iso(velas[0].t)} → ${iso(velas.at(-1)!.t)} | mintick ${r.mintick} | tf ${r.tfSegundos}s`)
    console.log(`   ${linhaDeEstadoGK(r.inputs)} | viragens ${r.sinais.length} | pernas ${u.pernasAlta}↑ ${u.pernasBaixa}↓`)
    console.log(`   última: ${u.baixa ? 'BAIXA' : 'ALTA'} center ${f2(u.entrada)} | Gain 50/75/90/100 ${[u.ganho.p50, u.ganho.p75, u.ganho.p90, u.ganho.p100].map(f2).join(' / ')} | Drawdown ${[u.perda.p50, u.perda.p75, u.perda.p90, u.perda.p100].map(f2).join(' / ')}`)
    for (const s of r.sinais.slice(-8)) console.log(`   ${iso(s.t)} ${s.lado.padEnd(4)} E ${f2(s.entry)} SL ${f2(s.sl)} TP ${f2(s.tp1)}/${f2(s.tp2)}/${f2(s.tp3)}${s.valido ? '' : ' (inválido)'}`)
  }

  const verificar = (nome: string, velas: Vela[]) => {
    const t0 = performance.now()
    const r = calcularGoldKiller(velas, { simbolo: 'XAUUSD' }, { ultimaConfirmada: true })
    const ms = performance.now() - t0
    imprimir(nome, velas, r)
    console.log(`   cálculo ${ms.toFixed(1)} ms`)
    let repinta = 0
    for (const k of [Math.floor(velas.length * 0.6), Math.floor(velas.length * 0.85), velas.length - 1]) {
      const p = calcularGoldKiller(velas.slice(0, k), { simbolo: 'XAUUSD' }, { ultimaConfirmada: true })
      if (JSON.stringify(p.sinais) !== JSON.stringify(r.sinais.filter((s) => s.barra < k))) repinta++
      if (p.series.ganho.p75.some((x, i) => !(x === r.series.ganho.p75[i] || (Number.isNaN(x) && Number.isNaN(r.series.ganho.p75[i]))))) repinta++
    }
    exigir('sem repaint nos cortes', repinta === 0)
    const validos = r.sinais.filter((s) => s.valido)
    exigir('SL/TP1 do lado certo em todas as viragens válidas', validos.every((s) => (s.lado === 'BUY' ? s.sl < s.entry && s.tp1 > s.entry : s.sl > s.entry && s.tp1 < s.entry)), String(validos.length))
    exigir('TP1→TP3 a afastar-se', validos.every((s) => (s.lado === 'BUY' ? s.tp1 <= s.tp2 && s.tp2 <= s.tp3 : s.tp1 >= s.tp2 && s.tp2 >= s.tp3)))
    exigir('BUY/SELL alternam', r.sinais.every((s, i) => i === 0 || s.lado !== r.sinais[i - 1].lado))
    const aberta = calcularGoldKiller(velas, { simbolo: 'XAUUSD' }, { ultimaConfirmada: false })
    exigir('vela aberta sem sinal', !aberta.sinais.some((s) => s.barra === velas.length - 1))
    return r
  }

  const meta: Record<string, Vela[]> = {}
  for (const tf of ['M15', 'M5', 'H1']) {
    const resp = await obterVelas('XAUUSD', tf, 5000)
    if (!resp.velas.length) { console.log(`MetaApi ${tf}: sem velas (${resp.motivo})`); continue }
    console.log(`\nMetaApi ${tf}: ${resp.velas.length} velas (nome na conta de leitura: ${resp.simboloFonte})`)
    meta[tf] = resp.velas
    verificar(`MetaApi XAUUSD ${tf}`, resp.velas)
  }

  if (tvDir) {
    const ler = (f: string): Vela[] => readFileSync(f, 'utf8').trim().split('\n').slice(1).map((ln) => {
      const [t, o, h, l, c, v] = ln.split(',')
      return { t: Date.parse(t.replace(' ', 'T') + 'Z') / 1000, o: +o, h: +h, l: +l, c: +c, v: +v }
    })
    for (const [tf, fich] of [['M15', 'OANDAXAUUSD_15m.csv'], ['M5', 'OANDAXAUUSD_5m.csv'], ['H1', 'OANDAXAUUSD_1h.csv']] as const) {
      const caminho = `${tvDir}/${fich}`
      if (!existsSync(caminho)) continue
      const tv = ler(caminho)
      const rtv = verificar(`TradingView OANDA:XAUUSD ${tf}`, tv)

      // dependência do histórico: mesmas velas finais, menos história atrás
      const curto = calcularGoldKiller(tv.slice(-3000), { simbolo: 'XAUUSD' }, { ultimaConfirmada: true })
      const d = (a: number, b: number) => Math.abs(a - b)
      const ut = rtv.ultima!, uc = curto.ultima!
      console.log(`   histórico 5000 vs 3000 velas: |ΔGain75| ${f2(d(ut.ganho.p75, uc.ganho.p75))} |ΔDrawdown50| ${f2(d(ut.perda.p50, uc.perda.p50))} (center ${f2(ut.entrada)} vs ${f2(uc.entrada)})`)

      const m = meta[tf]
      if (!m) continue
      // janela comum, com o MESMO início nas duas fontes (as pernas começam a contar no mesmo sítio)
      const inicio = Math.max(m[0].t, tv[0].t)
      const fim = Math.min(m.at(-1)!.t, tv.at(-1)!.t)
      const a = m.filter((v) => v.t >= inicio && v.t <= fim)
      const b = tv.filter((v) => v.t >= inicio && v.t <= fim)
      const ra = calcularGoldKiller(a, { simbolo: 'XAUUSD' }, { ultimaConfirmada: true })
      const rb = calcularGoldKiller(b, { simbolo: 'XAUUSD' }, { ultimaConfirmada: true })
      const sa = new Set(ra.sinais.map((s) => `${s.t}${s.lado}`))
      const sa1 = new Set(ra.sinais.flatMap((s) => [-1, 0, 1].map((k) => `${s.t + k * ra.tfSegundos}${s.lado}`)))
      const iguais = rb.sinais.filter((s) => sa.has(`${s.t}${s.lado}`)).length
      const perto = rb.sinais.filter((s) => sa1.has(`${s.t}${s.lado}`)).length
      const ib = new Map(b.map((v, i) => [v.t, i]))
      const dif: number[] = []
      const difPreco: number[] = []
      a.forEach((v, i) => {
        const j = ib.get(v.t)
        if (j == null || i < 300) return
        const x = ra.series.ganho.p75[i], y = rb.series.ganho.p75[j]
        if (Number.isFinite(x) && Number.isFinite(y)) dif.push(Math.abs(x - y))
        difPreco.push(Math.abs(v.c - b[j].c))
      })
      const med = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
      console.log(`\n══ ${tf} MetaApi vs OANDA (janela comum ${iso(inicio)} → ${iso(fim)}, ${a.length}/${b.length} velas)`)
      console.log(`   viragens: MetaApi ${ra.sinais.length}, OANDA ${rb.sinais.length}; na mesma vela ${iguais}, a ±1 vela ${perto}`)
      console.log(`   |Δfecho| médio ${f2(med(difPreco))} · |ΔGain75| médio ${f2(med(dif))} máx ${f2(Math.max(0, ...dif))}`)
    }
  }
  console.log(`\ngoldkiller-check: ${falhas} falhas`)
  if (falhas) process.exit(1)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
