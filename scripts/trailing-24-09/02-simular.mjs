/**
 * 02-simular.mjs — LEITURA APENAS. Reconstrói o que cada configuração de gestão teria dado
 * nos sinais «MTM Sensei X» em XAUUSD.
 *
 * Porquê: a conta mestre do Sensei (9782326a…, login 77094082) fechou as 10 posições por stop,
 * nenhuma tocou num alvo. A pergunta do dono foi: «se vires que teríamos lucros maiores [com
 * outro trailing], muda; se não, mantém». Sem números não se mexe.
 *
 * De onde vêm os preços: TradingView OANDA:XAUUSD, barras de 5 minutos (31/08 → 24/09) e de
 * 15 minutos (10/07 → 24/09), guardadas em scripts/dados/. NÃO há histórico de preços na base
 * (funded_precos só guarda o último tick por símbolo), por isso não é possível reconstruir ao
 * tick — e o trailing em causa persegue a 2,00 USD, menos do que a amplitude típica de uma
 * barra de 5m no ouro. Daí as DUAS leituras de cada configuração:
 *
 *   · pessimista — dentro de cada barra o extremo contra a posição vem primeiro, e o stop é
 *     reavaliado outra vez depois do trailing subir (o «serrote» dentro da mesma barra);
 *   · optimista  — dentro de cada barra o extremo a favor vem primeiro e o stop só é testado
 *     no fim.
 *
 * O resultado verdadeiro está algures entre os dois. Uma configuração só é «melhor» se ganhar
 * nas DUAS leituras.
 *
 * Níveis: o motor guarda as DISTÂNCIAS do sinal (sl, tp1..tp4) e aplica-as ao preço de
 * execução — verificado contra as posições reais. Por isso simula-se em espaço relativo à
 * entrada, o que também imuniza a medição contra a diferença de feed entre a OANDA e a PU Prime.
 * Volume 0,10 lote (10 oz) → 1,00 USD de preço = 10 USD de P&L. Custo: spread de 0,32 USD
 * (funded_symbols.spread_pontos = 32) por ida-e-volta, igual em todas as configurações.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dados = join(raiz, 'scripts', 'dados')
const ler = (f) => JSON.parse(readFileSync(join(dados, f), 'utf8'))

const LOTE = 0.1
const USD_POR_PONTO = LOTE * 100 // contract_size 100 → 0,10 lote = 10 oz
const SPREAD = 0.32
const HORIZONTE_H = 48

const sinais = ler('sinais-sensei-xauusd.json')
const posicoes = ler('posicoes-mestre-sensei.json')

// ── configurações a comparar ────────────────────────────────────────────────
// beR/trailR em USD absolutos ou, quando `emR: true`, em múltiplos do risco (R).
const CONFIGS = [
  { nome: 'A · actual (BE 3,5 · trail 4,0/2,0)', be: 3.5, beOff: 0.2, trailIni: 4.0, trailDist: 2.0, passo: 0.4 },
  { nome: 'B · só BE 3,5, sem trailing', be: 3.5, beOff: 0.2, trailIni: null },
  { nome: 'C · sem BE e sem trailing (SL fixo)', be: null, trailIni: null },
  { nome: 'D · trailing só depois do TP1 (2,0)', be: 3.5, beOff: 0.2, trailDepoisTp1: true, trailDist: 2.0, passo: 0.4 },
  { nome: 'E · trailing largo (8,0/4,0)', be: 3.5, beOff: 0.2, trailIni: 8.0, trailDist: 4.0, passo: 0.4 },
  { nome: 'F · em R (BE 0,5R · trail 1R/0,5R)', emR: true, be: 0.5, beOff: 0.05, trailIni: 1.0, trailDist: 0.5, passo: 0.1 },
  { nome: 'G · BE no TP1 + trail 1R depois do TP1', emR: true, beNoTp1: true, beOff: 0.05, trailDepoisTp1: true, trailDist: 1.0, passo: 0.1 },
  { nome: 'H · trailing mais apertado (3,0/1,5)', be: 3.5, beOff: 0.2, trailIni: 3.0, trailDist: 1.5, passo: 0.3 },
  { nome: 'I · actual mas a perseguir a 1,0', be: 3.5, beOff: 0.2, trailIni: 4.0, trailDist: 1.0, passo: 0.2 },
  { nome: 'J · actual mas a perseguir a 3,0', be: 3.5, beOff: 0.2, trailIni: 4.0, trailDist: 3.0, passo: 0.4 },
  { nome: 'K · actual sem parciais (tudo no trail)', be: 3.5, beOff: 0.2, trailIni: 4.0, trailDist: 2.0, passo: 0.4, semParciais: true },
  { nome: 'L · alvo fixo +4,00 USD, tudo', be: null, trailIni: null, tpFixo: 4.0 },
  { nome: 'M · alvo fixo +2,00 USD, tudo', be: null, trailIni: null, tpFixo: 2.0 },
  { nome: 'N · alvo fixo +6,00 USD, tudo', be: 3.5, beOff: 0.2, trailIni: null, tpFixo: 6.0 },
]

// ── uma trade ───────────────────────────────────────────────────────────────
function simular(sinal, barras, i0, cfg, modo) {
  const s = sinal.direcao === 'buy' ? 1 : -1
  const entrada = sinal.entrada
  const R = Math.abs(entrada - sinal.sl)
  if (!(R > 0)) return null
  const emR = (x) => (x == null ? null : cfg.emR ? x * R : x)

  const beGat = emR(cfg.be)
  const beOff = emR(cfg.beOff ?? 0) ?? 0
  const trailIni = emR(cfg.trailIni)
  const trailDist = emR(cfg.trailDist)
  const passo = emR(cfg.passo) ?? 0

  let alvos = sinal.alvos.slice(0, 2)
  let partes = [0.5, 0.25] // saidas_pct do provider sensei, como nas posições reais
  if (cfg.semParciais) { alvos = []; partes = [] }
  if (cfg.tpFixo != null) { alvos = [entrada + s * cfg.tpFixo]; partes = [1] }
  const dTp1 = alvos[0] != null ? Math.abs(alvos[0] - entrada) : null

  let stop = sinal.sl
  let restante = 1
  let nivel = 0
  let lucroPreco = 0 // em USD de preço, ponderado pela fracção fechada
  let melhor = 0 // excursão favorável máxima
  let mfe = 0
  let tocouTp1 = false
  let tocouTp2 = false
  let fim = null

  const fechar = (preco, fracao, motivo) => {
    lucroPreco += (preco - entrada) * s * fracao
    restante -= fracao
    if (restante <= 1e-9) fim = motivo
  }

  const recalcularStop = () => {
    // break-even
    if (beGat != null && melhor >= beGat) {
      const alvo = entrada + s * beOff
      if ((alvo - stop) * s > 0) stop = alvo
    }
    if (cfg.beNoTp1 && nivel >= 1) {
      const alvo = entrada + s * beOff
      if ((alvo - stop) * s > 0) stop = alvo
    }
    // trailing
    let arranque = trailIni
    if (cfg.trailDepoisTp1) arranque = dTp1 != null && nivel >= 1 ? 0 : null
    if (arranque != null && trailDist != null && melhor >= arranque) {
      const alvo = entrada + s * (melhor - trailDist)
      if ((alvo - stop) * s >= passo) stop = alvo
    }
  }

  const fimHorizonte = barras[i0].time + HORIZONTE_H * 3600
  for (let i = i0; i < barras.length && barras[i].time <= fimHorizonte && restante > 1e-9; i++) {
    const b = barras[i]
    const favor = s === 1 ? b.high : b.low
    const contra = s === 1 ? b.low : b.high
    mfe = Math.max(mfe, (favor - entrada) * s)

    if (modo === 'pessimista' && (contra - stop) * s <= 0) { fechar(stop, restante, 'stop'); break }

    while (nivel < alvos.length && (favor - alvos[nivel]) * s >= 0) {
      if (nivel === 0) tocouTp1 = true
      if (nivel === 1) tocouTp2 = true
      const f = Math.min(partes[nivel], restante)
      fechar(alvos[nivel], f, 'alvo')
      nivel++
      if (restante <= 1e-9) break
    }
    if (restante <= 1e-9) break

    melhor = Math.max(melhor, (favor - entrada) * s)
    if (modo === 'minimo' && trailIni != null && trailDist != null && melhor >= trailIni) {
      // pior caso possível de um trailing armado: banca exactamente o mínimo (arranque − distância)
      fechar(entrada + s * (trailIni - trailDist), restante, 'stop'); break
    }
    recalcularStop()

    if ((contra - stop) * s <= 0) { fechar(stop, restante, 'stop'); break }
  }
  if (restante > 1e-9) {
    const ult = barras[Math.min(barras.length - 1, i0 + Math.floor((HORIZONTE_H * 3600) / (barras[1].time - barras[0].time)))] ?? barras.at(-1)
    fechar(ult.close, restante, 'horizonte')
  }

  const pnl = lucroPreco * USD_POR_PONTO - SPREAD * USD_POR_PONTO
  return { pnl, mfe, tocouTp1, tocouTp2, fim }
}

// ── preparar sinais + índice da barra de entrada ────────────────────────────
function prepararSinais(barras) {
  const passo = barras[1].time - barras[0].time
  const t0 = barras[0].time
  const tN = barras.at(-1).time
  const saida = []
  for (const l of sinais) {
    const p = l.raw_payload ?? {}
    const entrada = Number(p.entry ?? l.price)
    const sl = Number(p.sl ?? l.sl)
    const dir = String(l.action ?? '').toLowerCase()
    if (!Number.isFinite(entrada) || !Number.isFinite(sl) || (dir !== 'buy' && dir !== 'sell')) continue
    const sgn = dir === 'buy' ? 1 : -1
    if ((entrada - sl) * sgn <= 0) continue
    const alvos = [p.tp1 ?? l.tp, p.tp2, p.tp3, p.tp4]
      .map(Number)
      .filter((x) => Number.isFinite(x) && (x - entrada) * sgn > 0)
      .sort((a, b) => (a - b) * sgn)
    if (!alvos.length) continue
    const t = Math.floor(new Date(l.received_at).getTime() / 1000)
    if (t < t0 || t > tN - 3600) continue
    const idx = Math.max(0, barras.findIndex((b) => b.time + passo > t))
    if (idx < 0 || idx >= barras.length - 1) continue
    saida.push({ id: l.id, em: l.received_at, direcao: dir, entrada, sl, alvos, idx })
  }
  return saida
}

function correr(ficheiro, etiqueta, filtro) {
  const barras = ler(ficheiro).bars
  let lista = prepararSinais(barras)
  if (filtro) lista = lista.filter((s) => filtro.has(s.id))
  const linhas = []
  for (const cfg of CONFIGS) {
    const r = { nome: cfg.nome }
    for (const modo of ['pessimista', 'optimista']) {
      let pnl = 0, ganhos = 0, tp1 = 0, tp2 = 0, n = 0
      for (const sg of lista) {
        const x = simular(sg, barras, sg.idx, cfg, modo)
        if (!x) continue
        n++; pnl += x.pnl; if (x.pnl > 0) ganhos++; if (x.tocouTp1) tp1++; if (x.tocouTp2) tp2++
      }
      r[modo] = { n, pnl, ganhos, tp1, tp2 }
    }
    linhas.push(r)
  }
  // excursão máxima favorável — independente da configuração
  const mfes = lista.map((sg) => {
    const x = simular(sg, barras, sg.idx, { be: null, trailIni: null }, 'optimista')
    const R = Math.abs(sg.entrada - sg.sl)
    const dTp1 = Math.abs(sg.alvos[0] - sg.entrada)
    return { mfe: x.mfe, R, dTp1 }
  })
  return { etiqueta, n: lista.length, linhas, mfes }
}

function tabela(res) {
  console.log(`\n${'═'.repeat(100)}\n${res.etiqueta} — ${res.n} sinais\n${'═'.repeat(100)}`)
  console.log('configuração'.padEnd(40) + '   PESSIMISTA          |    OPTIMISTA')
  console.log(''.padEnd(40) + '   lucro   acerto  TP1 |    lucro   acerto  TP1')
  for (const l of res.linhas) {
    const f = (m) => `${(m.pnl >= 0 ? '+' : '') + m.pnl.toFixed(0)}`.padStart(8) + `${((m.ganhos / m.n) * 100).toFixed(0)}%`.padStart(7) + `${m.tp1}`.padStart(5)
    console.log(l.nome.padEnd(40) + f(l.pessimista) + ' |' + f(l.optimista))
  }
  const m = res.mfes
  const q = (p) => { const a = m.map((x) => x.mfe).sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))] }
  const chegouTp1 = m.filter((x) => x.mfe >= x.dTp1).length
  const chegou4 = m.filter((x) => x.mfe >= 4).length
  const chegou8 = m.filter((x) => x.mfe >= 8).length
  console.log(`\nexcursão máxima a favor (USD): mediana ${q(0.5).toFixed(2)} · p75 ${q(0.75).toFixed(2)} · p90 ${q(0.9).toFixed(2)}`)
  console.log(`chegaram a +4,00 USD (arranque do trailing actual): ${chegou4}/${m.length} (${((chegou4 / m.length) * 100).toFixed(0)}%)`)
  console.log(`chegaram a +8,00 USD: ${chegou8}/${m.length} (${((chegou8 / m.length) * 100).toFixed(0)}%)`)
  console.log(`chegaram ao TP1 (em algum momento, 48h): ${chegouTp1}/${m.length} (${((chegouTp1 / m.length) * 100).toFixed(0)}%)`)
}

// ── validação: os 7 sinais que a conta mestre executou mesmo ────────────────
const executados = new Set(
  posicoes
    .filter((p) => /^sinal:sensei:msg:tv:/.test(p.ideia_ref ?? ''))
    .map((p) => p.ideia_ref.replace('sinal:sensei:msg:tv:', '')),
)
const realPnl = posicoes.reduce((a, p) => a + Number(p.pnl), 0)
console.log(`conta mestre: ${posicoes.length} posições, P&L real ${realPnl.toFixed(2)} USD`)
console.log(`  · ao vivo com este trailing: ${executados.size}`)
console.log(`  · reconstituídas (RECONST, não são execuções): ${posicoes.filter((p) => /^recon:/.test(p.ideia_ref ?? '')).length}`)
console.log(`  · espelho do provider (outra gestão): ${posicoes.filter((p) => /^espelho-provider:/.test(p.ideia_ref ?? '')).length}`)

tabela(correr('oanda-xauusd-5m.json', 'SÓ os sinais que a conta executou (5m) — validação', executados))
tabela(correr('oanda-xauusd-5m.json', 'Todos os sinais Sensei XAUUSD, 31/08 → 24/09 (barras 5m)'))
tabela(correr('oanda-xauusd-15m.json', 'Todos os sinais Sensei XAUUSD, 10/07 → 24/09 (barras 15m — granularidade grosseira)'))

// ── teste de granularidade ──────────────────────────────────────────────────
// Um trailing que persegue a 1,00-2,00 USD é MAIS APERTADO do que a amplitude média de uma
// barra de 5m no ouro. Num backtest por OHLC isso cria um viés conhecido: o simulador põe o
// stop no extremo da barra e sai logo a seguir, como se tivéssemos apanhado o topo. Se a
// vantagem de um trailing apertado CRESCER quando as barras ficam mais grossas, a vantagem é
// do instrumento, não da estratégia. Mesmos sinais, mesma janela, só muda o tamanho da vela.
function agregar(barras, fator) {
  const out = []
  for (let i = 0; i < barras.length; i += fator) {
    const g = barras.slice(i, i + fator)
    if (!g.length) break
    out.push({ time: g[0].time, open: g[0].open, high: Math.max(...g.map((b) => b.high)), low: Math.min(...g.map((b) => b.low)), close: g.at(-1).close })
  }
  return out
}

console.log(`\n${'═'.repeat(100)}\nTESTE DE GRANULARIDADE — mesmos sinais e mesma janela, só muda o tamanho da vela\n${'═'.repeat(100)}`)
const b5 = ler('oanda-xauusd-5m.json').bars
const base = prepararSinais(b5).map((s) => s.id)
const idsBase = new Set(base)
console.log('velas'.padEnd(10) + 'amplitude média'.padEnd(18) + CONFIGS.filter((c) => /^(A|I|H|E) /.test(c.nome)).map((c) => c.nome.slice(0, 1).padStart(9)).join(''))
for (const fator of [1, 3, 6, 12]) {
  const bb = fator === 1 ? b5 : agregar(b5, fator)
  const lista = prepararSinais(bb).filter((s) => idsBase.has(s.id))
  const amp = bb.reduce((a, b) => a + (b.high - b.low), 0) / bb.length
  const cols = []
  for (const cfg of CONFIGS.filter((c) => /^(A|I|H|E) /.test(c.nome))) {
    let pnl = 0
    for (const sg of lista) pnl += simular(sg, bb, sg.idx, cfg, 'pessimista').pnl
    cols.push(`${pnl.toFixed(0)}`.padStart(9))
  }
  console.log(`${fator * 5}m`.padEnd(10) + `${amp.toFixed(2)} USD`.padEnd(18) + cols.join('') + `   (${lista.length} sinais)`)
}

// ── limite inferior da configuração actual ──────────────────────────────────
// Modo «mínimo»: assume que, MAL o trailing arma (+4,00), é atingido no pior instante possível
// e banca exactamente 4,00 − 2,00 = +2,00 USD. É o pior resultado que a configuração actual
// pode dar sem inventar preços — e não depende do tamanho da vela.
console.log(`\n${'═'.repeat(100)}\nLIMITE INFERIOR — o pior que a configuração actual pode dar (banca sempre só +2,00)\n${'═'.repeat(100)}`)
for (const [fich, etq] of [['oanda-xauusd-5m.json', '47 sinais · 31/08→24/09'], ['oanda-xauusd-15m.json', '266 sinais · 10/07→24/09']]) {
  const bb = ler(fich).bars
  const lista = prepararSinais(bb)
  const linha = []
  for (const cfg of CONFIGS.filter((c) => /^(A|B|C|D|E) /.test(c.nome))) {
    let pnl = 0
    for (const sg of lista) pnl += simular(sg, bb, sg.idx, cfg, 'minimo').pnl
    linha.push(`${cfg.nome.slice(0, 1)}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}`.padStart(12))
  }
  console.log(etq.padEnd(28) + linha.join(''))
}

// ── qualidade dos preenchimentos da conta mestre ────────────────────────────
// O preço a que a conta ENTROU vem do tick da PU Prime (metaapi); o preço do sinal vem do
// TradingView. Se as entradas forem sistematicamente melhores do que o preço do sinal, parte
// do lucro da conta não vem da gestão — vem do preenchimento. A 0,10 lote, 1,00 USD de preço
// vale 10 USD, por isso isto mede-se em dinheiro.
console.log(`\n${'═'.repeat(100)}\nQUALIDADE DOS PREENCHIMENTOS — entrada real vs preço do sinal\n${'═'.repeat(100)}`)
const porId = new Map(sinais.map((s) => [s.id, s]))
let soma = 0, n = 0
for (const p of posicoes) {
  const m = /^sinal:sensei:msg:tv:(.+)$/.exec(p.ideia_ref ?? '')
  if (!m) continue
  const sg = porId.get(m[1])
  if (!sg) continue
  const s = p.direcao === 'buy' ? 1 : -1
  const vantagem = (Number(sg.price) - Number(p.preco_entrada)) * s // >0 = entrámos melhor
  soma += vantagem; n++
  console.log(`${p.aberta_em.slice(0, 16)}  ${p.direcao.padEnd(4)} sinal ${Number(sg.price).toFixed(2)}  entrada ${Number(p.preco_entrada).toFixed(2)}  vantagem ${(vantagem >= 0 ? '+' : '') + vantagem.toFixed(2)} USD = ${(vantagem * USD_POR_PONTO >= 0 ? '+' : '') + (vantagem * USD_POR_PONTO).toFixed(1)} USD de P&L   (P&L real ${Number(p.pnl).toFixed(1)})`)
}
console.log(`\nvantagem média à entrada: ${(soma / n).toFixed(2)} USD de preço = ${((soma / n) * USD_POR_PONTO).toFixed(1)} USD por trade`)
console.log(`total da vantagem nas ${n} trades ao vivo: ${(soma * USD_POR_PONTO).toFixed(0)} USD`)
const pnlVivo = posicoes.filter((p) => /^sinal:sensei:msg:tv:/.test(p.ideia_ref ?? '')).reduce((a, p) => a + Number(p.pnl), 0)
console.log(`P&L real dessas ${n} trades: ${pnlVivo.toFixed(2)} USD`)

// ── P&L por sinal, para o 03-intervalos.mjs calcular diferenças emparelhadas ──
import { writeFileSync } from 'node:fs'
{
  const out = {}
  for (const [fich, etq] of [['oanda-xauusd-5m.json', '5m'], ['oanda-xauusd-15m.json', '15m']]) {
    const bb = ler(fich).bars
    const lista = prepararSinais(bb)
    for (const modo of ['pessimista', 'optimista']) {
      for (const cfg of CONFIGS) {
        out[`${etq}|${modo}|${cfg.nome.slice(0, 1)}`] = lista.map((sg) => simular(sg, bb, sg.idx, cfg, modo).pnl)
      }
    }
  }
  writeFileSync(join(dados, 'pnl-por-sinal.json'), JSON.stringify(out))
}
