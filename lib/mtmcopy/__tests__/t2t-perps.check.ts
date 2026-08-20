/** Perpétuos no T2T: seguir em vez de executar. npx tsx lib/mtmcopy/__tests__/t2t-perps.check.ts */
import { isT2TEntrySignal, t2tMode, t2tButtonLabel, t2tSourceKey } from '@/lib/mtmcopy/t2t-source'

let ok = 0, ko = 0
const t = (nome: string, real: unknown, esperado: unknown) => {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++
  else { ko++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(real)}\n   esperado: ${JSON.stringify(esperado)}`) }
}

const SOL = 'MTM Perps · SOLUSDT\n🔴 SHORT\nEntrada 178.4\nSL 183 · TP1 171 · TP2 165'
const ETH = 'AURUM FLOW · ETHUSDT.P\n🟢 LONG\nEntrada 3120\nSL 3050 · TP1 3210 · TP2 3290'
const BTC = 'AURUM FLOW · BTCUSDT.P\n🟢 LONG\nEntrada 62000\nSL 60500 · TP1 64000 · TP2 65500'

console.log('— fonte —')
t('perps sao fonte T2T', t2tSourceKey('cripto-perps', ETH), 'aurum')
t('primeverse continua a ganhar', t2tSourceKey('cripto-perps', 'PrimeVerse BTCUSD long 62000 TP1 64000'), 'primeverse')
// O marcador "Aurum Flow" no conteúdo já ganhava por si (o scanner pode publicar noutros
// canais) — o que a linha nova acrescenta é o MTM Perps, que só se identifica pelo canal.
t('MTM Perps no canal de perps e fonte', t2tSourceKey('cripto-perps', SOL), 'aurum')
t('indice sem marcador continua fora', t2tSourceKey('trade-ideas', 'US30 long 52000 TP1 52400'), null)

console.log('— botao aparece —')
t('entrada de perp gera botao', isT2TEntrySignal('cripto-perps', ETH), true)
t('gestao nao gera botao', isT2TEntrySignal('cripto-perps', 'ETHUSDT.P · HIT TP1 ✅ +90 pontos'), false)
t('resumo do dia nao gera botao', isT2TEntrySignal('cripto-perps', 'Performance de hoje: total net pips 320'), false)

console.log('— modo —')
t('ETH perp segue', t2tMode('cripto-perps', ETH), 'follow')
t('SOL perp segue', t2tMode('cripto-perps', SOL), 'follow')
t('BTCUSDT executa', t2tMode('cripto-perps', BTC), 'execute')
t('BTCUSD executa', t2tMode('cripto-perps', 'AURUM FLOW · BTCUSD long 62000 TP1 64000'), 'execute')
t('ouro no Premium executa', t2tMode('premium-ideas', 'XAUUSD buy 4370 TP1 4390'), 'execute')
t('rotulo de seguir', t2tButtonLabel('follow'), 'Seguir posição')
t('rotulo de aceitar', t2tButtonLabel('execute'), 'Aceitar trade')

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
