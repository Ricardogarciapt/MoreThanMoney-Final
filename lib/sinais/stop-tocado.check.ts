/**
 * O «SL» FALSO DO PINE, com as 11 trades reais do MTM Sensei X em BTCUSDT.P (17–25/10/2026).
 *
 *   npx tsx lib/sinais/stop-tocado.check.ts
 */
import { stopNaoFoiTocado } from './stop-tocado'

const falhas: string[] = []
type D = 'buy' | 'sell'
// [quando, direcção, entrada, stop original, stop do alerta, preço do alerta, foi stop a sério?]
const casos: Array<[string, D, number, number, number, number, boolean]> = [
  ['17/10 21:33', 'sell', 81086.7, 81237.4, 81188.29, 81000, false],
  ['18/10 09:37', 'buy', 81999.2, 81852.7, 81974.15, 82153.1, false],
  ['18/10 21:03', 'sell', 80804.2, 81021.5, 81021.5, 81004.6, true],
  ['19/10 10:00', 'buy', 82752.7, 82522.1, 82704.29, 82730.7, true],
  ['19/10 13:39', 'buy', 82491.1, 82234.4, 82234.4, 82172.6, true],
  ['20/10 14:05', 'buy', 82120.9, 81817.3, 82075.6, 82444.9, false],
  ['21/10 22:19', 'buy', 84675.6, 84399.8, 84547.94, 84558.8, true],
  ['22/10 16:51', 'sell', 81419.3, 81754.5, 81395.65, 81018.7, false],
  ['23/10 22:51', 'sell', 81061.4, 81250.2, 81035.08, 80800, false],
  ['25/10 09:14', 'sell', 80361.9, 80509, 80335.27, 80142, false],
  ['25/10 23:36', 'sell', 80045.4, 80283.5, 80283.5, 80291.4, true],
]
for (const [q, direcao, entrada, slOriginal, sl, preco, real] of casos) {
  if (stopNaoFoiTocado({ direcao, entrada, slOriginal, sl, preco }) !== !real) falhas.push(q)
}
// Sem dados não se reclassifica nada (fica como stop, como antes).
if (stopNaoFoiTocado({ direcao: 'buy', entrada: 1, slOriginal: null, sl: 0.9, preco: 2 })) falhas.push('sem stop original')
if (stopNaoFoiTocado({ direcao: null, entrada: 1, slOriginal: 0.9, sl: 0.9, preco: 2 })) falhas.push('sem direcção')

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}): ${falhas.join(', ')}`)
  process.exit(1)
}
console.log('stop-tocado: as 11 trades classificam certo')
