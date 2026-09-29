/**
 * AS REGRAS DO MARKETPLACE — quem publica, quem vê, quem recebe, e quem abre o que comprou.
 *
 * PORQUE É QUE ISTO EXISTE, E O QUE NÃO É
 *
 * O marketplace tem quatro perguntas que se fazem em sítios diferentes e que TÊM de ser
 * respondidas da mesma maneira em todos:
 *
 *   1. Este produto pode ir para a rua?      — ecrã do educador, rota de publicar, admin
 *   2. Esta pessoa vê este produto?          — vitrine web, vitrine da app, ficha do produto
 *   3. Quanto é que o educador recebe?       — webhook, extracto dele, painel do dono
 *   4. Esta pessoa abre o que comprou?       — rota de acesso, biblioteca, app
 *
 * A pergunta 2 e a pergunta 4 são diferentes de propósito. VER um produto pago é normal — é a
 * montra. ABRIR o conteúdo é que exige ter comprado. Foi por não separar as duas que o cartão de
 * cursos do /live acabou a mandar o `url` de playlists VIP a toda a gente e a pôr o cadeado no
 * ecrã: quem via a montra recebia a chave junto. Aqui a montra nunca leva o `conteudo_url`.
 *
 * PURO de propósito: sem base de dados, sem Stripe, sem `next/headers`. Recebe factos, devolve
 * uma decisão. É o que permite ao `marketplace.check.ts` correr isto com `npx tsx` em meio
 * segundo, e é o que permite ao mesmo ficheiro servir o browser (esconder botões) e o servidor
 * (recusar pedidos) sem duas versões da mesma regra a discordarem.
 *
 * Guarda: `npx tsx lib/marketplace/regras.check.ts`
 */

import { contaAtivaUi, ehAdminUi, podeAcederAoTier, type PerfilUi } from '@/lib/perfil-ui'

// ── O CATÁLOGO ────────────────────────────────────────────────────────────────────────────
//
// As doze categorias, num sítio só. A lista vive aqui e não no `check` do SQL, no formulário do
// educador e no filtro da montra — que foi o que a 151 tinha (um `check` na tabela e o mesmo
// array escrito à mão em duas rotas), e é assim que uma categoria nova nasce a funcionar em dois
// dos três sítios.
//
// `recorrente` e `requerMorada` são o que a categoria SUGERE, não o que ela impõe: ficam colunas
// no produto e o educador pode contrariá-las. Há mentorias cobradas ao mês e há merchandise que
// é um ficheiro. Obrigar a categoria a decidir o modo do Stripe era garantir que, mais cedo ou
// mais tarde, alguém escolhia a categoria errada só para conseguir cobrar como queria.

export type TipoProduto =
  | 'curso' | 'mentoria' | 'masterclass' | 'ea' | 'servico' | 'personalizavel'
  | 'merchandise' | 'aplicacao' | 'subscricao' | 'ebook' | 'comunidade' | 'outro'

export const CATEGORIAS: {
  id: TipoProduto
  nome: string
  /** Sugestão: nasce a cobrar todos os meses. */
  recorrente?: boolean
  /** Sugestão: há uma caixa para enviar, o checkout pede morada. */
  requerMorada?: boolean
}[] = [
  { id: 'mentoria', nome: 'Mentoria' },
  { id: 'masterclass', nome: 'Masterclass' },
  { id: 'curso', nome: 'Curso' },
  { id: 'ea', nome: 'EA / Robô' },
  { id: 'servico', nome: 'Serviços' },
  { id: 'personalizavel', nome: 'Personalizáveis' },
  { id: 'merchandise', nome: 'Merchandise', requerMorada: true },
  { id: 'aplicacao', nome: 'Aplicações' },
  { id: 'subscricao', nome: 'Subscrições', recorrente: true },
  { id: 'ebook', nome: 'Ebook' },
  { id: 'comunidade', nome: 'Comunidade' },
  { id: 'outro', nome: 'Outro' },
]

const PorId = new Map(CATEGORIAS.map((c) => [c.id, c]))

/** Só devolve uma categoria que existe. Lixo vira 'outro' — nunca rebenta um formulário. */
export function tipoValido(tipo: unknown): TipoProduto {
  const t = String(tipo ?? '').trim().toLowerCase()
  return PorId.has(t as TipoProduto) ? (t as TipoProduto) : 'outro'
}

export function nomeDaCategoria(tipo: unknown): string {
  return PorId.get(tipoValido(tipo))?.nome ?? 'Outro'
}

/** O que a categoria sugere ao formulário quando o educador a escolhe. */
export function sugestaoDaCategoria(tipo: unknown): { recorrente: boolean; requerMorada: boolean } {
  const c = PorId.get(tipoValido(tipo))
  return { recorrente: c?.recorrente === true, requerMorada: c?.requerMorada === true }
}

// ── A partilha ────────────────────────────────────────────────────────────────────────────
//
// ── A REGRA, E PORQUE É QUE ELA ESTÁ AO CONTRÁRIO DO QUE JÁ ESTEVE ────────────────────────
//
// O educador fica com 80%. A casa leva no mínimo 20%. O educador PODE dar mais à casa se quiser,
// mas não pode ficar com mais de 80%.
//
// 90 → 80 a 29/09/2026, no mesmo movimento em que o referral desceu de 10% para 5%: com a casa a
// 10% e o referral a 10%, uma venda indicada deixava a casa a ZERO. A 80/20 sobram-lhe 15%.
//
// Isto INVERTE o que estava aqui antes. A primeira versão do marketplace leu a landing («ficas com
// 90–95%»), tomou 95 como o valor e 90 como o piso do educador, e escreveu `>= 90 and <= 100`.
// A regra do dono é a oposta: 90 é o TECTO do educador, não o piso dele. Não é uma correcção de um
// erro de leitura — é uma regra nova, decidida depois, e o sentido dos três números mudou com ela.
//
// Consequência que vale a pena escrever, porque se nota em todo o resto do sistema: a casa passa a
// ter SEMPRE pelo menos 10% de margem numa venda. É de dentro dessa margem que sai a comissão de
// quem indicou a venda (ver `referral.ts`), e é por isso que ela existe.
//
// ── O PISO, E PORQUE NÃO É ZERO ───────────────────────────────────────────────────────────
//
// Um educador generoso pode dar mais do que 10% à casa, e isso é legítimo. Mas o piso não é 0, e a
// razão não é filosófica: é o erro de escrita mais provável nesta coluna.
//
// Quem preenche isto a pensar «a casa leva 10» escreve 10. Com piso 0, essa linha grava, e o
// educador passa a receber 20% em vez de 80% — sem erro, sem aviso, e só se descobre no primeiro
// extracto. Com piso 50, a mesma distracção é recusada em voz alta pela base de dados.
//
// 50 continua a deixar um educador oferecer metade da receita à casa, o que é muito mais do que
// alguém faz por engano. O que se perde é a possibilidade de oferecer mais de 50% à casa; o que se ganha é
// que nenhum educador perde 80 pontos percentuais por ter trocado a ordem dos números na cabeça.

/** O mínimo que o educador pode ficar. Piso contra o erro de escrita, não contra a generosidade. */
export const PARTILHA_MIN_PCT = 50
/** O máximo que o educador pode ficar. A casa leva sempre 10% ou mais. */
export const PARTILHA_MAX_PCT = 80
/** O que vale por omissão: o tecto, que é o que favorece o educador. */
export const PARTILHA_PADRAO_PCT = 80

export type Partilha = {
  /** O que o cliente pagou. */
  brutoCents: number
  /** O que a App Store/Play levou antes de chegar cá. Zero no Stripe. */
  comissaoLojaCents: number
  /** O que sobrou para repartir. */
  liquidoCents: number
  parteEducadorPct: number
  parteEducadorCents: number
  parteCasaCents: number
}

/**
 * De quem é o produto.
 *
 * `'casa'` é a MTM a vender coisa dela — scanners, subscrições, licenças de EA. Não tem educador
 * e não tem partilha: o líquido é todo da casa. Existir como conceito é o que permite à montra
 * abrir com produtos lá dentro em vez de abrir vazia, e é o que impede que a alternativa (um
 * educador de mentira chamado «MoreThanMoney») apareça na lista de payouts a pedir transferência.
 */
export type DonoProduto = 'educador' | 'casa'

export function donoValido(dono: unknown): DonoProduto {
  return String(dono ?? '') === 'casa' ? 'casa' : 'educador'
}

/** Corta a percentagem para o intervalo prometido, e desconfia de lixo (null, NaN, texto). */
export function partilhaValida(pct: unknown): number {
  const n = Number(pct)
  if (!Number.isFinite(n)) return PARTILHA_PADRAO_PCT
  if (n < PARTILHA_MIN_PCT) return PARTILHA_MIN_PCT
  if (n > PARTILHA_MAX_PCT) return PARTILHA_MAX_PCT
  return n
}

/**
 * A conta da venda.
 *
 * A COMISSÃO DA LOJA SAI PRIMEIRO. Quando a venda passa pela App Store, a Apple leva 15–30% antes
 * de o dinheiro existir aqui. Calcular os 90% do educador sobre o BRUTO numa venda dessas punha a
 * casa a pagar a comissão da Apple do próprio bolso: 100 € de venda, 30 € para a Apple, 90 € para
 * o educador, e 20 € de prejuízo por cada produto vendido. Os 90% são sobre o que a casa RECEBE, e
 * é isso que tem de estar escrito no contrato do educador.
 *
 * O ARREDONDAMENTO É PARA O EDUCADOR. Um cêntimo perdido no arredondamento tem de ir para algum
 * lado, e vai para quem produziu o conteúdo. A casa fica com o resto, o que garante que as duas
 * partes somam SEMPRE o líquido exacto — não há cêntimos a evaporar-se entre as duas colunas.
 */
export function calcularPartilha(entrada: {
  brutoCents: number
  comissaoLojaCents?: number
  partilhaPct?: number | null
  dono?: DonoProduto | null
}): Partilha {
  const bruto = Math.max(0, Math.round(Number(entrada.brutoCents) || 0))
  const loja = Math.min(bruto, Math.max(0, Math.round(Number(entrada.comissaoLojaCents) || 0)))
  const liquido = bruto - loja

  // Produto da casa: não há ninguém a quem pagar, e o líquido é todo dela. Isto é um RAMO e não
  // uma percentagem de 0 porque `partilhaValida` corta tudo para 50–90 — é esse piso que protege o
  // educador do erro de escrita, e afrouxá-lo para acomodar os produtos da casa era abrir a porta a
  // uma venda de educador pagar 0 por um erro de tipagem em qualquer sítio.
  if (donoValido(entrada.dono) === 'casa') {
    return {
      brutoCents: bruto,
      comissaoLojaCents: loja,
      liquidoCents: liquido,
      parteEducadorPct: 0,
      parteEducadorCents: 0,
      parteCasaCents: liquido,
    }
  }

  const pct = partilhaValida(entrada.partilhaPct)
  const educador = Math.round((liquido * pct) / 100)
  return {
    brutoCents: bruto,
    comissaoLojaCents: loja,
    liquidoCents: liquido,
    parteEducadorPct: pct,
    parteEducadorCents: educador,
    parteCasaCents: liquido - educador,
  }
}

/**
 * A comissão da loja Apple, em cêntimos. 15% no Small Business Program (é onde a MTM está: bem
 * abaixo do milhão de dólares/ano), 30% acima disso. Fica aqui como função e não como constante
 * porque o dia em que a casa passar o milhão não pode ser o dia em que os extractos dos
 * educadores ficam todos errados em silêncio.
 */
export const APPLE_COMISSAO_PCT = 15
export function comissaoAppleCents(brutoCents: number, pct = APPLE_COMISSAO_PCT): number {
  return Math.round((Math.max(0, Math.round(brutoCents) || 0) * pct) / 100)
}

// ── Quem publica ──────────────────────────────────────────────────────────────────────────

export type EstadoProduto = 'rascunho' | 'em_revisao' | 'publicado' | 'retirado'

export type ProdutoRegra = {
  id?: string
  educator_id?: string | null
  titulo?: string | null
  descricao?: string | null
  tipo?: string | null
  preco_cents?: number | null
  moeda?: string | null
  conteudo_url?: string | null
  estado?: string | null
  activo?: boolean | null
  partilha_pct?: number | null
  dono?: string | null
  recorrente?: boolean | null
  requer_morada?: boolean | null
  stripe_price_id?: string | null
  checkout_externo_url?: string | null
  campanha_pct?: number | null
  campanha_inicio?: string | null
  campanha_fim?: string | null
  campanha_tier?: string | null
}

export type VendedorRegra = {
  educator_id?: string
  activo?: boolean | null
  partilha_pct?: number | null
}

export type Definicoes = {
  ligado: boolean
  revisaoObrigatoria: boolean
  iosVitrine: 'ver_sem_comprar' | 'esconder'
}

export const DEFINICOES_PADRAO: Definicoes = {
  // Desligado à nascença. Um marketplace vazio no menu ensina quem lá entra que o menu mente.
  ligado: false,
  revisaoObrigatoria: true,
  iosVitrine: 'ver_sem_comprar',
}

/**
 * Este produto está em condições de ser posto à venda?
 *
 * Devolve o motivo em português e já escrito para ser lido pelo EDUCADOR, não pelo programador.
 * «conteudo_url em falta» não diz a ninguém o que fazer a seguir; «um produto sem conteúdo é uma
 * cobrança sem entrega» diz — e é literalmente o que aconteceria se isto passasse.
 */
export function podePublicar(
  produto: ProdutoRegra,
  vendedor: VendedorRegra | null | undefined,
  def: Definicoes,
): { pode: boolean; motivo?: string } {
  if (!def.ligado) return { pode: false, motivo: 'O marketplace está desligado. Fala connosco.' }
  // Um produto da casa não tem vendedor para activar — quem o põe lá já é a casa. A pergunta do
  // interruptor do vendedor só se faz a quem tem vendedor.
  const daCasa = donoValido(produto.dono) === 'casa'
  if (!daCasa && !vendedor?.activo) {
    return { pode: false, motivo: 'A tua conta de vendedor ainda não foi activada pela MTM.' }
  }
  const titulo = String(produto.titulo ?? '').trim()
  if (titulo.length < 3) return { pode: false, motivo: 'Dá um título ao produto.' }
  const descricao = String(produto.descricao ?? '').trim()
  if (descricao.length < 30) {
    return { pode: false, motivo: 'Escreve uma descrição com pelo menos 30 caracteres — é o que a pessoa lê antes de decidir.' }
  }
  const conteudo = String(produto.conteudo_url ?? '').trim()
  const externo = String(produto.checkout_externo_url ?? '').trim()
  // Um produto da casa que manda o comprador para o caminho de compra ANTIGO (um scanner, uma
  // licença de EA) não entrega nada por aqui: quem entrega é o fluxo que já existe e que já
  // provisiona o acesso. Exigir-lhe `conteudo_url` era exigir-lhe um link falso.
  const entregaLaFora = daCasa && /^https?:\/\//i.test(externo)
  if (!entregaLaFora && !/^https?:\/\//i.test(conteudo)) {
    // Um produto pago sem destino é uma cobrança sem entrega. É o pior defeito possível num
    // marketplace: o cliente paga, não recebe nada, e a culpa fica com a casa e não com o autor.
    return { pode: false, motivo: 'Falta o link do conteúdo — é para onde o comprador vai depois de pagar.' }
  }
  const preco = Number(produto.preco_cents ?? 0)
  if (!Number.isFinite(preco) || preco < 0) return { pode: false, motivo: 'Preço inválido.' }
  return { pode: true }
}

/**
 * O estado para onde um pedido de publicação deve levar o produto.
 *
 * Com revisão obrigatória, o educador nunca chega sozinho a `publicado`: fica `em_revisao` e é o
 * dono que decide. Isto não é burocracia — é que o produto sai com a marca MTM em cima, o cliente
 * paga à MTM, e quem responde por um curso mau é a MTM, não o autor.
 */
export function estadoAoPublicar(def: Definicoes): EstadoProduto {
  return def.revisaoObrigatoria ? 'em_revisao' : 'publicado'
}

// ── Quanto custa, hoje, a esta pessoa ─────────────────────────────────────────────────────
//
// ── PORQUE É QUE ISTO NÃO USA A TABELA `coupons` ──────────────────────────────────────────
//
// O reflexo era reaproveitar os `coupons` da casa. Não serve, e é melhor dizer porquê do que
// deixar a pergunta viva para a próxima pessoa:
//
//   · Um `coupon` é um CÓDIGO que alguém ESCREVE. Uma campanha de marketplace não se escreve —
//     o preço aparece já descontado a quem tem direito. São duas interacções diferentes.
//   · `coupons` não tem âmbito de produto. O campo que faz de âmbito é `plan_override`, um texto
//     único já a fazer triplo serviço (packs do site, MTM Funded, parcerias). Não consegue dizer
//     «20% NESTE produto».
//   · `coupons.used_count` está partido desde Setembro (o contador nunca foi incrementado) e há
//     rotas vivas que ainda o lêem. Encostar o preço do marketplace a isso era herdar o defeito.
//
// Uma campanha é do produto. Sem tabela, sem junção, e sem duas fontes a discordarem sobre
// quanto custa a mesma coisa — que é o defeito que qualquer loja tem de não ter.
//
// O CÓDIGO ESCRITO À MÃO continua a poder existir um dia, por cima disto, sem conflito: seria um
// desconto adicional e não a substituição deste. Hoje não existe de propósito.

export type Preco = {
  /** O preço de tabela, sem campanha. */
  baseCents: number
  /** O que esta pessoa paga, hoje. */
  cents: number
  descontoPct: number
  descontoCents: number
  emCampanha: boolean
  /** Quando é que acaba, para o ecrã poder dizê-lo. Null = não acaba. */
  acabaEm: string | null
  moeda: string
}

/**
 * A campanha está a correr AGORA e esta pessoa apanha-a?
 *
 * O `agoraIso` é parâmetro e não `new Date()` cá dentro pela mesma razão que em
 * `temAcessoAoProduto`: uma regra que lê o relógio sozinha não se testa no dia a seguir ao prazo,
 * e o prazo é metade do que uma campanha é.
 *
 * O tier usa `podeAcederAoTier`, que é a função que o resto da casa já usa para decidir quem vê
 * o quê. Inventar aqui uma noção nova de «membro» era criar a TERCEIRA definição de membro nesta
 * casa — e a segunda já custou sinais perdidos (o VIP que vive em dois campos).
 */
export function campanhaActiva(
  produto: ProdutoRegra,
  agoraIso: string,
  perfil?: PerfilUi | null,
): boolean {
  const pct = Number(produto.campanha_pct ?? 0)
  if (!Number.isFinite(pct) || pct <= 0) return false

  const agora = Date.parse(agoraIso)
  if (!Number.isFinite(agora)) return false

  if (produto.campanha_inicio) {
    const i = Date.parse(produto.campanha_inicio)
    if (Number.isFinite(i) && i > agora) return false
  }
  if (produto.campanha_fim) {
    const f = Date.parse(produto.campanha_fim)
    // Uma data de fim ilegível NÃO deixa a campanha correr para sempre: fecha-a. Entre cobrar a
    // menos indefinidamente e cobrar o preço de tabela, o erro que se corrige é o segundo.
    if (!Number.isFinite(f) || f <= agora) return false
  }

  const tier = String(produto.campanha_tier ?? 'app_member')
  if (tier === 'all') return true
  return podeAcederAoTier(perfil, tier)
}

/**
 * O preço que se mostra e o preço que se cobra — a MESMA função nos dois sítios.
 *
 * É esta a razão de ela ser pura: o cartão da montra chama-a no browser para desenhar «99 € →
 * 79 €», e a rota do checkout chama-a no servidor para decidir quanto pedir ao Stripe. Se fossem
 * duas contas, mais cedo ou mais tarde discordavam, e discordar aqui é mostrar um preço e cobrar
 * outro — que é a única coisa que uma loja não pode fazer nunca.
 */
export function precoEfectivo(
  produto: ProdutoRegra,
  agoraIso: string,
  perfil?: PerfilUi | null,
): Preco {
  const base = Math.max(0, Math.round(Number(produto.preco_cents ?? 0) || 0))
  const moeda = String(produto.moeda ?? 'eur')
  const activa = campanhaActiva(produto, agoraIso, perfil)
  if (!activa) {
    return { baseCents: base, cents: base, descontoPct: 0, descontoCents: 0, emCampanha: false, acabaEm: null, moeda }
  }
  const pct = Math.min(90, Math.max(0, Number(produto.campanha_pct ?? 0)))
  // Arredonda o DESCONTO para baixo, não o preço: garante que o que se cobra nunca fica abaixo
  // do que se anunciou por um cêntimo de arredondamento.
  const desconto = Math.floor((base * pct) / 100)
  return {
    baseCents: base,
    cents: Math.max(0, base - desconto),
    descontoPct: pct,
    descontoCents: desconto,
    emCampanha: true,
    acabaEm: produto.campanha_fim ?? null,
    moeda,
  }
}

/**
 * O `mode` da sessão Stripe.
 *
 * Uma subscrição cobrada em `payment` cobra uma vez o que devia ser mensal; um curso cobrado em
 * `subscription` fica a cobrar todos os meses a quem comprou uma vez. Nenhum dos dois dá erro —
 * dão um extracto errado e um cliente zangado, e o segundo devolve-se com pedido de desculpa.
 */
export function modoStripe(produto: ProdutoRegra): 'payment' | 'subscription' {
  return produto.recorrente === true ? 'subscription' : 'payment'
}

// ── Quem vê ───────────────────────────────────────────────────────────────────────────────

/**
 * Este produto aparece na vitrine?
 *
 * Os TRÊS interruptores têm de dizer que sim: o geral (`def.ligado`), o do educador
 * (`vendedor.activo`) e o do produto (`produto.activo`). Três porque são três perguntas
 * diferentes que o dono faz em momentos diferentes — desligar o marketplace inteiro numa
 * emergência, suspender uma pessoa, ou tirar um produto de circulação — e um único interruptor
 * obrigava-o a escolher a machadada errada para o problema que tem à frente.
 *
 * O admin vê sempre, incluindo rascunhos e retirados: é quem aprova, e não pode aprovar às cegas.
 */
export function produtoNaVitrine(
  produto: ProdutoRegra,
  vendedor: VendedorRegra | null | undefined,
  def: Definicoes,
  perfil?: PerfilUi | null,
): boolean {
  if (ehAdminUi(perfil)) return true
  if (!def.ligado) return false
  // Um produto da casa não depende do interruptor de vendedor nenhum — não tem vendedor.
  if (donoValido(produto.dono) !== 'casa' && !vendedor?.activo) return false
  if (produto.activo === false) return false
  return produto.estado === 'publicado'
}

/**
 * Esta pessoa pode ver um caminho de COMPRA?
 *
 * ── A REGRA DA APPLE, NUM SÍTIO SÓ ────────────────────────────────────────────────────────
 *
 * Um curso comprado no marketplace é conteúdo digital consumido dentro da app. A Guideline 3.1.1
 * diz que isso tem de passar por In-App Purchase, e a 3.1.1 é a linha por onde uma submissão cai
 * mais depressa. Mandar o utilizador para um checkout Stripe dentro da WebView — ou até mostrar-
 * lhe um link que lá vá dar — é a 3.1.1 à letra.
 *
 * Enquanto não houver produtos IAP criados no App Store Connect, a app iOS mostra a montra e NÃO
 * mostra caminho nenhum de compra. É exactamente o que o `live-sessions-mobile.tsx` já faz com as
 * aulas pagas (um aviso, e fica por ali), e esse ecrã passou revisão. O que não se faz é ter uma
 * terceira opção que abra pagamento externo: ela não existe neste ficheiro de propósito.
 *
 * ABRIR o que já se comprou continua a funcionar no iOS, e tem de continuar — a Apple proíbe
 * VENDER fora do IAP, não proíbe entregar o que alguém já pagou noutro sítio.
 */
export function podeComprarAqui(opcoes: {
  iosNativo: boolean
  def: Definicoes
  produto: ProdutoRegra
  vendedor?: VendedorRegra | null
  jaComprou?: boolean
}): { pode: boolean; motivo?: string } {
  // «Já comprou» vem primeiro porque não é uma recusa: é o ecrã a mostrar «Abrir» em vez de
  // «Comprar», e vale na app tanto como na web — a Apple proíbe VENDER fora do IAP, não proíbe
  // entregar o que alguém já pagou.
  if (opcoes.jaComprou) return { pode: false, motivo: 'ja_comprado' }

  // A REGRA DA APPLE VEM ANTES DE TODAS AS OUTRAS RECUSAS, e a ordem é a decisão.
  //
  // Antes estava em último. Funcionava, mas por sorte: bastava um produto novo (um da casa com
  // `checkout_externo_url`, por exemplo) sair por um dos `return` de cima para o ecrã da app
  // deixar de dizer «ios_iap_required» e passar a dizer outra coisa — e «outra coisa» é o caminho
  // por onde um link para fora acaba a aparecer dentro da app. Com ela aqui, nenhum produto, de
  // ninguém, por motivo nenhum, devolve um caminho de compra à app iOS. Guideline 3.1.1.
  if (opcoes.iosNativo) return { pode: false, motivo: 'ios_iap_required' }

  if (!opcoes.def.ligado) return { pode: false, motivo: 'marketplace_desligado' }
  if (donoValido(opcoes.produto.dono) !== 'casa' && !opcoes.vendedor?.activo) {
    return { pode: false, motivo: 'vendedor_inactivo' }
  }
  if (opcoes.produto.activo === false || opcoes.produto.estado !== 'publicado') {
    return { pode: false, motivo: 'produto_indisponivel' }
  }
  return { pode: true }
}

/** O separador do marketplace aparece na app iOS? */
export function vitrineVisivelNoIos(def: Definicoes): boolean {
  return def.iosVitrine !== 'esconder'
}

// ── Quem abre o que comprou ───────────────────────────────────────────────────────────────

export type CompraRegra = {
  produto_id?: string
  estado?: string | null
  acesso_expira_em?: string | null
}

/**
 * Esta pessoa abre este produto?
 *
 * Um reembolso tira o acesso — senão o reembolso é um desconto de 100%. Uma mentoria com prazo
 * fecha quando o prazo acaba. E o admin abre sempre, porque é quem tem de conseguir ver o que
 * está a aprovar e o que um cliente diz que não abre.
 *
 * O `agoraIso` é um parâmetro e não `new Date()` lá dentro porque uma regra que lê o relógio
 * sozinha não se consegue testar no dia a seguir ao prazo.
 */
export function temAcessoAoProduto(
  compras: CompraRegra[] | null | undefined,
  produtoId: string,
  agoraIso: string,
  perfil?: PerfilUi | null,
): boolean {
  if (ehAdminUi(perfil)) return true
  if (!contaAtivaUi(perfil)) return false
  const agora = Date.parse(agoraIso)
  if (!Number.isFinite(agora)) return false
  return (compras ?? []).some((c) => {
    if (c.produto_id !== produtoId) return false
    if (c.estado !== 'paga') return false
    if (!c.acesso_expira_em) return true
    const fim = Date.parse(c.acesso_expira_em)
    return Number.isFinite(fim) && fim > agora
  })
}

/**
 * O extracto do educador: o que já vendeu e quanto lhe cabe.
 *
 * As vendas reembolsadas e anuladas não entram. Não é pormenor de contabilidade — é que um
 * extracto que conta vendas devolvidas promete ao educador dinheiro que já saiu da casa, e
 * descobri-lo no dia do pagamento é pior do que nunca o ter visto.
 */
export type LinhaExtracto = {
  estado?: string | null
  bruto_cents?: number | null
  parte_educador_cents?: number | null
}

export function extractoDoEducador(
  compras: LinhaExtracto[] | null | undefined,
): { vendas: number; brutoCents: number; aReceberCents: number } {
  let vendas = 0
  let brutoCents = 0
  let aReceberCents = 0
  for (const c of compras ?? []) {
    if (c.estado !== 'paga') continue
    vendas += 1
    brutoCents += Math.max(0, Number(c.bruto_cents) || 0)
    aReceberCents += Math.max(0, Number(c.parte_educador_cents) || 0)
  }
  return { vendas, brutoCents, aReceberCents }
}

// ── O VENDEDOR ────────────────────────────────────────────────────────────────────────────
//
// Num marketplace de vários vendedores, a pergunta «de quem é isto?» tem de estar respondida em
// cada cartão. É a diferença entre uma montra multivendedor e uma página de produtos: quem chega
// vê logo que aqui vende mais do que uma pessoa.
//
// A CASA É UM VENDEDOR. Hoje é o único — os catorze produtos publicados são todos dela, e nenhum
// educador tem produto ainda. A tentação era não mostrar vendedor nenhum enquanto assim for, e
// acrescentá-lo quando houvesse educadores. Ficou de fora, por duas razões:
//
//   · Um layout onde o vendedor «às vezes aparece» tem dois desenhos, e o segundo só se vê no dia
//     em que o primeiro educador publica — ou seja, é testado por um cliente.
//   · A casa É a vendedora daqueles produtos. Esconder isso não é neutro: é tirar da montra a
//     única coisa que a torna um marketplace.
//
// O que se resolve é o ASPECTO de catorze linhas iguais: a casa leva uma marca (uma pílula com o
// nome e a categoria de vendedor), e um educador leva o nome e a especialidade dele. São duas
// formas diferentes do mesmo campo, e não duas presenças diferentes.

export type Vendedor = {
  /** 'casa' para a MTM, ou o uuid do educador. É também o endereço da loja dele. */
  id: string
  nome: string
  /** A linha por baixo do nome. A da casa é fixa; a do educador é a especialidade. */
  nota: string | null
  ehACasa: boolean
  avatarUrl: string | null
}

/** O identificador da loja da casa. Não é um uuid de propósito: não há linha nenhuma por trás. */
export const LOJA_DA_CASA = 'casa'

/** O que a casa diz de si na montra. Um sítio só, para os três ecrãs não divergirem. */
export const NOTA_DA_CASA = 'Equipa MoreThanMoney'

/**
 * Quem vende este produto, já pronto para um cartão.
 *
 * Recebe o autor já resolvido (a montra lê-os todos de uma vez) em vez de ir buscá-lo: manter isto
 * puro é o que permite ao ecrã e à guarda usarem a mesma função.
 */
export function vendedorDoProduto(
  produto: { educator_id?: string | null; dono?: string | null },
  autor?: { id: string; display_name: string; avatar_url: string | null; specialty: string | null } | null,
): Vendedor {
  if (donoValido(produto.dono) === 'casa' || !produto.educator_id || !autor) {
    return { id: LOJA_DA_CASA, nome: NOME_DA_CASA, nota: NOTA_DA_CASA, ehACasa: true, avatarUrl: null }
  }
  return {
    id: autor.id,
    nome: autor.display_name,
    nota: autor.specialty ?? null,
    ehACasa: false,
    avatarUrl: autor.avatar_url ?? null,
  }
}

/**
 * A lista de vendedores de uma montra, com quantos produtos cada um tem.
 *
 * Ordenada por número de produtos e depois por nome — e NÃO por vendas. Não há dados de vendas
 * nenhuns ainda, e uma ordem que finge um ranking é uma ordem que mente. Quando houver vendas, é
 * esta a função que muda, e num sítio só.
 */
export function vendedoresDaMontra(
  produtos: { educator_id?: string | null; dono?: string | null; vendedor?: Vendedor }[],
): (Vendedor & { produtos: number })[] {
  const por = new Map<string, Vendedor & { produtos: number }>()
  for (const p of produtos) {
    const v = p.vendedor ?? vendedorDoProduto(p)
    const ja = por.get(v.id)
    if (ja) ja.produtos += 1
    else por.set(v.id, { ...v, produtos: 1 })
  }
  return Array.from(por.values()).sort((a, b) => b.produtos - a.produtos || a.nome.localeCompare(b.nome, 'pt'))
}

/**
 * O que procurar dá.
 *
 * Puro, e no servidor não — é no BROWSER que isto corre, sobre os produtos que já lá estão. Uma ida
 * ao servidor por tecla carregada dava um piscar a cada letra, e são no máximo 200 produtos.
 *
 * Sem acentos dos dois lados: quem escreve «vitalicio» tem de encontrar «vitalício». Procurar
 * também no nome do VENDEDOR é o que faz «marketplace» e não «lista»: num multivendedor, escrever
 * o nome de alguém é uma das maneiras naturais de procurar.
 */
export function procuraCasa(
  produto: { titulo?: string | null; subtitulo?: string | null; tipo?: string | null; vendedor?: { nome?: string | null } },
  termo: string,
): boolean {
  const q = semAcentos(termo).trim()
  if (!q) return true
  const alvo = semAcentos(
    [produto.titulo, produto.subtitulo, nomeDaCategoria(produto.tipo), produto.vendedor?.nome].filter(Boolean).join(' '),
  )
  // Todas as palavras têm de aparecer, em qualquer ordem. «sensei vitalicio» encontra o produto
  // cujo título é «MTM Sensei EA · vitalício»; com um `includes` da frase inteira não encontrava.
  return q.split(/\s+/).every((palavra) => alvo.includes(palavra))
}

function semAcentos(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ── DE QUANTO EM QUANTO TEMPO SE COBRA ────────────────────────────────────────────────────
//
// `recorrente` é um booleano e responde a «paga-se outra vez?». Não responde a «de quanto em
// quanto tempo?», e a diferença custou caro duas vezes no mesmo dia (29/09/2026):
//
//   · a MONTRA escrevia «624,00 €/mês» no Premium ANUAL, porque `recorrente = true` foi lido como
//     mensal. Um preço anual mostrado como mensal é publicidade enganosa, e é o produto mais caro
//     do catálogo;
//   · e `sincronizarPrecoNoStripe` criava sempre `interval: 'month'`. Nos quatro produtos anuais o
//     preço do Stripe «não batia certo», logo o caminho normal era criar um MENSAL de 624 € e
//     arquivar o anual que os clientes estão a pagar.
//
// A coluna `periodicidade` (migração 157) responde à pergunta, e é ELA que decide o `interval` do
// Stripe. `recorrente` continua a decidir o `mode` da sessão (ver `modoStripe`) — são duas
// perguntas, e foi por serem uma só que isto se partiu.

export type Periodicidade = 'unica' | 'mensal' | 'trimestral' | 'semestral' | 'anual'

/**
 * As periodicidades, com o que cada uma escreve no ecrã e o que vale no Stripe.
 *
 * UMA LISTA E NÃO TRÊS. O rótulo, o intervalo do Stripe e a coerência com `recorrente` saem todos
 * daqui: três tabelas separadas divergiam, e divergir aqui é mostrar «/mês» e cobrar ao ano.
 *
 * O Stripe não tem `interval: 'quarter'` nem `'semester'` — tem `month` com `interval_count`. É
 * por isso que trimestral e semestral são o mesmo intervalo com contagens diferentes, e é o erro
 * que se comete quando se tenta adivinhar o nome do intervalo em vez de o ler.
 */
export const PERIODICIDADES: {
  id: Periodicidade
  /** O nome no formulário. */
  nome: string
  /** O que vai a seguir ao preço na montra. Vazio quando não há repetição para anunciar. */
  rotulo: string
  /** O intervalo do Stripe. Null só para `unica`, que não é uma subscrição. */
  stripe: { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } | null
}[] = [
  { id: 'unica', nome: 'Pagamento único', rotulo: '', stripe: null },
  { id: 'mensal', nome: 'Mensal', rotulo: '/mês', stripe: { interval: 'month', interval_count: 1 } },
  { id: 'trimestral', nome: 'Trimestral', rotulo: '/trimestre', stripe: { interval: 'month', interval_count: 3 } },
  { id: 'semestral', nome: 'Semestral', rotulo: '/semestre', stripe: { interval: 'month', interval_count: 6 } },
  { id: 'anual', nome: 'Anual', rotulo: '/ano', stripe: { interval: 'year', interval_count: 1 } },
]

/**
 * A periodicidade que se grava.
 *
 * `unica` é o valor por omissão e NÃO `mensal`: um produto sem periodicidade declarada é uma venda
 * única, que é o caso que não cobra ninguém duas vezes por engano.
 */
export function periodicidadeValida(v: unknown): Periodicidade {
  const s = String(v ?? '').trim().toLowerCase()
  return (PERIODICIDADES.find((p) => p.id === s)?.id ?? 'unica') as Periodicidade
}

/**
 * `recorrente` e `periodicidade` estão de acordo?
 *
 * A mesma regra que a restrição `marketplace_produtos_periodicidade_coerente` da 157 tem presa no
 * esquema. Está aqui repetida de propósito: uma restrição da base que rebenta com um erro do
 * Postgres à frente do educador não é validação, é uma avaria com sotaque.
 */
export function periodicidadeCoerente(recorrente: unknown, periodicidade: unknown): boolean {
  const p = periodicidadeValida(periodicidade)
  return recorrente === true ? p !== 'unica' : p === 'unica'
}

/**
 * A periodicidade coerente com o `recorrente` que vem do formulário.
 *
 * Quem manda é o `recorrente`, porque é ele que decide o `mode` do checkout: um produto marcado
 * como pagamento único com «anual» ao lado cobra uma vez, e é esse o comportamento que o resto do
 * código já tem. O contrário — uma subscrição sem periodicidade — fica `mensal`, que é o caso mais
 * comum e o único que a restrição da base aceita.
 */
export function periodicidadeParaGravar(recorrente: unknown, periodicidade: unknown): Periodicidade {
  const p = periodicidadeValida(periodicidade)
  if (recorrente === true) return p === 'unica' ? 'mensal' : p
  return 'unica'
}

/**
 * O que vai a seguir ao preço, e se cola ao número.
 *
 * `junto` existe porque «624,00 €/ano» não leva espaço e «65,00 € subscrição» leva. Devolver isto
 * em vez de o ecrã adivinhar é o que mantém os três sítios que desenham preços (montra, ficha e
 * loja do vendedor) a escrever a mesma coisa.
 *
 * NUNCA INVENTA «/mês». Um produto recorrente sem periodicidade legível cai em «subscrição» — que
 * é vago mas verdadeiro, e era exactamente o que o Premium anual precisava de ter dito.
 */
export function sufixoDoPeriodo(produto: {
  recorrente?: boolean | null
  periodicidade?: string | null
}): { texto: string; junto: boolean } {
  if (produto.recorrente !== true) return { texto: '', junto: true }
  const achado = PERIODICIDADES.find((p) => p.id === periodicidadeValida(produto.periodicidade))
  if (!achado || !achado.rotulo) return { texto: 'subscrição', junto: false }
  return { texto: achado.rotulo, junto: true }
}

/**
 * O `recurring` para o Stripe, ou null quando não há subscrição nenhuma.
 *
 * Devolve null para `unica` e NÃO um mensal por omissão: um mensal adivinhado é o defeito que isto
 * veio corrigir. Quem chama tem de decidir o que fazer com o null — e em `stripe-preco.ts` a
 * decisão é recusar, não inventar.
 */
export function intervaloStripe(periodicidade: unknown): { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } | null {
  return PERIODICIDADES.find((p) => p.id === periodicidadeValida(periodicidade))?.stripe ?? null
}

// ── A GALERIA ─────────────────────────────────────────────────────────────────────────────
//
// Pedido do dono a 29/09: «permite ter várias imagens nos produtos de marketplace».
//
// `imagem_url` FICA e continua a ser a CAPA — é ela que a montra desenha. Uma montra em que cada
// cartão escolhe uma imagem diferente da galeria é uma montra que muda de aspecto a cada
// recarregamento. `imagens` é o resto, pela ordem em que o autor as pôs.
//
// A CAPA NÃO ENTRA NA GALERIA. Quem lê mostra a capa primeiro e a seguir `imagens`; guardar a mesma
// URL nos dois sítios dava uma ficha com a primeira imagem repetida, e o ecrã não tem maneira de
// saber se a repetição foi intenção de alguém.

/** O tecto da coluna `imagens`, o mesmo número que a restrição da 157 tem preso. A capa é à parte. */
export const IMAGENS_MAX = 8

/**
 * A galeria da coluna `imagens`, limpa: sem a capa, sem repetições, sem vazios, com o tecto.
 *
 * É esta que se GRAVA. Corre no ecrã antes de gravar e outra vez no servidor — não por desconfiança
 * do primeiro, mas porque o servidor tem outros clientes além deste formulário (a app, e amanhã
 * uma importação), e a restrição da base é a última rede e não a primeira.
 */
export function galeriaParaGravar(capa: unknown, imagens: unknown): string[] {
  const capaLimpa = String(capa ?? '').trim()
  const vistas = new Set<string>()
  if (capaLimpa) vistas.add(capaLimpa)
  const saida: string[] = []
  for (const item of Array.isArray(imagens) ? imagens : []) {
    const url = String(item ?? '').trim()
    if (!url || vistas.has(url)) continue
    vistas.add(url)
    saida.push(url)
    if (saida.length >= IMAGENS_MAX) break
  }
  return saida
}

/**
 * O que a ficha mostra, pela ordem: a capa primeiro, a galeria a seguir.
 *
 * A capa primeiro e não a ordenar por qualquer outro critério: é a imagem que a pessoa viu no
 * cartão que a trouxe aqui, e abrir a ficha noutra imagem faz duvidar de que se clicou no produto
 * certo.
 */
export function galeriaDoProduto(produto: { imagem_url?: string | null; imagens?: unknown }): string[] {
  const capa = String(produto.imagem_url ?? '').trim()
  const resto = galeriaParaGravar(capa, produto.imagens)
  return capa ? [capa, ...resto] : resto
}

/**
 * O `checkout_externo_url` de um produto da casa é um destino a que se pode mandar alguém?
 *
 * Duas formas válidas, e a segunda é a que faltava: um endereço ABSOLUTO (`https://…`) e um
 * caminho INTERNO (`/upgrade?plan=premium_monthly`). Os catorze produtos da casa publicados usam
 * todos a segunda, e o teste na rota era só `^https?://` — nenhum passava, e os catorze botões da
 * montra respondiam «este produto ainda não tem cobrança ligada».
 *
 * O que NÃO passa, e é o motivo de isto ser uma função com guarda em vez de um `startsWith('/')`:
 * `//outro-sitio.com` é um caminho relativo ao PROTOCOLO. Começa por `/`, mas o browser segue-o
 * para outro domínio. Aceitá-lo era transformar um campo de texto do painel numa porta de
 * redireccionamento para fora — e um redireccionamento a partir de um domínio de confiança é
 * metade do trabalho de quem monta uma página de login falsa.
 */
export function destinoDeCompraValido(url: unknown): boolean {
  const s = String(url ?? '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  // `\` porque alguns browsers tratam `/\evil.com` como `//evil.com`.
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')
}

/** O nome da casa, quando é ela que vende. Escrito uma vez para os três ecrãs o dizerem igual. */
export const NOME_DA_CASA = 'MoreThanMoney'

/**
 * DE QUEM É ESTE PRODUTO, em texto para um ecrã.
 *
 * Isto é uma função e não uma expressão dentro de um componente porque a expressão que estava no
 * painel do Centro era esta:
 *
 *     const nomeDe = (id: string) => educadores.find((e) => e.educator_id === id)?.nome ?? id.slice(0, 8)
 *
 * E `educator_id` é NULO em todos os produtos da casa — é isso que `dono = 'casa'` significa. Com o
 * marketplace ligado e 14 produtos da casa publicados, a primeira linha da tabela de produtos
 * chamava `null.slice(0, 8)`, e um TypeError no render de um componente de cliente não estraga uma
 * célula: derruba a secção inteira. O painel ficava em branco, e é esse o erro que o dono via.
 *
 * O que se aprende do caso é mais geral do que o `?.`: um produto SEM educador não é um produto com
 * um educador desconhecido. A resposta certa não é um uuid cortado a oito letras — é o nome da casa.
 * Por isso a decisão vive aqui, ao lado de `donoValido`, e não em cada ecrã que a repetia.
 */
export function nomeDoAutor(
  produto: { educator_id?: string | null; dono?: string | null },
  nomePorId?: (id: string) => string | null | undefined,
): string {
  const id = produto.educator_id ?? null
  if (donoValido(produto.dono) === 'casa' || !id) return NOME_DA_CASA
  // Um educador sem nome à mão mostra as primeiras letras do id — é feio, mas é informação, e
  // acontece só enquanto a lista de educadores não tiver chegado ao ecrã.
  return nomePorId?.(id) || id.slice(0, 8)
}

/** Cêntimos → «35,00 €». Um sítio só, porque um extracto com dois formatos parece dois extractos. */
export function euros(cents: number | null | undefined, moeda = 'eur'): string {
  const v = (Math.round(Number(cents) || 0)) / 100
  return v.toLocaleString('pt-PT', { style: 'currency', currency: (moeda || 'eur').toUpperCase() })
}

/** O slug do endereço público, a partir do título. Sem acentos, sem espaços, sem surpresas. */
export function slugDoTitulo(titulo: string): string {
  return String(titulo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
