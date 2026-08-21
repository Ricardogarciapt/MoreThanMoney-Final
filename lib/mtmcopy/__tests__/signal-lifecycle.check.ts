import { detectLifecycleEvent, symbolFromContent, directionFromContent } from '@/lib/mtmcopy/followup-reader'
import { lifecycleMessage, isTerminal, cancelsPending, closesPosition, headline } from '@/lib/mtmcopy/signal-lifecycle'

let ok = 0, ko = 0
function t(nome: string, real: unknown, esperado: unknown) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado)
  if (bate) ok++; else { ko++; console.log(`  ✗ ${nome}\n      esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`) }
}

console.log('— deteção de eventos —')
t('fecho pt', detectLifecycleEvent('Posição fechada · XAUUSD'), 'closed')
t('fecho en', detectLifecycleEvent('Trade closed manually'), 'closed')
t('cancelado', detectLifecycleEvent('Sinal CANCELADO antes de ativar'), 'cancelled')
t('sl', detectLifecycleEvent('SL hit — stop atingido'), 'stop_loss')
t('descartado', detectLifecycleEvent('Ideia descartada, já não é válida'), 'discarded')
t('invalidado', detectLifecycleEvent('Setup invalidado'), 'discarded')
t('alvos antes en', detectLifecycleEvent('All TPs hit before opening'), 'targets_before_entry')
t('alvos antes pt', detectLifecycleEvent('Todos os alvos atingidos antes da entrada'), 'targets_before_entry')
t('entrada não é follow-up', detectLifecycleEvent('XAUUSD BUY 4490 TP1 4500 SL 4480'), null)
t('vazio', detectLifecycleEvent(''), null)

console.log('— precedência (descarte antes de fecho) —')
t('descarte ganha', detectLifecycleEvent('Ideia descartada — posição fechada sem abrir'), 'discarded')

console.log('— extração —')
t('símbolo xau', symbolFromContent('🏁 Posição fechada · XAUUSD 🔴 VENDA'), 'XAUUSD')
t('símbolo par', symbolFromContent('EURUSD fechado'), 'EURUSD')
t('direção venda', directionFromContent('🔴 VENDA'), 'sell')
t('direção compra', directionFromContent('BUY agora'), 'buy')

console.log('— vocabulário —')
const m = lifecycleMessage('discarded', { symbol: 'XAUUSD', direction: 'sell' })
t('título descarte', m.title, '🗑️ Ideia descartada · XAUUSD 🔴 VENDA')
t('descarte é terminal', isTerminal('discarded'), true)
t('descarte apaga pendentes', cancelsPending('discarded'), true)
t('descarte fecha', closesPosition('discarded'), true)
t('entry_hit não é terminal', isTerminal('entry_hit'), false)
t('parcial não apaga pendentes', cancelsPending('partial'), false)


// ——— desfecho no cabeçalho (pips + %) ———
console.log('— desfecho —')
t('sem precos fica so o par', headline({ symbol: 'XAUUSD', direction: 'buy' }), 'XAUUSD 🔵 COMPRA')
t('compra com lucro', headline({ symbol: 'XAUUSD', direction: 'buy', entry: 4370, price: 4390 }),
  'XAUUSD 🔵 COMPRA · +200 pips · +0,46%')
t('venda a perder mostra o sinal negativo', headline({ symbol: 'XAUUSD', direction: 'sell', entry: 4370, price: 4390 }),
  'XAUUSD 🔴 VENDA · −200 pips · −0,46%')
t('cripto conta em pontos', headline({ symbol: 'BTCUSDT', direction: 'buy', entry: 60000, price: 63500 }),
  'BTCUSDT 🔵 COMPRA · +3500 pontos · +5,83%')
t('stop loss traz o desfecho na mensagem',
  lifecycleMessage('stop_loss', { symbol: 'EURUSD', direction: 'buy', entry: 1.09, price: 1.085 }).title.includes('−50 pips · −0,46%'), true)

// ——— "Updated": o trader corrigiu o setup ———
console.log('— setup atualizado —')
t('updated simples', detectLifecycleEvent('updated'), 'superseded')
t('Updated com maiuscula', detectLifecycleEvent('Updated'), 'superseded')
t('UPDATED com emoji', detectLifecycleEvent('UPDATED 👍'), 'superseded')
t('updated com ponto', detectLifecycleEvent('updated.'), 'superseded')
// Uma frase QUE CONTEM "updated" nao e uma correcao de setup — e conversa.
t('frase com updated nao conta',
  detectLifecycleEvent("Trade from tonight's session, will keep everyone updated on the trade"), null)
t('update com texto nao conta',
  detectLifecycleEvent('Update 👍\n\nWe have decided not to pursue any additional trades today'), null)
t('cancela pendentes mas nao fecha', cancelsPending('superseded'), true)
t('nao fecha posicoes abertas', closesPosition('superseded'), false)
t('mensagem explica o que aconteceu',
  lifecycleMessage('superseded', { symbol: 'XAUUSD', direction: 'buy', source: 'Premium' }).title,
  '♻️ Setup atualizado · XAUUSD 🔵 COMPRA')

console.log(`\n${ok} passaram, ${ko} falharam`)
process.exit(ko ? 1 : 0)
