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
import {
  LOJA_DA_CASA, NOME_DA_CASA, destinoDeCompraDoProduto, destinoDeCompraValido, nomeDoAutor,
  procuraCasa, vendedorDoProduto, vendedoresDaMontra,
} from './regras'
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

// ── O nome de MARCA (`vendedor_nome`) ──────────────────────────────────────────────────────
//
// A She Is Faceless Academy: a educadora é a Maria Mafalda Costa, mas o curso vende-se sob o nome
// da academia. Sem este campo, as duas saídas eram más — pôr o produto em nome da MTM, e ela
// deixava de o poder editar; ou trocar o `display_name` dela, e a academia passava a chamar-se
// assim no LMS e no estúdio.
sim(
  'marca: o nome do produto ganha ao nome da pessoa',
  nomeDoAutor(
    { ...PRODUTO_DE_EDUCADOR, vendedor_nome: 'SHE IS FACELESS ACADEMY' },
    () => 'Maria Mafalda Costa',
  ) === 'SHE IS FACELESS ACADEMY',
)
sim(
  'marca: em branco não conta como marca — assina a pessoa',
  nomeDoAutor({ ...PRODUTO_DE_EDUCADOR, vendedor_nome: '   ' }, () => 'Maria Mafalda Costa') === 'Maria Mafalda Costa',
)
/**
 * O CASO MAU: um produto da CASA com um nome de marca escrito à mão.
 *
 * Se o campo fosse lido também aí, uma linha escrita no painel punha um produto da MTM a
 * apresentar-se como sendo de outra entidade. O `dono` manda primeiro — e é por isso que a
 * verificação da casa está ANTES da marca na função, e não depois.
 */
sim(
  'marca: um produto da casa NÃO se apresenta com outro nome',
  nomeDoAutor({ educator_id: 'edu-1', dono: 'casa', vendedor_nome: 'OUTRA EMPRESA LDA' }) === NOME_DA_CASA,
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
  const msgNovo = await recusaSync({ ...BASE_SYNC, stripe_price_id: null, stripe_product_id: null, periodicidade: 'anual' })
  sim('sync: produto novo passa a guarda', !String(msgNovo).includes('não foi criado aqui'))

  // ── 4b. O STRIPE DEIXOU DE FORÇAR MENSAL ────────────────────────────────────────────────
  //
  // Este bloco é a prova do pior defeito do marketplace. `sincronizarPrecoNoStripe` criava sempre
  // `interval: 'month'`: nos quatro produtos ANUAIS o preço do Stripe «não batia certo», logo o
  // caminho normal era criar um MENSAL de 624 € e arquivar o anual que os clientes estão a pagar.
  //
  // Duas metades, e as duas presas:
  //   · o intervalo sai agora da coluna `periodicidade` (migração 157);
  //   · e um recorrente sem periodicidade legível é RECUSADO, não adivinhado como mensal.

  const msgSemPeriodo = await recusaSync({ ...BASE_SYNC, stripe_price_id: null, stripe_product_id: null, periodicidade: 'unica' })
  sim('sync: recorrente sem periodicidade é recusado', Boolean(msgSemPeriodo))
  sim('sync: e a recusa diz o que falta escolher', String(msgSemPeriodo).includes('de quanto em quanto tempo'))
  // O mensal adivinhado era o defeito. Se um dia esta chamada passar a guarda, ele voltou.
  sim('sync: um recorrente sem período NÃO vira mensal em silêncio', !String(msgSemPeriodo).includes('0 não precisa'))

  const stripePreco = readFileSync(join(__dirname, 'stripe-preco.ts'), 'utf8')
  // SEM OS COMENTÁRIOS. O ficheiro conta a história do defeito e escreve `interval: 'month'` a
  // explicá-la — apagar essa explicação para o teste passar era apagar a razão de o teste existir.
  // O que se procura é o intervalo no CÓDIGO.
  const stripeCodigo = stripePreco
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')

  // O `interval: 'month'` escrito à mão desapareceu dos dois sítios — da criação do preço e da
  // comparação com o que já lá está. Uma busca no texto porque é assim que este defeito volta:
  // alguém a escrever o intervalo à mão num caminho novo.
  sim("sync: já não há `interval: 'month'` escrito à mão", !/interval:\s*'month'/.test(stripeCodigo))
  sim('sync: o intervalo vem do mapa das regras', /intervaloStripe\(produto\.periodicidade\)/.test(stripeCodigo))
  // `month`×3 e `month`×1 são o MESMO `interval`. Sem comparar a contagem, um produto que passasse
  // de mensal a trimestral dizia que o preço batia certo e continuava a cobrar todos os meses.
  sim('sync: a comparação também confere o interval_count', /interval_count \?\? 1\) === intervalo\?\.interval_count/.test(stripePreco))
  // E A GUARDA FICA. Com o intervalo certo, sincronizar um dos catorze preços vivos da casa ainda
  // criaria um preço NOVO (outro id, mesmo valor) e arquivaria aquele que as subscrições
  // referenciam. Tirar a guarda porque «agora o intervalo está certo» era o erro seguinte.
  sim('sync: a guarda do preço que não é nosso continua lá', stripePreco.includes('temPrecoAlheio'))

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

  // ── 6. A montra multivendedor ───────────────────────────────────────────────────────────
  //
  // O vendedor em cada cartão é o que faz disto um multivendedor. A casa é um vendedor como outro
  // qualquer — e hoje é o único, com os catorze produtos.

  const AUTOR = { id: 'edu-1', display_name: 'Ana Silva', avatar_url: null, specialty: 'Cripto' }

  sim('vendedor: a casa é um vendedor', vendedorDoProduto(PRODUTO_DA_CASA).ehACasa === true)
  sim('vendedor: a casa leva o nome da casa', vendedorDoProduto(PRODUTO_DA_CASA).nome === NOME_DA_CASA)
  sim('vendedor: a loja da casa tem endereço próprio', vendedorDoProduto(PRODUTO_DA_CASA).id === LOJA_DA_CASA)
  sim(
    'vendedor: um educador leva o nome e a especialidade dele',
    vendedorDoProduto(PRODUTO_DE_EDUCADOR, AUTOR).nome === 'Ana Silva' &&
      vendedorDoProduto(PRODUTO_DE_EDUCADOR, AUTOR).nota === 'Cripto',
  )
  // O caso que faz a diferença entre um cartão com vendedor e um cartão partido: o autor ainda não
  // chegou (a leitura dos autores falhou, ou o educador foi apagado). Cai para a casa em vez de
  // deixar o cartão sem linha nenhuma.
  sim('vendedor: sem autor resolvido, não fica vazio', vendedorDoProduto(PRODUTO_DE_EDUCADOR, null).ehACasa === true)

  const tira = vendedoresDaMontra([
    PRODUTO_DA_CASA, PRODUTO_DA_CASA, PRODUTO_DA_CASA,
    { ...PRODUTO_DE_EDUCADOR, vendedor: vendedorDoProduto(PRODUTO_DE_EDUCADOR, AUTOR) },
  ])
  sim('tira: agrupa por vendedor', tira.length === 2)
  sim('tira: conta os produtos de cada um', tira[0].produtos === 3 && tira[0].ehACasa)

  // ── A procura ───────────────────────────────────────────────────────────────────────────

  const SENSEI = { titulo: 'MTM Sensei EA · vitalício', subtitulo: 'Licença vitalícia.', tipo: 'ea', vendedor: { nome: NOME_DA_CASA } }

  sim('procura: vazia devolve tudo', procuraCasa(SENSEI, ''))
  sim('procura: encontra pelo título', procuraCasa(SENSEI, 'sensei'))
  // Sem isto, quem escreve sem acentos (que é quase toda a gente, e todos os telemóveis) não
  // encontrava o produto cujo título os tem.
  sim('procura: ignora acentos', procuraCasa(SENSEI, 'vitalicio'))
  sim('procura: palavras em qualquer ordem', procuraCasa(SENSEI, 'vitalicio sensei'))
  sim('procura: encontra pela categoria', procuraCasa(SENSEI, 'robo'))
  // Num multivendedor, escrever o nome de quem vende é uma das maneiras naturais de procurar.
  sim('procura: encontra pelo vendedor', procuraCasa(SENSEI, 'morethanmoney'))
  sim('procura: o que não existe não aparece', !procuraCasa(SENSEI, 'xpto'))
  sim('procura: todas as palavras têm de bater', !procuraCasa(SENSEI, 'sensei xpto'))

  // ── 7. A montra e a ficha são PÚBLICAS ──────────────────────────────────────────────────
  //
  // Mudança de 29/09: estavam atrás de `ProtectedPage` e quem chegava do Instagram via um
  // formulário de entrada em vez de uma loja. O que protege o conteúdo não é a página — é o
  // `conteudo_url` nunca sair na resposta pública. Estas duas verificações andam JUNTAS de
  // propósito: se alguém abrir a porta, a segunda é que tem de continuar fechada.
  const paginaMontra = readFileSync(join(RAIZ, 'app/marketplace/page.tsx'), 'utf8')
  const paginaFicha = readFileSync(join(RAIZ, 'app/marketplace/[slug]/page.tsx'), 'utf8')
  const servidor = readFileSync(join(RAIZ, 'lib/marketplace/servidor.ts'), 'utf8')

  // Procura o IMPORT e não a palavra: os cabeçalhos destes ficheiros contam que elas já
  // estiveram protegidas, e um teste que falha por causa do comentário que explica a mudança é um
  // teste que alguém desliga.
  const importaGuarda = (fonte: string) => /import\s+ProtectedPage\s+from/.test(fonte) || /<ProtectedPage/.test(fonte)
  sim('a montra é pública', !importaGuarda(paginaMontra))
  sim('a ficha é pública', !importaGuarda(paginaFicha))
  // A linha que torna as duas de cima seguras. `COLUNAS_VITRINE` é o que a montra pode ver.
  const colunas = servidor.slice(servidor.indexOf('COLUNAS_VITRINE'), servidor.indexOf('export type ProdutoVitrine'))
  sim('a montra pública NÃO leva o conteudo_url', !colunas.includes('conteudo_url'))
  sim('a montra pública NÃO leva a nota do conteúdo', !colunas.includes('conteudo_nota'))

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

// ══════════════ O DESTINO DE COMPRA, POR DONO ══════════════
//
// A pergunta «para onde vai o botão de comprar» tinha duas respostas em dois ficheiros, e já
// divergiram uma vez. Agora é uma função, e isto prova-a dos dois lados.
{
  const CASA = { dono: 'casa' as const }
  const EDU = { dono: 'educador' as const }

  sim('casa: caminho interno serve',
    destinoDeCompraDoProduto({ ...CASA, checkout_externo_url: '/upgrade?plan=premium_annual' }) === '/upgrade?plan=premium_annual')
  sim('casa: endereço absoluto serve',
    destinoDeCompraDoProduto({ ...CASA, checkout_externo_url: 'https://morethanmoney.pt/scanners' }) !== null)

  sim('educador: endereço absoluto serve (She Is Faceless Academy)',
    destinoDeCompraDoProduto({ ...EDU, checkout_externo_url: 'https://shop.beacons.ai/sheisfacelessacademy/abc' })
      === 'https://shop.beacons.ai/sheisfacelessacademy/abc')

  /**
   * O CASO MAU: um produto de educador a apontar para um caminho NOSSO.
   *
   * `/upgrade?plan=…` cobra uma subscrição da MTM. Pendurado num curso de outra pessoa, o cliente
   * pagava-nos uma coisa e esperava outra — e o curso nunca lhe era entregue. Nada disto daria
   * erro: o botão funcionava e levava a uma página de compra verdadeira.
   */
  sim('educador: caminho interno NÃO serve',
    destinoDeCompraDoProduto({ ...EDU, checkout_externo_url: '/upgrade?plan=premium_annual' }) === null)

  // O redireccionamento aberto, nos dois donos.
  for (const mau of ['//evil.com', '/\\evil.com', '//morethanmoney.pt.evil.com']) {
    sim(`casa: «${mau}» não é destino`, destinoDeCompraDoProduto({ ...CASA, checkout_externo_url: mau }) === null)
    sim(`educador: «${mau}» não é destino`, destinoDeCompraDoProduto({ ...EDU, checkout_externo_url: mau }) === null)
  }

  sim('sem destino escrito, não há destino', destinoDeCompraDoProduto({ ...EDU, checkout_externo_url: null }) === null)
  sim('só espaços não é destino', destinoDeCompraDoProduto({ ...CASA, checkout_externo_url: '   ' }) === null)
}
