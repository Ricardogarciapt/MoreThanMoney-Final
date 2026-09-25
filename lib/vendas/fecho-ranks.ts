/**
 * O FECHO MENSAL DA ESCADA DE RANKS: ler a árvore, medir o volume das pernas, propor os residuais.
 *
 * PORQUE É UM FECHO E NÃO UM EVENTO. A escada antiga era um valor fixo por mês, e por isso podia
 * ser paga à primeira renovação que aparecesse (era o que `processRankMonthlyResiduals` fazia, com
 * uma deduplicação por mês). A escada nova é uma PERCENTAGEM DO VOLUME DA PERNA MENOR: esse número
 * só existe quando o mês está medido. Pagar a percentagem à primeira renovação do mês seria pagar
 * sobre um volume que ainda não aconteceu.
 *
 * DUAS COISAS QUE ESTE FECHO NÃO FAZ
 *  · não paga: cria comissões 'pending' que um humano aprova em /admin (nada neste sistema paga
 *    sozinho);
 *  · não conta o volume que a EQUIPA já pagou. As vendas com papéis atribuídos são pagas pela
 *    tabela de papéis, e entram aqui a zero — é a mesma regra do «mesmo euro não paga duas vezes»
 *    (`lib/vendas/exclusividade.ts`), aplicada ao volume em vez de à comissão.
 *
 * É IDEMPOTENTE: uma pessoa não recebe dois residuais do mesmo mês, nem dois bónus do mesmo rank.
 * Correr o fecho outra vez a seguir a um erro é seguro — e é isso que o torna utilizável.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { centimosEmEuros } from './calculo'
import {
  calcularEscadaDeRanks,
  type LinhaDeRank,
  type NoDaArvore,
  type RankDaEscada,
} from './escada-ranks'

/** Marca do bónus na tabela do MLM, para se saber que rank já pagou a quem. */
const MARCA_BONUS = (slug: string) => `rank:${slug}`

export type FechoDeRanks = {
  mes: string
  inicio: string
  fim: string
  linhas: LinhaDeRank[]
  /** As que já existiam (mês repetido, bónus já pago) e foram deixadas em paz. */
  repetidas: number
  criadas: number
  totalCents: number
  volumeTotalCents: number
  /** Percentagem do volume do mês que o fecho propõe pagar em residuais de rank. */
  pctDoVolume: number | null
  avisos: string[]
  /** true = só proposta, nada escrito. O defeito, de propósito. */
  simulacao: boolean
}

/** Fronteiras do mês pedido (ou do actual), com o mês a ser lido à portuguesa. */
function limitesDoMes(mes?: string | null): { mes: string; inicio: string; fim: string } {
  const referencia = mes && /^\d{4}-\d{2}$/.test(mes)
    ? mes
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()).slice(0, 7)
  const [ano, m] = referencia.split('-').map(Number)
  return {
    mes: referencia,
    inicio: new Date(Date.UTC(ano, m - 1, 1)).toISOString(),
    fim: new Date(Date.UTC(m === 12 ? ano + 1 : ano, m === 12 ? 0 : m, 1)).toISOString(),
  }
}

/**
 * Corre o fecho de um mês.
 *
 * `simulacao: true` (o defeito) não escreve nada — devolve o que PAGARIA. O dono tem de poder ver a
 * conta antes de a assumir, e um fecho que escreve à primeira leitura não se consegue revisitar.
 */
export async function fecharEscadaDeRanks(
  supabase: SupabaseClient,
  opcoes: { mes?: string | null; simulacao?: boolean } = {},
): Promise<FechoDeRanks> {
  const simulacao = opcoes.simulacao !== false
  const { mes, inicio, fim } = limitesDoMes(opcoes.mes)
  const avisos: string[] = []

  // ── a árvore ──
  const { data: nosBrutos, error: erroNos } = await supabase
    .from('mlm_nodes')
    .select('id, user_id, left_child_id, right_child_id, rank_id, plano_rank')
  if (erroNos) {
    // A coluna `plano_rank` nasce na migração 130. Sem ela não se sabe quem está na escada antiga,
    // e pagar por percentagem a quem foi prometido valor fixo seria cortar-lhe o rendimento.
    throw new Error(
      `Não foi possível ler a árvore (${erroNos.message}). A migração 130 (escada em percentagem) já foi aplicada?`,
    )
  }

  const { data: ranksBrutos, error: erroRanks } = await supabase
    .from('mlm_ranks')
    .select('id, slug, sort_order, residual_pct, bonus_unico, monthly_residual')
  if (erroRanks) {
    throw new Error(
      `Não foi possível ler os ranks (${erroRanks.message}). A migração 130 (residual_pct/bonus_unico) já foi aplicada?`,
    )
  }

  const nos: NoDaArvore[] = (nosBrutos ?? []).map((n) => {
    const linha = n as unknown as Record<string, unknown>
    return {
      id: String(linha.id),
      user_id: String(linha.user_id),
      left_child_id: linha.left_child_id ? String(linha.left_child_id) : null,
      right_child_id: linha.right_child_id ? String(linha.right_child_id) : null,
      rank_id: Number(linha.rank_id) || 0,
      plano_rank: String(linha.plano_rank ?? ''),
    }
  })

  const ranks: RankDaEscada[] = (ranksBrutos ?? []).map((r) => {
    const linha = r as unknown as Record<string, unknown>
    return {
      id: Number(linha.id),
      slug: String(linha.slug),
      sort_order: Number(linha.sort_order) || 0,
      residual_pct: Number(linha.residual_pct) || 0,
      bonus_unico: Number(linha.bonus_unico) || 0,
      monthly_residual: Number(linha.monthly_residual) || 0,
    }
  })

  // ── o volume do mês, por nó ──
  //
  // Vem de `vendas_vendas` porque é a única fonte que sabe de DEVOLUÇÕES: `payment_history` soma
  // pagamentos e nunca soube que algum voltou para trás, e um volume que conta dinheiro devolvido
  // faz subir ranks e pagar residuais sobre vendas que já não existem. O preço disto é que o volume
  // só começa onde este sistema começou — que é conservador, e é o lado certo para errar.
  const { data: vendas } = await supabase
    .from('vendas_vendas')
    .select('comprador_id, negocio_id, valor_cents')
    .gte('pago_em', inicio)
    .lt('pago_em', fim)
    .is('estornada_em', null)
    .limit(10_000)

  const negociosComEquipa = new Set<string>()
  const idsDeNegocio = [...new Set((vendas ?? []).map((v) => v.negocio_id).filter((x): x is string => !!x))]
  if (idsDeNegocio.length) {
    const { data: negocios } = await supabase
      .from('vendas_negocios')
      .select('id, prospector_id, setter_id, closer_id, team_leader_id, afiliado_id')
      .in('id', idsDeNegocio)
    for (const n of negocios ?? []) {
      const linha = n as unknown as Record<string, unknown>
      const temEquipa = ['prospector_id', 'setter_id', 'closer_id', 'team_leader_id', 'afiliado_id'].some(
        (c) => typeof linha[c] === 'string' && linha[c],
      )
      if (temEquipa) negociosComEquipa.add(String(linha.id))
    }
  }

  const noDoUtilizador = new Map(nos.map((n) => [n.user_id, n.id]))
  const volumePorNo: Record<string, number> = {}
  let volumeDaEquipa = 0
  for (const v of vendas ?? []) {
    const valor = Number(v.valor_cents) || 0
    if (v.negocio_id && negociosComEquipa.has(String(v.negocio_id))) {
      volumeDaEquipa += valor
      continue
    }
    const noId = v.comprador_id ? noDoUtilizador.get(String(v.comprador_id)) : undefined
    if (!noId) continue
    volumePorNo[noId] = (volumePorNo[noId] ?? 0) + valor
  }
  if (volumeDaEquipa > 0) {
    avisos.push(
      `${centimosEmEuros(volumeDaEquipa)} de volume ficou de fora: são vendas com equipa atribuída, pagas pela tabela de papéis (o mesmo euro não paga duas vezes).`,
    )
  }

  // ── que bónus já foram pagos ──
  const { data: bonusAntigos } = await supabase
    .from('mlm_commissions')
    .select('beneficiary_id, source_plan')
    .eq('type', 'rank_bonus')
  const rankPorMarca = new Map(ranks.map((r) => [MARCA_BONUS(r.slug), r.id]))
  const bonusJaPago: Record<string, number[]> = {}
  for (const b of bonusAntigos ?? []) {
    const rankId = rankPorMarca.get(String(b.source_plan ?? ''))
    const pessoa = String(b.beneficiary_id)
    // Um bónus antigo sem marca de rank continua a contar como «já recebeu bónus»: na dúvida não se
    // paga outra vez um bónus que devia ser único.
    const lista = bonusJaPago[pessoa] ?? []
    if (rankId !== undefined) lista.push(rankId)
    else lista.push(...ranks.map((r) => r.id))
    bonusJaPago[pessoa] = lista
  }

  const resultado = calcularEscadaDeRanks({ nos, ranks, volumePorNo, bonusJaPago })
  avisos.push(...resultado.avisos)

  // ── deduplicação: um residual por pessoa por mês ──
  const { data: residuaisDoMes } = await supabase
    .from('mlm_commissions')
    .select('beneficiary_id')
    .eq('type', 'rank_residual')
    .gte('created_at', inicio)
    .lt('created_at', fim)
  const jaTemResidual = new Set((residuaisDoMes ?? []).map((c) => String(c.beneficiary_id)))

  const porCriar: LinhaDeRank[] = []
  let repetidas = 0
  for (const linha of resultado.linhas) {
    if (linha.tipo === 'rank_residual' && jaTemResidual.has(linha.user_id)) {
      repetidas += 1
      continue
    }
    porCriar.push(linha)
  }

  const totalCents = porCriar.reduce((t, l) => t + l.valor_cents, 0)
  const fecho: FechoDeRanks = {
    mes,
    inicio,
    fim,
    linhas: porCriar,
    repetidas,
    criadas: 0,
    totalCents,
    volumeTotalCents: resultado.volumeTotalCents,
    pctDoVolume:
      resultado.volumeTotalCents > 0 ? Math.round((totalCents / resultado.volumeTotalCents) * 1000) / 10 : null,
    avisos,
    simulacao,
  }

  if (simulacao) return fecho

  for (const linha of porCriar) {
    // `amount` no MLM é NUMERIC em EUROS (a tabela é de 2024). Converte-se aqui, num sítio só, a
    // partir dos cêntimos com que a conta foi feita.
    const { error } = await supabase.from('mlm_commissions').insert({
      beneficiary_id: linha.user_id,
      type: linha.tipo,
      amount: linha.valor_cents / 100,
      currency: 'EUR',
      source_plan: linha.tipo === 'rank_bonus' ? MARCA_BONUS(linha.rank_slug) : linha.rank_slug,
      source_amount_cents: linha.base_cents || null,
      status: 'pending',
      payout_status: 'pending',
      notes: `[${mes}] ${linha.explicacao}`,
    })
    if (error) {
      avisos.push(`${linha.user_id}: não foi possível gravar (${error.message})`)
      continue
    }
    fecho.criadas += 1

    const { data: no } = await supabase
      .from('mlm_nodes')
      .select('pending_commissions')
      .eq('user_id', linha.user_id)
      .maybeSingle()
    if (no) {
      await supabase
        .from('mlm_nodes')
        .update({
          pending_commissions: (Number(no.pending_commissions) || 0) + linha.valor_cents / 100,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', linha.user_id)
    }
  }

  return fecho
}
