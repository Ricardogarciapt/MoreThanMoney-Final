/**
 * `npx tsx lib/__tests__/escada-precos.check.ts`
 *
 * O que se protege aqui não são os preços — esses mudam. É a regra de que há UMA fonte: nenhum
 * guião pode voltar a ter o número escrito à mão. Já aconteceu duas vezes (os 300/350 do
 * depósito, e o «300 $» que ficou meses no desenhador de funis do admin), e as duas vezes o
 * sintoma foi o mesmo — o bot a prometer uma coisa e a validação a exigir outra.
 *
 * Por isso os testes são sobre a PROVENIÊNCIA e sobre o que o texto não pode deixar de dizer,
 * não sobre os valores em si.
 */

import assert from 'node:assert/strict'
import {
  MIN_DEPOSIT,
  NOME_DEGRAU_TOPO,
  PRECO_MEMBRO,
  PRECO_PREMIUM,
  PRECO_PREMIUM_1O_MES,
  PRECO_TOPO,
  TOPO_ANUAL_EUR,
  TOPO_LINK_PAGAMENTO,
  BONUS_PUPRIME_PCT,
  bonusEmLinhas,
  bonusNumaLinha,
  escadaEmLinhas,
  escadaNumaLinha,
} from '@/lib/escada-precos'
import { MENSAGENS, substituir, valoresPadrao } from '@/lib/mensagens-funil'

// ── Formatação portuguesa ────────────────────────────────────────────────────────────────────
assert.equal(PRECO_MEMBRO, '35€/mês')
assert.equal(PRECO_PREMIUM, '65€/mês')
assert.equal(PRECO_PREMIUM_1O_MES, '34,99€', 'o 1º mês escreve-se com vírgula, não com ponto')
assert.equal(PRECO_TOPO, '597€/ano')
assert.equal(TOPO_ANUAL_EUR, 597)

// ── O degrau de cima ─────────────────────────────────────────────────────────────────────────
//
// O dono chamou-lhe «fundador» e depois decidiu ficar com o nome do pacote. «Fundador» está
// tomado pelos cupões do cohort grátis: se alguém voltar a usá-lo como nome do produto, são dois
// produtos com o mesmo nome e direitos diferentes.
assert.equal(NOME_DEGRAU_TOPO, 'Elite')
for (const texto of [escadaEmLinhas(), escadaNumaLinha()]) {
  assert.ok(texto.includes(PRECO_TOPO), 'o degrau de cima tem de aparecer na escada')
  assert.ok(texto.includes(NOME_DEGRAU_TOPO))
  assert.ok(!/fundador/i.test(texto), 'o degrau de cima não se chama Fundador')
}

// Onde se compra o degrau de cima. Esteve `null` de 20/08 a 24/09, enquanto a coluna esteve fora
// do /upgrade; voltou com ela. O que este teste prende é que seja SEMPRE uma página nossa — um URL
// inventado manda o lead para onde o pacote não está, no momento em que ele já decidiu pagar.
assert.ok(
  TOPO_LINK_PAGAMENTO === null || TOPO_LINK_PAGAMENTO.startsWith('/'),
  'o link do degrau de cima é uma página nossa, ou não existe',
)

// ── A regra do bónus: acumula, e tem exactamente dois caminhos ───────────────────────────────
//
// Escrito só com o degrau de cima, esconde os clientes directos que também têm direito; escrito
// sem os dois caminhos, promete a toda a gente. As duas leituras erradas custam a mesma coisa:
// uma pessoa a ouvir o que não lhe pertence.
for (const texto of [bonusEmLinhas(), bonusNumaLinha()]) {
  assert.ok(texto.includes(`${BONUS_PUPRIME_PCT}%`), 'a percentagem do bónus tem de estar no texto')
  assert.ok(/acumula/i.test(texto), 'o bónus ACUMULA — se o texto não o disser, lê-se como substituição')
  assert.ok(texto.includes(NOME_DEGRAU_TOPO), '1.º caminho: o pack anual')
  assert.ok(/cliente directo/i.test(texto), '2.º caminho: cliente directo na PU Prime')
  assert.ok(texto.includes(`${MIN_DEPOSIT}$`), 'o mínimo do 2.º caminho vem do MIN_DEPOSIT, não escrito à mão')
}

// ── A mensagem do /premium ───────────────────────────────────────────────────────────────────
const escada = MENSAGENS.find((m) => m.chave === 'escada_precos')
assert.ok(escada, 'a escada tem de existir como mensagem editável no /admin/social')

// O texto por defeito NÃO pode ter preços escritos — entram por variável. Um preço dentro de uma
// mensagem editável acaba guardado na base de dados, onde nem uma pesquisa no código o encontra.
assert.ok(
  !/\d+\s*€/.test(escada.padrao),
  'os preços entram por {{degraus}}, nunca escritos dentro da mensagem',
)

const saida = substituir(escada.padrao, valoresPadrao())
assert.ok(saida.includes(PRECO_MEMBRO) && saida.includes(PRECO_PREMIUM) && saida.includes(PRECO_TOPO))
assert.ok(saida.includes(`${BONUS_PUPRIME_PCT}%`))
assert.ok(!saida.includes('{{'), 'nenhuma variável pode ficar por substituir no texto que sai')

// Não se lidera com o grátis: a rota sem mensalidade e o teste da app vêm DEPOIS dos degraus
// pagos. O dia em que alguém trocar a ordem, isto falha antes de o lead a ler.
assert.ok(
  saida.indexOf(PRECO_MEMBRO) < saida.indexOf('sem mensalidade'),
  'o Membro tem de vir antes da rota sem mensalidade',
)
assert.ok(
  saida.indexOf(PRECO_TOPO) < saida.indexOf('sem mensalidade'),
  'o degrau de cima é o topo da escada paga, não vem depois do grátis',
)

console.log('escada-precos: ok')
