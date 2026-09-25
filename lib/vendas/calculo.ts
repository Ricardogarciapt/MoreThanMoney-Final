/**
 * O CÁLCULO de uma comissão de equipa. Funções puras, sem base de dados — de propósito.
 *
 * Isto é a única coisa no sistema que transforma uma venda em dinheiro a pagar a pessoas. Por
 * isso não fala com o Supabase, não lê a hora, não tem números lá dentro: recebe a venda, a
 * atribuição e as regras em vigor, e devolve linhas. Assim pode ser testado em cima de casos de
 * fronteira (zero, arredondamento, venda sem regra, devolução) sem base de dados nenhuma — ver
 * `lib/vendas/calculo.check.ts`.
 *
 * AS TRÊS REGRAS QUE ESTE FICHEIRO GARANTE
 *
 *  1. ZERO percentagens no código. Não existe aqui nenhum valor por defeito. Sem regra para um
 *     (papel, pack), a pessoa aparece em `semRegra` com o motivo — e não se calcula nada. Uma
 *     percentagem inventada é uma dívida que o dono não sabe que tem.
 *  2. Cêntimos inteiros, um só arredondamento. Nada de euros em float: `Math.round(65.4 * 0.15)`
 *     e amigos são exactamente como se perdem cêntimos que depois viram queixas.
 *  3. A regra usada sai identificada (`regra_id` + `pct`). O livro de comissões guarda-a, e por
 *     isso mudar a percentagem amanhã não reescreve o que foi calculado hoje.
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

export type AplicaA = 'primeira' | 'renovacao' | 'ambos'

// ───────────────────────────── o que entra ─────────────────────────────

export type RegraComissao = {
  id: string
  papel: PapelVendas
  /** planId da escada (ex: 'premium_monthly') ou {@link PACK_TODOS}. */
  pack: string
  /** Percentagem sobre o valor da venda, 0–100, até 3 casas decimais. */
  pct: number
  aplica_a: AplicaA
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

export type LinhaComissao = {
  papel: PapelVendas
  beneficiario_id: string
  regra_id: string
  pct: number
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
 * inteiros. Nenhuma divisão em vírgula flutuante entra na conta: `Math.round(6500 * 0.155)` dá
 * 1008 em vez de 1007,5→1008 por sorte, e no dia em que der para o outro lado é um cêntimo a
 * menos no bolso de alguém que o vai contar.
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

// ───────────────────────────── resolver a regra ─────────────────────────────

function dentroDaVigencia(regra: RegraComissao, emIso: string): boolean {
  if (regra.valido_de > emIso) return false
  return regra.valido_ate === null || regra.valido_ate > emIso
}

/**
 * A regra que vale para (papel, pack, tipo) NA DATA DA VENDA — não na de hoje.
 *
 * É este `em` que garante o histórico: recalcular uma venda de Agosto usa a regra de Agosto,
 * mesmo que a percentagem tenha mudado em Setembro.
 *
 * Precedência, por ordem: o pack exacto ganha ao {@link PACK_TODOS}; `aplica_a` específico
 * ('primeira'/'renovacao') ganha a 'ambos'; e entre empates ganha a mais recente a entrar em
 * vigor. Devolve null quando não há nenhuma — e null significa «não se calcula», nunca zero.
 */
export function regraEmVigor(
  regras: RegraComissao[],
  papel: PapelVendas,
  pack: string,
  tipo: 'primeira' | 'renovacao',
  emIso: string,
): RegraComissao | null {
  const candidatas = regras.filter(
    (r) =>
      r.papel === papel &&
      (r.pack === pack || r.pack === PACK_TODOS) &&
      (r.aplica_a === tipo || r.aplica_a === 'ambos') &&
      dentroDaVigencia(r, emIso),
  )
  if (candidatas.length === 0) return null

  const peso = (r: RegraComissao) => (r.pack === pack ? 2 : 0) + (r.aplica_a === tipo ? 1 : 0)
  return candidatas.reduce((melhor, r) => {
    const dif = peso(r) - peso(melhor)
    if (dif > 0) return r
    if (dif < 0) return melhor
    return r.valido_de > melhor.valido_de ? r : melhor
  })
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
): ResultadoCalculo {
  const linhas: LinhaComissao[] = []
  const semRegra: PapelSemRegra[] = []
  const avisos: string[] = []

  const atribuidos = PAPEIS_VENDAS.map((papel) => ({ papel, pessoa: atribuicao[papel] || null })).filter(
    (a): a is { papel: PapelVendas; pessoa: string } => !!a.pessoa,
  )

  if (atribuidos.length === 0) {
    avisos.push('Venda sem atribuição: ninguém está marcado como prospector, setter, closer ou team leader.')
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

  if (!venda.pack) {
    for (const { papel, pessoa } of atribuidos) {
      semRegra.push({ papel, beneficiario_id: pessoa, motivo: 'Venda sem pack identificado — não há regra que se possa aplicar.' })
    }
    return { linhas, semRegra, avisos }
  }

  for (const { papel, pessoa } of atribuidos) {
    const regra = regraEmVigor(regras, papel, venda.pack, venda.tipo, emIso)
    if (!regra) {
      semRegra.push({
        papel,
        beneficiario_id: pessoa,
        motivo: `Sem regra definida para ${papel} no pack ${venda.pack} (${venda.tipo}). O dono tem de definir a percentagem.`,
      })
      continue
    }

    const valor = comissaoEmCentimos(venda.valor_cents, regra.pct)
    if (valor <= 0) {
      // A regra existe e diz zero: é uma decisão do dono, não uma falta. Não se cria linha, mas
      // também não se põe isto em `semRegra` — não há nada para ele decidir.
      avisos.push(`${papel}: a regra em vigor é ${regra.pct} % e não gera valor nesta venda.`)
      continue
    }

    linhas.push({
      papel,
      beneficiario_id: pessoa,
      regra_id: regra.id,
      pct: regra.pct,
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
