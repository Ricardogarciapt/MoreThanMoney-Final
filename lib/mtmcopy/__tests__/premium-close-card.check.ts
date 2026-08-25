import assert from 'node:assert/strict'
import { lifecycleMessage } from '../signal-lifecycle'

// O cartão que o monitor publica ao encerrar tem de ser reconhecido como TERMINAL pelos dois
// feeds do Tap to Trade — web (components/mobile/tap-to-trade-feed.tsx) e nativo (Swift).
// Se deixar de bater, o cartão fica no tab como se ainda desse para entrar.
const TERMINAL_WEB =
  /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i

for (const evento of ['target_final', 'closed'] as const) {
  const { text } = lifecycleMessage(evento, {
    symbol: 'XAUUSD',
    direction: 'buy',
    source: 'MTM Auto Premium',
    entry: 4615,
    price: 4635,
  })
  assert.ok(TERMINAL_WEB.test(text), `${evento}: o feed não reconhece este cartão como fecho → ${text}`)
  assert.ok(/XAUUSD/.test(text), `${evento}: falta o par`)
  assert.ok(/pips/.test(text), `${evento}: falta o resultado em pips`)
}

// Um cartão de meio-caminho NÃO pode encerrar a ideia — a trade continua a correr.
for (const evento of ['break_even', 'partial', 'trailing'] as const) {
  const { text } = lifecycleMessage(evento, { symbol: 'XAUUSD', direction: 'buy', source: 'MTM Auto Premium' })
  assert.equal(TERMINAL_WEB.test(text), false, `${evento} não devia encerrar a ideia → ${text}`)
}

console.log('✓ premium-close-card: 9 verificações')
