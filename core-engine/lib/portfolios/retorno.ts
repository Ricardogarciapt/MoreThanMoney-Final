/**
 * O RETORNO DE UMA CARTEIRA — uma fórmula só, para os quatro ecrãs que o mostram.
 *
 * ── O defeito que isto corrige ──────────────────────────────────────────────────────────────
 * `app/portfolios/page.tsx` fazia `avgPerformance = soma(pnl_percent) / nº de activos`: a MÉDIA
 * SIMPLES das percentagens de cada activo. Isso não é o retorno de uma carteira — é o retorno de
 * uma carteira imaginária em que se pôs o mesmo dinheiro em cada linha.
 *
 * O caso que torna o defeito invisível: 50 $ num activo a +200 % e 5 000 $ noutro a −10 %. A média
 * simples diz «+95 %»; a carteira perdeu 400 $ e está a −8,7 %. O ecrã dizia «ETF PERFORMANCE
 * +60,37 %» quando a conta real fez +39,52 %.
 *
 * Mostrar uma perda como ganho é o pior defeito possível numa página de portefólios, e uma
 * percentagem inflacionada por uma média mal feita vale o mesmo que um «+340 % em 90 dias»: é um
 * número inventado. Por isso a regra está num módulo puro, com guarda — e não em três ecrãs.
 *
 * ── As duas perguntas, que são diferentes ───────────────────────────────────────────────────
 *  · `resultadoDaConta` — o que a conta FEZ: (valor de mercado − contribuído) / contribuído.
 *    É a resposta canónica: `sim_saldo` = contribuído e `sim_equity` = valor de mercado nas duas
 *    contas de portefólio (ver migração 173). É o que o seletor do WebTrader já mostrava certo.
 *  · `retornoDaCarteira` — o mesmo, mas somado activo a activo, para onde não há conta (a tabela
 *    de activos). PONDERADO pelo que foi efectivamente posto em cada um, nunca uma média de
 *    percentagens. Declara a COBERTURA: activos sem preço não entram em lado nenhum da fracção,
 *    e quem mostra o número tem de dizer quantos ficaram de fora.
 *
 * `potencialPonderado` responde a uma TERCEIRA pergunta — uma projecção da configuração do admin,
 * não um resultado. Fica separada de propósito: quem a mostra tem de a rotular como projecção.
 *
 * Puro: sem React, sem base. Testado em lib/portfolios/retorno.check.ts.
 */

/** O mínimo que um activo precisa de ter para entrar numa soma de carteira. */
export interface ActivoDaCarteira {
  symbol?: string | null
  /** Dinheiro posto neste activo. Sem isto não há peso — e sem peso não há retorno de carteira. */
  total_invested?: number | null
  /** Valor de mercado hoje. */
  current_value?: number | null
  /** `null` = sem cotação: o activo não entra na fracção (nem em cima nem em baixo). */
  current_price?: number | null
  /** Projecção da configuração do admin (potencial até ATH, crescimento esperado a 5 anos). */
  potential_growth?: number | null
}

export interface RetornoCarteira {
  /** Soma do investido nos activos COM cotação. */
  investido: number
  /** Soma do valor de mercado desses mesmos activos. */
  valor: number
  resultado: number
  /** `null` quando não há investido nenhum a medir — e aí o ecrã mostra «—», não um zero. */
  resultadoPct: number | null
  /** Quantos activos entraram, de quantos existem: a origem declarada do número. */
  comCotacao: number
  activos: number
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const r2 = (x: number) => Math.round(x * 100) / 100

/**
 * O resultado de uma CONTA de portefólio, em percentagem.
 *
 * Contra o CONTRIBUÍDO e não contra o primeiro depósito: medir uma carteira com reforços semanais
 * contra os 1 000 $ iniciais dá um número bonito que não é o retorno de ninguém.
 *
 * `null` com contribuído a zero: sem dinheiro posto não há percentagem, e um «0,00 %» ali seria
 * uma afirmação falsa sobre uma conta que ninguém mediu.
 */
export function resultadoDaConta(c: { contribuido?: number | null; valor?: number | null }): number | null {
  const contribuido = n(c.contribuido)
  if (contribuido <= 0) return null
  return r2((n(c.valor) / contribuido - 1) * 100)
}

/** O mesmo, em dinheiro. */
export function resultadoEmDinheiro(c: { contribuido?: number | null; valor?: number | null }): number {
  return r2(n(c.valor) - n(c.contribuido))
}

/**
 * O retorno de uma lista de activos — ponderado pelo investido.
 *
 * Um activo sem cotação fica FORA das duas somas. Deixá-lo no investido e não no valor fazia a
 * carteira parecer a perder tudo o que ainda não tinha preço; metê-lo nas duas com o preço de
 * entrada fingia um resultado de zero que ninguém mediu. Quem mostra o número diz a cobertura.
 */
export function retornoDaCarteira(activos: ActivoDaCarteira[] | null | undefined): RetornoCarteira {
  const todos = activos ?? []
  // «Tem cotação» = `current_price` é um número finito > 0. `null`/`undefined`/0 não serve.
  const medidos = todos.filter((a) => {
    const p = Number(a.current_price)
    return Number.isFinite(p) && p > 0
  })
  const investido = r2(medidos.reduce((s, a) => s + n(a.total_invested), 0))
  const valor = r2(medidos.reduce((s, a) => s + n(a.current_value), 0))
  return {
    investido,
    valor,
    resultado: r2(valor - investido),
    resultadoPct: investido > 0 ? r2(((valor - investido) / investido) * 100) : null,
    comCotacao: medidos.length,
    activos: todos.length,
  }
}

/**
 * A projecção do admin, PONDERADA pelo investido — e nunca apresentada como desempenho.
 *
 * A média simples que estava aqui tinha o mesmo vício: um activo de 50 $ com «+500 % até ao ATH»
 * puxava o cartão inteiro. Ponderar pelo dinheiro posto diz o que a carteira projectaria se cada
 * activo chegasse ao alvo que o admin lhe escreveu — que continua a ser uma projecção, e o rótulo
 * do ecrã tem de o dizer.
 *
 * Sem investido conhecido (a configuração do admin sozinha, sem a carteira) devolve `null`: antes
 * de inventar um peso, não se mostra número.
 */
export function potencialPonderado(activos: ActivoDaCarteira[] | null | undefined): number | null {
  const todos = activos ?? []
  const peso = todos.reduce((s, a) => s + n(a.total_invested), 0)
  if (peso <= 0) return null
  const soma = todos.reduce((s, a) => s + n(a.total_invested) * n(a.potential_growth), 0)
  return r2(soma / peso)
}

/** «+39,52 %» / «−36,40 %» / «—». O sinal é explícito: um «36,40 %» sem sinal já foi lido como ganho. */
export function pctFormatada(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`
}

/**
 * Várias contas somadas numa só linha (o cartão único do separador da app).
 *
 * Soma os contribuídos e os valores e mede UMA fracção — não a média dos resultados das contas,
 * que seria o mesmo erro um nível acima.
 */
export function resultadoDasContas(
  contas: Array<{ contribuido?: number | null; valor?: number | null }> | null | undefined,
): { contribuido: number; valor: number; resultado: number; resultadoPct: number | null; contas: number } {
  const lista = contas ?? []
  const contribuido = r2(lista.reduce((s, c) => s + n(c.contribuido), 0))
  const valor = r2(lista.reduce((s, c) => s + n(c.valor), 0))
  return {
    contribuido,
    valor,
    resultado: r2(valor - contribuido),
    resultadoPct: resultadoDaConta({ contribuido, valor }),
    contas: lista.length,
  }
}
