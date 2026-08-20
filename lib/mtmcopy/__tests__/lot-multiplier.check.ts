import { computeLotSize } from '@/lib/mtmcopy/lot-sizing'
import type { ParsedSignal } from '@/lib/mtmcopy/signal-parser'
const ouro = { symbol:'XAUUSD', direction:'buy', entry:4490, sl:4480, tp:[4500] } as ParsedSignal
let ok=0,ko=0
const t=(n:string,r:unknown,e:unknown)=>{ if(JSON.stringify(r)===JSON.stringify(e)) ok++; else {ko++;console.log(`  ✗ ${n}: esperado ${e}, veio ${r}`)} }

console.log('— multiplicador já não inventa 1 lote —')
// Nuno: multiplier 1, risco 1%, saldo 15.000 → 1% de 15.000 = 150 USD / (10 pts × 100) = 0.15
t('Nuno (15.000, risco 1%)',
  computeLotSize({lot_mode:'multiplier',lot_value:1,max_risk_percent:1} as never, ouro, 15000), 0.15)
// Ruben: multiplier 1, risco 0.3%, saldo 50.000 → 150 USD → 0.15
t('Ruben (50.000, risco 0,3%)',
  computeLotSize({lot_mode:'multiplier',lot_value:1,max_risk_percent:0.3} as never, ouro, 50000), 0.15)
t('sem risco definido recusa',
  computeLotSize({lot_mode:'multiplier',lot_value:1,max_risk_percent:0} as never, ouro, 15000), 0)
t('sem saldo recusa',
  computeLotSize({lot_mode:'multiplier',lot_value:1,max_risk_percent:1} as never, ouro, 0), 0)

console.log('— os outros modos não mudam —')
t('fixo 0.01', computeLotSize({lot_mode:'fixed',lot_value:0.01} as never, ouro, 1000), 0.01)
t('risco 1% de 1000', computeLotSize({lot_mode:'risk_percent',lot_value:1} as never, ouro, 1000), 0.01)

const antes = 1.0 * 100 * 4490
console.log(`\nExposição ANTES: ${antes.toLocaleString('pt-PT')} USD · DEPOIS: ${(0.15*100*4490).toLocaleString('pt-PT')} USD`)
console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko?1:0)
