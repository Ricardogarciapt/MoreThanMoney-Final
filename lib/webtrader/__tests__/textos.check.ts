import assert from 'node:assert/strict'
import { estadoEmFrase } from '../textos'
/** Correr: npx tsx lib/webtrader/__tests__/textos.check.ts */
assert.equal(estadoEmFrase('Breached'), 'quebrada')
assert.equal(estadoEmFrase('Pause'), 'em pausa')
assert.equal(estadoEmFrase('Active'), 'activa')
assert.equal(estadoEmFrase(''), 'indisponível')
assert.equal(estadoEmFrase(null), 'indisponível')
assert.equal(estadoEmFrase('Outro'), 'outro')
console.log('  ok  estado da conta em frase portuguesa')
