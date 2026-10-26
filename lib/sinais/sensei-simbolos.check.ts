/**
 *   npx tsx lib/sinais/sensei-simbolos.check.ts
 */
import { simboloAceite, simboloCanonico } from './sensei-simbolos'

const falhas: string[] = []
const t = (n: string, c: boolean) => { if (!c) falhas.push(n) }

t('BTCUSDT.P', simboloAceite('sensei', 'BINANCE:BTCUSDT.P'))
t('BTCUSD', simboloAceite('sensei', 'BTCUSD'))
t('XAUUSD', simboloAceite('sensei', 'OANDA:XAUUSD'))
t('GOLD', simboloAceite('sensei', 'GOLD'))
t('ETH fora', !simboloAceite('sensei', 'ETHUSDT.P'))
t('XRP fora', !simboloAceite('sensei', 'BYBIT:XRPUSDT.P'))
t('EURUSD fora', !simboloAceite('sensei', 'EURUSD'))
t('outras estratégias livres', simboloAceite('mtm-scanner', 'ETHUSDT.P') && simboloAceite('aurum-flow', 'XRPUSDT.P'))
t('canónico', simboloCanonico('BINANCE:BTCUSDT.P') === 'BTCUSD')

if (falhas.length) { console.error('FALHOU: ' + falhas.join(', ')); process.exit(1) }
console.log('sensei-simbolos: só BTCUSD e XAUUSD passam no Sensei')
