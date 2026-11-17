import assert from 'node:assert/strict'
import { limparLeitura, relatorioBase, validarPedidoAnalise } from './analise'

const base = {
  nome: 'Ana',
  email: 'ana@exemplo.pt',
  empresa: 'Estúdio Ana',
  telefone: '912 345 678',
  site: '@estudioana',
  equipa: '2 a 5 pessoas',
  dores: 'Passo as tardes a responder a mensagens e a marcar aulas.',
  sector: 'ginasio',
  horas: { mensagens: 10, marcacoes: 5, inexistente: 9, lixo: 'x' },
  custoHora: 10,
  consentimento: true,
}

// Válido: horas desconhecidas e lixo caem fora.
const v = validarPedidoAnalise(base)
assert.ok(v.ok)
if (v.ok) {
  assert.deepEqual(Object.keys(v.pedido.horas).sort(), ['marcacoes', 'mensagens'])
  const { relatorio } = relatorioBase(v.pedido)
  assert.equal(relatorio.totais.horasSemana, 15)
  assert.ok(relatorio.oportunidades.length >= 1)
  assert.ok(relatorio.pressupostos.includes('não é lucro'))
  assert.ok(!/—/.test(JSON.stringify(relatorio)))
}

// Sem consentimento ou sem email: erros, nada passa.
const s = validarPedidoAnalise({ ...base, consentimento: false, email: 'x' })
assert.ok(!s.ok && !('descartar' in s && s.descartar))
if (!s.ok && 'erros' in s) assert.ok(s.erros.consentimento && s.erros.email)

// Site/Instagram e telemóvel são obrigatórios.
const sem = validarPedidoAnalise({ ...base, site: '', telefone: '12' })
assert.ok(!sem.ok && 'erros' in sem && sem.erros.site && sem.erros.telefone)

// Negócio fora da lista: o nome escrito pela pessoa chega ao relatório.
const lv = validarPedidoAnalise({ ...base, sector: 'outro', sectorLivre: 'Oficina de bicicletas' })
assert.ok(lv.ok)
if (lv.ok) assert.equal(relatorioBase(lv.pedido).relatorio.sector, 'Oficina de bicicletas')

// Honeypot: descartado em silêncio.
const h = validarPedidoAnalise({ ...base, website: 'http://spam' })
assert.ok(!h.ok && 'descartar' in h && h.descartar)

// A IA não pode trazer números.
const l = limparLeitura('{"leitura":"Perdes tempo nas mensagens. Poupas 40% já. Começávamos pela agenda.","ideias":["Agente no WhatsApp","Ganhas 3000 € por ano","ok"]}')
assert.equal(l.leitura, 'Perdes tempo nas mensagens. Começávamos pela agenda.')
assert.deepEqual(l.ideias, ['Agente no WhatsApp'])
assert.deepEqual(limparLeitura('não é json'), { leitura: '', ideias: [] })

// Sem horas: relatório honesto, sem prioridades.
const vz = validarPedidoAnalise({ ...base, horas: {} })
assert.ok(vz.ok)
if (vz.ok) assert.equal(relatorioBase(vz.pedido).relatorio.oportunidades.length, 0)

console.log('site-solucoes/analise: ok')
