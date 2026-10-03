import assert from 'node:assert/strict'
import {
  CAIXA_PRE_MARCADA,
  PONTOS_DE_CAPTURA,
  emailUtilizavel,
  ehEmailDeMentira,
  listaDe,
  normalizarEmail,
  podeReceber,
  type PessoaParaDecidir,
} from './captacao-consentimento'

/**
 * As guardas do consentimento.
 *
 * Isto decide A QUEM SE MANDA EMAIL. É a única coisa deste trabalho que, se estiver errada em
 * silêncio, não se corrige com um deploy: os emails já saíram, as queixas já entraram, e o domínio
 * que a MTM usa para falar com clientes que pagam já está a cair em spam.
 *
 * Por isso a forma destes testes é «tenta passar e falha», e não «confirma que funciona».
 */

function pessoa(p: Partial<PessoaParaDecidir>): PessoaParaDecidir {
  return { email: 'alguem@dominio.pt', baseLegal: null, retirou: false, ehCliente: false, ...p }
}

// ── O silêncio é NÃO ────────────────────────────────────────────────────────

// A regra-mãe. Ausência de registo não é permissão, e nunca passa a ser por omissão de ninguém.
assert.equal(podeReceber(pessoa({ baseLegal: null }), 'campanha').pode, false, 'sem registo não se manda campanha')
assert.equal(podeReceber(pessoa({ baseLegal: 'sem_base' }), 'campanha').pode, false)

// ── Ser cliente NÃO é ter pedido campanhas ─────────────────────────────────

// É o atalho mais tentador que existe («são clientes, já nos conhecem») e é ilegal. Fica preso.
assert.equal(
  podeReceber(pessoa({ baseLegal: 'relacao_contratual', ehCliente: true }), 'campanha').pode,
  false,
  'relação contratual serve para emails de serviço, nunca para campanhas',
)

// E o inverso: o email de serviço a um cliente TEM de passar, senão o sistema deixa de avisar as
// pessoas do débito que lhes vai ser feito — que é pior para elas do que um email a mais.
assert.equal(podeReceber(pessoa({ baseLegal: 'relacao_contratual', ehCliente: true }), 'servico').pode, true)

// Um «email de serviço» a quem não é cliente é uma campanha com outro nome. É por aqui que a
// `type: 'transactional'` do caminho antigo deixava passar tudo.
assert.equal(
  podeReceber(pessoa({ baseLegal: 'consentimento', ehCliente: false }), 'servico').pode,
  false,
  'não-cliente não recebe emails de serviço — seria uma campanha disfarçada',
)

// ── Quem retirou, retirou ──────────────────────────────────────────────────

// Antes de tudo o mais: nem consentimento anterior, nem ser cliente, nem ser um email de serviço
// desfaz um «não me mandes mais nada». É a única falha desta lista que não se corrige a pedir desculpa.
for (const finalidade of ['campanha', 'servico'] as const) {
  assert.equal(
    podeReceber(pessoa({ baseLegal: 'consentimento', retirou: true, ehCliente: true }), finalidade).pode,
    false,
    `quem retirou não recebe (${finalidade})`,
  )
}

// ── Quem pediu, recebe ────────────────────────────────────────────────────

// A guarda tem de deixar passar o caso legítimo, senão a lista não serve para nada e alguém vai
// desligá-la em vez de a corrigir.
assert.equal(podeReceber(pessoa({ baseLegal: 'consentimento' }), 'campanha').pode, true)

// ── Emails que não se devem tocar ─────────────────────────────────────────

// Bounces a mais é o que faz um domínio começar a cair em spam, e um endereço malformado é um
// bounce garantido.
for (const mau of ['', '   ', 'sem-arroba', 'a@b', 'a@b.', '@dominio.pt', 'espaço @dominio.pt']) {
  assert.equal(emailUtilizavel(mau), false, `«${mau}» não devia passar`)
}
for (const bom of ['alguem@dominio.pt', 'A.B+tag@Sub.Dominio.COM']) {
  assert.equal(emailUtilizavel(bom), true, `«${bom}» devia passar`)
}
// Um endereço absurdamente longo é sempre lixo, e há limite no protocolo.
assert.equal(emailUtilizavel(`${'a'.repeat(250)}@dominio.pt`), false)

// O `frangauci@test.com` que a ingestão já apanhou: não é de ninguém, e ocupava o lugar de uma
// pessoa a sério numa lista de envio.
assert.ok(ehEmailDeMentira('frangauci@test.com'))
assert.ok(ehEmailDeMentira('  QUALQUER@Example.COM '), 'tem de normalizar antes de comparar')
assert.ok(!ehEmailDeMentira('ricardo@morethanmoney.pt'))
assert.equal(podeReceber(pessoa({ email: 'x@test.com', baseLegal: 'consentimento' }), 'campanha').pode, false)

// ── Comparar emails é comparar a forma normalizada ────────────────────────

// A base compara `lower(btrim(email))`. Se o código comparasse de outra maneira, a mesma pessoa
// apareceria como duas — uma com consentimento e outra sem — e a que não tem é a que recebe.
assert.equal(normalizarEmail('  Alguem@Dominio.PT '), 'alguem@dominio.pt')
assert.equal(normalizarEmail(null), '')

// ── As duas listas não se juntam ──────────────────────────────────────────

// «pediu» e «existe» são listas diferentes e não se misturam. Se alguém sem consentimento cair na
// lista «pediu», cai na lista com que se fazem envios em massa.
assert.equal(listaDe(pessoa({ baseLegal: 'consentimento' })), 'pediu')
assert.equal(listaDe(pessoa({ baseLegal: 'relacao_contratual' })), 'existe')
assert.equal(listaDe(pessoa({ baseLegal: null })), 'existe')
assert.equal(listaDe(pessoa({ baseLegal: 'consentimento', retirou: true })), 'existe')

// ── A caixa nunca nasce marcada ───────────────────────────────────────────

// É a primeira coisa que alguém «optimiza» para subir a conversão da página. Um sim que a pessoa
// não deu vale menos do que um não, porque dá a ilusão de uma lista que não existe.
assert.equal(CAIXA_PRE_MARCADA, false, 'consentimento pré-marcado não é consentimento')

// ── Cada ponto de captura mostra à pessoa o que ela está a aceitar ────────

assert.ok(PONTOS_DE_CAPTURA.length >= 3, 'poucos sítios a pedir permissão = lista que não cresce')
const canaisVistos = new Set<string>()
for (const p of PONTOS_DE_CAPTURA) {
  assert.ok(!canaisVistos.has(p.canal), `canal repetido: ${p.canal}`)
  canaisVistos.add(p.canal)
  assert.ok(p.onde.trim().length > 10, `${p.canal}: falta dizer ONDE se captura`)
  // Sem texto de pedido não há prova, e sem prova não há consentimento que se possa mostrar a
  // ninguém — só um booleano a dizer «confia em mim».
  assert.ok(p.pedido.trim().length > 30, `${p.canal}: o texto do pedido é demasiado curto para ser prova`)
  // A saída tem de estar dita no próprio pedido. Uma permissão que não diz como se retira é uma
  // permissão que a pessoa não deu de forma informada.
  assert.match(
    p.pedido.toLowerCase(),
    /cancel|sais quando|sai quando|quando quiser/,
    `${p.canal}: o pedido tem de dizer que se sai quando se quiser`,
  )
}

console.log('captacao-consentimento.check: ok')
