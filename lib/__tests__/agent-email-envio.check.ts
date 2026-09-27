import assert from 'node:assert/strict'
import {
  LIMITE_POR_CHAMADA,
  normalizarDestinatarios,
  separarConhecidos,
  validarPedido,
} from '../agent-email-envio'

const base = { to: 'a@b.pt', subject: 'Olá', html: '<p>oi</p>' }

// ── O ENSAIO É O ESTADO POR OMISSÃO ────────────────────────────────────────

/**
 * A regra que protege de um agente curioso: chamar a rota para ver o que ela faz não pode acabar
 * com email em casa de um cliente. Só o booleano `true` envia — nem "true", nem 1, nem "sim".
 */
assert.equal((validarPedido(base) as any).ensaio, true, 'sem confirmar, é ensaio')
assert.equal((validarPedido({ ...base, confirmar: true }) as any).ensaio, false)
for (const quase of ['true', 1, 'sim', {}, [], 'confirmar']) {
  assert.equal((validarPedido({ ...base, confirmar: quase }) as any).ensaio, true, `confirmar=${String(quase)} não envia`)
}

// ── Destinatários ──────────────────────────────────────────────────────────

assert.deepEqual(normalizarDestinatarios(' A@B.PT ').validos, ['a@b.pt'], 'normaliza espaços e caixa')
assert.deepEqual(normalizarDestinatarios(['a@b.pt', 'A@B.pt']).validos, ['a@b.pt'], 'o repetido conta uma vez')
assert.deepEqual(normalizarDestinatarios(['x', 'a@b.pt']).invalidos, ['x'])
assert.deepEqual(normalizarDestinatarios([null, '', undefined]).validos, [])

// Um endereço inválido RECUSA o pedido inteiro em vez de o enviar aos outros: metade de uma lista
// enviada é pior do que nenhuma, porque ninguém sabe qual metade.
assert.equal((validarPedido({ ...base, to: ['a@b.pt', 'lixo'] }) as any).erro, 'destinatario_invalido')
assert.equal((validarPedido({ ...base, to: [] }) as any).erro, 'sem_destinatarios')

// ── Tecto por chamada ──────────────────────────────────────────────────────

const muitos = Array.from({ length: LIMITE_POR_CHAMADA + 1 }, (_, i) => `p${i}@b.pt`)
assert.equal((validarPedido({ ...base, to: muitos }) as any).erro, 'limite_excedido')
assert.ok(!('erro' in (validarPedido({ ...base, to: muitos.slice(0, LIMITE_POR_CHAMADA) }) as any)))
assert.ok(LIMITE_POR_CHAMADA <= 50, 'isto serve avisos, não campanhas')

// ── Corpo e assunto ────────────────────────────────────────────────────────

assert.equal((validarPedido({ to: 'a@b.pt', subject: 'x' }) as any).erro, 'sem_corpo')
assert.equal((validarPedido({ ...base, html: undefined, text: 'olá' }) as any).erro, undefined)
assert.equal((validarPedido({ ...base, subject: '   ' }) as any).erro, 'sem_assunto')
assert.equal((validarPedido({ ...base, subject: 'x'.repeat(201) }) as any).erro, 'assunto_longo')

// ── Só para quem já é nosso ────────────────────────────────────────────────

/**
 * Sem esta separação, quem tivesse a chave tinha um servidor de envio com o domínio e a reputação
 * da MoreThanMoney para mandar o que quisesse a quem quisesse. O custo não é o email: é o domínio
 * ir parar a listas negras e deixarem de chegar os que interessam.
 */
const r = separarConhecidos(['a@b.pt', 'estranho@fora.com'], ['a@b.pt', 'outro@b.pt'])
assert.deepEqual(r.seguem, ['a@b.pt'])
assert.deepEqual(r.desconhecidos, ['estranho@fora.com'])
assert.deepEqual(separarConhecidos(['a@b.pt'], ['A@B.PT']).seguem, ['a@b.pt'], 'a caixa não decide isto')
assert.deepEqual(separarConhecidos([], ['a@b.pt']).seguem, [])

console.log('agent-email-envio: OK')
