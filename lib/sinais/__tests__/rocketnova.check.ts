import assert from 'node:assert/strict'
import {
  CANAL_ROCKETNOVA,
  NOME_ROCKETNOVA,
  arredondarRocketnova,
  chaveTradeRocketnova,
  classeRocketnova,
  direcaoRocketnova,
  eAlertaRocketnova,
  eventoRocketnova,
  extrasRocketnova,
  niveisRocketnova,
} from '../rocketnova'
import { formatarSinal } from '../formato-sinal'
import { CANAIS_SO_SEGUIMENTO } from '../../mtmcopy/t2t-source'
import { parseSignal } from '../../mtmcopy/signal-parser'
import { scannerKeyFromStrategy } from '../../mtm-alerts/scanners'
import { chaveDeSubscricao } from '../../alertas/catalogo'
import { ESTUDOS_WEBTRADER, scannerStudies } from '../../scanners/estudos'
import { ESTRATEGIA_DO_WEBHOOK } from '../../mestres/servidor/sinal-mestre'
import { CANAL_POR_FONTE_MTM } from '../../mestres/canal-t2t'
import { marcaDaEstrategia } from '../grafico-estrategia'
import { eAlertaTrendshot } from '../trendshot'
import { eAlertaDefy } from '../defy-webhook'

/** RocketNova by MTM (docs/pine/rocketnova.pine). Correr: npx tsx lib/sinais/__tests__/rocketnova.check.ts */

// Encaminhamento: `?strategy` decide; sem ele, o JSON do Pine ou o texto do alerta simples.
assert.equal(eAlertaRocketnova('rocketnova', {}), true)
assert.equal(eAlertaRocketnova('RocketNova', {}), true)
assert.equal(eAlertaRocketnova('trendshot', { strategy: 'ROCKETNOVA' }), false, 'um ?strategy de outra estratégia nunca é desviado')
assert.equal(eAlertaRocketnova(null, { strategy: 'ROCKETNOVA', event: 'entry' }), true)
assert.equal(eAlertaRocketnova(null, { source: 'rocketnova' }), true)
assert.equal(eAlertaRocketnova(null, { message: 'RocketNova: sinal de COMPRA em XAUUSD a 4000' }), true)
assert.equal(eAlertaRocketnova(null, {}, 'RocketNova: sinal de VENDA em US30 a 42000'), true)
assert.equal(eAlertaRocketnova(null, { message: 'Trendshot: BUY signal' }), false)
assert.equal(eAlertaRocketnova('', { ticker: 'XAUUSD', action: 'buy' }), false)
// …e os outros caminhos não apanham o RocketNova.
assert.equal(eAlertaTrendshot(null, { strategy: 'ROCKETNOVA', message: 'RocketNova: sinal de COMPRA' }, ''), false)
assert.equal(eAlertaDefy(null, { strategy: 'ROCKETNOVA' }), false)

assert.equal(direcaoRocketnova('RocketNova: sinal de COMPRA em XAUUSD'), 'buy')
assert.equal(direcaoRocketnova('sell'), 'sell')
assert.equal(direcaoRocketnova('RocketNova'), null)

// Níveis AUTO (quando o alerta simples não traz sl/tp): a regra de 100 pips do TrendShot.
assert.equal(classeRocketnova('XAUUSD'), 'ouro')
assert.equal(classeRocketnova('EURUSD'), 'forex')
assert.equal(classeRocketnova('US30'), 'outro')
assert.deepEqual(niveisRocketnova('XAUUSD', 'buy', 4000), { sl: 3990, tps: [4003, 4006, 4010, 4015] })
assert.deepEqual(niveisRocketnova('EURUSD', 'sell', 1.1), { sl: 1.11, tps: [1.097, 1.095, 1.09, 1.085] })
assert.deepEqual(niveisRocketnova('US30', 'buy', 42000), { sl: 41900, tps: [42030, 42050, 42100, 42150] })
assert.equal(arredondarRocketnova(4012.7349, 'XAUUSD'), 4012.73)
assert.equal(arredondarRocketnova(1.123456, 'EURUSD'), 1.12346)
assert.equal(arredondarRocketnova(0, 'EURUSD'), null)

// Chave da trade: par + id da vela de sinal.
assert.equal(chaveTradeRocketnova('XAUUSD', { id: '1762560000000' }), 'XAUUSD:1762560000000')
assert.equal(chaveTradeRocketnova('XAUUSD', {}), null)

// Eventos do Pine → ciclo de vida.
assert.deepEqual(eventoRocketnova('tp1', 0), { evento: 'partial', nivel: 1 })
assert.deepEqual(eventoRocketnova('tp3', 2, true), { evento: 'partial', nivel: 3 })
assert.deepEqual(eventoRocketnova('tp3', 2, false), { evento: 'target_final', nivel: 3 }, 'sem TP4 o TP3 é o alvo final')
assert.deepEqual(eventoRocketnova('tp4', 3), { evento: 'target_final', nivel: 4 })
assert.deepEqual(eventoRocketnova('sl', 0), { evento: 'stop_loss' })
assert.deepEqual(eventoRocketnova('sl', 1), { evento: 'stop_protegido' })
assert.deepEqual(eventoRocketnova('be', 1), { evento: 'stop_protegido' })
assert.deepEqual(eventoRocketnova('exit', 0), { evento: 'closed' })
assert.equal(eventoRocketnova('xpto', 0), null)

// Extras do cartão.
assert.deepEqual(extrasRocketnova({ star_bars: 7, rocket: true, volatility: 'high', volume: 'low' }), [
  '✦ Estrela de lançamento há 7 velas',
  '🚀 Rocket Candle no sinal',
  '📈 Volatilidade alta',
  '⚠️ Volume baixo na vela do sinal',
])
assert.deepEqual(extrasRocketnova({}), [])

// O cartão publicado lê-se pelo parser. Como o DEFY, o Pine segue a SUA trade (tp/sl/be/exit) e o
// canal entra no Tap to Trade por `t2t_extra_channels` (migração 239) — nunca pelo tracker só de
// seguimento, senão cada alvo saía duas vezes.
const n = niveisRocketnova('XAUUSD', 'buy', 4000)
const cartao = formatarSinal({ estrategia: NOME_ROCKETNOVA, simbolo: 'XAUUSD', direcao: 'buy', entrada: 4000, sl: n.sl, tps: [...n.tps] })
assert.equal(CANAIS_SO_SEGUIMENTO.includes(CANAL_ROCKETNOVA), false, 'o Pine já segue a trade: sem tracker duplo')
const p = parseSignal(cartao)
assert.equal(p?.symbol, 'XAUUSD')
assert.equal(p?.direction, 'buy')
assert.equal(p?.sl, 3990)
assert.deepEqual(p?.tp, [4003, 4006, 4010, 4015])

// O RocketNova é uma estratégia própria nos alertas, no WebTrader, no T2T e tem mestre no webhook.
assert.equal(scannerKeyFromStrategy(NOME_ROCKETNOVA), 'rocketnova')
assert.equal(scannerKeyFromStrategy('MTM Auto Trendshot'), 'trendshot')
assert.equal(chaveDeSubscricao('RocketNova'), 'rocketnova')
assert.ok(ESTUDOS_WEBTRADER.some((e) => e.chave === 'RocketNova' && e.alerta === 'rocketnova'))
assert.ok(Array.isArray(scannerStudies.RocketNova))
assert.equal(ESTRATEGIA_DO_WEBHOOK.rocketnova?.slug, 'mtm-auto-rocketnova')
assert.equal(CANAL_POR_FONTE_MTM.rocketnova, CANAL_ROCKETNOVA)
assert.equal(marcaDaEstrategia('rocketnova', NOME_ROCKETNOVA).chave, 'rocketnova')
assert.equal(marcaDaEstrategia('trendshot', 'MTM Auto Trendshot').chave, 'trendshot')
console.log('rocketnova.check: OK')
