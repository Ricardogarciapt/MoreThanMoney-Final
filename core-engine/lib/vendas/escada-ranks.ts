/**
 * A ESCADA DE RANKS EM PERCENTAGEM — o cálculo, puro e sem base de dados.
 *
 * A escada antiga prometia valores FIXOS por mês (500 € no Distribuidor … 20 000 € no Embaixador).
 * Com o Premium a 65 €, isso era ~55 % do volume da perna que qualificava o rank, EM CIMA dos 50 %
 * já pagos ao patrocinador directo: o plano prometia mais de 100 % da receita, e não fechava em
 * nenhum degrau (migração 130). Agora o residual é uma percentagem do volume mensal da PERNA MENOR,
 * com DIFERENCIAL.
 *
 * AS TRÊS COISAS QUE ESTE FICHEIRO GARANTE
 *
 *  1. O DIFERENCIAL É O TECTO. Cada upline recebe a SUA percentagem menos a maior já paga abaixo
 *     dele na mesma perna. Por isso o total pago sobre um dado volume nunca passa da percentagem do
 *     degrau mais alto (18 %). Sem o diferencial, a mesma subscrição pagava a TODA a linha acima e
 *     multiplicava-se — que é exactamente como a escada antiga rebentava.
 *  2. QUEM ESTÁ NA ESCADA ANTIGA CONTINUA LÁ. `plano_rank = 'casa_valor_fixo'` recebe o valor fixo
 *     com que entrou (os dois Distribuidores da casa, decisão do dono). O plano é do NÓ, não uma
 *     data no código — mesmo padrão do `afiliado_legado_50`.
 *  3. O BÓNUS ÚNICO PAGA UMA VEZ. Ao alcançar o rank pela primeira vez, e nunca mais — nem se a
 *     pessoa descer e voltar a subir. Um bónus «único» que paga duas vezes é um bónus mensal
 *     disfarçado.
 *
 * É puro de propósito: um cálculo que decide quanto se paga a uma rede inteira tem de poder ser
 * provado sobre árvores inventadas, sem base de dados. Ver `lib/vendas/escada-ranks.check.ts`.
 */
import { comissaoEmCentimos } from './calculo'

export const PLANO_CASA_VALOR_FIXO = 'casa_valor_fixo'
export const PLANO_ESCADA_PCT = 'escada_pct_2026_09'

export type NoDaArvore = {
  id: string
  user_id: string
  left_child_id: string | null
  right_child_id: string | null
  rank_id: number
  /** {@link PLANO_CASA_VALOR_FIXO} ou {@link PLANO_ESCADA_PCT}. */
  plano_rank: string
}

export type RankDaEscada = {
  id: number
  slug: string
  sort_order: number
  /** A escada nova: percentagem do volume da perna menor. */
  residual_pct: number
  /** Pago UMA vez, ao alcançar o rank. */
  bonus_unico: number
  /** A escada antiga, em euros por mês. Só paga a quem está no plano da casa. */
  monthly_residual: number
}

export type LinhaDeRank = {
  user_id: string
  no_id: string
  tipo: 'rank_residual' | 'rank_bonus'
  rank_id: number
  rank_slug: string
  plano: string
  valor_cents: number
  /** O volume sobre que se calculou (perna menor). Zero no valor fixo e no bónus. */
  base_cents: number
  /** A percentagem do degrau, antes do diferencial. */
  pct: number
  /** A percentagem efectivamente aplicada, já com o diferencial descontado. */
  pct_efectiva: number
  perna: 'left' | 'right' | null
  /** A conta em palavras, para o livro a poder explicar um ano depois. */
  explicacao: string
}

export type ParametrosEscada = {
  nos: NoDaArvore[]
  ranks: RankDaEscada[]
  /** Volume PRÓPRIO de cada nó no mês, em cêntimos (as vendas dele, não as da perna). */
  volumePorNo: Record<string, number>
  /** Que ranks já pagaram bónus a cada pessoa (user_id → rank_ids). */
  bonusJaPago?: Record<string, number[]>
}

export type ResultadoEscada = {
  linhas: LinhaDeRank[]
  avisos: string[]
  /** Volume total do mês e total a pagar — para se ver, de relance, se a conta é sustentável. */
  volumeTotalCents: number
  totalCents: number
}

/** Cêntimos a partir de um valor em euros guardado como NUMERIC (a escada antiga). */
function eurosParaCentimos(euros: number): number {
  return Math.round((Number(euros) || 0) * 100)
}

/**
 * Calcula os residuais e bónus de rank de um mês.
 *
 * Recebe a árvore inteira e o volume próprio de cada nó; devolve linhas a criar. Não escreve nada e
 * não paga nada — o que sai daqui entra no livro como 'pending' e espera por um humano.
 */
export function calcularEscadaDeRanks(params: ParametrosEscada): ResultadoEscada {
  const linhas: LinhaDeRank[] = []
  const avisos: string[] = []

  const porId = new Map(params.nos.map((n) => [n.id, n]))
  const rankPorId = new Map(params.ranks.map((r) => [r.id, r]))
  const volume = (id: string | null) => (id ? Math.max(0, Math.round(params.volumePorNo[id] ?? 0)) : 0)

  // Volume acumulado de uma sub-árvore, com memória. Ciclos partiriam a recursão: a árvore é
  // construída por código nosso, mas uma linha corrompida não pode pendurar o fecho do mês.
  const memoria = new Map<string, number>()
  const emCurso = new Set<string>()
  function volumeDaSubArvore(id: string | null): number {
    if (!id) return 0
    const guardado = memoria.get(id)
    if (guardado !== undefined) return guardado
    if (emCurso.has(id)) {
      avisos.push(`Ciclo na árvore em ${id} — sub-árvore ignorada.`)
      return 0
    }
    const no = porId.get(id)
    if (!no) return 0
    emCurso.add(id)
    const total = volume(id) + volumeDaSubArvore(no.left_child_id) + volumeDaSubArvore(no.right_child_id)
    emCurso.delete(id)
    memoria.set(id, total)
    return total
  }

  /** A maior percentagem de rank já paga ABAIXO deste nó, dentro desta perna. É o diferencial. */
  function maiorPctAbaixo(id: string | null): number {
    if (!id) return 0
    const no = porId.get(id)
    if (!no) return 0
    const rank = rankPorId.get(no.rank_id)
    // Um nó da casa não entra no diferencial: não é pago por percentagem, por isso não há
    // percentagem dele para descontar a quem está acima.
    const pctDoNo = no.plano_rank === PLANO_CASA_VALOR_FIXO ? 0 : Number(rank?.residual_pct) || 0
    return Math.max(pctDoNo, maiorPctAbaixo(no.left_child_id), maiorPctAbaixo(no.right_child_id))
  }

  let volumeTotalCents = 0
  for (const no of params.nos) volumeTotalCents += volume(no.id)

  for (const no of params.nos) {
    const rank = rankPorId.get(no.rank_id)
    if (!rank) continue

    const esquerda = volumeDaSubArvore(no.left_child_id)
    const direita = volumeDaSubArvore(no.right_child_id)
    const pernaMenorCents = Math.min(esquerda, direita)
    const perna: 'left' | 'right' | null =
      esquerda === direita ? (esquerda === 0 ? null : 'left') : esquerda < direita ? 'left' : 'right'

    // ── O BÓNUS ÚNICO: ao alcançar o rank, uma vez só. ──
    const bonus = Number(rank.bonus_unico) || 0
    const jaPagos = params.bonusJaPago?.[no.user_id] ?? []
    if (bonus > 0 && !jaPagos.includes(rank.id)) {
      linhas.push({
        user_id: no.user_id,
        no_id: no.id,
        tipo: 'rank_bonus',
        rank_id: rank.id,
        rank_slug: rank.slug,
        plano: no.plano_rank,
        valor_cents: eurosParaCentimos(bonus),
        base_cents: 0,
        pct: 0,
        pct_efectiva: 0,
        perna: null,
        explicacao: `Bónus único por alcançar ${rank.slug} (paga uma vez, nunca mais).`,
      })
    }

    // ── O RESIDUAL ──
    if (no.plano_rank === PLANO_CASA_VALOR_FIXO) {
      // A escada antiga, tal e qual: valor fixo, independente do volume. Foi o que lhes foi
      // prometido, e cortar rendimento a quem já cá está não se desfaz.
      const fixo = eurosParaCentimos(rank.monthly_residual)
      if (fixo > 0) {
        linhas.push({
          user_id: no.user_id,
          no_id: no.id,
          tipo: 'rank_residual',
          rank_id: rank.id,
          rank_slug: rank.slug,
          plano: no.plano_rank,
          valor_cents: fixo,
          base_cents: pernaMenorCents,
          pct: 0,
          pct_efectiva: 0,
          perna,
          explicacao: `Valor fixo da escada antiga (${rank.slug}), por decisão do dono: nó da casa.`,
        })
      }
      continue
    }

    const pct = Number(rank.residual_pct) || 0
    if (pct <= 0) continue
    if (pernaMenorCents <= 0) continue

    const pctAbaixo = Math.max(
      maiorPctAbaixo(perna === 'right' ? no.right_child_id : no.left_child_id),
      // Quando as pernas empatam em volume, o diferencial tem de olhar para as duas: pagar pela
      // perna com menos gente ranqueada seria escolher o lado que paga mais.
      esquerda === direita ? maiorPctAbaixo(perna === 'right' ? no.left_child_id : no.right_child_id) : 0,
    )
    const pctEfectiva = Math.max(0, Math.round((pct - pctAbaixo) * 1000) / 1000)
    if (pctEfectiva <= 0) {
      avisos.push(
        `${no.user_id}: ${rank.slug} (${pct} %) não recebe residual — já há ${pctAbaixo} % pagos abaixo dele nesta perna.`,
      )
      continue
    }

    const valor = comissaoEmCentimos(pernaMenorCents, pctEfectiva)
    if (valor <= 0) continue

    linhas.push({
      user_id: no.user_id,
      no_id: no.id,
      tipo: 'rank_residual',
      rank_id: rank.id,
      rank_slug: rank.slug,
      plano: no.plano_rank,
      valor_cents: valor,
      base_cents: pernaMenorCents,
      pct,
      pct_efectiva: pctEfectiva,
      perna,
      explicacao:
        `${rank.slug}: ${pctEfectiva} % (= ${pct} % do degrau − ${pctAbaixo} % já pagos abaixo) ` +
        `sobre o volume da perna menor (${pernaMenorCents} cêntimos).`,
    })
  }

  return {
    linhas,
    avisos,
    volumeTotalCents,
    totalCents: linhas.reduce((t, l) => t + l.valor_cents, 0),
  }
}
