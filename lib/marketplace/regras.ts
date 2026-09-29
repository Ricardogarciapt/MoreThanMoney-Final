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

import { contaAtivaUi, ehAdminUi, type PerfilUi } from '@/lib/perfil-ui'

// ── A partilha ────────────────────────────────────────────────────────────────────────────
//
// «Ficas com 90–95% do que vender» está escrito na /criadores, em texto corrido e nos três
// cartões de números da página. Isso não é uma intenção — é o que a pessoa leu antes de se
// candidatar, e é por isso que estes números vivem aqui e não numa variável de ambiente.
//
// O valor por omissão é o EXTREMO QUE FAVORECE O EDUCADOR. Entre dois números prometidos em
// público, aplicar o pior por omissão é deixar que um esquecimento decida contra a pessoa que
// confiou na página. Descer para 90 é uma decisão que alguém toma à mão e que fica escrita na
// linha dele.

export const PARTILHA_MIN_PCT = 90
export const PARTILHA_MAX_PCT = 95
export const PARTILHA_PADRAO_PCT = 95

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
 * de o dinheiro existir aqui. Calcular os 95% do educador sobre o BRUTO numa venda dessas punha a
 * casa a pagar a comissão da Apple do próprio bolso: 100 € de venda, 30 € para a Apple, 95 € para
 * o educador, 25 € de prejuízo por cada produto vendido. Os 90–95% são sobre o que a casa recebe,
 * e é isso que tem de estar escrito no contrato do educador.
 *
 * O ARREDONDAMENTO É PARA O EDUCADOR. Um cêntimo perdido no arredondamento tem de ir para algum
 * lado, e vai para quem produziu o conteúdo. A casa fica com o resto, o que garante que as duas
 * partes somam SEMPRE o líquido exacto — não há cêntimos a evaporar-se entre as duas colunas.
 */
export function calcularPartilha(entrada: {
  brutoCents: number
  comissaoLojaCents?: number
  partilhaPct?: number | null
}): Partilha {
  const bruto = Math.max(0, Math.round(Number(entrada.brutoCents) || 0))
  const loja = Math.min(bruto, Math.max(0, Math.round(Number(entrada.comissaoLojaCents) || 0)))
  const liquido = bruto - loja
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
  educator_id?: string
  titulo?: string | null
  descricao?: string | null
  preco_cents?: number | null
  conteudo_url?: string | null
  estado?: string | null
  activo?: boolean | null
  partilha_pct?: number | null
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
  if (!vendedor?.activo) {
    return { pode: false, motivo: 'A tua conta de vendedor ainda não foi activada pela MTM.' }
  }
  const titulo = String(produto.titulo ?? '').trim()
  if (titulo.length < 3) return { pode: false, motivo: 'Dá um título ao produto.' }
  const descricao = String(produto.descricao ?? '').trim()
  if (descricao.length < 30) {
    return { pode: false, motivo: 'Escreve uma descrição com pelo menos 30 caracteres — é o que a pessoa lê antes de decidir.' }
  }
  const conteudo = String(produto.conteudo_url ?? '').trim()
  if (!/^https?:\/\//i.test(conteudo)) {
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
  if (!vendedor?.activo) return false
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
  if (opcoes.jaComprou) return { pode: false, motivo: 'ja_comprado' }
  if (!opcoes.def.ligado) return { pode: false, motivo: 'marketplace_desligado' }
  if (!opcoes.vendedor?.activo) return { pode: false, motivo: 'vendedor_inactivo' }
  if (opcoes.produto.activo === false || opcoes.produto.estado !== 'publicado') {
    return { pode: false, motivo: 'produto_indisponivel' }
  }
  if (opcoes.iosNativo) return { pode: false, motivo: 'ios_iap_required' }
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
