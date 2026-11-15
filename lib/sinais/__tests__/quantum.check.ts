import assert from 'node:assert/strict'
import {
  CANAL_QUANTUM,
  NOME_QUANTUM,
  chaveTradeQuantum,
  direcaoQuantum,
  eAlertaQuantum,
  eventoQuantum,
  extrasQuantum,
  niveisQuantum,
} from '../quantum'
import { formatarSinal } from '../formato-sinal'
import { parseSignal } from '../../mtmcopy/signal-parser'
import { scannerKeyFromStrategy } from '../../mtm-alerts/scanners'
import { chaveDeSubscricao } from '../../alertas/catalogo'
import { ESTUDOS_WEBTRADER, scannerStudies } from '../../scanners/estudos'
import { ESTRATEGIA_DO_WEBHOOK } from '../../mestres/servidor/sinal-mestre'
import { CANAL_POR_FONTE_MTM } from '../../mestres/canal-t2t'
import { marcaDaEstrategia } from '../grafico-estrategia'
import { eAlertaRocketnova } from '../rocketnova'
import { eAlertaDefy } from '../defy-webhook'

/** Quantum by MTM (docs/pine/mtm-quantum.pine). Correr: npx tsx lib/sinais/__tests__/quantum.check.ts */

// Encaminhamento: `?strategy` decide; sem ele, o JSON do Pine ou o texto do alerta simples.
assert.equal(eAlertaQuantum('quantum', {}), true)
assert.equal(eAlertaQuantum('QUANTUM', {}), true)
assert.equal(eAlertaQuantum('rocketnova', { strategy: 'QUANTUM' }), false, 'um ?strategy de outra estratégia nunca é desviado')
assert.equal(eAlertaQuantum(null, { strategy: 'QUANTUM', event: 'entry' }), true)
assert.equal(eAlertaQuantum(null, { source: 'quantum' }), true)
assert.equal(eAlertaQuantum(null, { message: 'Quantum: sinal de COMPRA em XAUUSD a 4000' }), true)
assert.equal(eAlertaQuantum(null, {}, 'Quantum: sinal de VENDA em US30 a 42000'), true)
assert.equal(eAlertaQuantum(null, { message: 'RocketNova: BUY signal' }), false)
assert.equal(eAlertaQuantum('', { ticker: 'XAUUSD', action: 'buy' }), false)
// …e os outros caminhos não apanham o Quantum.
assert.equal(eAlertaRocketnova(null, { strategy: 'QUANTUM', message: 'Quantum: sinal de COMPRA' }), false)
assert.equal(eAlertaDefy(null, { strategy: 'QUANTUM' }), false)

assert.equal(direcaoQuantum('Quantum: sinal de COMPRA em XAUUSD'), 'buy')
assert.equal(direcaoQuantum('sell'), 'sell')
assert.equal(direcaoQuantum('Quantum'), null)

// Níveis: com o stop do Pine, o alvo sai a 2R; sem nada, a regra de 100 pips e 2R.
assert.deepEqual(niveisQuantum('XAUUSD', 'buy', 4000, 3992), { sl: 3992, tp: 4016 })
assert.deepEqual(niveisQuantum('XAUUSD', 'sell', 4000, 4005.5), { sl: 4005.5, tp: 3989 })
assert.deepEqual(niveisQuantum('XAUUSD', 'buy', 4000), { sl: 3990, tp: 4020 })
assert.deepEqual(niveisQuantum('EURUSD', 'sell', 1.1), { sl: 1.11, tp: 1.08 })
assert.deepEqual(niveisQuantum('US30', 'buy', 42000), { sl: 41900, tp: 42200 })

// Chave da trade: par + id da vela de sinal.
assert.equal(chaveTradeQuantum('XAUUSD', { id: '1762560000000' }), 'XAUUSD:1762560000000')
assert.equal(chaveTradeQuantum('XAUUSD', {}), null)

// Eventos (o Pine de hoje só manda entry; estes ficam prontos).
assert.deepEqual(eventoQuantum('tp1', 0), { evento: 'target_final', nivel: 1 })
assert.deepEqual(eventoQuantum('sl', 0), { evento: 'stop_loss' })
assert.deepEqual(eventoQuantum('sl', 1), { evento: 'stop_protegido' })
assert.deepEqual(eventoQuantum('be', 0), { evento: 'stop_protegido' })
assert.deepEqual(eventoQuantum('exit', 0), { evento: 'closed' })
assert.deepEqual(eventoQuantum('cancel', 0), { evento: 'discarded' })
assert.equal(eventoQuantum('xpto', 0), null)

// Extras do cartão: a força do painel e o tipo de sinal, como o Pine os manda.
assert.deepEqual(extrasQuantum({ score: 72, signal: 'pullback+wave' }), ['💪 Força 72/100', '🔺 Recuo à fita + onda do oscilador'])
assert.deepEqual(extrasQuantum({ score: 31, signal: 'wave' }), ['💪 Força 31/100', '🌊 Onda do oscilador'])
assert.deepEqual(extrasQuantum({}), [])

// O cartão publicado lê-se pelo parser.
const n = niveisQuantum('XAUUSD', 'buy', 4000, 3992)
const cartao = formatarSinal({ estrategia: NOME_QUANTUM, simbolo: 'XAUUSD', direcao: 'buy', entrada: 4000, sl: n.sl, tps: [n.tp] })
const p = parseSignal(cartao)
assert.equal(p?.symbol, 'XAUUSD')
assert.equal(p?.direction, 'buy')
assert.equal(p?.sl, 3992)
assert.deepEqual(p?.tp, [4016])

// O Quantum é uma estratégia própria nos alertas, no WebTrader, no T2T e tem mestre no webhook.
assert.equal(scannerKeyFromStrategy(NOME_QUANTUM), 'quantum')
assert.equal(scannerKeyFromStrategy('MTM Auto RocketNova'), 'rocketnova')
assert.equal(chaveDeSubscricao('Quantum'), 'quantum')
assert.ok(ESTUDOS_WEBTRADER.some((e) => e.chave === 'Sinergy' && e.alerta === 'quantum'))
assert.ok(Array.isArray(scannerStudies.Sinergy))
assert.equal(ESTRATEGIA_DO_WEBHOOK.quantum?.slug, 'mtm-auto-quantum')
assert.equal(CANAL_POR_FONTE_MTM.quantum, CANAL_QUANTUM)
assert.equal(marcaDaEstrategia('quantum', NOME_QUANTUM).chave, 'quantum')
assert.equal(marcaDaEstrategia('rocketnova', 'MTM Auto RocketNova').chave, 'rocketnova')
console.log('quantum.check: OK')
