/**
 * Banco de ensaio do MTM Scanner V3.5 (porte TS) com velas REAIS.
 *
 *   npx tsx scripts/estudos/mtmscanner-check.ts [--tv <pasta com CSV do TradingView>]
 *
 * 1. Lê XAUUSD M15 / M5 / H1 pelo MESMO helper da rota do WebTrader (obterVelas; volume = ticks MetaApi).
 * 2. Imprime os últimos B/S com os níveis do alerta, a caixa e a estrutura, e verifica no real: sem
 *    repaint (cortes), SL/TP do lado certo, vela aberta sem sinal, tempo de cálculo.
 * 3. Com --tv (CSV OANDA:XAUUSD exportados pelo MCP tradingview: OANDAXAUUSD_15m.csv, _5m, _1h) compara
 *    na janela comum, com o MESMO início (o reset do POC conta bar_index desde a 1.ª vela):
 *    B/S na mesma vela / a ±1, CHoCH/BOS iguais (não dependem do volume) e — para isolar a fonte do
 *    volume — OANDA com o volume da MetaApi. Mede ainda o efeito de começar o histórico k velas depois.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { ResultadoMTMScanner, Vela } from '../../lib/estudos/mtmscanner'

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'na')
let falhas = 0
const exigir = (nome: string, ok: boolean, extra = '') => { if (!ok) { falhas++; console.log(`   ✗ ${nome} ${extra}`) } else console.log(`   ✓ ${nome}`) }
const INP = { simbolo: 'XAUUSD', mintick: 0.01 }

async function main() {
  const { calcularMTMScanner } = await import('../../lib/estudos/mtmscanner')
  const { obterVelas } = await import('../../lib/mtmfunded/simulado/velas')
  const tvDir = process.argv.includes('--tv') ? process.argv[process.argv.indexOf('--tv') + 1] : null
  const calc = (v: Vela[], extra: object = {}) => calcularMTMScanner(v, { ...INP, ...extra }, { ultimaConfirmada: true })

  const imprimir = (nome: string, velas: Vela[], r: ResultadoMTMScanner) => {
    const u = r.ultima!
    console.log(`\n══ ${nome}: ${velas.length} velas ${iso(velas[0].t)} → ${iso(velas.at(-1)!.t)} | tf ${r.tfSegundos}s`)
    console.log(`   B/S ${r.sinais.length} | DEMA ${f2(u.dema15)}/${f2(u.dema50)}/${f2(u.dema238)} POC ${f2(u.poc)} | estrutura ${u.os ? 'alta' : 'baixa'} (${r.estrutura.length} desenhos) | swings ${r.swings.length}`)
    for (const s of r.sinais.slice(-6)) console.log(`   ${iso(s.t)} ${s.lado.padEnd(4)} E ${f2(s.entry)} SL ${f2(s.sl)} TP ${f2(s.tp1)}/${f2(s.tp2)}/${f2(s.tp3)}`)
    if (r.caixa) console.log(`   caixa ${r.caixa.lado} Entry ${f2(r.caixa.entry)} Stop ${f2(r.caixa.sl)} ${r.caixa.tps.map((t) => t.texto).join(' ')}`)
  }

  const verificar = (nome: string, velas: Vela[]) => {
    const t0 = performance.now()
    const r = calc(velas)
    const ms = performance.now() - t0
    imprimir(nome, velas, r)
    console.log(`   cálculo ${ms.toFixed(1)} ms`)
    let repinta = 0
    for (const k of [Math.floor(velas.length * 0.6), Math.floor(velas.length * 0.85), velas.length - 1]) {
      const p = calc(velas.slice(0, k))
      if (JSON.stringify(p.sinais) !== JSON.stringify(r.sinais.filter((s) => s.barra < k))) repinta++
    }
    exigir('sem repaint nos cortes', repinta === 0)
    const validos = r.sinais.filter((s) => s.valido)
    exigir('SL/TP1 do lado certo', validos.every((s) => (s.lado === 'BUY' ? s.sl < s.entry && s.tp1 > s.entry : s.sl > s.entry && s.tp1 < s.entry)), String(validos.length))
    exigir('TP1→TP3 a afastar-se', validos.every((s) => (s.lado === 'BUY' ? s.tp1 <= s.tp2 && s.tp2 <= s.tp3 : s.tp1 >= s.tp2 && s.tp2 >= s.tp3)))
    const aberta = calcularMTMScanner(velas, INP, { ultimaConfirmada: false })
    exigir('vela aberta sem sinal', !aberta.sinais.some((s) => s.barra === velas.length - 1))
    return r
  }

  const chaves = (r: ResultadoMTMScanner) => r.sinais.map((s) => `${s.t}${s.lado}`)
  const cruzar = (ra: ResultadoMTMScanner, rb: ResultadoMTMScanner) => {
    const sa = new Set(chaves(ra))
    const sa1 = new Set(ra.sinais.flatMap((s) => [-1, 0, 1].map((k) => `${s.t + k * ra.tfSegundos}${s.lado}`)))
    return { iguais: rb.sinais.filter((s) => sa.has(`${s.t}${s.lado}`)).length, perto: rb.sinais.filter((s) => sa1.has(`${s.t}${s.lado}`)).length }
  }
  const estr = (r: ResultadoMTMScanner, velas: Vela[]) => new Set(r.estrutura.filter((e) => !e.extensao && e.tipo !== 'SWEEP').map((e) => `${e.tipo}${e.lado}${velas[e.barra].t}`))

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

      // dependência do início do histórico (fase do reset do POC)
      for (const k of [1, 7]) {
        const rk = calc(tv.slice(k))
        const { iguais } = cruzar(rtv, rk)
        console.log(`   início +${k} vela(s): ${rk.sinais.length} B/S, ${iguais} iguais aos ${rtv.sinais.filter((s) => s.barra >= k).length} com início na 1.ª`)
      }

      const m = meta[tf]
      if (!m) continue
      const inicio = Math.max(m[0].t, tv[0].t)
      const fim = Math.min(m.at(-1)!.t, tv.at(-1)!.t)
      const a = m.filter((v) => v.t >= inicio && v.t <= fim)
      const b = tv.filter((v) => v.t >= inicio && v.t <= fim)
      const ra = calc(a)
      const rb = calc(b)
      const { iguais, perto } = cruzar(ra, rb)
      const volMeta = new Map(a.map((v) => [v.t, v.v ?? 0]))
      const bComVolMeta = b.map((v) => ({ ...v, v: volMeta.get(v.t) ?? 0 }))
      const rbv = calc(bComVolMeta)
      const cv = cruzar(ra, rbv)
      const ea = estr(ra, a), eb = estr(rb, b)
      const estIguais = [...eb].filter((x) => ea.has(x)).length
      const ib = new Map(b.map((v, i) => [v.t, i]))
      const dPoc: number[] = [], dFecho: number[] = []
      let pocIgual = 0, pocTotal = 0
      a.forEach((v, i) => {
        const j = ib.get(v.t)
        if (j == null) return
        dFecho.push(Math.abs(v.c - b[j].c))
        if (Number.isFinite(ra.series.poc[i]) && Number.isFinite(rb.series.poc[j])) { dPoc.push(Math.abs(ra.series.poc[i] - rb.series.poc[j])); pocTotal++ }
      })
      // o POC «igual» mede-se pela vela de onde veio: o mesmo fecho a menos do desvio médio das fontes
      const med = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
      const tol = med(dFecho) * 3
      pocIgual = dPoc.filter((d) => d <= tol).length
      // correlação do volume das duas fontes
      const va = a.filter((v) => ib.has(v.t)).map((v) => v.v ?? 0), vb = a.filter((v) => ib.has(v.t)).map((v) => b[ib.get(v.t)!].v ?? 0)
      const ma = med(va), mb = med(vb)
      const cor = va.reduce((s, x, i) => s + (x - ma) * (vb[i] - mb), 0) / Math.sqrt(va.reduce((s, x) => s + (x - ma) ** 2, 0) * vb.reduce((s, x) => s + (x - mb) ** 2, 0))
      console.log(`\n══ ${tf} MetaApi vs OANDA (janela comum ${iso(inicio)} → ${iso(fim)}, ${a.length}/${b.length} velas)`)
      console.log(`   |Δfecho| médio ${f2(med(dFecho))} · correlação do volume ${cor.toFixed(2)} · POC «da mesma vela» ${pocIgual}/${pocTotal} (${((100 * pocIgual) / Math.max(1, pocTotal)).toFixed(0)} %)`)
      console.log(`   B/S: MetaApi ${ra.sinais.length}, OANDA ${rb.sinais.length}; na mesma vela ${iguais}, a ±1 vela ${perto}`)
      console.log(`   B/S com preços OANDA + volume MetaApi: ${rbv.sinais.length}; na mesma vela ${cv.iguais}, a ±1 ${cv.perto}`)
      console.log(`   estrutura CHoCH/BOS/IDM (sem volume): MetaApi ${ea.size}, OANDA ${eb.size}, iguais ${estIguais}`)
    }
  }
  console.log(`\nmtmscanner-check: ${falhas} falhas`)
  process.exit(falhas ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
