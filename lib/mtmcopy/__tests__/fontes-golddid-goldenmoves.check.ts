/** Formatos reais do Gold Did e do Golden Moves. Correr: npx tsx lib/mtmcopy/__tests__/fontes-golddid-goldenmoves.check.ts */
import { parseSignal } from '../signal-parser'
import { isT2TEntrySignal } from '../t2t-source'
import { detectLifecycleEvent } from '../followup-reader'

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

// ── GOLD DID: "XAUUSD I'm buying" + "Entry Zone a - b" + "Stop Loss x" + "TP 1 y"
const goldDid = "XAUUSD I'm buying\n\nEntry Zone 4627.65 - 4632.65\nStop Loss 4622.65\n\nTP 1 4635.15\nTP 2 4637.65\nTP 3 4640.15"
const g = parseSignal(goldDid)
eq('gold did simbolo', g?.symbol, 'XAUUSD')
eq('gold did direcao (gerundio)', g?.direction, 'buy')
eq('gold did stop', g?.sl, 4622.65)
eq('gold did alvos (precos, nao niveis)', g?.tp, [4635.15, 4637.65, 4640.15])
eq('gold did e entrada T2T', isT2TEntrySignal('gold-did', goldDid), true)

// ── GOLDEN MOVES: "I'm buying XAUUSD" + zona sem rótulo + "TP1 x" + "SL y"
const golden = "I'm buying XAUUSD\n\n4642.50-4638\n\nTP1 4645\nTP2 4647\nTP3 4649\nTP4 4653\n\nSL 4635"
const gm = parseSignal(golden)
eq('golden simbolo (sem colar o gerundio)', gm?.symbol, 'XAUUSD')
eq('golden direcao', gm?.direction, 'buy')
eq('golden stop', gm?.sl, 4635)
eq('golden alvos', gm?.tp, [4645, 4647, 4649, 4653])
eq('golden e entrada T2T', isT2TEntrySignal('golden-moves', golden), true)

// ── O que NÃO é sinal
eq('comentario nao e entrada',
   isT2TEntrySignal('gold-did', '7pm.\n\ni would like to see if there is any more willing buyers below 4630.'), false)
eq('resumo do dia nao e entrada',
   isT2TEntrySignal('golden-moves', '**Monday Summary**\n**5 Trades Sent**\n**4 winning trades**'), false)

// ── Follow-ups: como o trader os escreve
eq('Tp1 hit', detectLifecycleEvent('Tp1 hit'), 'partial')
eq('TP1 HIT', detectLifecycleEvent('TP1 HIT'), 'partial')
eq('SET BE', detectLifecycleEvent('SET BE'), 'break_even')
eq('saida', detectLifecycleEvent('Out after we secured TP1 🙌🏼'), 'closed')
eq('fecho condicional', detectLifecycleEvent('Close we break below'), 'closed')
eq('entrada nao e evento', detectLifecycleEvent(golden), null)

// ── Sem regressões nos formatos que já existiam
const premium = "5. GOLD BUY SETUP\nGold Buy Zone 4586  - 4580\nSL : 4575\nTP1 : 4591\nTP2 : 4596\nTP3 : 4601"
eq('premium continua a ler', parseSignal(premium)?.tp, [4591, 4596, 4601])
const sensei = "🧠 Sensei Scanner — Entry Alert\n📊 XAUUSD   🔵 COMPRA\n🎯 Entrada activada: 4591.79\n🛑 Stop Loss: 4579.14\n✅ Take Profit 1: 4600.5\n✅ Take Profit 2: 4610.2"
// Bug antigo: os alvos do Sensei saíam como "1" e "2" (os níveis), não os preços.
eq('sensei alvos sao precos', parseSignal(sensei)?.tp, [4600.5, 4610.2])

// ── O nosso próprio cartão NÃO é uma entrada (senão ganhava botão de Tap to Trade e os
// follow-ups seguintes penduravam-se nele em vez do sinal do trader).
eq('cartao proprio nao e entrada',
   isT2TEntrySignal('gold-did', '🎯 Alvo 1 · XAUUSD 🔵 COMPRA · +75 pips · +0,16%\nParcial realizada.'), false)
eq('fecho proprio nao e entrada',
   isT2TEntrySignal('golden-moves', '🏁 Posição fechada · XAUUSD 🔵 COMPRA · +120 pips · +0,26%'), false)

console.log(`\n${ok} ok · ${mau} mau`)
process.exit(mau === 0 ? 0 : 1)
