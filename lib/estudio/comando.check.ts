// Guarda de lib/estudio/comando.ts: npx tsx lib/estudio/comando.check.ts
import assert from 'node:assert/strict'
import { lerComando, reelCurto } from './comando'

const c = lerComando('Cria um Reel do ricardo em 3 planos e takes, num estudio de pod cast, 7 s, gancho: Pagas demais?')
assert.equal(c.planos, 3); assert.equal(c.segundos, 7); assert.equal(c.gancho, 'Pagas demais?')
assert.deepEqual(lerComando(''), { planos: 3, segundos: 15, gancho: null, cenario: null })
assert.equal(lerComando('em dois planos, quinze segundos').planos, 2)

const ws = 'Isto é a primeira frase. Agora vem outra frase aqui. E a terceira frase final. Quarta sobra.'.split(' ')
  .map((w, i) => ({ w, ini: i * 0.5 + Math.floor(i / 5) * 0.6, fim: i * 0.5 + Math.floor(i / 5) * 0.6 + 0.4 }))
const z = reelCurto(ws, [{ ini: 0, fim: 100 }], { planos: 3, segundos: 7, gancho: null, cenario: null })
assert.ok(z.length >= 2 && z.length <= 4, `zonas: ${z.length}`)
assert.equal(z[0].zoom, 1.6)
assert.ok(z.every((x, i) => i === 0 || x.ini >= z[i - 1].fim - 0.11), 'zonas por ordem e sem sobreposição')
console.log('comando.check ok', z.map((x) => [x.ini.toFixed(2), x.fim.toFixed(2), x.zoom]))
