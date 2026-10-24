/**
 * Harmonização dos seguimentos nos chats de sinais (24/10/2026).
 *
 * Correr: npx tsx lib/sinais/__tests__/harmonizacao-seguimentos.check.ts
 *
 *   1. O Forex Swings entra no formato único e continua a ser seguido pelo tracker (entrada a mercado).
 *   2. O «ENTRY HIT» não anuncia lucro de uma trade acabada de abrir, e o preço sai sem ruído de vírgula.
 *   3. Os fechos continuam com pips/pontos no cabeçalho.
 */
import assert from 'node:assert/strict'
import { forexSwingsParaFormatoUnico } from '../forex-swings-formato'
import { lerSinal } from '../formato-sinal'
import { isEntradaParaSeguimento } from '../../mtmcopy/t2t-source'
import { parseSignal } from '../../mtmcopy/signal-parser'
import { lifecycleMessage } from '../../mtmcopy/signal-lifecycle'

// Mensagem real do canal ideias-e-sinais (23/10/2026).
const SWINGS =
  '🌊 MTM Auto FOREX Swings\n\n🔴 EURCHF SELL\n🎯 Take Profit: 0.9158\n🛡️ Stop Loss: 0.9231\n\n' +
  '⚙️ Set & forget — gestão com trailing automático.\n⚠️ Sem promessas de lucro. Usa gestão de risco adequada.'

const unico = forexSwingsParaFormatoUnico(SWINGS, '2026-10-23T10:02:00Z')
assert.ok(unico, 'Forex Swings converte-se')
const lido = lerSinal(unico)
assert.equal(lido?.estrategia, 'MTM Auto Forex Swings')
assert.equal(lido?.simbolo, 'EURCHF')
assert.equal(lido?.direcao, 'sell')
assert.equal(lido?.mercado, true)
assert.equal(lido?.sl, 0.9231)
assert.deepEqual(lido?.tps, [0.9158])
assert.ok(unico!.includes('⚙️ Set & forget'), 'nota do autor mantém-se')
assert.ok(isEntradaParaSeguimento('ideias-e-sinais', unico), 'o tracker continua a seguir a entrada')
const p = parseSignal(unico!)
assert.equal(p?.symbol, 'EURCHF')
assert.equal(p?.entry ?? null, null)
assert.equal(forexSwingsParaFormatoUnico('🏁 EURCHF fechado +40 pips'), null, 'seguimento fica literal')

const entrada = lifecycleMessage('entry_hit', { symbol: 'BTCUSD', direction: 'sell', entry: 81061.4, price: 80990.64499999999 })
assert.ok(!/pontos|pips/.test(entrada.title), `ENTRY HIT sem desfecho: ${entrada.title}`)
assert.ok(entrada.text.includes('@ 80990.645'), `preço limpo: ${entrada.text}`)

const fecho = lifecycleMessage('target_final', { symbol: 'EURCHF', direction: 'sell', entry: 0.9195, price: 0.9158 })
assert.ok(/\+37 pips/.test(fecho.title), `fecho com pips: ${fecho.title}`)

console.log('harmonizacao-seguimentos: ok')

// 4. Premium: o tracker segue o 1.º valor da zona (onde a mestre e o trader entram), não a ponta.
import { entradaDoSeguimento } from '../../mtmcopy/tracker-entrada'
import { t2tSourceKey } from '../../mtmcopy/t2t-source'
const PREMIUM =
  '🔴 XAUUSD · VENDA\n📌 MTM Auto Premium · Novo sinal\n🎯 Zona: 4131 – 4137\n🛑 SL: 4142\n✅ TP1: 4126\n✅ TP2: 4121\n✅ TP3: 4116\n✅ TP4: deixar correr\n⏱ 20/10 08:15\n⚠️ Não é aconselhamento financeiro.'
const pp = parseSignal(PREMIUM)!
const sk = t2tSourceKey('premium-ideas', PREMIUM)
assert.equal(sk, 'premium')
assert.equal(entradaDoSeguimento({ sourceKey: sk, entrada: pp.entry ?? null, zonaPrimeiro: pp.zoneFirst ?? null }), 4131)
assert.equal(entradaDoSeguimento({ sourceKey: 'goldkiller', entrada: 4000, zonaPrimeiro: null }), 4000)
console.log('harmonizacao-seguimentos (premium): ok')
