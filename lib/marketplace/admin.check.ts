/**
 * A GUARDA DO QUE REBENTOU COM O MARKETPLACE LIGADO.
 *
 *   npx tsx lib/marketplace/admin.check.ts
 *
 * Três defeitos reais, dos dias 28 e 29/09, presos aqui para não voltarem. Todos têm a mesma
 * origem: o marketplace foi escrito a pensar em produtos de EDUCADOR e abriu com catorze produtos
 * da CASA lá dentro — que não têm educador, não têm partilha, e vendem por um caminho antigo.
 *
 *   1. O painel do Centro chamava `null.slice(0, 8)` para mostrar o nome do autor. Um TypeError no
 *      render não estraga uma célula: derruba a secção toda. O painel ficava em branco.
 *   2. O checkout só aceitava destinos `https://`, e os catorze apontam para caminhos INTERNOS.
 *      Os catorze botões da montra respondiam «ainda não tem cobrança ligada».
 *   3. Retirar um produto passa a arquivar no Stripe — e os catorze apontam para os preços que JÁ
 *      VENDEM hoje (Membro, Premium, scanners, EA). Arquivar um desses parava as vendas do site.
 *
 * Este ficheiro é separado de `regras.check.ts` de propósito: aquele conta 321 verificações e o
 * número está escrito no relatório e nas instruções de quem trabalha aqui. Um ficheiro novo cresce
 * sem mexer nesse contrato.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOME_DA_CASA, destinoDeCompraValido, nomeDoAutor } from './regras'
import { podeArquivarNoStripe, sincronizarPrecoNoStripe } from './stripe-preco'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

// ── 1. O nome do autor, que derrubava o painel ────────────────────────────────────────────

const PRODUTO_DA_CASA = { educator_id: null, dono: 'casa' }
const PRODUTO_DE_EDUCADOR = { educator_id: 'edu-1234-5678-9012', dono: 'educador' }

// O caso EXACTO que rebentava: os catorze produtos da casa, todos com educator_id nulo.
sim('casa: não rebenta com educator_id nulo', (() => {
  try {
    nomeDoAutor(PRODUTO_DA_CASA)
    return true
  } catch {
    return false
  }
})())
sim('casa: mostra o nome da casa e não um uuid cortado', nomeDoAutor(PRODUTO_DA_CASA) === NOME_DA_CASA)

// `dono = 'casa'` manda mesmo que alguém tenha deixado lá um educator_id: é o produto que É da
// casa, e a partilha desse produto é zero. Mostrar o nome de um educador ao lado dele prometia-lhe
// uma venda que não é dele.
sim('casa: o dono manda sobre o educator_id', nomeDoAutor({ educator_id: 'edu-1', dono: 'casa' }) === NOME_DA_CASA)

// Sem `dono` nenhum (o caso das linhas de VENDA, que não trazem essa coluna) um educator_id nulo
// continua a ser a casa: uma venda sem educador é uma venda da casa.
sim('sem dono e sem educador: continua a ser a casa', nomeDoAutor({ educator_id: null }) === NOME_DA_CASA)

sim(
  'educador: usa o nome quando o há',
  nomeDoAutor(PRODUTO_DE_EDUCADOR, () => 'Ana Silva') === 'Ana Silva',
)
sim(
  'educador: sem nome à mão, mostra o princípio do id',
  nomeDoAutor(PRODUTO_DE_EDUCADOR) === 'edu-1234',
)
// Um nome vazio não é um nome. Sem este cuidado, a célula ficava em branco e ninguém sabia de quem
// era o produto — pior do que oito letras de um uuid.
sim(
  'educador: nome vazio cai para o id, não para uma célula em branco',
  nomeDoAutor(PRODUTO_DE_EDUCADOR, () => '') === 'edu-1234',
)

// ── 2. O destino de compra dos produtos da casa ───────────────────────────────────────────

// Os catorze, tal como estão na base de dados hoje.
for (const destino of ['/upgrade?plan=app_member_monthly', '/scanner-access', '/scanner', '/sensei-ea', '/sensei-scalp']) {
  sim(`destino interno aceite: ${destino}`, destinoDeCompraValido(destino))
}
sim('destino absoluto aceite', destinoDeCompraValido('https://morethanmoney.pt/upgrade'))

// O caso MAU, que é a razão de isto ser uma função: `//` começa por `/` e leva para fora.
sim('protocolo-relativo recusado', !destinoDeCompraValido('//evil.example/login'))
sim('barra invertida recusada', !destinoDeCompraValido('/\\evil.example'))
sim('vazio recusado', !destinoDeCompraValido(''))
sim('nulo recusado', !destinoDeCompraValido(null))
sim('javascript: recusado', !destinoDeCompraValido('javascript:alert(1)'))
sim('caminho sem barra recusado', !destinoDeCompraValido('upgrade'))

// ── 3. Arquivar no Stripe: o que NUNCA se toca ────────────────────────────────────────────
//
// O pior defeito possível neste trabalho. Um produto da casa retirado da montra não pode arquivar
// o preço de uma subscrição viva — isso impediria o site inteiro de vender Membro ou Premium.

// Os catorze, tal como estão: preço de produção vivo, e `stripe_product_id` a NULO porque esse
// preço não nasceu do marketplace.
const CASA_COM_PRECO_VIVO = {
  dono: 'casa',
  stripe_price_id: 'price_1Tg1s7B0TQE8czM3YzlkE0ne',
  stripe_product_id: null,
}
sim('casa: NUNCA se arquiva', podeArquivarNoStripe(CASA_COM_PRECO_VIVO).pode === false)
sim('casa: diz porquê', podeArquivarNoStripe(CASA_COM_PRECO_VIVO).motivo === 'produto_da_casa')

// A segunda condição, sozinha: mesmo marcado como de educador, um preço que não foi criado por nós
// não é nosso para arquivar. É o que trava um produto a que alguém colou um price_id à mão.
sim(
  'preço que não é nosso: não se arquiva',
  podeArquivarNoStripe({ dono: 'educador', stripe_price_id: 'price_alheio', stripe_product_id: null }).motivo === 'nao_e_nosso',
)

sim(
  'produto de educador criado por nós: arquiva-se',
  podeArquivarNoStripe({ dono: 'educador', stripe_price_id: 'price_x', stripe_product_id: 'prod_x' }).pode === true,
)
sim(
  'sem nada no Stripe: não há o que arquivar',
  podeArquivarNoStripe({ dono: 'educador', stripe_price_id: null, stripe_product_id: null }).motivo === 'nada_no_stripe',
)
// `dono` em falta trata-se como educador (é o valor por omissão da coluna), mas a segunda condição
// continua a mandar: sem `stripe_product_id` nosso, não se toca.
sim(
  'sem dono declarado: a guarda do «não é nosso» continua a valer',
  podeArquivarNoStripe({ stripe_price_id: 'price_y', stripe_product_id: null }).pode === false,
)

/**
 * O resto corre dentro de uma função async.
 *
 * `await` no topo do ficheiro não passa no transformador que o `tsx` usa aqui (os outros `check`
 * desta pasta são todos síncronos e usam `__dirname`). Envolver é mais simples do que mudar o
 * modo do módulo só por causa de duas chamadas.
 */
async function main() {
  // ── 4. Sincronizar: o mesmo preço vivo não se toca ────────────────────────────────────────
  //
  // A guarda corre ANTES de o Stripe e o Supabase serem instanciados, o que permite testá-la aqui
  // sem chaves nenhumas à frente. Se um dia alguém a mover para baixo dos clientes, este teste
  // deixa de passar por falta de chave — e é exactamente o aviso que se quer.

  const recusaSync = async (produto: Parameters<typeof sincronizarPrecoNoStripe>[0]) => {
    try {
      await sincronizarPrecoNoStripe(produto)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  const BASE_SYNC = { id: 'p1', titulo: 'Premium · anual', preco_cents: 62400, recorrente: true }

  // O caso real: o «Premium · anual» da montra. Preço de produção vivo, `stripe_product_id` nulo.
  // Sem a guarda, esta chamada criava um preço MENSAL de 624 € e arquivava o anual que está vivo.
  const msgAlheio = await recusaSync({ ...BASE_SYNC, stripe_price_id: 'price_1Tg1sAB0TQE8czM3bSKfAr7z', stripe_product_id: null })
  sim('sync: preço alheio é recusado', Boolean(msgAlheio))
  sim('sync: a recusa explica-se', String(msgAlheio).includes('não foi criado aqui'))

  // Um produto sem nada no Stripe TEM de poder passar a guarda — é o caminho da criação, e fechá-lo
  // era impedir qualquer produto novo de nascer com preço. Falha depois, por falta de chaves, e é
  // essa a prova de que passou daqui.
  const msgNovo = await recusaSync({ ...BASE_SYNC, stripe_price_id: null, stripe_product_id: null })
  sim('sync: produto novo passa a guarda', !String(msgNovo).includes('não foi criado aqui'))

  // ── 5. As rotas fazem o que está prometido ────────────────────────────────────────────────
  //
  // Verificação sobre o TEXTO das rotas, como o `gestao.check.ts` já faz. Não substitui um teste a
  // correr, mas apanha o que interessa: alguém a tirar uma destas chamadas num refactor. As quatro
  // são promessas feitas ao dono por escrito.

  const RAIZ = join(__dirname, '..', '..')
  const gestao = readFileSync(join(RAIZ, 'app/api/marketplace/gestao/route.ts'), 'utf8')
  const centro = readFileSync(join(RAIZ, 'app/api/admin/centro/marketplace/route.ts'), 'utf8')

  sim('criar: o POST sincroniza no Stripe', /criado\.preco_cents > 0[\s\S]{0,200}sincronizarPrecoNoStripe/.test(gestao))
  sim('criar: a falha do Stripe não perde o produto', /sincronizarPrecoNoStripe\(criado\)[\s\S]{0,200}catch[\s\S]{0,200}avisoStripe/.test(gestao))
  sim('retirar: arquiva no Stripe', /accao === 'retirar'[\s\S]{0,200}arquivarNoStripe/.test(gestao))
  sim('apagar: arquiva no Stripe', gestao.includes('arquivarNoStripe(r.produto'))
  sim('o painel do admin também arquiva ao retirar', centro.includes('arquivarNoStripe'))
  // Nenhuma das duas rotas pode chamar `del()` no Stripe: no Stripe o que já vendeu não se apaga.
  sim('ninguém apaga no Stripe', !/(products|prices)\.del\(/.test(gestao + centro))

  // ── Resultado ─────────────────────────────────────────────────────────────────────────────

  if (falhas.length > 0) {
    console.error(`❌ marketplace/admin: ${falhas.length} falharam:`)
    for (const f of falhas) console.error(`   · ${f}`)
    process.exit(1)
  }
  assert.ok(ok > 0)
  console.log(`✅ marketplace/admin: ${ok} verificações passaram`)

}

void main()
