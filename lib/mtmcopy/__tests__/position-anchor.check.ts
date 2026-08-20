import { findPremiumSinglePosition } from '@/lib/mtmcopy/premium-single'
import type { MetaApiPosition } from '@/lib/mtmcopy/metaapi'

const p = (id: string, openPrice: number): MetaApiPosition => ({
  id, symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice,
  comment: 'Premium-0.1-75/15/10', volume: 0.1,
} as MetaApiPosition)

// Dois setups de ouro abertos ao mesmo tempo, como aconteceu hoje.
const posicoes = [p('setup-4486', 4486), p('setup-4367', 4367)]

let ok = 0, ko = 0
const t = (nome: string, real: unknown, esp: unknown) => {
  if (real === esp) ok++
  else { ko++; console.log(`  ✗ ${nome}: esperado ${esp}, veio ${real}`) }
}

console.log('— follow-up ligado à posição do seu sinal —')
t('zona 4489-4483 → posição 4486',
  findPremiumSinglePosition(posicoes, 'XAUUSD', { zoneLow: 4483, zoneHigh: 4489 })?.id, 'setup-4486')
t('zona 4370-4365 → posição 4367',
  findPremiumSinglePosition(posicoes, 'XAUUSD', { zoneLow: 4365, zoneHigh: 4370 })?.id, 'setup-4367')
t('entrada exata 4367',
  findPremiumSinglePosition(posicoes, 'XAUUSD', { entry: 4367 })?.id, 'setup-4367')

console.log('— sem âncora mantém o comportamento antigo (a última) —')
t('sem âncora → última', findPremiumSinglePosition(posicoes, 'XAUUSD')?.id, 'setup-4367')
t('uma só posição', findPremiumSinglePosition([p('unica', 4400)], 'XAUUSD')?.id, 'unica')
t('nenhuma', findPremiumSinglePosition([], 'XAUUSD'), null)

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
