import assert from 'node:assert/strict'
import { classeTrendshot, direcaoTrendshot, eAlertaTrendshot, niveisTrendshot, CANAL_TRENDSHOT, ESTRATEGIA_TRENDSHOT } from '../trendshot'
import { formatarSinal } from '../formato-sinal'
import { isEntradaParaSeguimento, isT2TEntrySignal } from '../../mtmcopy/t2t-source'
import { parseSignal } from '../../mtmcopy/signal-parser'
import { scannerKeyFromStrategy } from '../../mtm-alerts/scanners'
import { chaveDeSubscricao } from '../../alertas/catalogo'
import { ESTUDOS_WEBTRADER } from '../../scanners/estudos'
import { ESTRATEGIA_DO_WEBHOOK } from '../../mestres/servidor/sinal-mestre'

/** Níveis do modo AUTO do Pine «Trendshot by MTM». Correr: npx tsx lib/sinais/__tests__/trendshot.check.ts */
assert.equal(classeTrendshot('XAUUSD'), 'ouro')
assert.equal(classeTrendshot('EURUSD'), 'forex')
assert.equal(classeTrendshot('USDJPY'), 'forex')
assert.equal(classeTrendshot('BTCUSD'), 'outro')
assert.equal(classeTrendshot('US30'), 'outro')

assert.equal(direcaoTrendshot('Trendshot: BUY signal'), 'buy')
assert.equal(direcaoTrendshot('Trendshot: SELL signal'), 'sell')
assert.equal(direcaoTrendshot('Trendshot'), null)

// Ouro: SL 20,00 · TP 0,3/0,6/1,0/1,5
assert.deepEqual(niveisTrendshot('XAUUSD', 'buy', 4000), { sl: 3980, tps: [4006, 4012, 4020, 4030] })
assert.deepEqual(niveisTrendshot('XAUUSD', 'sell', 4000), { sl: 4020, tps: [3994, 3988, 3980, 3970] })
// Forex: SL 100 pips · TP 0,3/0,5/1,0/1,5
assert.deepEqual(niveisTrendshot('EURUSD', 'buy', 1.1), { sl: 1.09, tps: [1.103, 1.105, 1.11, 1.115] })
assert.deepEqual(niveisTrendshot('USDJPY', 'sell', 150), { sl: 151, tps: [149.7, 149.5, 149, 148.5] })
// Resto: 10 000 pontos × 0,01 = 100
assert.deepEqual(niveisTrendshot('US30', 'buy', 42000), { sl: 41900, tps: [42030, 42050, 42100, 42150] })

// O cartão publicado é seguido pelo tracker (cartões de alvo/stop), mas nunca é T2T negociável.
const n = niveisTrendshot('XAUUSD', 'buy', 4000)
const cartao = formatarSinal({ estrategia: ESTRATEGIA_TRENDSHOT, simbolo: 'XAUUSD', direcao: 'buy', entrada: 4000, sl: n.sl, tps: [...n.tps] })
assert.equal(isEntradaParaSeguimento(CANAL_TRENDSHOT, cartao), true, 'Trendshot tem de ser seguido')
assert.equal(isT2TEntrySignal(CANAL_TRENDSHOT, cartao), false, 'Trendshot não é T2T')
const p = parseSignal(cartao)
assert.equal(p?.symbol, 'XAUUSD')
assert.equal(p?.direction, 'buy')
assert.equal(p?.sl, 3980)
assert.deepEqual(p?.tp, [4006, 4012, 4020, 4030])
console.log('trendshot.check: OK')

// 23/10: o TrendShot é uma estratégia própria nos alertas e no WebTrader, e tem mestre no webhook.
{
  assert.equal(scannerKeyFromStrategy(ESTRATEGIA_TRENDSHOT), 'trendshot')
  assert.equal(scannerKeyFromStrategy('MTM Scanner V3.5'), 'mtmscanner')
  assert.equal(chaveDeSubscricao('TrendShot'), 'trendshot')
  assert.ok(ESTUDOS_WEBTRADER.some((e) => e.chave === 'TrendShot' && e.alerta === 'trendshot'))
  assert.equal(ESTRATEGIA_DO_WEBHOOK.trendshot?.slug, 'mtm-auto-trendshot')
}

// Encaminhamento: `?strategy` decide; sem ele, o texto do alerta.
assert.equal(eAlertaTrendshot('Trendshot', {}, ''), true)
assert.equal(eAlertaTrendshot('mtmscanner', { message: 'Trendshot: BUY signal' }, ''), false)
assert.equal(eAlertaTrendshot(null, { message: 'Trendshot: SELL signal' }, '{"message": "Trendshot: SELL signal"}'), true)
assert.equal(eAlertaTrendshot(null, { message: 'Trendshot: BUY signal' }, 'Trendshot: BUY signal'), true)
assert.equal(eAlertaTrendshot(null, { alert_name: 'MTM Auto Trendshot' }, ''), true)
assert.equal(eAlertaTrendshot(null, { message: 'MTMScanner BUY XAUUSD' }, ''), false)
assert.equal(eAlertaTrendshot('', { ticker: 'XAUUSD', action: 'buy' }, ''), false)
console.log('eAlertaTrendshot ok')
