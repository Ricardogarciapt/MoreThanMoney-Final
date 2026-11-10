// Guarda de lib/estudio/texto.ts: npx tsx lib/estudio/texto.check.ts
import assert from 'node:assert/strict'
import { ehBengala, normalizarCortes, normalizarEstilo, normalizarPalavras, zonasACortar } from './texto'

const p = normalizarPalavras([
  { word: 'Olá', start: 0.5, end: 0.8 },
  { w: 'ãh', ini: 0.9, fim: 1.1 },
  { w: 'hoje', ini: 1.2, fim: 1.5 },
  { w: 'vamos', ini: 2.6, fim: 2.9 },
  { w: 'falar', ini: 3.0, fim: 3.3 },
])
assert.equal(p.length, 5)
assert.equal(ehBengala('Ãh,'), 'som')
assert.equal(ehBengala('pronto'), 'palavra')
assert.equal(ehBengala('hoje'), null)

const z = zonasACortar(p, new Set([1]), { duracao: 4 })
assert.deepEqual(z, [{ ini: 0.9, fim: 1.1 }].map((c) => ({ ini: Math.min(0.92, c.ini), fim: Math.max(1.08, c.fim) })))

const zp = zonasACortar(p, new Set(), { pausas: true, duracao: 4 })
// início (0–0.38), pausa entre hoje e vamos (1.62–2.48), fim (3.42–4)
assert.equal(zp.length, 3)
assert.ok(Math.abs(zp[1].ini - 1.62) < 1e-9 && Math.abs(zp[1].fim - 2.48) < 1e-9)

assert.deepEqual(normalizarCortes([{ ini: 1, fim: 2 }, { ini: 1.5, fim: 3 }, { ini: 5, fim: 5.01 }]), [{ ini: 1, fim: 3 }])
assert.deepEqual(normalizarEstilo({ legenda: 'xx', musica_db: -100 }), { legenda: 'karaoke', musica_db: -40, duck: true, pausas: true })
console.log('ok — texto do estúdio')

import { notaGancho, notaReel } from './nota'
const g1 = notaGancho('Pára de procurar a estratégia perfeita')
const g2 = notaGancho('Olá a todos, hoje vou falar convosco sobre um tema muito interessante e importante para todos')
assert.ok(g1.nota > g2.nota, `${g1.nota} > ${g2.nota}`)
const r = notaReel({ palavras: p, riscadas: new Set([1]), cortes: zonasACortar(p, new Set([1]), { pausas: true, duracao: 4 }), duracaoBruto: 4, legendas: true, ativos: 1 })
assert.equal(r.sinais.length, 7)
assert.equal(r.sinais.find((s) => s.id === 'bengalas')!.nota, 100)
console.log('ok — notas do estúdio')
