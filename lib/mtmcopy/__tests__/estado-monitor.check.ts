/** Estado dos monitores só é gravado quando muda. Correr: npx tsx lib/mtmcopy/__tests__/estado-monitor.check.ts */
import assert from 'node:assert/strict'
import { estadoMudou, fotografiaEstado, jsonCanonico } from '../estado-monitor'

// A base devolve as chaves por outra ordem: não pode contar como mudança.
const lido = { b: { trailing: false, exitsDone: 1 }, a: { beDone: true } }
const foto = fotografiaEstado(lido)
assert.equal(estadoMudou(foto, { a: { beDone: true }, b: { exitsDone: 1, trailing: false } }), false, 'ordem das chaves')
assert.equal(estadoMudou(fotografiaEstado({}), {}), false, 'vazio continua vazio')

// Mudanças reais.
const s: Record<string, { exitsDone: number; beDone?: boolean; trailSl?: number }> = { x: { exitsDone: 0 } }
const f2 = fotografiaEstado(s)
s.x.exitsDone = 1
assert.equal(estadoMudou(f2, s), true, 'mutação no próprio objecto (a fotografia é uma cópia)')
const s3: Record<string, unknown> = { x: 1 }
const f3 = fotografiaEstado(s3)
delete s3.x
assert.equal(estadoMudou(f3, s3), true, 'linha apagada')
assert.equal(estadoMudou(fotografiaEstado({ x: { trailSl: 1.1 } }), { x: { trailSl: 1.10001 } }), true, 'ratchet do stop')

// undefined não entra (JSON.stringify também o larga ao gravar).
assert.equal(jsonCanonico({ a: undefined, b: 1 }), '{"b":1}')
assert.equal(jsonCanonico([1, { z: null, y: 'a' }]), '[1,{"y":"a","z":null}]')

console.log('estado-monitor: todos certos')
