/** Guarda do protótipo automático: npx tsx lib/site-solucoes/prototipo.check.ts */
import assert from 'node:assert/strict'
import { fichaKit, lerServicos, limparPrototipo, modeloDoPrototipo, novoSlug, prazoDemo, promptPrototipo, prototipoBase, validarPedidoPrototipo } from './prototipo'

const ok = validarPedidoPrototipo({
  nome: 'Ana', email: 'Ana@Exemplo.PT', telefone: '912 345 678', empresa: 'Estúdio Ana', sector: 'beleza',
  cor: '#a4496b', servicos: 'Corte - 20 €\nManicure: 25 €\nColoração', solucoes: ['agenda-lembretes', 'agente-ia', 'xpto'], consentimento: true, proposta: 'MTM-261121-19V7',
})
assert.ok(ok.ok)
if (!ok.ok) throw new Error()
assert.equal(ok.pedido.email, 'ana@exemplo.pt')
assert.equal(ok.pedido.cor, '#A4496B')
assert.deepEqual(ok.pedido.solucoes, ['agenda-lembretes', 'agente-ia'], 'solução desconhecida cai')
assert.equal(ok.pedido.proposta, 'MTM-261121-19V7')
assert.deepEqual(lerServicos('Corte - 20 €\nColoração'), [{ s: 'Corte', p: '20 €' }, { s: 'Coloração', p: '' }])

const mau = validarPedidoPrototipo({ nome: 'A', email: 'x', telefone: '1', empresa: '', solucoes: [], consentimento: false, sector: 'outro' })
assert.ok(!mau.ok && !('descartar' in mau && mau.descartar))
if (!mau.ok && 'erros' in mau) for (const k of ['nome', 'email', 'telefone', 'empresa', 'solucoes', 'consentimento', 'sectorLivre']) assert.ok(mau.erros[k], `falta erro ${k}`)
const bot = validarPedidoPrototipo({ website: 'http://spam' })
assert.ok(!bot.ok && 'descartar' in bot && bot.descartar, 'honeypot descarta')

const base = prototipoBase(ok.pedido)
assert.equal(base.modelo, 'beleza')
assert.equal(base.servicos.length, 3)
assert.equal(base.solucoes.length, 2)
assert.ok(base.solucoes.every((s) => s.fluxo.length === 3))
assert.equal(modeloDoPrototipo(base).marca, 'Estúdio Ana')

// IA: frases com números caem, o resto entra
const ia = limparPrototipo(base, JSON.stringify({
  slogan: 'Cabelo bonito sem esperas',
  boasVindas: 'Olá! Bem-vinda ao Estúdio Ana. Temos 20% de desconto hoje.',
  faq: [{ p: 'Posso marcar pelo WhatsApp?', r: 'Sim, escolhes a hora livre e recebes lembrete.' }, { p: 'Quanto custa?', r: 'Custa 20 €.' }],
  paraTi: { 'agenda-lembretes': 'As clientes marcam a hora certa para cada serviço.', 'agente-ia': 'Respondo em 5 minutos.' },
}))
assert.equal(ia.slogan, 'Cabelo bonito sem esperas')
assert.equal(ia.assistente.boasVindas, 'Olá! Bem-vinda ao Estúdio Ana.')
assert.equal(ia.assistente.faq.length, 1, 'resposta com preço inventado cai')
assert.equal(ia.solucoes[0].paraTi, 'As clientes marcam a hora certa para cada serviço.')
assert.equal(ia.solucoes[1].paraTi, '', 'frase com número cai')
assert.ok(ia.ia)
assert.deepEqual(limparPrototipo(base, 'não é json'), base)

const pr = promptPrototipo(ok.pedido, base)
assert.match(pr.sistema, /NUNCA escrevas números/)
assert.match(pr.mensagem, /agenda-lembretes/)

const ficha = fichaKit(ia, ok.pedido)
for (const k of ['nome', 'slogan', 'sector', 'cidade', 'contactos', 'servicos', 'horario', 'marcacao']) assert.ok(k in ficha, `ficha sem ${k}`)
assert.equal((ficha.contactos as { whatsapp: string }).whatsapp, '351912345678')
assert.equal(ficha.tema, 'beleza')

const s = novoSlug('Estúdio Ana & Filhos', () => 0.5)
assert.match(s, /^estudio-ana-filhos-[a-z0-9]{8}$/)
assert.equal(prazoDemo(new Date('2026-11-24T10:30:00Z')).toISOString(), '2026-11-25T10:30:00.000Z')

console.log('ok · protótipo automático')
