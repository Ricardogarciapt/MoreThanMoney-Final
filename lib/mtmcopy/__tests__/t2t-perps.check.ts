/** Perpétuos no T2T: seguir em vez de executar. npx tsx lib/mtmcopy/__tests__/t2t-perps.check.ts */
import { isT2TEntrySignal, t2tMode, t2tButtonLabel, t2tSourceKey, matchesT2TPrefs } from '@/lib/mtmcopy/t2t-source'

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
// A regra passou a ser o PAR, não «só o BTC»: 2026-08-25, pedido do Ricardo — botão de abrir para
// a cripto que existe nas contas MT5, botão de seguir para o que só vive na Bybit. A lista saiu
// dos símbolos reais das contas (PU Prime e VT oferecem os mesmos), por isso ETH e SOL passaram
// de 'follow' para 'execute': o cliente pode mesmo abri-los na conta dele.
t('ETH executa (existe em MT5)', t2tMode('cripto-perps', ETH), 'execute')
t('SOL executa (existe em MT5)', t2tMode('cripto-perps', SOL), 'execute')
t('BTCUSDT executa', t2tMode('cripto-perps', BTC), 'execute')
t('BTCUSD executa', t2tMode('cripto-perps', 'AURUM FLOW · BTCUSD long 62000 TP1 64000'), 'execute')
// O que NÃO existe em MT5 continua a ser seguido, não aberto.
t('PEPE segue', t2tMode('cripto-perps', 'MTM Perps · PEPEUSDT.P\n🟢 LONG\nEntrada 0.0000121\nSL 0.0000115 · TP1 0.0000133'), 'follow')
t('ARB segue', t2tMode('cripto-perps', 'AURUM FLOW · ARBUSDT.P\n🔴 SHORT\nEntrada 0.84\nSL 0.88 · TP1 0.78'), 'follow')
t('fora dos perps executa sempre', t2tMode('premium-ideas', 'GOLD BUY SETUP Zone 4643 - 4637 SL 4635 TP1 4650'), 'execute')
t('ouro no Premium executa', t2tMode('premium-ideas', 'XAUUSD buy 4370 TP1 4390'), 'execute')
t('rotulo de seguir', t2tButtonLabel('follow'), 'Seguir posição')
t('rotulo de aceitar', t2tButtonLabel('execute'), 'Aceitar trade')

console.log('— filtros —')
// Sem filtros definidos segue tudo: e o comportamento por omissao de sempre.
t('sem filtros segue tudo', matchesT2TPrefs('cripto-perps', ETH, { sources: [], assetClasses: [] }), true)
t('sem filtros (null) segue tudo', matchesT2TPrefs('cripto-perps', ETH, { sources: null, assetClasses: null }), true)
// So Premium + ouro: um perpetuo do Aurum nao deve passar -- era isto que o push ignorava.
t('filtro de fonte exclui o perp', matchesT2TPrefs('cripto-perps', ETH, { sources: ['premium'], assetClasses: [] }), false)
t('filtro de classe exclui o perp', matchesT2TPrefs('cripto-perps', ETH, { sources: [], assetClasses: ['gold'] }), false)
t('filtro certo deixa passar', matchesT2TPrefs('cripto-perps', ETH, { sources: ['aurum'], assetClasses: ['crypto'] }), true)

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
