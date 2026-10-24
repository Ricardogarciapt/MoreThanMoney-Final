/**
 * Eventos do calendário económico no gráfico do WebTrader.
 *
 *   npx tsx lib/webtrader/__tests__/calendario.check.ts
 */
import assert from 'node:assert/strict'
import { eventosDasMoedas, moedasDoSimbolo, proximoEvento } from '../calendario'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('moedas que mexem cada ativo', () => {
  assert.deepEqual(moedasDoSimbolo('EURUSD'), ['EUR', 'USD'])
  assert.deepEqual(moedasDoSimbolo('XAUUSD'), ['USD'])
  assert.deepEqual(moedasDoSimbolo('US30'), ['USD'])
  assert.deepEqual(moedasDoSimbolo('GER40'), ['EUR'])
  assert.deepEqual(moedasDoSimbolo('GBPJPY.pro'), ['GBP', 'JPY'])
  assert.deepEqual(moedasDoSimbolo('ABCXYZ'), [])
})

const linhas = [
  { time: '2026-10-23 12:30:00', country: 'US', event: 'Nonfarm Payrolls', impact: 'high', actual: 210, estimate: 180, prev: 150, unit: 'K' },
  { time: '2026-10-23 08:00:00', country: 'DE', event: 'Ifo', impact: 'medium', actual: null, estimate: 87.1, prev: 86.9 },
  { time: '2026-10-23 09:00:00', country: 'US', event: 'Pouco importante', impact: 'low' },
  { time: '2026-10-23 10:00:00', country: 'JP', event: 'BoJ', impact: 'high' },
]

caso('filtra pelas moedas e pelo impacto, ordena por tempo, hora em UTC', () => {
  const e = eventosDasMoedas(linhas, ['EUR', 'USD'])
  assert.deepEqual(e.map((x) => [x.moeda, x.titulo, x.impacto]), [['EUR', 'Ifo', 'medio'], ['USD', 'Nonfarm Payrolls', 'alto']])
  assert.equal(e[1].em, Date.UTC(2026, 9, 23, 12, 30) / 1000)
  assert.equal(e[1].atual, '210 K')
  assert.equal(e[0].atual, null)
  assert.deepEqual(eventosDasMoedas(null as never, ['USD']), [])
})

caso('próximo evento a partir de agora', () => {
  const e = eventosDasMoedas(linhas, ['EUR', 'USD'])
  assert.equal(proximoEvento(e, Date.UTC(2026, 9, 23, 9) / 1000)?.titulo, 'Nonfarm Payrolls')
  assert.equal(proximoEvento(e, Date.UTC(2026, 9, 24) / 1000), null)
})

console.log(`\n${n} casos ok`)
