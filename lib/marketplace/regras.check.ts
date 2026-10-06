/**
 * Guarda das regras do marketplace.
 *
 *   npx tsx lib/marketplace/regras.check.ts
 *
 * O que está aqui preso é o que custa dinheiro a alguém quando se parte: a partilha prometida em
 * público, o cadeado do conteúdo pago, e a regra da Apple. Nenhuma destas três dá erro quando
 * falha — dá uma venda mal paga, um curso aberto a quem não pagou, ou uma submissão recusada.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPLE_COMISSAO_PCT,
  CATEGORIAS,
  DEFINICOES_PADRAO,
  donoValido,
  modoStripe,
  precoEfectivo,
  sugestaoDaCategoria,
  tipoValido,
  PARTILHA_MAX_PCT,
  PARTILHA_MIN_PCT,
  PARTILHA_PADRAO_PCT,
  calcularPartilha,
  comissaoAppleCents,
  estadoAoPublicar,
  euros,
  extractoDoEducador,
  partilhaValida,
  podeComprarAqui,
  podePublicar,
  produtoNaVitrine,
  slugDoTitulo,
  temAcessoAoProduto,
  vitrineVisivelNoIos,
  IMAGENS_MAX,
  PERIODICIDADES,
  galeriaDoProduto,
  galeriaParaGravar,
  intervaloStripe,
  periodicidadeCoerente,
  periodicidadeParaGravar,
  periodicidadeValida,
  sufixoDoPeriodo,
  type Definicoes,
} from './regras'

const RAIZ = join(__dirname, '..', '..')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const LIGADO: Definicoes = { ligado: true, revisaoObrigatoria: true, iosVitrine: 'ver_sem_comprar' }
const VENDEDOR = { educator_id: 'e1', activo: true, partilha_pct: 95 }
const PRODUTO_BOM = {
  id: 'p1',
  educator_id: 'e1',
  titulo: 'Curso de Cripto do Zero',
  descricao: 'Oito módulos sobre carteiras, custódia e gestão de risco em cripto, do zero.',
  preco_cents: 9900,
  conteudo_url: 'https://youtube.com/playlist?list=abc',
  estado: 'publicado',
  activo: true,
}

// ══════════════ 1. A PARTILHA: 80 É O TECTO DO EDUCADOR ══════════════
//
// ── ESTE BLOCO MUDOU DE SIGNIFICADO, NÃO SÓ DE NÚMERO ─────────────────────────────────────
//
// Dizia: «a /criadores diz 90–95%; estes três números são o contrato», e fixava MIN=90, MAX=95,
// PADRÃO=95 — com 90 a ser o PISO que protegia o educador de receber menos.
//
// A regra do dono inverteu isso: o educador fica com 90%, a casa leva no mínimo 10%, e o educador
// pode dar mais à casa mas nunca ficar com mais. Portanto o tecto — 90 a 29/09 de manhã,
// 80 à tarde, quando o referral desceu para 5% e a casa precisou de margem para o pagar.
//
// Não foi uma correcção de um erro de leitura: a versão antiga guardava fielmente o que a landing
// prometia. Foi uma decisão de negócio nova, tomada depois. Fica escrito porque o `<= 90` onde antes
// estava `>= 90` parece, sem contexto, um sinal trocado por acidente.
//
// A landing pública, a FAQ, a /criadores e as duas mensagens do bot do Instagram foram todas
// corrigidas a 29/09 e dizem 80%. Antes diziam «90 a 95%» e «comissão MTM de
// 5–10%» em oito sítios — incluindo as duas mensagens que o bot do Instagram manda a leads reais.
// Foram todos corrigidos a 29/09 e dizem 80% / comissão 20%.

sim('o tecto do educador é 80', PARTILHA_MAX_PCT === 80)
sim('o piso é 50, contra o erro de escrita', PARTILHA_MIN_PCT === 50)
assert.equal(
  PARTILHA_PADRAO_PCT,
  PARTILHA_MAX_PCT,
  'por omissão aplica-se o tecto: um esquecimento não pode decidir contra o educador',
)
assert.ok(
  PARTILHA_MAX_PCT <= 90,
  'A CASA TEM DE FICAR COM 10% NO MÍNIMO. É de dentro dessa margem que sai a comissão de quem indica a venda (ver referral.ts) — se o tecto subir, a comissão deixa de ter de onde sair.',
)

// Lixo não pode virar uma percentagem fora do intervalo, nem para cima nem para baixo.
for (const v of [null, undefined, NaN, 'muito', {}, -3, 0, 200, 91, 49.9, 100]) {
  const p = partilhaValida(v)
  sim(`partilhaValida(${String(v)}) fica dentro de 50–90`, p >= 50 && p <= 90)
}
sim('80 é aceite tal e qual', partilhaValida(80) === 80)
sim('90 é cortado ao tecto de 80', partilhaValida(90) === 80)
sim('75 é aceite tal e qual — o educador pode dar mais à casa', partilhaValida(75) === 75)
// O ERRO DE ESCRITA QUE O PISO EXISTE PARA APANHAR: quem quer dizer «a casa leva 10» escreve 10.
// Sem piso, isso dava 10% ao educador em vez de 90%.
sim('escrever 10 por engano não deixa o educador com 10%', partilhaValida(10) === 50)
// E o tecto: 95 e 90 foram os números antigos (de manhã e de tarde do mesmo dia). Nenhum passa.
sim('95 já não é um valor válido', partilhaValida(95) === 80)
sim('90 também deixou de existir', partilhaValida(90) === 80)

// Venda simples no Stripe: 99,00 €, nada para loja nenhuma.
//
// Os números mudaram de 95/5 para 90/10 porque a REGRA mudou (ver o bloco 1), não porque a conta
// estivesse errada. O que este teste guarda é a aritmética, e essa é a mesma.
{
  const p = calcularPartilha({ brutoCents: 9900, partilhaPct: 80 })
  assert.equal(p.parteEducadorCents, 7920, '80% de 99,00 € são 79,20 € para o educador')
  assert.equal(p.parteCasaCents, 1980, 'à casa sobram os 20% — 19,80 €')
  assert.equal(
    p.parteEducadorCents + p.parteCasaCents,
    p.liquidoCents,
    'as duas partes somam sempre o líquido: um cêntimo a evaporar-se entre colunas é um extracto que não fecha',
  )
}

// ── O caso que paga do bolso da casa ──────────────────────────────────────────────────────
//
// 100 € vendidos na App Store. A Apple leva 15 antes de o dinheiro chegar cá. Se os 80% fossem
// sobre o BRUTO, a casa entregava 80 € tendo recebido 85 — e ficava com 5, não com 20.
//
// A margem foi apertando: com 95% a casa PERDIA 10 € nesta venda, com 90% perdia 5, com 80% ganha
// 5. O sentido inverteu-se, mas a ordem das operações continua a ser o que este teste prende —
// porque é ela que decide se a casa ganha 5 ou perde 5, e a diferença entre as duas é invisível
// até alguém somar um mês de vendas.
{
  const bruto = 10000
  const loja = comissaoAppleCents(bruto)
  assert.equal(loja, 1500, 'o Small Business Program da Apple leva 15%')
  const p = calcularPartilha({ brutoCents: bruto, comissaoLojaCents: loja, partilhaPct: 80 })
  assert.equal(p.liquidoCents, 8500, 'só há 85,00 € para repartir')
  assert.equal(p.parteEducadorCents, 6800, '80% de 85,00 € — não de 100,00 €')
  assert.ok(
    p.parteCasaCents >= 0,
    'a casa nunca pode ficar com uma parte negativa: era estar a pagar para vender o produto de outra pessoa',
  )
  // A regressão que isto trava, dita pelo número:
  const seFosseSobreOBruto = Math.round((bruto * 80) / 100)
  sim('a conta sobre o bruto deixava a casa com quase nada', 8500 - seFosseSobreOBruto < p.parteCasaCents)
}

sim('a comissão da Apple está escrita como 15', APPLE_COMISSAO_PCT === 15)

// Somas fechadas para uma bateria de valores estranhos.
for (const bruto of [0, 1, 7, 99, 3500, 999999]) {
  for (const pct of [90, 92.5, 95]) {
    for (const loja of [0, comissaoAppleCents(bruto), bruto * 2]) {
      const p = calcularPartilha({ brutoCents: bruto, comissaoLojaCents: loja, partilhaPct: pct })
      sim(`soma fecha (${bruto}/${pct}/${loja})`, p.parteEducadorCents + p.parteCasaCents === p.liquidoCents)
      sim(`nada é negativo (${bruto}/${pct}/${loja})`, p.parteEducadorCents >= 0 && p.parteCasaCents >= 0 && p.liquidoCents >= 0)
      sim(`a loja nunca leva mais do que o bruto (${bruto}/${loja})`, p.comissaoLojaCents <= p.brutoCents)
    }
  }
}

// Com 1 cêntimo a repartir, o cêntimo é do educador.
{
  const p = calcularPartilha({ brutoCents: 1, partilhaPct: 95 })
  assert.equal(p.parteEducadorCents, 1, 'o cêntimo do arredondamento vai para quem fez o conteúdo')
  assert.equal(p.parteCasaCents, 0, 'e a casa fica com zero, não com menos um')
}

// ══════════════ 2. QUEM PUBLICA ══════════════

sim('com o marketplace desligado ninguém publica', !podePublicar(PRODUTO_BOM, VENDEDOR, DEFINICOES_PADRAO).pode)
sim('um educador não-activado não publica', !podePublicar(PRODUTO_BOM, { activo: false }, LIGADO).pode)
sim('sem linha de vendedor não publica', !podePublicar(PRODUTO_BOM, null, LIGADO).pode)
sim('um produto completo publica', podePublicar(PRODUTO_BOM, VENDEDOR, LIGADO).pode)

// O defeito que custa mais caro: cobrar e não entregar.
for (const conteudo of [null, '', '   ', 'brevemente', 'ftp://algures', 'javascript:alert(1)']) {
  const r = podePublicar({ ...PRODUTO_BOM, conteudo_url: conteudo }, VENDEDOR, LIGADO)
  sim(`sem link a sério não publica (${String(conteudo)})`, !r.pode)
}
assert.ok(
  !podePublicar({ ...PRODUTO_BOM, descricao: 'Curso bom.' }, VENDEDOR, LIGADO).pode,
  'uma descrição de três palavras é o que a pessoa lê antes de gastar dinheiro — não chega',
)
sim('sem título não publica', !podePublicar({ ...PRODUTO_BOM, titulo: '  ' }, VENDEDOR, LIGADO).pode)
sim('preço negativo não publica', !podePublicar({ ...PRODUTO_BOM, preco_cents: -1 }, VENDEDOR, LIGADO).pode)
sim('grátis publica', podePublicar({ ...PRODUTO_BOM, preco_cents: 0 }, VENDEDOR, LIGADO).pode)

// O motivo é para ser lido pelo educador, não pelo programador.
{
  const r = podePublicar({ ...PRODUTO_BOM, conteudo_url: null }, VENDEDOR, LIGADO)
  sim('o motivo vem escrito em português', /link do conteúdo/i.test(r.motivo ?? ''))
  sim('o motivo não expõe nomes de colunas', !/conteudo_url|preco_cents|null/i.test(r.motivo ?? ''))
}

assert.equal(estadoAoPublicar(LIGADO), 'em_revisao', 'com revisão obrigatória o educador não se publica a si próprio')
assert.equal(estadoAoPublicar({ ...LIGADO, revisaoObrigatoria: false }), 'publicado', 'sem revisão vai directo')

// ══════════════ 3. QUEM VÊ ══════════════
//
// Os três interruptores, um de cada vez.

const MEMBRO = { user_type: 'member', member_category: 'premium', is_active: true }
const ADMIN = { user_type: 'admin', is_active: true }

sim('publicado + tudo ligado aparece', produtoNaVitrine(PRODUTO_BOM, VENDEDOR, LIGADO, MEMBRO))
sim('interruptor geral desligado esconde', !produtoNaVitrine(PRODUTO_BOM, VENDEDOR, DEFINICOES_PADRAO, MEMBRO))
sim('educador desligado esconde', !produtoNaVitrine(PRODUTO_BOM, { activo: false }, LIGADO, MEMBRO))
sim('produto desligado esconde', !produtoNaVitrine({ ...PRODUTO_BOM, activo: false }, VENDEDOR, LIGADO, MEMBRO))
for (const estado of ['rascunho', 'em_revisao', 'retirado']) {
  sim(`${estado} não aparece na vitrine`, !produtoNaVitrine({ ...PRODUTO_BOM, estado }, VENDEDOR, LIGADO, MEMBRO))
}
assert.ok(
  produtoNaVitrine({ ...PRODUTO_BOM, estado: 'em_revisao' }, VENDEDOR, DEFINICOES_PADRAO, ADMIN),
  'o admin vê o que tem de aprovar — aprovar às cegas não é aprovar',
)

// ══════════════ 4. A REGRA DA APPLE ══════════════
//
// É aqui que uma submissão cai. Na app iOS não há caminho de compra NENHUM — nem checkout, nem
// link para fora.

{
  const base = { def: LIGADO, produto: PRODUTO_BOM, vendedor: VENDEDOR }
  assert.ok(podeComprarAqui({ ...base, iosNativo: false }).pode, 'na web compra-se')
  const ios = podeComprarAqui({ ...base, iosNativo: true })
  assert.equal(ios.pode, false, 'na app iOS não há caminho de compra — Guideline 3.1.1')
  assert.equal(ios.motivo, 'ios_iap_required', 'e o motivo é o que o servidor devolve, para o ecrã e a rota dizerem o mesmo')

  sim('já comprado não volta a oferecer compra', !podeComprarAqui({ ...base, iosNativo: false, jaComprou: true }).pode)
  sim('marketplace desligado não vende', !podeComprarAqui({ ...base, def: DEFINICOES_PADRAO, iosNativo: false }).pode)
  sim('vendedor suspenso não vende', !podeComprarAqui({ ...base, vendedor: { activo: false }, iosNativo: false }).pode)
  sim('produto em rascunho não vende', !podeComprarAqui({ ...base, produto: { ...PRODUTO_BOM, estado: 'rascunho' }, iosNativo: false }).pode)
}

sim('por omissão a vitrine aparece no iOS sem comprar', vitrineVisivelNoIos(DEFINICOES_PADRAO))
sim('o dono pode escondê-la de todo', !vitrineVisivelNoIos({ ...LIGADO, iosVitrine: 'esconder' }))

// A terceira opção não existe, e não pode passar a existir por distracção.
//
// ── PORQUE É QUE ESTA GUARDA MUDOU DE FORMA ───────────────────────────────────────────────
//
// Era um `grep` à fonte por `checkout_externo`. Isso funcionava enquanto o marketplace só vendia
// produtos de educadores: a palavra não tinha razão de existir, e vê-la aparecer era sinal de que
// alguém estava a abrir um caminho de pagamento externo.
//
// Deixou de servir quando os produtos da CASA entraram na montra. Um scanner já vendido no site
// tem de mandar o comprador para o caminho de compra que já funciona (senão a compra cobra e não
// entrega), e esse caminho chama-se `checkout_externo_url`. A palavra passou a ser legítima.
//
// Trocar um `grep` por nada era baixar a fasquia. O que ficou é MAIS forte do que o que saiu:
// em vez de procurar uma palavra na fonte, prova-se o COMPORTAMENTO — que nenhuma forma de
// produto, nenhuma, devolve caminho de compra a um pedido da app iOS. Uma palavra podia ser
// contornada escrevendo-a de outra maneira; isto não.
{
  const DEF = LIGADO
  const FORMAS: { nome: string; produto: Record<string, unknown>; vendedor?: { activo: boolean } | null }[] = [
    { nome: 'produto normal de educador', produto: PRODUTO_BOM, vendedor: VENDEDOR },
    {
      nome: 'produto da casa com checkout externo (o caso que criou esta guarda)',
      produto: { ...PRODUTO_BOM, dono: 'casa', educator_id: null, checkout_externo_url: 'https://morethanmoney.pt/scanners' },
      vendedor: null,
    },
    {
      nome: 'produto da casa sem vendedor nenhum',
      produto: { ...PRODUTO_BOM, dono: 'casa', educator_id: null },
      vendedor: null,
    },
    {
      nome: 'produto em campanha (o desconto não abre a porta)',
      produto: { ...PRODUTO_BOM, campanha_pct: 50, campanha_tier: 'all' },
      vendedor: VENDEDOR,
    },
    {
      nome: 'subscrição',
      produto: { ...PRODUTO_BOM, tipo: 'subscricao', recorrente: true },
      vendedor: VENDEDOR,
    },
    {
      nome: 'merchandise com morada',
      produto: { ...PRODUTO_BOM, tipo: 'merchandise', requer_morada: true },
      vendedor: VENDEDOR,
    },
  ]

  for (const f of FORMAS) {
    const r = podeComprarAqui({ iosNativo: true, def: DEF, produto: f.produto, vendedor: f.vendedor })
    sim(`no iOS não há compra: ${f.nome}`, r.pode === false)
    sim(`no iOS o motivo é ios_iap_required: ${f.nome}`, r.motivo === 'ios_iap_required')
  }

  // E o contrário, para a guarda não passar só por estar tudo a dizer não a tudo.
  sim(
    'na web o produto da casa com checkout externo compra-se',
    podeComprarAqui({
      iosNativo: false,
      def: DEF,
      produto: { ...PRODUTO_BOM, dono: 'casa', educator_id: null, checkout_externo_url: 'https://morethanmoney.pt/scanners' },
      vendedor: null,
    }).pode,
  )

  // A ordem importa: a recusa da Apple tem de vir ANTES das outras recusas, senão um produto novo
  // que saia por outro ramo devolve à app um motivo que o ecrã não sabe tratar como «não vendas».
  const desligado = podeComprarAqui({
    iosNativo: true,
    def: DEFINICOES_PADRAO,
    produto: PRODUTO_BOM,
    vendedor: VENDEDOR,
  })
  sim('no iOS a regra da Apple fala antes do interruptor geral', desligado.motivo === 'ios_iap_required')

  // Já comprado é a ÚNICA coisa que fala antes da Apple, e é de propósito: não é um caminho de
  // compra, é o ecrã a mostrar «Abrir». A Apple proíbe vender fora do IAP, não proíbe entregar.
  const jaTem = podeComprarAqui({ iosNativo: true, def: DEF, produto: PRODUTO_BOM, vendedor: VENDEDOR, jaComprou: true })
  sim('no iOS quem já comprou vê que já comprou', jaTem.motivo === 'ja_comprado' && !jaTem.pode)
}

// A rota do checkout também não pode ter um ramo que devolva o `externo` antes do travão do iOS.
// Esta é a mesma afirmação da guarda de cima, mas na ROTA, que é onde o dinheiro se move.
{
  const ROTA = readFileSync(join(RAIZ, 'app/api/marketplace/checkout/route.ts'), 'utf8')
  const posIos = ROTA.indexOf('isIosAppRequest(')
  const posExterno = ROTA.indexOf('externo }')
  sim('a rota trava o iOS antes de devolver qualquer caminho externo', posIos >= 0 && (posExterno < 0 || posIos < posExterno))
}

// A rota de checkout tem de ter o travão do servidor. Esconder o botão não chega: o pedido
// chega à mesma se alguém o fizer à mão, e foi assim que o iPad em modo secretária abriu
// checkout Stripe dentro da app (ver lib/is-native-request.ts).
{
  const ROTA = readFileSync(join(RAIZ, 'app/api/marketplace/checkout/route.ts'), 'utf8')
  assert.ok(
    /isIosAppRequest\(/.test(ROTA) && /IOS_IAP_REQUIRED/.test(ROTA),
    'a rota de checkout do marketplace tem de recusar pedidos da app iOS no SERVIDOR',
  )
}

// ══════════════ 5. QUEM ABRE O QUE COMPROU ══════════════

const AGORA = '2026-09-29T12:00:00.000Z'
const COMPRA = { produto_id: 'p1', estado: 'paga', acesso_expira_em: null as string | null }

assert.ok(temAcessoAoProduto([COMPRA], 'p1', AGORA, MEMBRO), 'quem comprou, abre')
assert.ok(!temAcessoAoProduto([COMPRA], 'p2', AGORA, MEMBRO), 'comprar um não abre o outro')
assert.ok(!temAcessoAoProduto([], 'p1', AGORA, MEMBRO), 'quem não comprou, não abre')
assert.ok(!temAcessoAoProduto(null, 'p1', AGORA, MEMBRO), 'sem compras nenhumas, não abre')

assert.ok(
  !temAcessoAoProduto([{ ...COMPRA, estado: 'reembolsada' }], 'p1', AGORA, MEMBRO),
  'um reembolso que não tira o acesso é um desconto de 100%',
)
sim('anulada não abre', !temAcessoAoProduto([{ ...COMPRA, estado: 'anulada' }], 'p1', AGORA, MEMBRO))

// Mentoria com prazo.
sim(
  'dentro do prazo, abre',
  temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: '2026-12-01T00:00:00.000Z' }], 'p1', AGORA, MEMBRO),
)
sim(
  'passado o prazo, fecha',
  !temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: '2026-01-01T00:00:00.000Z' }], 'p1', AGORA, MEMBRO),
)
sim(
  'uma data ilegível não abre a porta',
  !temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: 'qualquer coisa' }], 'p1', AGORA, MEMBRO),
)

// Conta suspensa por falta de pagamento não abre nada — é a alavanca `is_active` da casa.
assert.ok(
  !temAcessoAoProduto([COMPRA], 'p1', AGORA, { ...MEMBRO, is_active: false }),
  'is_active=false fecha tudo, incluindo o que a pessoa comprou enquanto estava activa',
)
sim('sem perfil nenhum, não abre', !temAcessoAoProduto([COMPRA], 'p1', AGORA, null))
sim('o admin abre para poder diagnosticar', temAcessoAoProduto([], 'p1', AGORA, ADMIN))

// ══════════════ 6. O EXTRACTO DO EDUCADOR ══════════════

{
  const linhas = [
    { estado: 'paga', bruto_cents: 9900, parte_educador_cents: 8910 },
    { estado: 'paga', bruto_cents: 4900, parte_educador_cents: 4410 },
    { estado: 'reembolsada', bruto_cents: 9900, parte_educador_cents: 8910 },
    { estado: 'anulada', bruto_cents: 1000, parte_educador_cents: 950 },
  ]
  const e = extractoDoEducador(linhas)
  assert.equal(e.vendas, 2, 'as devolvidas não contam como vendas')
  assert.equal(
    e.aReceberCents,
    13320,
    'prometer ao educador dinheiro de uma venda devolvida é pior do que nunca lho ter mostrado',
  )
  sim('o bruto também ignora as devolvidas', e.brutoCents === 14800)
  const vazio = extractoDoEducador([])
  sim('sem vendas, zeros e não erro', vazio.vendas === 0 && vazio.aReceberCents === 0)
  sim('null não rebenta o extracto', extractoDoEducador(null).vendas === 0)
}

// ══════════════ 7. FORMATO E SLUG ══════════════

sim('cêntimos viram euros', /94/.test(euros(9405)) && /€/.test(euros(9405)))
sim('zero mostra-se', /0/.test(euros(0)))
sim('null não rebenta', typeof euros(null) === 'string')

assert.equal(slugDoTitulo('Curso de Criptomoedas — Nível 1'), 'curso-de-criptomoedas-nivel-1', 'acentos e travessões saem do endereço')
sim('slug não começa nem acaba em traço', !/^-|-$/.test(slugDoTitulo('  !!! Olá !!!  ')))
sim('slug tem tecto', slugDoTitulo('a'.repeat(200)).length <= 60)
sim('título vazio dá slug vazio e não rebenta', slugDoTitulo('') === '')

// ══════════════ 8. O ESQUEMA FECHADO ══════════════
//
// A regra da casa depois dos incidentes das tabelas abertas: nenhuma tabela nova nasce legível
// pela chave `anon`, que está no bundle do browser.

{
  const SQL = readFileSync(join(RAIZ, 'supabase/migrations/151_marketplace_educadores.sql'), 'utf8')
  for (const t of ['marketplace_educadores', 'marketplace_produtos', 'marketplace_compras', 'marketplace_payouts']) {
    sim(`${t} tem RLS ligada`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL))
    sim(`${t} é revogada a anon`, new RegExp(`revoke all on public\\.${t}\\s+from anon`).test(SQL))
  }
  sim('nenhuma política diz using (true)', !/using\s*\(\s*true\s*\)/i.test(SQL))
  assert.ok(
    /"ligado":\s*false/.test(SQL),
    'o marketplace nasce desligado: um menu que leva a uma montra vazia ensina quem lá entra que o menu mente',
  )
  sim('o interruptor por educador nasce desligado', /activo boolean not null default false/.test(SQL))
  sim('a partilha está presa entre 90 e 100 no próprio esquema', /partilha_pct >= 90/.test(SQL))
  sim('as compras têm chave de idempotência única', /unique index[\s\S]*marketplace_compras_referencia/.test(SQL))
}

// ══════════════ 7. O CATÁLOGO ══════════════

{
  // As nove que o dono pediu, pelo nome. Uma categoria em falta não dá erro — dá um produto
  // arrumado em 'outro', e uma montra que não sabe dizer o que vende.
  for (const id of ['mentoria', 'masterclass', 'curso', 'ea', 'servico', 'personalizavel', 'merchandise', 'aplicacao', 'subscricao'] as const) {
    sim(`a categoria ${id} existe`, CATEGORIAS.some((c) => c.id === id))
  }
  // E as da 151 não desapareceram: há linhas escritas com elas.
  for (const id of ['ebook', 'comunidade', 'outro'] as const) {
    sim(`a categoria antiga ${id} sobreviveu`, CATEGORIAS.some((c) => c.id === id))
  }

  sim('lixo cai em outro e não rebenta', tipoValido('<script>') === 'outro' && tipoValido(null) === 'outro')
  sim('uma categoria válida passa intacta', tipoValido('masterclass') === 'masterclass')

  // A categoria muda o que o checkout faz. Se isto se partir, uma subscrição é cobrada uma vez
  // só, ou uma encomenda chega sem morada.
  sim('subscrição nasce recorrente', sugestaoDaCategoria('subscricao').recorrente)
  sim('curso NÃO nasce recorrente', !sugestaoDaCategoria('curso').recorrente)
  sim('merchandise nasce a pedir morada', sugestaoDaCategoria('merchandise').requerMorada)
  sim('um curso não pede morada', !sugestaoDaCategoria('curso').requerMorada)

  sim('o modo do Stripe segue a recorrência', modoStripe({ recorrente: true }) === 'subscription')
  sim('e por omissão cobra uma vez', modoStripe({}) === 'payment')

  // A lista da fonte e o `check` do SQL têm de dizer o mesmo. Se discordarem, o formulário oferece
  // uma categoria que a base de dados recusa — e o educador vê «erro» sem saber porquê.
  // O check vive na migração mais recente que o redefine (192 acrescentou 'produto').
  const SQL153 = readFileSync(join(RAIZ, 'supabase/migrations/192_marketplace_categoria_produtos.sql'), 'utf8')
  for (const c of CATEGORIAS) {
    sim(`o SQL aceita a categoria ${c.id}`, new RegExp(`'${c.id}'`).test(SQL153))
  }
}

// ══════════════ 8. OS PRODUTOS DA CASA ══════════════
//
// O que se protege aqui é dinheiro nos dois sentidos: a casa não pode pagar 95% de um scanner a
// um educador que não existe, e um educador não pode deixar de receber por o produto dele ter
// sido marcado como sendo da casa.

{
  const daCasa = calcularPartilha({ brutoCents: 10000, dono: 'casa' })
  sim('produto da casa: o educador não recebe nada', daCasa.parteEducadorCents === 0)
  sim('produto da casa: o líquido é todo da casa', daCasa.parteCasaCents === 10000)
  sim('produto da casa: a percentagem escrita na linha é 0', daCasa.parteEducadorPct === 0)

  // A protecção mais importante: uma percentagem passada por engano NÃO ressuscita a partilha
  // num produto da casa.
  const teimoso = calcularPartilha({ brutoCents: 10000, dono: 'casa', partilhaPct: 90 })
  sim('produto da casa ignora uma partilha passada por engano', teimoso.parteEducadorCents === 0)

  // E o contrário: um produto de educador continua a pagar, e a somar ao cêntimo.
  const deEducador = calcularPartilha({ brutoCents: 10000, dono: 'educador', partilhaPct: 80 })
  sim('produto de educador continua a pagar 80%', deEducador.parteEducadorCents === 8000)
  // E a casa fica SEMPRE com pelo menos 20% — é de dentro disto que sai a comissão do referral.
  // A 29/09 a conta era: casa 10%, referral 10%, casa fica a ZERO. Passou a 20% e 5%, e sobram 15%.
  sim('a casa fica com 20% ou mais num produto de educador', deEducador.parteCasaCents >= 2000)
  sim('as duas partes somam sempre o líquido', deEducador.parteEducadorCents + deEducador.parteCasaCents === deEducador.liquidoCents)
  sim('e no caso da casa também', daCasa.parteEducadorCents + daCasa.parteCasaCents === daCasa.liquidoCents)

  sim('donoValido não deixa passar lixo', donoValido('CASA!!') === 'educador' && donoValido('casa') === 'casa')

  // Um produto da casa entra na vitrine sem vendedor nenhum — é este o ponto de tudo isto.
  sim(
    'produto da casa aparece na montra sem vendedor',
    produtoNaVitrine({ ...PRODUTO_BOM, dono: 'casa', educator_id: null }, null, LIGADO),
  )
  sim(
    'produto de educador SEM vendedor activo continua fora da montra',
    !produtoNaVitrine(PRODUTO_BOM, { educator_id: 'e1', activo: false }, LIGADO),
  )

  // Publicar um produto da casa que entrega no caminho antigo não exige `conteudo_url`...
  sim(
    'produto da casa com checkout externo publica-se sem conteudo_url',
    podePublicar(
      { ...PRODUTO_BOM, dono: 'casa', educator_id: null, conteudo_url: null, checkout_externo_url: 'https://morethanmoney.pt/scanners' },
      null,
      LIGADO,
    ).pode,
  )
  // ...e um produto de EDUCADOR que cobra lá fora também não: é o caso da She Is Faceless Academy,
  // em que o curso se paga na loja da academia e o dinheiro nunca passa pela MTM. Quem APONTA para
  // fora continua a ser só a casa — `checkout_externo_url` é admin-only (ver gestao.check.ts) — mas
  // o produto pode ficar em nome de quem o fez.
  sim(
    'produto de educador com checkout externo publica-se sem conteudo_url',
    podePublicar(
      { ...PRODUTO_BOM, conteudo_url: null, checkout_externo_url: 'https://shop.beacons.ai/sheisfacelessacademy/abc' },
      VENDEDOR,
      LIGADO,
    ).pode,
  )
  // ...mas um produto de EDUCADOR sem conteúdo E sem destino continua a ser uma cobrança sem entrega.
  sim(
    'produto de educador sem conteúdo continua a NÃO publicar',
    !podePublicar({ ...PRODUTO_BOM, conteudo_url: null }, VENDEDOR, LIGADO).pode,
  )
  // E o vendedor por activar continua a mandar: um checkout externo não é uma porta das traseiras
  // para pôr na montra um educador que a casa ainda não aprovou.
  sim(
    'educador NÃO-activado com checkout externo continua a não publicar',
    !podePublicar(
      { ...PRODUTO_BOM, conteudo_url: null, checkout_externo_url: 'https://shop.beacons.ai/sheisfacelessacademy/abc' },
      { activo: false },
      LIGADO,
    ).pode,
  )
  // Um caminho interno não chega para dispensar o conteúdo: `/upgrade?...` entrega cá dentro, e
  // dar-lhe o passe livre reabria exactamente o buraco da cobrança sem entrega.
  sim(
    'checkout interno NÃO dispensa o conteudo_url',
    !podePublicar(
      { ...PRODUTO_BOM, conteudo_url: null, checkout_externo_url: '/upgrade?plan=premium_annual' },
      VENDEDOR,
      LIGADO,
    ).pode,
  )
  // E um produto da casa SEM nenhum dos dois também não: o buraco não se abre por ser da casa.
  sim(
    'produto da casa sem conteúdo e sem checkout externo não publica',
    !podePublicar({ ...PRODUTO_BOM, dono: 'casa', educator_id: null, conteudo_url: null }, null, LIGADO).pode,
  )
}

// ══════════════ 9. CAMPANHAS ══════════════
//
// Uma campanha tem duas maneiras de sair mal e as duas custam dinheiro: cobrar a menos a quem não
// tinha direito, e continuar a descontar depois de ter acabado.

{
  const MEMBRO = { user_type: 'member', member_category: 'premium', is_active: true }
  const ONTEM = '2026-09-01T00:00:00.000Z'
  const HOJE = '2026-09-15T00:00:00.000Z'
  const AMANHA = '2026-09-30T00:00:00.000Z'

  const P = { ...PRODUTO_BOM, preco_cents: 10000, campanha_pct: 20, campanha_tier: 'all' as const }

  sim('sem campanha, paga-se o preço de tabela', precoEfectivo({ ...P, campanha_pct: 0 }, HOJE, MEMBRO).cents === 10000)

  const emCampanha = precoEfectivo(P, HOJE, MEMBRO)
  sim('com campanha de 20% paga-se 80', emCampanha.cents === 8000)
  sim('e o ecrã sabe o preço de antes, para o riscar', emCampanha.baseCents === 10000)
  sim('e sabe que está em campanha', emCampanha.emCampanha)

  // O PRAZO. Estes dois são a diferença entre uma campanha e um desconto permanente por
  // esquecimento.
  sim(
    'antes de começar, não desconta',
    precoEfectivo({ ...P, campanha_inicio: AMANHA }, HOJE, MEMBRO).cents === 10000,
  )
  sim(
    'depois de acabar, não desconta',
    precoEfectivo({ ...P, campanha_fim: ONTEM }, HOJE, MEMBRO).cents === 10000,
  )
  sim(
    'a correr dentro da janela, desconta',
    precoEfectivo({ ...P, campanha_inicio: ONTEM, campanha_fim: AMANHA }, HOJE, MEMBRO).cents === 8000,
  )
  // Uma data ilegível FECHA a campanha. O erro que se prefere é cobrar o preço de tabela (que se
  // corrige com um pedido de desculpa) e não descontar para sempre (que se corrige a pagar).
  sim(
    'uma data de fim ilegível fecha a campanha',
    precoEfectivo({ ...P, campanha_fim: 'às tantas' }, HOJE, MEMBRO).cents === 10000,
  )

  // QUEM APANHA. Uma campanha «para membro» não é para uma conta suspensa nem para quem não tem
  // o nível — senão «desconto para membro» não quer dizer nada.
  const suspenso = { user_type: 'member', member_category: 'premium', is_active: false }
  sim(
    'uma conta suspensa não apanha a campanha de membro',
    precoEfectivo({ ...P, campanha_tier: 'app_member' }, HOJE, suspenso).cents === 10000,
  )
  sim(
    'uma campanha para todos aplica-se mesmo sem perfil',
    precoEfectivo({ ...P, campanha_tier: 'all' }, HOJE, null).cents === 8000,
  )
  sim(
    'uma campanha de VIP não se aplica a quem não é VIP',
    precoEfectivo({ ...P, campanha_tier: 'vip' }, HOJE, { user_type: 'member', is_active: true }).cents === 10000,
  )

  // O desconto arredonda para BAIXO, para o que se cobra nunca ficar acima do que se anunciou.
  const impar = precoEfectivo({ ...P, preco_cents: 999, campanha_pct: 33 }, HOJE, MEMBRO)
  sim('o desconto arredonda a favor do cliente', impar.cents === 999 - Math.floor((999 * 33) / 100))
  sim('e nunca dá um preço negativo', precoEfectivo({ ...P, preco_cents: 1, campanha_pct: 90 }, HOJE, MEMBRO).cents >= 0)

  // A percentagem não pode escapar do intervalo por a coluna vir com lixo.
  sim('uma campanha de 999% não dá dinheiro a ninguém', precoEfectivo({ ...P, campanha_pct: 999 }, HOJE, MEMBRO).cents >= 0)
}

// ══════════════ 10. O SQL DA 153 ══════════════

{
  const SQL = readFileSync(join(RAIZ, 'supabase/migrations/153_marketplace_catalogo_campanhas_leads.sql'), 'utf8')

  sim('a coerência dono/educador está presa no esquema', /marketplace_produtos_dono_coerente/.test(SQL))
  sim('uma campanha ao contrário não se grava', /marketplace_produtos_campanha_ordem/.test(SQL))
  sim('o desconto está limitado no próprio esquema', /campanha_pct >= 0 and campanha_pct <= 90/.test(SQL))
  sim('a tabela de leads tem RLS ligada', /alter table public\.marketplace_leads\s+enable row level security/.test(SQL))
  sim('e é revogada a anon', /revoke all on public\.marketplace_leads\s+from anon/.test(SQL))
  sim('nenhuma política nova diz using (true)', !/using\s*\(\s*true\s*\)/i.test(SQL))

  // A guarda da promessa pública não foi afrouxada para acomodar os produtos da casa. Se alguém
  // tiver de mexer no `check` dos 90 para fazer a casa funcionar, é sinal de que a partilha da
  // casa voltou a ser uma percentagem em vez de um ramo — e aí um bug de tipagem paga 0 a um
  // educador a sério.
  sim(
    'a 153 NÃO mexe no check dos 90% da partilha',
    !/partilha_pct/.test(SQL) || !/drop constraint[^\n]*partilha/i.test(SQL),
  )
}

// ══════════════ 11. A PERIODICIDADE: DE QUANTO EM QUANTO TEMPO ══════════════
//
// O defeito de 29/09/2026, em duas metades. A montra escrevia «624,00 €/mês» no Premium ANUAL, e
// `sincronizarPrecoNoStripe` criava sempre `interval: 'month'` — o que transformava «sincronizar o
// preço» em «criar um mensal de 624 € e arquivar o anual que os clientes estão a pagar».
//
// As duas metades têm a mesma causa: `recorrente` é um booleano e responde a «paga-se outra vez?»,
// não a «de quanto em quanto tempo?». O que está preso aqui é a segunda pergunta.

{
  const ANUAL = { recorrente: true, periodicidade: 'anual' }
  const MENSAL = { recorrente: true, periodicidade: 'mensal' }
  const UNICA = { recorrente: false, periodicidade: 'unica' }

  // ── O rótulo do ecrã ───────────────────────────────────────────────────────────────────
  //
  // O caso exacto que se viu com os olhos: o Premium anual. Se este teste falhar, alguém voltou a
  // anunciar um preço anual como mensal no produto mais caro do catálogo.
  sim('o produto ANUAL escreve «/ano» e nunca «/mês»', sufixoDoPeriodo(ANUAL).texto === '/ano')
  sim('o mensal escreve «/mês»', sufixoDoPeriodo(MENSAL).texto === '/mês')
  sim('o trimestral escreve «/trimestre»', sufixoDoPeriodo({ recorrente: true, periodicidade: 'trimestral' }).texto === '/trimestre')
  sim('o semestral escreve «/semestre»', sufixoDoPeriodo({ recorrente: true, periodicidade: 'semestral' }).texto === '/semestre')
  sim('um pagamento único não escreve período nenhum', sufixoDoPeriodo(UNICA).texto === '')

  // NUNCA ADIVINHA. Um recorrente sem periodicidade legível diz «subscrição» — vago mas verdadeiro.
  // Se um dia isto devolver «/mês», o defeito voltou por inteiro.
  sim(
    'recorrente sem periodicidade NÃO inventa «/mês»',
    sufixoDoPeriodo({ recorrente: true, periodicidade: null }).texto === 'subscrição' &&
      sufixoDoPeriodo({ recorrente: true, periodicidade: 'lixo' }).texto === 'subscrição',
  )
  sim('o sufixo com barra cola ao número', sufixoDoPeriodo(ANUAL).junto === true)
  sim('«subscrição» leva espaço', sufixoDoPeriodo({ recorrente: true, periodicidade: null }).junto === false)

  // ── O mapa para o Stripe ───────────────────────────────────────────────────────────────
  //
  // O Stripe não tem `interval: 'quarter'` nem `'semester'`: tem `month` com `interval_count`.
  sim('anual → year × 1', intervaloStripe('anual')?.interval === 'year' && intervaloStripe('anual')?.interval_count === 1)
  sim('mensal → month × 1', intervaloStripe('mensal')?.interval === 'month' && intervaloStripe('mensal')?.interval_count === 1)
  sim('trimestral → month × 3', intervaloStripe('trimestral')?.interval === 'month' && intervaloStripe('trimestral')?.interval_count === 3)
  sim('semestral → month × 6', intervaloStripe('semestral')?.interval === 'month' && intervaloStripe('semestral')?.interval_count === 6)

  // A prova de que o mensal deixou de ser o valor por omissão silencioso: `unica` e o lixo dão NULL,
  // e quem chama tem de decidir. Em `stripe-preco.ts` a decisão é recusar.
  sim('pagamento único não tem intervalo', intervaloStripe('unica') === null)
  sim('periodicidade ilegível NÃO cai em mensal', intervaloStripe('lixo') === null && intervaloStripe(null) === null)

  // ── A coerência com `recorrente` ───────────────────────────────────────────────────────
  //
  // A mesma regra que a restrição `marketplace_produtos_periodicidade_coerente` (157) tem presa no
  // esquema. Repetida aqui porque uma restrição da base que rebenta à frente do educador não é
  // validação: é uma avaria com sotaque.
  sim('único + «unica» é coerente', periodicidadeCoerente(false, 'unica'))
  sim('recorrente + «anual» é coerente', periodicidadeCoerente(true, 'anual'))
  sim('recorrente + «unica» NÃO é coerente', !periodicidadeCoerente(true, 'unica'))
  sim('único + «mensal» NÃO é coerente', !periodicidadeCoerente(false, 'mensal'))

  // O que se GRAVA é sempre coerente, venha o formulário como vier — é isto que impede a restrição
  // da base de ser a primeira a dizer «não» a quem está a editar.
  sim('gravar: recorrente sem período fica mensal', periodicidadeParaGravar(true, 'unica') === 'mensal')
  sim('gravar: recorrente com período mantém o período', periodicidadeParaGravar(true, 'anual') === 'anual')
  sim('gravar: pagamento único apaga o período', periodicidadeParaGravar(false, 'anual') === 'unica')
  for (const p of PERIODICIDADES) {
    sim(`gravar: «${p.id}» sai coerente com recorrente=true`, periodicidadeCoerente(true, periodicidadeParaGravar(true, p.id)))
    sim(`gravar: «${p.id}» sai coerente com recorrente=false`, periodicidadeCoerente(false, periodicidadeParaGravar(false, p.id)))
  }

  // `unica` é o valor de nascença e NÃO `mensal`: um produto sem periodicidade declarada é uma venda
  // única, que é o caso que não cobra ninguém duas vezes por engano.
  sim('por omissão é «unica» e não «mensal»', periodicidadeValida(undefined) === 'unica' && periodicidadeValida('') === 'unica')
  sim('a lista tem as cinco, sem repetições', new Set(PERIODICIDADES.map((p) => p.id)).size === 5)
  sim('só «unica» não tem intervalo de Stripe', PERIODICIDADES.filter((p) => !p.stripe).map((p) => p.id).join() === 'unica')
}

// ══════════════ 12. A GALERIA: A CAPA NÃO SE REPETE, E O TECTO É 8 ══════════════
//
// `imagem_url` é a CAPA e `imagens` é o resto. A capa não entra na galeria: quem lê mostra a capa
// primeiro e a seguir `imagens`, e guardar a mesma URL nos dois sítios dava uma ficha com a primeira
// imagem repetida — sem o ecrã ter maneira de saber se a repetição foi intenção de alguém.

{
  const CAPA = 'https://mtm/capa.jpg'
  const A = 'https://mtm/a.jpg'
  const B = 'https://mtm/b.jpg'

  sim('a capa NUNCA entra na galeria', !galeriaParaGravar(CAPA, [CAPA, A]).includes(CAPA))
  sim('e o resto fica', galeriaParaGravar(CAPA, [CAPA, A, B]).join() === [A, B].join())
  sim('a ordem do autor mantém-se', galeriaParaGravar(CAPA, [B, A]).join() === [B, A].join())
  sim('sem repetições', galeriaParaGravar(CAPA, [A, A, B, B]).join() === [A, B].join())
  sim('sem vazios nem espaços', galeriaParaGravar(CAPA, ['', '   ', A]).join() === A)
  sim('espaços em volta são cortados', galeriaParaGravar(CAPA, [`  ${A}  `]).join() === A)
  sim('sem capa continua a funcionar', galeriaParaGravar(null, [A, B]).join() === [A, B].join())
  sim('uma galeria que não é lista dá lista vazia', galeriaParaGravar(CAPA, 'isto-nao-e-uma-lista').length === 0)
  sim('e null também', galeriaParaGravar(CAPA, null).length === 0)

  // ── O TECTO ────────────────────────────────────────────────────────────────────────────
  //
  // O mesmo número que a restrição `marketplace_produtos_imagens_check` (157) tem presa. Sem tecto,
  // um educador entusiasmado põe quarenta e a ficha passa a demorar a abrir num telemóvel — que é
  // onde a maioria compra.
  const muitas = Array.from({ length: 30 }, (_, i) => `https://mtm/${i}.jpg`)
  sim(`o tecto é ${IMAGENS_MAX}`, IMAGENS_MAX === 8)
  sim('trinta imagens cortam-se no tecto', galeriaParaGravar(CAPA, muitas).length === IMAGENS_MAX)
  sim('e cortam-se pelo FIM, ficando as primeiras', galeriaParaGravar(CAPA, muitas)[0] === muitas[0])
  // A capa não gasta lugar no tecto: o tecto é da COLUNA, e a capa vive noutra. Com a capa incluída
  // a ficha mostra 9 — que é o que a restrição da base permite, e o que ela não permite é 9 na coluna.
  sim('a capa não gasta lugar no tecto', galeriaParaGravar(CAPA, muitas).length === IMAGENS_MAX)

  // ── O que a ficha mostra ───────────────────────────────────────────────────────────────
  //
  // A capa primeiro, e não ordenada por outro critério: é a imagem que a pessoa viu no cartão que a
  // trouxe à ficha, e abrir noutra imagem faz duvidar de que se clicou no produto certo.
  sim('a ficha abre na capa', galeriaDoProduto({ imagem_url: CAPA, imagens: [A, B] })[0] === CAPA)
  sim('a ficha mostra capa + galeria', galeriaDoProduto({ imagem_url: CAPA, imagens: [A, B] }).join() === [CAPA, A, B].join())
  sim('a capa não aparece duas vezes na ficha', galeriaDoProduto({ imagem_url: CAPA, imagens: [CAPA, A] }).join() === [CAPA, A].join())
  sim('sem imagem nenhuma a ficha não desenha nada', galeriaDoProduto({ imagem_url: null, imagens: [] }).length === 0)
  sim('só com capa a ficha mostra uma', galeriaDoProduto({ imagem_url: CAPA, imagens: null }).join() === CAPA)
}

// ══════════════ 13. O SQL DA 157 ══════════════

{
  const SQL = readFileSync(join(RAIZ, 'supabase/migrations/157_periodicidade_e_galeria.sql'), 'utf8')

  sim('a coerência periodicidade↔recorrente está presa no esquema', /marketplace_produtos_periodicidade_coerente/.test(SQL))
  sim('e recusa recorrente sem periodicidade', /recorrente = true\s+and periodicidade <> 'unica'/.test(SQL))
  sim('e recusa periodicidade num pagamento único', /recorrente = false and periodicidade = 'unica'/.test(SQL))
  sim('as cinco periodicidades estão presas no esquema', /periodicidade in \('unica', 'mensal', 'trimestral', 'semestral', 'anual'\)/.test(SQL))
  sim('o valor de nascença é «unica» e não «mensal»', /periodicidade text not null default 'unica'/.test(SQL))
  sim(`o tecto de ${IMAGENS_MAX} imagens está preso no esquema`, new RegExp(`jsonb_array_length\\(imagens\\) <= ${IMAGENS_MAX}`).test(SQL))
  sim('e `imagens` tem de ser uma lista', /jsonb_typeof\(imagens\) = 'array'/.test(SQL))
  sim('a galeria nasce vazia', /imagens jsonb not null default '\[\]'::jsonb/.test(SQL))

  // A 157 não pode mexer em `imagem_url`: a capa FICA, é ela que a montra desenha, e uma migração
  // que a mova para dentro da galeria deixa os catorze cartões sem imagem.
  sim('a 157 NÃO apaga nem renomeia a capa', !/drop column[^\n]*imagem_url|rename column[^\n]*imagem_url/i.test(SQL))
  // Nem toca em preços: a periodicidade descreve o que o Stripe já cobra, não muda quanto se cobra.
  sim('a 157 não mexe em preços', !/update[\s\S]{0,80}set[^\n]*preco_cents/i.test(SQL))
}

// ── Relatório ─────────────────────────────────────────────────────────────────────────────

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) do marketplace partida(s)`)
console.log(`✅ marketplace: ${ok} verificações passaram`)
