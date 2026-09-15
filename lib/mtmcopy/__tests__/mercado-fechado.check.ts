/** Saltar leituras à MetaApi com o mercado fechado (fim de semana), excepto cripto. Correr: npx tsx lib/mtmcopy/__tests__/mercado-fechado.check.ts */
import assert from 'node:assert/strict'
import { fimDeSemanaFx, podeSaltarLeitura, saltarLeiturasLigado } from '../market-hours'

let n = 0
const d = (iso: string) => new Date(iso)
const salta = (s: Array<string | null>, iso: string, ligado = true) => { n++; return podeSaltarLeitura(s, d(iso), ligado) }

// ── Verão (EDT, NY = UTC−4): sexta 21:05 UTC → domingo 20:55 UTC ──
assert.equal(salta(['XAUUSD'], '2026-09-18T20:59:00Z'), false, 'sexta antes do fecho lê')
assert.equal(salta(['XAUUSD'], '2026-09-18T21:04:00Z'), false, 'sexta 17:04 NY ainda na margem')
assert.equal(salta(['XAUUSD'], '2026-09-18T21:05:00Z'), true, 'sexta 17:05 NY salta')
assert.equal(salta(['EURUSD', 'XAUUSD.s'], '2026-09-19T12:00:00Z'), true, 'sábado salta')
assert.equal(salta(['XAUUSD'], '2026-09-20T20:54:00Z'), true, 'domingo 16:54 NY ainda salta')
assert.equal(salta(['XAUUSD'], '2026-09-20T20:55:00Z'), false, 'domingo 16:55 NY volta a ler')
assert.equal(salta(['XAUUSD'], '2026-09-20T23:00:00Z'), false, 'domingo à noite lê')

// ── Inverno (EST, NY = UTC−5): o fecho real é às 22:00 UTC — não se salta a última hora ──
assert.equal(salta(['XAUUSD'], '2026-12-04T21:30:00Z'), false, 'sexta de inverno 16:30 NY ainda lê (isMarketOpen diria fechado)')
assert.equal(salta(['XAUUSD'], '2026-12-04T22:10:00Z'), true, 'sexta de inverno 17:10 NY salta')
assert.equal(salta(['XAUUSD'], '2026-12-06T21:50:00Z'), true, 'domingo de inverno 16:50 NY salta')
assert.equal(salta(['XAUUSD'], '2026-12-06T21:56:00Z'), false, 'domingo de inverno 16:56 NY lê')

// ── Cripto nunca se salta; uma cripto na lista mantém a conta a ser lida ──
assert.equal(salta(['BTCUSD'], '2026-09-19T12:00:00Z'), false, 'BTC ao sábado lê')
assert.equal(salta(['XAUUSD', 'ETHUSD'], '2026-09-19T12:00:00Z'), false, 'mistura com cripto lê')
assert.equal(salta(['XAUUSD', null, 'BTCUSDT'], '2026-09-19T12:00:00Z'), false, 'BTCUSDT conta como cripto')

// ── Casos de segurança ──
assert.equal(salta([], '2026-09-19T12:00:00Z'), false, 'lista vazia lê')
assert.equal(salta([''], '2026-09-19T12:00:00Z'), false, 'só vazios lê')
assert.equal(salta(['XAUUSD'], '2026-09-19T12:00:00Z', false), false, 'interruptor desligado lê')
assert.equal(salta(['XAUUSD'], '2026-09-16T12:00:00Z'), false, 'quarta lê')
assert.equal(salta(['XAUUSD'], '2026-09-16T21:30:00Z'), false, 'pausa diária de rollover NÃO salta')

// ── Interruptor ──
n += 6
assert.equal(saltarLeiturasLigado(undefined), true, 'default ligado')
assert.equal(saltarLeiturasLigado('1'), true)
assert.equal(saltarLeiturasLigado('0'), false)
assert.equal(saltarLeiturasLigado('false'), false)
assert.equal(saltarLeiturasLigado(' OFF '), false)
assert.equal(fimDeSemanaFx(d('2026-09-15T12:00:00Z')), false, 'terça não é fim de semana')

console.log(`✓ mercado-fechado: ${n} verificações`)
