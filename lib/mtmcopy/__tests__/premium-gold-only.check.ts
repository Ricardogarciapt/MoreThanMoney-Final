import { channelSymbolSkipReason, isPremiumTradableSymbol } from '@/lib/mtmcopy/signal-rules'
let ok=0, ko=0
const t=(n:string,r:unknown,e:unknown)=>{ if(JSON.stringify(r)===JSON.stringify(e)) ok++; else {ko++;console.log(`  ✗ ${n}: esperado ${e}, veio ${r}`)} }
console.log('— Premium só ouro —')
t('XAUUSD passa', channelSymbolSkipReason('premium-signals','XAUUSD'), null)
t('XAUUSD.s passa', channelSymbolSkipReason('premium-signals','XAUUSD.s'), null)
t('GOLD passa', channelSymbolSkipReason('premium-signals','GOLD'), null)
t('EURUSD recusado', channelSymbolSkipReason('premium-signals','EURUSD') !== null, true)
t('USDJPY recusado', channelSymbolSkipReason('premium-signals','USDJPY') !== null, true)
t('NZDUSD recusado', channelSymbolSkipReason('premium-signals','NZDUSD') !== null, true)
t('sem símbolo recusado', channelSymbolSkipReason('premium-signals', null) !== null, true)
console.log('— outros canais não são afetados —')
t('forex no trade-ideas passa', channelSymbolSkipReason('trade-ideas','EURUSD'), null)
t('forex sem canal passa', channelSymbolSkipReason(null,'EURUSD'), null)
t('helper ouro', isPremiumTradableSymbol('XAUUSD'), true)
t('helper forex', isPremiumTradableSymbol('EURUSD'), false)
console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko?1:0)
