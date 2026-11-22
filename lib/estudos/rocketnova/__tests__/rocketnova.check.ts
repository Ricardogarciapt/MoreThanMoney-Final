/**
 * RocketNova no gráfico do WebTrader — EMAs, estrelas, sinal com estrela de lançamento e níveis AUTO.
 *
 *   npx tsx lib/estudos/rocketnova/__tests__/rocketnova.check.ts
 */
import assert from 'node:assert/strict'
import { BACKSTEP, calcularRocketNova, LOOKBACK_ESTRELA } from '../motor'
import { niveisRocketnova } from '@/lib/sinais/rocketnova'
import type { Vela } from '../../comum/velas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

// Velas de 15 min: descida com ondas, depois subida com ondas.
const T0 = Date.UTC(2026, 9, 22, 8) / 1000
const velas: Vela[] = []
for (let i = 0; i < 300; i++) {
  const base = i < 150 ? 2000 - i * 1.2 : 1820 + (i - 150) * 1.6
  const c = base + Math.sin(i / 5) * 3
  velas.push({ t: T0 + i * 900, o: c - 0.5, h: c + 1.5, l: c - 1.5, c })
}
const r = calcularRocketNova(velas, { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 })

caso('desenha as três EMAs e encontra estrelas nos fundos', () => {
  assert.equal(r.emaRapida.length, velas.length)
  assert.ok(r.estrelas.some((e) => !e.alto), 'estrela nos mínimos')
})

caso('cada sinal tem estrela do mesmo lado nas últimas 40 velas e os níveis do servidor', () => {
  assert.ok(r.sinais.length > 0, 'há sinais')
  for (const s of r.sinais) {
    const ok = r.estrelas.some((e) => e.alto === (s.direcao === 'sell') && e.i + BACKSTEP <= s.i && s.i - (e.i + BACKSTEP) <= LOOKBACK_ESTRELA)
    assert.ok(ok, `estrela de lançamento para o sinal em ${s.i}`)
    assert.deepEqual({ sl: s.sl, tps: s.tps }, niveisRocketnova('XAUUSD', s.direcao, s.entrada))
  }
})

caso('a última vela (aberta) nunca dá sinal', () => {
  assert.ok(r.sinais.every((s) => s.i <= velas.length - 2))
})

caso('fora do Trade Clock não há sinais', () => {
  const fora = calcularRocketNova(velas.map((v, i) => ({ ...v, t: Date.UTC(2026, 9, 22, 22) / 1000 + (i % 30) * 60 + Math.floor(i / 30) * 86400 })), { simbolo: 'XAUUSD' })
  assert.equal(fora.sinais.length, 0)
})

console.log(`${n} casos ok`)
