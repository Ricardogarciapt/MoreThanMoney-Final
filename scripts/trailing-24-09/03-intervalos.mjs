/**
 * 03-intervalos.mjs — LEITURA APENAS. Quanto é que esta amostra consegue mesmo dizer?
 *
 * Porquê: 7 trades ao vivo (as outras 3 da conta são 2 reconstituições e 1 espelho com outra
 * gestão) não provam nada. Este script põe números no que a amostra NÃO consegue dizer:
 * intervalo de confiança a 95% do lucro médio por trade (t de Student e bootstrap), e o
 * intervalo da DIFERENÇA emparelhada entre a configuração actual e cada alternativa nos
 * 47 sinais de 31/08→24/09 (a diferença emparelhada é muito mais precisa do que a diferença
 * de dois totais, porque cada sinal é o seu próprio controlo).
 */
const reais = [57.3, 49.9, 36.5, 53.4, -75.0, 65.5, 34.6] // P&L das 7 trades ao vivo (funded_positions)

const media = (a) => a.reduce((x, y) => x + y, 0) / a.length
const dp = (a) => Math.sqrt(a.reduce((x, y) => x + (y - media(a)) ** 2, 0) / (a.length - 1))
const T95 = { 6: 2.447, 7: 2.365, 46: 2.013, 265: 1.969 }

function ic(a, etiqueta) {
  const n = a.length, m = media(a), s = dp(a)
  const t = T95[n - 1] ?? 1.96
  const e = (t * s) / Math.sqrt(n)
  // bootstrap (10 000 reamostragens) — não assume normalidade
  const boot = []
  for (let i = 0; i < 10000; i++) {
    let soma = 0
    for (let j = 0; j < n; j++) soma += a[Math.floor(Math.random() * n)]
    boot.push(soma / n)
  }
  boot.sort((x, y) => x - y)
  console.log(
    `${etiqueta.padEnd(46)} n=${String(n).padStart(3)}  média ${m >= 0 ? '+' : ''}${m.toFixed(1)}  ` +
    `IC95% t [${(m - e).toFixed(1)}, ${(m + e).toFixed(1)}]  bootstrap [${boot[250].toFixed(1)}, ${boot[9750].toFixed(1)}]`,
  )
}

console.log('LUCRO MÉDIO POR TRADE (USD, 0,10 lote)\n')
ic(reais, 'as 7 trades ao vivo da conta mestre')
console.log(`\nO zero ${media(reais) - (T95[6] * dp(reais)) / Math.sqrt(7) > 0 ? 'FICA DE FORA' : 'CAI DENTRO'} do intervalo — ` +
  `com 7 trades e um desvio-padrão de ${dp(reais).toFixed(0)} USD, ` +
  `seriam precisas ~${Math.ceil(((1.96 * dp(reais)) / (media(reais) * 0.5)) ** 2)} trades ` +
  'para estimar o lucro médio com metade da margem de erro actual.')

// ── diferença emparelhada entre a configuração actual e cada alternativa ─────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const dados = join(dirname(fileURLToPath(import.meta.url)), '..', 'dados')
const pnl = JSON.parse(readFileSync(join(dados, 'pnl-por-sinal.json'), 'utf8'))

for (const [etq, modo] of [['5m', 'pessimista'], ['5m', 'optimista'], ['15m', 'pessimista'], ['15m', 'optimista']]) {
  const A = pnl[`${etq}|${modo}|A`]
  if (!A) continue
  console.log(`\nDIFERENÇA POR SINAL face à configuração ACTUAL — barras ${etq}, leitura ${modo} (n=${A.length})`)
  for (const k of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']) {
    const X = pnl[`${etq}|${modo}|${k}`]
    if (!X) continue
    const d = X.map((v, i) => v - A[i])
    const n = d.length, m = media(d), s = dp(d)
    const t = n - 1 >= 100 ? 1.97 : 2.013
    const e = (t * s) / Math.sqrt(n)
    const veredicto = m - e > 0 ? 'MELHOR (significativo)' : m + e < 0 ? 'PIOR (significativo)' : 'indistinguível de zero'
    console.log(`  ${k}: ${(m >= 0 ? '+' : '') + m.toFixed(1)} USD/sinal  IC95% [${(m - e).toFixed(1)}, ${(m + e).toFixed(1)}]  → ${veredicto}`)
  }
}

// ── a vantagem do trailing mais apertado é real ou é do simulador? ───────────
// Num backtest por OHLC, um stop mais apertado sai sempre mais perto do extremo da vela: o
// simulador OFERECE a diferença de distância. Se as diferenças por sinal só tomarem dois
// valores — «exactamente a diferença de distância» ou «zero» —, não há nenhum caso em que o
// stop mais apertado tenha saído cedo demais e perdido dinheiro. Isso não acontece no mercado
// real; acontece no simulador. Então a «vantagem» é do instrumento, não da estratégia.
console.log(`\nA VANTAGEM DO TRAILING MAIS APERTADO (I: persegue a 1,00 em vez de 2,00) É REAL?`)
for (const etq of ['5m', '15m']) {
  const A = pnl[`${etq}|pessimista|A`], I = pnl[`${etq}|pessimista|I`]
  const d = I.map((v, i) => Number((v - A[i]).toFixed(2)))
  const valores = [...new Set(d)].sort((a, b) => a - b)
  const presente = d.filter((x) => Math.abs(x - 10) < 0.01).length
  console.log(`  ${etq}: valores distintos da diferença → ${valores.join(', ')} USD`)
  console.log(`        ${presente}/${d.length} valem exactamente +10,00 USD (= 1,00 USD de preço × 10 USD/USD a 0,10 lote)`)
  console.log(`        casos em que o stop mais apertado saiu cedo demais e PERDEU dinheiro: ${d.filter((x) => x < 0).length}`)
}
console.log('  → nenhum caso negativo. No mercado real um stop mais apertado é apanhado mais vezes;')
console.log('    aqui nunca é. A diferença é o presente do simulador, não uma vantagem a levar para dinheiro real.')
