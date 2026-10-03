/**
 * MARCAR O CONTEÚDO COM O CÓDIGO DO AGENTE QUE O PRODUZIU.
 *
 * ═══ O BURACO QUE ISTO TAPA, MEDIDO ════════════════════════════════════════════════════════
 *
 * A cadeia da atribuição está inteira e viva desde 01/10: `?ag=` é apanhado em todas as páginas
 * (`components/agentes/captura-atribuicao.tsx`), guardado 30 dias, enviado no checkout
 * (`app/api/marketplace/checkout/route.ts`) e gravado em `marketplace_compras.agente_codigo`, que
 * é o que `lib/agentes/receita.ts` lê.
 *
 * Falta a PRIMEIRA peça: **ninguém EMITE um link com `?ag=`.** Medido na base a 01/10:
 *
 *     select count(*) total,
 *            count(*) filter (where caption ilike '%?ag=%') com_ag
 *       from social_scheduled_posts;
 *     → total 200, com_ag 0   (181 já publicados)
 *
 *     select count(*) from social_scheduled_posts where caption ~* 'morethanmoney\.pt';
 *     → 39 legendas levam um link nosso, nenhuma leva código.
 *
 * E os sete agentes estão todos `vivo` com `receita = 0`. Isto não é um relatório mal feito: a
 * regra de vida (`lib/agentes/vida.ts`) julga cada agente por receita menos gasto na janela de
 * 48 h. Com receita zero para todos, ela pára a equipa inteira — e o motivo escrito em cada linha
 * (`sem_codigo`) vai parecer sólido a quem o ler depois. **Pára-os por falta de MEDIÇÃO, não por
 * falta de trabalho.** É o pior tipo de defeito: não dá erro, dá um número.
 *
 * ═══ PORQUE É QUE ISTO É PURO ══════════════════════════════════════════════════════════════
 *
 * Errar aqui é invisível das duas maneiras:
 *
 *  · **marcar de menos** — um link que fica sem código é receita que ninguém vai conseguir
 *    atribuir, e um agente que morre por isso;
 *  · **marcar mal** — um link PARTIDO numa publicação já no Instagram não se corrige: a legenda
 *    de um post publicado é a que lá ficou. Um `?ag=` colado à frente do ponto final da frase
 *    (`…/register?ag=AG-SAAS.`) é exactamente isso.
 *
 * Nenhuma das duas rebenta. `marca-conteudo.check.ts` atira-lhe os casos maus com as URL REAIS
 * que estão hoje na base — incluindo `morethanmoney.pt/register.`, com o ponto colado.
 *
 * ═══ O QUE NÃO SE INVENTA ══════════════════════════════════════════════════════════════════
 *
 * Um pilar sem agente declarado NÃO cai no CEO. Cair no CEO dava ao topo a receita que ninguém
 * ganhou, e a regra de vida salvava-o com dinheiro que não era dele — o mesmo erro que
 * `pareceCodigoDeAgente` existe para travar, pela porta do lado. Fica `null` com o motivo escrito,
 * e o painel mostra «por atribuir: pilar sem agente». Ver `lib/agentes/receita.ts`.
 */
import { normalizar } from './atribuicao'
import { PARAMETRO } from './atribuicao'

/** O domínio da casa. Só links NOSSOS levam código — ver `ehNosso`. */
export const DOMINIO_DA_CASA = 'morethanmoney.pt'

/**
 * QUEM FICA COM O CRÉDITO DE CADA PILAR DE CONTEÚDO.
 *
 * As chaves são os pilares que `social_scheduled_posts.pillar` realmente usa: o gerador autónomo
 * escreve `cta:<palavra-chave>` (ver `app/api/cron/content-draft/route.ts`), que é a palavra que
 * o leitor comenta e que o funil do Instagram reconhece. O pilar é a INTENÇÃO de quem produziu o
 * post, e é por isso que manda — e não o link, que um post pode ter em número qualquer.
 *
 * Este mapa é a lista de decisões do dono, num sítio visível e editável. Está deliberadamente
 * INCOMPLETO: `desafio` (MTM Funded), `criar` (criadores), `resultados` e `prova` não têm agente
 * porque **não há hoje um agente que seja dono desses produtos**. Inventar um dono é inventar um
 * número; quando houver agente, acrescenta-se aqui uma linha.
 */
export const AGENTE_POR_PILAR: Readonly<Record<string, string>> = Object.freeze({
  // Sinais, copytrading e Premium vivem todos do que o scanner produz.
  'cta:sinais': 'AG-SCANNER',
  'cta:copy': 'AG-SCANNER',
  'cta:premium': 'AG-SCANNER',
  // A app MTM System e o trial são o produto.
  'cta:app': 'AG-SAAS',
  'cta:quero': 'AG-SAAS',
  'cta:mundo': 'AG-SAAS',
  // Formação paga.
  educacao: 'AG-FORMACAO',
  formacao: 'AG-FORMACAO',
})

/** Porque é que um conteúdo ficou sem código. Vai escrito para o painel, nunca «zero» a seco. */
export type MotivoSemCodigo =
  /** O pilar não tem agente declarado em `AGENTE_POR_PILAR`. Não se atribui ao CEO por omissão. */
  | 'pilar_sem_agente'
  /** Veio um código que não tem a forma `AG-…`/`CEO-…`. Trata-se como ausente. */
  | 'codigo_invalido'
  /** Há código, mas a legenda não tem nenhum link nosso onde o pôr. O post não mede nada. */
  | 'sem_link_nosso'

export interface Marcacao {
  /** O código que ficou nos links, ou `null`. */
  codigo: string | null
  /** A legenda a gravar. Igual à que entrou quando não houve nada a marcar. */
  legenda: string
  /** Quantos links nossos levaram o código. Zero COM código é um post que não mede nada. */
  marcados: number
  /** Escrito sempre que `codigo` é `null` ou `marcados` é 0. */
  motivo?: MotivoSemCodigo
}

/**
 * O agente de um pilar, ou `null`.
 *
 * Os pilares `repost:<uuid>` (ver o cron `content-repost`) não entram no mapa de propósito: o
 * crédito de um repost é de quem escreveu o original, e isso resolve-se passando o código do post
 * original a `marcarConteudo`, não adivinhando aqui.
 */
export function agenteDoPilar(pilar: unknown): string | null {
  const p = String(pilar ?? '').trim().toLowerCase()
  return normalizar(AGENTE_POR_PILAR[p] ?? null)
}

/**
 * Pontuação que a frase deixa colada ao fim de uma URL escrita a correr no meio do texto.
 *
 * É a razão de este módulo não poder ser um `replace` de três linhas. Na base, hoje, existem
 * mesmo `morethanmoney.pt/register.`, `morethanmoney.pt/mtmfunded.` e `morethanmoney.pt.` — com
 * o ponto final da frase encostado. Enfiar `?ag=` depois do ponto escreve
 * `…/register.?ag=AG-SAAS`, que é um caminho que não existe: a pessoa recebe um 404 e a casa
 * perde a visita e a medição ao mesmo tempo.
 */
const PONTUACAO_FINAL = '.,;:!?)]}>"\'»…'

/** O endereço é nosso? Aceita subdomínios (`app.morethanmoney.pt`), rejeita `nao-morethanmoney.pt`. */
function ehNosso(hospedeiro: string): boolean {
  const h = hospedeiro.toLowerCase()
  return h === DOMINIO_DA_CASA || h.endsWith(`.${DOMINIO_DA_CASA}`)
}

/**
 * Reconhece as URL do nosso domínio escritas como elas aparecem numa legenda: com ou sem
 * `https://`, com ou sem `www.`, e muitas vezes sem nada — `morethanmoney.pt/register` é o que o
 * modelo escreve, porque é o que se lê bem.
 *
 * ═══ AS DUAS ÂNCORAS, E O QUE CADA UMA TRAVA ═══════════════════════════════════════════════
 *
 * O nome da casa aparece em sítios que NÃO são a casa, e a primeira versão deste padrão marcou os
 * três — foi a guarda que os apanhou:
 *
 *  · `(?<![\w.@/-])` — o nome tem de começar onde começa um endereço. Sem isto,
 *    `instagram.com/morethanmoney.pt` (o nosso nome no CAMINHO de outro site) e
 *    `nao-morethanmoney.pt` (outro domínio que acaba no nosso nome) levavam código;
 *  · `(?![\w-])(?!\.[\w-])` — o `.pt` tem de ser o FIM do domínio. Sem isto,
 *    `morethanmoney.pt.evil.com/roubar` era marcado como se fosse nosso, porque o padrão parava
 *    no `.pt` e escrevia `morethanmoney.pt?ag=…` colado ao resto. A segunda metade distingue um
 *    ponto que continua o domínio (`.pt.evil`) de um ponto que acaba a frase (`morethanmoney.pt.`,
 *    que está na base e tem de continuar a ser marcado).
 */
const PADRAO_LINK =
  /(?<![\w.@/-])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*morethanmoney\.pt(?![\w-])(?!\.[\w-])(?:\/[^\s<>"'`]*)?/gi

/**
 * Põe `ag=<codigo>` numa URL já isolada, no sítio certo.
 *
 * Devolve `null` quando não há nada a fazer — já tem o parâmetro. É o que torna isto IDEMPOTENTE,
 * e a idempotência não é um luxo: o cron `content-repost` reescreve legendas já marcadas, e sem
 * isto um repost de um repost saía com `?ag=X&ag=X&ag=X`.
 */
function comParametro(url: string, codigo: string): string | null {
  // O fragmento fica sempre no fim do endereço. Um `?ag=` posto depois do `#` não é um parâmetro
  // — é texto dentro do fragmento, e o servidor nunca o vê.
  const corte = url.indexOf('#')
  const fragmento = corte >= 0 ? url.slice(corte) : ''
  const semFragmento = corte >= 0 ? url.slice(0, corte) : url
  // Já marcado (por nós ou à mão): não se duplica nem se sobrepõe. Sobrepor seria roubar o
  // crédito a um código que alguém escolheu escrever.
  if (/[?&]ag=/i.test(semFragmento)) return null
  const separador = semFragmento.includes('?') ? '&' : '?'
  return `${semFragmento}${separador}${PARAMETRO}=${encodeURIComponent(codigo)}${fragmento}`
}

/**
 * Mete o código em todos os links nossos de um texto. Puro: não lê nem escreve nada.
 *
 * Os links de TERCEIROS não se tocam, e isto é mais do que irrelevância: as legendas levam links
 * de corretora e de afiliação, onde um parâmetro a mais pode anular o rastreio de quem paga a
 * comissão. Acrescentar `?ag=` a um link que não é nosso não ganha medição nenhuma e pode custar
 * dinheiro a sério.
 */
export function marcarLegenda(texto: unknown, codigo: unknown): { legenda: string; marcados: number } {
  const t = typeof texto === 'string' ? texto : String(texto ?? '')
  const c = normalizar(codigo)
  if (!c || !t) return { legenda: t, marcados: 0 }

  let marcados = 0
  const legenda = t.replace(PADRAO_LINK, (achado) => {
    // Descola a pontuação da frase antes de mexer no endereço, e devolve-a intacta no fim: o
    // texto lê-se igual, o link é que passa a funcionar.
    let url = achado
    let cauda = ''
    while (url.length > 0 && PONTUACAO_FINAL.includes(url[url.length - 1])) {
      cauda = url[url.length - 1] + cauda
      url = url.slice(0, -1)
    }
    // `nao-morethanmoney.pt` casa com o padrão e não é nosso. Sem esta verificação, marcava-se o
    // domínio de outra pessoa.
    const hospedeiro = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]
    if (!ehNosso(hospedeiro)) return achado
    const marcada = comParametro(url, c)
    if (!marcada) return achado
    marcados += 1
    return `${marcada}${cauda}`
  })
  return { legenda, marcados }
}

/**
 * A decisão completa para um conteúdo: que código leva, com que legenda fica, e — quando não leva
 * nada — porquê.
 *
 * `codigoExplicito` ganha ao pilar. Serve o repost (herda o código do original) e o estúdio, onde
 * é uma pessoa a escolher.
 */
export function marcarConteudo(entrada: {
  legenda: unknown
  pilar?: unknown
  codigoExplicito?: unknown
}): Marcacao {
  const bruta = typeof entrada.legenda === 'string' ? entrada.legenda : String(entrada.legenda ?? '')

  // Um código explícito MAL FORMADO não cai em silêncio para o pilar: quem o passou acredita que
  // está a atribuir a esse agente, e o crédito ia para outro sem ninguém dar por nada.
  if (entrada.codigoExplicito != null && String(entrada.codigoExplicito).trim() !== '') {
    const c = normalizar(entrada.codigoExplicito)
    if (!c) return { codigo: null, legenda: bruta, marcados: 0, motivo: 'codigo_invalido' }
    const { legenda, marcados } = marcarLegenda(bruta, c)
    return marcados > 0
      ? { codigo: c, legenda, marcados }
      : { codigo: c, legenda, marcados: 0, motivo: 'sem_link_nosso' }
  }

  const doPilar = agenteDoPilar(entrada.pilar)
  if (!doPilar) return { codigo: null, legenda: bruta, marcados: 0, motivo: 'pilar_sem_agente' }

  const { legenda, marcados } = marcarLegenda(bruta, doPilar)
  return marcados > 0
    ? { codigo: doPilar, legenda, marcados }
    : { codigo: doPilar, legenda, marcados: 0, motivo: 'sem_link_nosso' }
}
