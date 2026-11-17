import assert from 'node:assert/strict'
import { normalizarSector, sectorGenerico, validarNegocio } from './sector-livre'

assert.ok(!validarNegocio({ negocio: 'x' }).ok)
const v = validarNegocio({ negocio: 'Oficina de bicicletas', site: 'bikes.pt' })
assert.ok(v.ok && v.site === 'https://bikes.pt/')
const ip = validarNegocio({ negocio: 'Oficina', site: 'http://127.0.0.1/x' })
assert.ok(ip.ok && ip.site === null)

const s = normalizarSector(
  JSON.stringify({
    retrato: 'Clientes a ligar para saber se a bicicleta está pronta.',
    horas: { mensagens: 6, marcacoes: 50, inventada: 4, redes: 'x' },
    plano: ['Aviso automático quando a reparação acaba', 'Poupa 30% do tempo', 'Marcação online de revisões'],
    ecra: { cliente: 'João', pergunta: 'A minha bicicleta já está pronta?', resposta: 'Está quase — fica pronta amanhã.', servico: 'Revisão' },
  }),
  'Oficina de bicicletas',
)
assert.ok(s)
if (s) {
  assert.deepEqual(s.horas, { mensagens: 6, marcacoes: 12 })
  assert.equal(s.plano.length, 2)
  assert.ok(!/—/.test(JSON.stringify(s)))
  assert.equal(s.id, 'outro')
}
assert.equal(normalizarSector('{"horas":{"mensagens":3}}', 'X'), null)
assert.equal(normalizarSector('lixo', 'X'), null)
assert.equal(sectorGenerico('Padaria').nome, 'Padaria')
console.log('site-solucoes/sector-livre: ok')
