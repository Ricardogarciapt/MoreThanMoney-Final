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
import { readFileSync } from 'node:fs'
import {
  MIN_DEPOSIT,
  NOME_DEGRAU_TOPO,
  ondeComprarTopoNumaLinha,
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

// ── O guião de vendas não pode voltar a guardar números ──────────────────────────────────────
//
// `docs/mtm-sales-brain.md` é citado como autoridade por seis ficheiros de runtime, e durante um
// mês inteiro (20/08 → 24/09) disse o contrário do código: a tabela de preços dele anunciava que o
// degrau de topo tinha sido «retirado da oferta — não o oferecer nem o mencionar», enquanto os
// quatro closers de IA já o vendiam a partir daqui. Ninguém reparou porque um documento errado não
// dá erro; só dá um lead a ouvir uma coisa e a pagar outra.
//
// A correcção foi tirar os números ao documento, e é isso que estas duas asserções prendem. Não
// verificam o texto — verificam que ele não tem nada para envelhecer.
const guiao = readFileSync(
  new URL('../../docs/mtm-sales-brain.md', import.meta.url),
  'utf-8',
)

// Um valor monetário escrito à mão — «65€», «597 €», «350$». Os nomes das constantes passam
// (`PRECO_TOPO`), as percentagens passam, os ids de produto passam: só o dinheiro é que não.
const VALOR_A_OLHO = /(?:\d[\d.,]*\s*(?:€|\$)|(?:€|\$)\s*\d)/
const linhasComValor = guiao
  .split('\n')
  .map((l, i) => [i + 1, l] as const)
  .filter(([, l]) => VALOR_A_OLHO.test(l))
assert.equal(
  linhasComValor.length,
  0,
  `o guião não pode ter preços escritos à mão — vêm de escada-precos.ts. Linhas: ${linhasComValor
    .map(([n, l]) => `${n}: ${l.trim()}`)
    .join(' | ')}`,
)

// E não pode voltar a mandar esconder o degrau de topo enquanto ele estiver à venda. O sintoma de
// 20/08 foi exactamente esta frase, deixada para trás quando o pacote voltou.
const MANDA_ESCONDER = /(retirado da oferta|n(ã|a)o o (oferecer|mencionar))/i
for (const [n, linha] of guiao.split('\n').map((l, i) => [i + 1, l] as const)) {
  // A secção 0 conta a história do incidente e cita a frase — é o único sítio onde ela pode estar.
  if (linha.trimStart().startsWith('passou a dizer')) continue
  assert.ok(
    !MANDA_ESCONDER.test(linha),
    `o guião manda esconder o degrau de topo (linha ${n}) e ele está à venda: ${linha.trim()}`,
  )
}

// ── E os GUIÕES DE RUNTIME também não ─────────────────────────────────────────────────────────
//
// O bloco de cima só olhava para o documento. Foi por isso que a mesma frase sobreviveu onde
// custa dinheiro: a 25/09 o closer das DMs do Instagram já dizia que o degrau de topo se compra
// no site, e o do funil do Telegram ainda dizia «não dês link de pagamento: esse fecho é com o
// Ricardo» — os dois a ler os preços daqui, os dois a contradizerem-se na única frase que fecha
// a venda. Um closer que recusa fechar não dá erro: dá um lead que já tinha decidido pagar e
// fica à espera de um humano.
//
// A frase passou a ser UMA (`ondeComprarTopoNumaLinha`), e é isso que estas asserções prendem.

assert.equal(
  ondeComprarTopoNumaLinha().includes('/'),
  TOPO_LINK_PAGAMENTO !== null,
  'a frase tem de dar o link quando ele existe, e não o inventar quando não existe',
)
if (TOPO_LINK_PAGAMENTO) {
  assert.ok(
    ondeComprarTopoNumaLinha().includes(TOPO_LINK_PAGAMENTO),
    'com o pacote à venda, a frase leva o link onde se paga',
  )
  assert.ok(
    !/fecho é com o Ricardo|não inventes link de pagamento/i.test(ondeComprarTopoNumaLinha()),
    'com o pacote à venda, a frase não pode mandar o closer esperar por um humano',
  )
}

// Nenhum guião pode voltar a escrever a frase à mão — é assim que um deles fica para trás.
const GUIOES = [
  '../instagram/dm-closer.ts',
  '../telegram-lead-funnel.ts',
  '../../app/api/manychat/closer/route.ts',
]
for (const rel of GUIOES) {
  const texto = readFileSync(new URL(rel, import.meta.url), 'utf-8')
  assert.ok(
    texto.includes('ondeComprarTopoNumaLinha()'),
    `${rel} tem de ler a frase do degrau de topo da fonte única`,
  )
  assert.ok(
    !/fecho é com o Ricardo|n(ã|a)o d(ê|e)s link de pagamento|n(ã|a)o se compra sozinho|ainda N(Ã|A)O se compra|n(ã|a)o inventes link de pagamento/i.test(texto),
    `${rel} ainda diz que o degrau de topo não se vende, e ele está à venda`,
  )
}

console.log('escada-precos: ok')
