/** Gestão não acorda toda a gente; entradas continuam a acordar. npx tsx lib/mtmcopy/__tests__/notif-ruido.check.ts */
import { isManagementFollowup, isT2TEntrySignal } from '@/lib/mtmcopy/t2t-source'

let ok = 0, ko = 0
const t = (nome: string, real: unknown, esperado: unknown) => {
  if (real === esperado) ok++
  else { ko++; console.error(`✗ ${nome}: obtido ${JSON.stringify(real)}, esperado ${JSON.stringify(esperado)}`) }
}

console.log('— gestão (não deve notificar toda a gente) —')
for (const m of [
  'HIT TP2 ✅ +106PIPS\nTake partials. Manage the trade',
  'HIT TP3 ✅ +180PIPS\nHIT ALL TP ✅',
  '1st entry running +400PIPS ✅\n2nd entry running +240PIPS',
  'Trade active and running +50PIPS ✅\nTake partials and set BE',
  'SL HIT ❌',
  'Posição fechada',
  'Trade cancelada',
]) t(m.split('\n')[0].slice(0, 34), isManagementFollowup(m), true)

console.log('— entradas (têm de continuar a notificar) —')
const setup = '1. GOLD BUY SETUP\nGold Buy Zone 4586 - 4580\nSL : 4575\nTP1 : 4591\nTP2 : 4596\nTP3 : 4601'
t('setup de ouro', isManagementFollowup(setup), false)
t('setup gera botao T2T', isT2TEntrySignal('premium-ideas', setup), true)
t('aviso de sessao', isManagementFollowup('GET READY FOR NEW YORK SESSION!'), false)
t('bom dia', isManagementFollowup('Bom Domingo!'), false)
t('vazio', isManagementFollowup(''), false)
t('nulo', isManagementFollowup(null), false)

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
