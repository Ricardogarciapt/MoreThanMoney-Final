/** Guarda dos factos de relance: npx tsx lib/site-solucoes/factos.check.ts */
import assert from 'node:assert/strict'
import { dataAteOnde, factos, numeroProposta } from './factos'

const f = factos({ horasSemana: 20, recuperaveisSemana: 12, recuperaveisAno: 552, eurosAno: 6624 })
assert.equal(f.diasAno, 69, '552 h / 8 h = 69 dias')
assert.equal(f.semanasAno, 13.8, '552 h / 40 h')
assert.equal(f.minutosDia, 144, '12 h × 60 / 5 dias')
assert.equal(f.fatiaSemana, 0.5)
assert.equal(f.fatiaAutomatizavel, 0.6)
assert.equal(f.diasRepetidosAno, 115, '20 h × 46 semanas / 8 h')

const zero = factos({ horasSemana: 0, recuperaveisSemana: 0, recuperaveisAno: 0, eurosAno: 0 })
assert.equal(zero.diasAno, 0)
assert.equal(zero.fatiaAutomatizavel, 0, 'sem horas não divide por zero')
assert.equal(dataAteOnde(0, 2027), null)

// 2027 começa numa sexta: 1.º dia útil = 1 jan, 2.º = 4 jan (segunda)
assert.equal(dataAteOnde(1, 2027)!.toISOString().slice(0, 10), '2027-01-01')
assert.equal(dataAteOnde(2, 2027)!.toISOString().slice(0, 10), '2027-01-04')
assert.equal(dataAteOnde(23, 2027)!.toISOString().slice(0, 10), '2027-02-02')

const n = numeroProposta('Estúdio Ana', new Date(2026, 10, 21))
assert.match(n, /^MTM-261121-[0-9A-Z]{1,4}$/)
assert.equal(n, numeroProposta('estúdio ana', new Date(2026, 10, 21)), 'estável')

console.log('ok · factos de relance')
