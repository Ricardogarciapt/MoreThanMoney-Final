/**
 * O CÁLCULO de uma comissão de equipa. Funções puras, sem base de dados — de propósito.
 *
 * Isto é a única coisa no sistema que transforma uma venda em dinheiro a pagar a pessoas. Por
 * isso não fala com o Supabase, não lê a hora, não tem números lá dentro: recebe a venda, a
 * atribuição, as regras e o contexto, e devolve linhas. Assim pode ser provado em cima de casos de
 * fronteira (zero, arredondamento, venda sem regra, devolução, degrau de rank, afiliado antigo)
 * sem base de dados nenhuma — ver `lib/vendas/calculo.check.ts`.
 *
 * AS REGRAS QUE ESTE FICHEIRO GARANTE
 *
 *  1. ZERO percentagens no código. Não existe aqui nenhum valor por defeito. Sem regra para um
 *     (papel, pack), a pessoa aparece em `semRegra` com o motivo — e não se calcula nada. Uma
 *     percentagem inventada é uma dívida que o dono não sabe que tem.
 *  2. Cêntimos inteiros, um só arredondamento, meio-para-cima. `Math.round(65.4 * 0.15)` e amigos
 *     são exactamente como se perdem cêntimos que depois viram queixas.
 *  3. A regra usada sai identificada (`regra_id` + `pct`), com a percentagem ANTES do degrau de
 *     rank (`pct_base`) e o degrau aplicado. Mudar a percentagem amanhã não reescreve o hoje.
 *  4. O plano é da PESSOA. Quem entrou com 50 % mantém 50 % mesmo que a tabela geral mude — e
 *     isso lê-se do plano dela, nunca de uma data escrita no código.
 *  5. O residual só conta do SEGUNDO pagamento em diante.
 */

// ───────────────────────────── os papéis ─────────────────────────────

/**
 * Os papéis com que alguém participa numa venda. Uma pessoa pode ter vários (o dono foi
 * explícito nisso), e por isso pode aparecer em mais do que uma linha da mesma venda.
 *
 * Isto NÃO é a lista de permissões de ninguém: quem tem que papel vive no backoffice de
 * permissões. Aqui é só o vocabulário do cálculo, e tem de bater certo com o CHECK da migração
 * 127 — se divergirem, a base recusa a escrita com um erro que não explica nada.
 */
export const PAPEIS_VENDAS = ['afiliado', 'setter', 'closer', 'prospector', 'team_leader'] as const
export type PapelVendas = (typeof PAPEIS_VENDAS)[number]

/** O pack curinga: «todos os packs». É uma ESCOLHA do dono no admin, não um defeito do código. */
export const PACK_TODOS = '*'

/** O plano de comissão geral — o que vale para quem não tem plano próprio gravado. */
export const PLANO_PADRAO = 'padrao'

export type AplicaA = 'primeira' | 'renovacao' | 'ambos'

// ───────────────────────────── o que entra ─────────────────────────────

export type RegraComissao = {
  id: string
  /** O plano a que a regra pertence. {@link PLANO_PADRAO} é a tabela geral. */
  plano?: string
  papel: PapelVendas
  /** planId da escada (ex: 'premium_monthly') ou {@link PACK_TODOS}. */
  pack: string
  /** Percentagem sobre o valor da venda, 0–100, até 3 casas decimais. */
  pct: number
  aplica_a: AplicaA
  valido_de: string
  valido_ate: string | null
}

/**
 * Um degrau de rank: a partir de `min_vendas` vendas no mês, este papel vale `pct`.
 *
 * O degrau SOBE A PERCENTAGEM DA PRÓPRIA PESSOA — não acrescenta níveis de descendência a pagar.
 * É a diferença entre um plano que escala com o esforço e um que multiplica o custo sem
 * multiplicar a receita.
 */
export type RegraRank = {
  id: string
  papel: PapelVendas
  min_vendas: number
  pct: number
  valido_de: string
  valido_ate: string | null
}

export type VendaParaCalculo = {
  /** O pack PAGO (planId). Nulo significa que não se sabe o que foi vendido — não se calcula. */
  pack: string | null
  /** Valor bruto recebido, em cêntimos inteiros. */
  valor_cents: number
  tipo: 'primeira' | 'renovacao'
  moeda: string
}

/** Quem fez o quê nesta venda. Um papel ausente (ou nulo) é «não houve» — não se paga por ele. */
export type Atribuicao = Partial<Record<PapelVendas, string | null | undefined>>

export type ContextoCalculo = {
  /**
   * Qual pagamento deste cliente é este: 1 = o primeiro. O residual só conta de 2 para cima.
   *
   * Quando não vem (undefined) NÃO se bloqueia nada: só se sabe contar pagamentos de clientes que
   * passaram por aqui, e recusar residual a toda a base antiga seria cortar rendimento por falta
   * de dados nossos.
   */
  numeroDoPagamento?: number
  /** O plano gravado de cada pessoa (id → plano). Quem não estiver aqui usa {@link PLANO_PADRAO}. */
  planoPorPessoa?: Record<string, string>
  regrasRank?: RegraRank[]
  /** Vendas do mês por pessoa e papel, chave `papel:pessoaId`. Só conta para o 1.º pagamento. */
  vendasNoMes?: Record<string, number>
}

export type LinhaComissao = {
  papel: PapelVendas
  beneficiario_id: string
  /** O plano com que esta linha foi calculada (o da pessoa, ou o geral). */
  plano: string
  regra_id: string
  /** A percentagem efectiva, já com o degrau de rank aplicado. */
  pct: number
  /** A percentagem da regra, ANTES do degrau. Guardada para a conta se poder refazer à mão. */
  pct_base: number
  rank_regra_id: string | null
  rank_min_vendas: number | null
  vendas_no_mes: number | null
  numero_pagamento: number | null
  base_cents: number
  valor_cents: number
  moeda: string
}

/** Um papel atribuído para o qual NÃO há regra. Não é um erro: é uma decisão que falta ao dono. */
export type PapelSemRegra = {
  papel: PapelVendas
  beneficiario_id: string
  motivo: string
}

export type ResultadoCalculo = {
  linhas: LinhaComissao[]
  /** O que ficou por pagar por falta de regra. O admin tem de ver isto, não engolir em silêncio. */
  semRegra: PapelSemRegra[]
  /** Tudo o que alguém precisa de saber ao ler o resultado (valor zero, pct zero, papel duplo). */
  avisos: string[]
}

// ───────────────────────────── aritmética ─────────────────────────────

/**
 * base × pct, em cêntimos inteiros, com arredondamento MEIO-PARA-CIMA.
 *
 * A REGRA, escrita para não voltar a ser discutida: a percentagem tem no máximo 3 casas decimais
 * (é isso que a coluna `numeric(6,3)` guarda), por isso multiplica-se por 1000 e faz-se tudo em
 * inteiros. Nenhuma divisão em vírgula flutuante entra na conta: `Math.round(3499 * 0.15)` dá o
 * valor certo por sorte (3499×0,15 = 524,8499999999999 em float), e no dia em que der para o
 * outro lado é um cêntimo a menos no bolso de alguém que o vai contar.
 *
 * Meio-para-cima e não «banker's rounding» porque é o que uma pessoa espera quando confere a
 * conta à mão, e porque quem recebe deve ser quem beneficia do meio cêntimo.
 */
export function comissaoEmCentimos(base_cents: number, pct: number): number {
  if (!Number.isFinite(base_cents) || !Number.isFinite(pct)) return 0
  if (base_cents <= 0 || pct <= 0) return 0

  const base = Math.round(base_cents)
  const milesimos = Math.round(pct * 1000) // 15,5 % → 15500
  const numerador = base * milesimos // inteiro
  const divisor = 100_000 // 100 (percentagem) × 1000 (milésimos)
  const quociente = Math.floor(numerador / divisor)
  const resto = numerador - quociente * divisor
  return resto * 2 >= divisor ? quociente + 1 : quociente
}

/** Arredonda uma percentagem às 3 casas que a coluna guarda — o resto seria precisão a fingir. */
function pctCom3Casas(pct: number): number {
  return Math.round(pct * 1000) / 1000
}

// ───────────────────────────── resolver a regra ─────────────────────────────

function dentroDaVigencia(regra: { valido_de: string; valido_ate: string | null }, emIso: string): boolean {
  if (regra.valido_de > emIso) return false
  return regra.valido_ate === null || regra.valido_ate > emIso
}

/**
 * A regra que vale para (plano, papel, pack, tipo) NA DATA DA VENDA — não na de hoje.
 *
 * É este `em` que garante o histórico: recalcular uma venda de Agosto usa a regra de Agosto,
 * mesmo que a percentagem tenha mudado em Setembro.
 *
 * Precedência, por ordem de peso: o plano da PESSOA ganha ao plano geral (é isto que preserva os
 * 50 % de quem já era afiliado); o pack exacto ganha ao {@link PACK_TODOS}; `aplica_a` específico
 * ganha a 'ambos'; e entre empates ganha a mais recente a entrar em vigor. Devolve null quando não
 * há nenhuma — e null significa «não se calcula», nunca zero.
 */
export function regraEmVigor(
  regras: RegraComissao[],
  papel: PapelVendas,
  pack: string,
  tipo: 'primeira' | 'renovacao',
  emIso: string,
  plano: string = PLANO_PADRAO,
): RegraComissao | null {
  const candidatas = regras.filter(
    (r) =>
      r.papel === papel &&
      ((r.plano ?? PLANO_PADRAO) === plano || (r.plano ?? PLANO_PADRAO) === PLANO_PADRAO) &&
      (r.pack === pack || r.pack === PACK_TODOS) &&
      (r.aplica_a === tipo || r.aplica_a === 'ambos') &&
      dentroDaVigencia(r, emIso),
  )
  if (candidatas.length === 0) return null

  const peso = (r: RegraComissao) =>
    ((r.plano ?? PLANO_PADRAO) === plano ? 4 : 0) + (r.pack === pack ? 2 : 0) + (r.aplica_a === tipo ? 1 : 0)

  return candidatas.reduce((melhor, r) => {
    const dif = peso(r) - peso(melhor)
    if (dif > 0) return r
    if (dif < 0) return melhor
    return r.valido_de > melhor.valido_de ? r : melhor
  })
}

/**
 * O degrau de rank de um papel com `vendas` vendas no mês, e o factor que ele aplica.
 *
 * O FACTOR, e não a substituição: os 20/25/30 do closer são a escala das SUBSCRIÇÕES. Aplicados em
 * bruto a um desafio MTM Funded (7,5 %), um closer no topo passava a 30 % — quatro vezes mais, e o
 * tecto de 15 % que o dono definiu para o Funded ia pelo ar. Por isso o degrau entra como
 * proporção sobre o degrau BASE (o de menor `min_vendas`): 25/20 = ×1,25, 30/20 = ×1,5. Os números
 * do dono ficam à vista e editáveis; o que o código faz com eles não fura tectos.
 *
 * Só se aplica ao 1.º pagamento — o residual fica igual em todos os degraus.
 */
export function degrauDeRank(
  regrasRank: RegraRank[],
  papel: PapelVendas,
  vendas: number,
  emIso: string,
): { regra: RegraRank; fator: number } | null {
  const doPapel = regrasRank.filter((r) => r.papel === papel && dentroDaVigencia(r, emIso))
  if (doPapel.length === 0) return null

  const base = doPapel.reduce((m, r) => (r.min_vendas < m.min_vendas ? r : m))
  if (!(base.pct > 0)) return null

  const alcancados = doPapel.filter((r) => vendas >= r.min_vendas)
  if (alcancados.length === 0) return null
  const degrau = alcancados.reduce((m, r) => (r.min_vendas > m.min_vendas ? r : m))

  return { regra: degrau, fator: degrau.pct / base.pct }
}

// ───────────────────────────── o cálculo ─────────────────────────────

/**
 * Transforma uma venda confirmada nas linhas de comissão que ela gera.
 *
 * Não escreve nada e não decide nada sobre pagar: devolve o que SE DEVE, para o livro registar e
 * um humano aprovar. O que não consegue calcular sai em `semRegra`, com o motivo, para o admin
 * ver — em vez de desaparecer.
 */
export function calcularComissoes(
  venda: VendaParaCalculo,
  atribuicao: Atribuicao,
  regras: RegraComissao[],
  emIso: string,
  contexto: ContextoCalculo = {},
): ResultadoCalculo {
  const linhas: LinhaComissao[] = []
  const semRegra: PapelSemRegra[] = []
  const avisos: string[] = []

  const atribuidos = PAPEIS_VENDAS.map((papel) => ({ papel, pessoa: atribuicao[papel] || null })).filter(
    (a): a is { papel: PapelVendas; pessoa: string } => !!a.pessoa,
  )

  if (atribuidos.length === 0) {
    avisos.push('Venda sem atribuição: ninguém está marcado como prospector, setter, closer, afiliado ou team leader.')
    return { linhas, semRegra, avisos }
  }

  // Uma pessoa com dois papéis recebe pelos dois. Não é bug — é o caso normal de quem marca e
  // fecha a própria reunião. Mas tem de estar à vista de quem lê o livro.
  const porPessoa = new Map<string, PapelVendas[]>()
  for (const a of atribuidos) porPessoa.set(a.pessoa, [...(porPessoa.get(a.pessoa) ?? []), a.papel])
  for (const [pessoa, papeis] of porPessoa) {
    if (papeis.length > 1) {
      avisos.push(`A mesma pessoa (${pessoa}) acumula os papéis ${papeis.join(' + ')} e recebe por cada um.`)
    }
  }

  // Valor zero: um reembolso total, uma compra 100 % coberta por cupão, um teste. Não há base
  // para comissão nenhuma, e é isso que se diz — em vez de criar linhas de 0 € que só fazem
  // ruído no extracto de quem vende.
  if (venda.valor_cents <= 0) {
    avisos.push('Venda de valor zero: não gera comissões (nada entrou para repartir).')
    return { linhas, semRegra, avisos }
  }

  /**
   * O RESIDUAL SÓ CONTA DO SEGUNDO PAGAMENTO EM DIANTE.
   *
   * A permanência média medida foi de 10,8 meses, mas sai de subscrições quase todas manuais — a
   * data de expiração reflecte o que foi CONCEDIDO, não o que foi PAGO — e 72 % dos perfis estão
   * inactivos. A permanência real paga é provavelmente bem menor. Pagar residual sobre o primeiro
   * pagamento é pagar sobre clientes que nunca chegaram a ser clientes.
   */
  const numeroPagamento = contexto.numeroDoPagamento ?? null
  if (venda.tipo === 'renovacao' && numeroPagamento !== null && numeroPagamento < 2) {
    avisos.push(
      `Residual não pago: este é o pagamento nº ${numeroPagamento} deste cliente, e o residual só conta do segundo em diante.`,
    )
    return { linhas, semRegra, avisos }
  }

  if (!venda.pack) {
    for (const { papel, pessoa } of atribuidos) {
      semRegra.push({
        papel,
        beneficiario_id: pessoa,
        motivo: 'Venda sem pack identificado — não há regra que se possa aplicar.',
      })
    }
    return { linhas, semRegra, avisos }
  }

  for (const { papel, pessoa } of atribuidos) {
    const plano = contexto.planoPorPessoa?.[pessoa] ?? PLANO_PADRAO
    const regra = regraEmVigor(regras, papel, venda.pack, venda.tipo, emIso, plano)
    if (!regra) {
      semRegra.push({
        papel,
        beneficiario_id: pessoa,
        motivo: `Sem regra definida para ${papel} no pack ${venda.pack} (${venda.tipo}, plano ${plano}). O dono tem de definir a percentagem.`,
      })
      continue
    }

    // O degrau de rank só mexe no 1.º pagamento, e só sobe a percentagem de quem vendeu.
    const vendasNoMes = contexto.vendasNoMes?.[`${papel}:${pessoa}`] ?? null
    const degrau =
      venda.tipo === 'primeira' && contexto.regrasRank && vendasNoMes !== null
        ? degrauDeRank(contexto.regrasRank, papel, vendasNoMes, emIso)
        : null

    const pctBase = regra.pct
    const pctEfectiva = degrau ? pctCom3Casas(pctBase * degrau.fator) : pctBase

    const valor = comissaoEmCentimos(venda.valor_cents, pctEfectiva)
    if (valor <= 0) {
      // A regra existe e diz zero: é uma decisão do dono, não uma falta. Não se cria linha, mas
      // também não se põe isto em `semRegra` — não há nada para ele decidir.
      avisos.push(`${papel}: a regra em vigor é ${pctEfectiva} % e não gera valor nesta venda.`)
      continue
    }

    linhas.push({
      papel,
      beneficiario_id: pessoa,
      plano,
      regra_id: regra.id,
      pct: pctEfectiva,
      pct_base: pctBase,
      rank_regra_id: degrau?.regra.id ?? null,
      rank_min_vendas: degrau?.regra.min_vendas ?? null,
      vendas_no_mes: vendasNoMes,
      numero_pagamento: numeroPagamento,
      base_cents: venda.valor_cents,
      valor_cents: valor,
      moeda: venda.moeda,
    })
  }

  return { linhas, semRegra, avisos }
}

/**
 * O total de uma lista de linhas, em cêntimos. Soma de inteiros: o total de um extracto tem de
 * ser exactamente a soma do que lá está escrito, ao cêntimo.
 */
export function totalCentimos(linhas: Array<{ valor_cents: number }>): number {
  return linhas.reduce((t, l) => t + Math.round(l.valor_cents), 0)
}

/** Formata cêntimos à portuguesa, para o admin e para os emails. 6539 → «65,39 €». */
export function centimosEmEuros(cents: number): string {
  const negativo = cents < 0
  const abs = Math.abs(Math.round(cents))
  const texto = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} €`
  return negativo ? `-${texto}` : texto
}
