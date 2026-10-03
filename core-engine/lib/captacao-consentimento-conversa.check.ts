import assert from 'node:assert/strict'
import {
  ETIQUETA_PERGUNTADO,
  MENSAGENS_ANTES_DE_PEDIR,
  confirmacao,
  devePerguntar,
  lerResposta,
  type EstadoDoPedido,
} from './captacao-consentimento-conversa'

const novo = (p: Partial<EstadoDoPedido> = {}): EstadoDoPedido => ({
  mensagensDela: MENSAGENS_ANTES_DE_PEDIR,
  jaPerguntado: false,
  jaConsentiu: false,
  jaRecusouOuSaiu: false,
  ...p,
})

// ── Não se pede à primeira ─────────────────────────────────────────────────

assert.equal(devePerguntar(novo({ mensagensDela: 1 })), false, 'à primeira mensagem não se pede')
assert.equal(devePerguntar(novo({ mensagensDela: MENSAGENS_ANTES_DE_PEDIR - 1 })), false)
assert.equal(devePerguntar(novo()), true, 'à terceira já houve troca que justifica')
assert.ok(MENSAGENS_ANTES_DE_PEDIR >= 2, 'pedir antes de ter dado valor é ouvir «não»')

// ── Pergunta-se UMA vez ────────────────────────────────────────────────────

/**
 * Insistir depois de um «não» não é persistência comercial: é a mesma pessoa a ser incomodada por
 * uma máquina que não a ouviu. E repetir depois de um «sim» faz duvidar do que já foi dado.
 */
assert.equal(devePerguntar(novo({ jaPerguntado: true })), false)
assert.equal(devePerguntar(novo({ jaConsentiu: true })), false)
assert.equal(devePerguntar(novo({ jaRecusouOuSaiu: true })), false)
assert.equal(devePerguntar(novo({ mensagensDela: 900, jaRecusouOuSaiu: true })), false, 'nem com mil mensagens')

// ── A SAÍDA funciona sempre, com ou sem pergunta pendente ──────────────────

/**
 * O próprio pedido promete «sais quando quiseres, basta dizeres para parar». Uma promessa dessas
 * tem de valer em qualquer momento — antes da pergunta, anos depois, a meio de outra coisa. Se
 * esta guarda cair, o sistema passa a prometer uma saída que não existe.
 */
for (const frase of [
  'parar', 'PARA', 'pára', 'stop', 'cancelar', 'remover', 'unsubscribe',
  'não me mandes mais mensagens', 'nao me envies mais nada', 'deixa-me em paz', 'tira-me da lista',
]) {
  assert.equal(lerResposta(frase, false), 'sair', `«${frase}» sem pergunta pendente tem de sair`)
  assert.equal(lerResposta(frase, true), 'sair', `«${frase}» com pergunta pendente tem de sair`)
}

// ── O «sim» só vale com pergunta feita ─────────────────────────────────────

/**
 * Um «sim» solto no meio de uma conversa («sim, é isso mesmo») não pode valer como consentimento:
 * seria registar uma permissão que ninguém deu — exactamente o que a tabela existe para impedir.
 */
assert.equal(lerResposta('sim', false), 'nada', 'sem pergunta, um «sim» não é permissão')
assert.equal(lerResposta('sim', true), 'sim')
for (const s of ['Sim', 'claro', 'pode ser', 'ok', 'quero', 'aceito', 'autorizo', '👍']) {
  assert.equal(lerResposta(s, true), 'sim', `«${s}»`)
}
for (const n of ['não', 'nao', 'Não.', 'dispenso', 'prefiro que não']) {
  assert.equal(lerResposta(n, true), 'nao', `«${n}»`)
}
assert.equal(lerResposta('não', false), 'nada', 'sem pergunta, um «não» não se regista como recusa')

// ── «Não sei» é uma dúvida, não uma recusa ────────────────────────────────

/**
 * Fechar a porta a quem tem uma dúvida é perder a pessoa por má interpretação. Fica «nada»: não se
 * regista nada, e a pergunta continua pendente para ela responder quando perceber.
 */
for (const d of ['não sei', 'nao sei', 'não percebi', 'não entendi']) {
  assert.equal(lerResposta(d, true), 'nada', `«${d}» é dúvida, não recusa`)
}

// Vazios e ruído não decidem nada.
for (const v of ['', '   ', null, undefined, 'e quanto custa?', 'obrigado']) {
  assert.equal(lerResposta(v as never, true), 'nada', `«${String(v)}»`)
}

// ── As confirmações ────────────────────────────────────────────────────────

assert.match(confirmacao('sim'), /registad/i)
assert.match(confirmacao('sim'), /parar/i, 'o «sim» tem de repetir como se sai')
assert.match(confirmacao('nao'), /n[aã]o te mando/i)
assert.match(confirmacao('sair'), /n[aã]o voltas a receber/i)
// Nenhuma confirmação promete lucro nem mete números — é a regra da casa em toda a escrita.
for (const r of ['sim', 'nao', 'sair'] as const) {
  assert.doesNotMatch(confirmacao(r), /lucro|garant|\d+\s*(€|\$|%)/i)
}

assert.equal(ETIQUETA_PERGUNTADO, 'consentimento:perguntado')

console.log('captacao-consentimento-conversa: OK')
