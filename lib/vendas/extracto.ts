/**
 * O EXTRACTO ÚNICO de uma pessoa: o que ganhou, de onde veio, e o que já foi pago.
 *
 * O pedido do dono foi explícito: «uma pessoa pode ganhar pelos dois, mas tem de ver UM só
 * extracto». Por isso isto lê a vista `vendas_extracto` (migração 127), que junta as comissões por
 * PAPEL e o residual do MLM BINÁRIO na mesma lista, com a origem de cada linha à vista. Dois
 * extractos separados obrigavam a pessoa a somar de cabeça — e a quem não bate o total só sobra
 * desconfiar.
 *
 * O SALDO é o que interessa e é a parte fácil de fazer mal:
 *   · o que está por pagar SOMA;
 *   · o que já foi pago e depois foi DEVOLVIDO pelo cliente DESCONTA;
 *   · o que foi cancelado não conta para nada.
 * Um extracto que só soma acaba a mandar pagar sobre dinheiro que voltou para o cliente.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { centimosEmEuros } from './calculo'

export type LinhaExtracto = {
  id: string
  origem: 'papel' | 'mlm'
  /**
   * De QUEM é esta linha. Opcional porque quem lê o extracto de uma pessoa só já sabe de quem é;
   * quem lê o de várias (um responsável de equipa, o dono) precisa da coluna para não somar o
   * dinheiro de duas pessoas na mesma conta.
   */
  pessoa_id?: string
  /**
   * −1 quando a comissão foi paga e DEPOIS devolvida pelo cliente, +1 no resto (ver a vista, na
   * migração 128). Quem soma deduz o mesmo de `paga_em` + `estornada_em`; quem MOSTRA usa isto,
   * porque uma devolução tem de aparecer a negativo na lista e não só no total.
   */
  sinal?: number
  detalhe: string
  valor_cents: number
  moeda: string
  estado: string
  em: string
  paga_em: string | null
  estornada_em: string | null
  pack: string | null
  referencia: string | null
}

/** As colunas que se pedem à vista. Numa constante para as duas leituras não divergirem. */
const COLUNAS =
  'id, origem, detalhe, pessoa_id, valor_cents, moeda, estado, em, paga_em, estornada_em, sinal, pack, referencia'

export type Extracto = {
  pessoaId: string
  linhas: LinhaExtracto[]
  totais: {
    /** Tudo o que foi atribuído a esta pessoa, estornos à parte. */
    ganho_cents: number
    pago_cents: number
    por_pagar_cents: number
    /** Pago e depois devolvido pelo cliente: desconta no próximo pagamento. */
    a_descontar_cents: number
    cancelado_cents: number
    /** O que se lhe deve HOJE: por pagar menos o que há a descontar. */
    saldo_cents: number
  }
  totaisLegiveis: Record<string, string>
  /** O mesmo, separado por origem — para ela ver quanto vem da equipa e quanto vem da árvore. */
  porOrigem: Record<'papel' | 'mlm', { ganho_cents: number; pago_cents: number; por_pagar_cents: number }>
}

/** O MLM usa estados em inglês desde 2024; o livro da equipa usa português. Um vocabulário só. */
function normalizarEstado(estado: string): 'pendente' | 'aprovada' | 'paga' | 'cancelada' | 'estornada' | 'outro' {
  switch (estado) {
    case 'pending':
    case 'pendente':
      return 'pendente'
    case 'approved':
    case 'aprovada':
      return 'aprovada'
    case 'paid':
    case 'paga':
      return 'paga'
    case 'cancelled':
    case 'cancelada':
      return 'cancelada'
    case 'estornada':
      return 'estornada'
    default:
      return 'outro'
  }
}

/**
 * A CONTA do extracto, isolada do acesso à base para poder ser provada sozinha
 * (`lib/vendas/extracto.check.ts`). É aqui que se decide quanto se deve a uma pessoa hoje, e é a
 * parte fácil de fazer mal: um extracto que só soma acaba a mandar pagar sobre uma devolução.
 */
export function somarExtracto(linhas: LinhaExtracto[]): Pick<Extracto, 'totais' | 'porOrigem'> {
  const totais = {
    ganho_cents: 0,
    pago_cents: 0,
    por_pagar_cents: 0,
    a_descontar_cents: 0,
    cancelado_cents: 0,
    saldo_cents: 0,
  }
  const porOrigem: Extracto['porOrigem'] = {
    papel: { ganho_cents: 0, pago_cents: 0, por_pagar_cents: 0 },
    mlm: { ganho_cents: 0, pago_cents: 0, por_pagar_cents: 0 },
  }

  for (const linha of linhas) {
    const valor = Math.round(Number(linha.valor_cents) || 0)
    const estado = normalizarEstado(String(linha.estado))
    const origem = linha.origem === 'mlm' ? 'mlm' : 'papel'
    const paga = !!linha.paga_em || estado === 'paga'
    const estornada = !!linha.estornada_em

    // Estornada ANTES de ser paga: nunca saiu dinheiro, não entra em nada — nem como ganho.
    if (estado === 'cancelada' || (estornada && !paga)) {
      totais.cancelado_cents += valor
      continue
    }

    totais.ganho_cents += valor
    porOrigem[origem].ganho_cents += valor

    if (paga) {
      totais.pago_cents += valor
      porOrigem[origem].pago_cents += valor
      // Paga E devolvida pelo cliente: fica como dívida a descontar no próximo pagamento.
      if (estornada) totais.a_descontar_cents += valor
    } else {
      totais.por_pagar_cents += valor
      porOrigem[origem].por_pagar_cents += valor
    }
  }

  totais.saldo_cents = totais.por_pagar_cents - totais.a_descontar_cents
  return { totais, porOrigem }
}

export async function extractoDaPessoa(
  supabase: SupabaseClient,
  pessoaId: string,
  opcoes: { desde?: string | null } = {},
): Promise<Extracto> {
  let query = supabase
    .from('vendas_extracto')
    .select(COLUNAS)
    .eq('pessoa_id', pessoaId)
    .order('em', { ascending: false })
    .limit(2000)
  if (opcoes.desde) query = query.gte('em', opcoes.desde)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler o extracto: ${error.message}`)

  const linhas = (data ?? []) as unknown as LinhaExtracto[]
  const { totais, porOrigem } = somarExtracto(linhas)

  return {
    pessoaId,
    linhas,
    totais,
    totaisLegiveis: Object.fromEntries(Object.entries(totais).map(([k, v]) => [k, centimosEmEuros(v)])),
    porOrigem,
  }
}


/**
 * O extracto de UM CONJUNTO de pessoas — o que a página do backoffice precisa.
 *
 * PORQUE É QUE ISTO RECEBE UMA LISTA E NÃO UM BOOLEANO «vê a equipa»
 * A lista vem de `ambitoDeLeitura` (`lib/backoffice-papeis.ts`) e é ela que entra no `.in(...)`.
 * Uma consulta que filtra por uma lista não tem como esquecer-se do filtro; um `if (é responsável)
 * lê tudo` antes da consulta esquece-se — e o que se esquece aqui é o dinheiro dos colegas.
 *
 * `todos` só é verdade para o dono (`bo.extracto_todos`). Nesse caso não há filtro nenhum, e é a
 * única maneira de não haver: não existe caminho em que uma lista vazia signifique «tudo».
 */
export async function extractoDoAmbito(
  supabase: SupabaseClient,
  ambito: { ids: string[]; todos: boolean },
  opcoes: { desde?: string | null } = {},
): Promise<LinhaExtracto[]> {
  // Sem âmbito nenhum não se lê nada. Isto é a diferença entre uma falha que fecha e uma que abre:
  // um `.in('pessoa_id', [])` devolveria vazio, mas confiar nisso deixava o caso ao PostgREST.
  if (!ambito.todos && ambito.ids.length === 0) return []

  let query = supabase.from('vendas_extracto').select(COLUNAS).order('em', { ascending: false }).limit(2000)
  if (!ambito.todos) query = query.in('pessoa_id', ambito.ids)
  if (opcoes.desde) query = query.gte('em', opcoes.desde)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler o extracto: ${error.message}`)
  return (data ?? []) as unknown as LinhaExtracto[]
}
