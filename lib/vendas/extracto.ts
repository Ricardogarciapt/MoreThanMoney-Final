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

export async function extractoDaPessoa(
  supabase: SupabaseClient,
  pessoaId: string,
  opcoes: { desde?: string | null } = {},
): Promise<Extracto> {
  let query = supabase
    .from('vendas_extracto')
    .select('id, origem, detalhe, valor_cents, moeda, estado, em, paga_em, estornada_em, pack, referencia')
    .eq('pessoa_id', pessoaId)
    .order('em', { ascending: false })
    .limit(2000)
  if (opcoes.desde) query = query.gte('em', opcoes.desde)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler o extracto: ${error.message}`)

  const linhas = (data ?? []) as unknown as LinhaExtracto[]

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
    const valor = Number(linha.valor_cents) || 0
    const estado = normalizarEstado(String(linha.estado))
    const origem = linha.origem === 'mlm' ? 'mlm' : 'papel'
    const paga = !!linha.paga_em || estado === 'paga'
    const estornada = !!linha.estornada_em

    if (estado === 'cancelada' || (estornada && !paga)) {
      totais.cancelado_cents += valor
      continue
    }

    totais.ganho_cents += valor
    porOrigem[origem].ganho_cents += valor

    if (paga) {
      totais.pago_cents += valor
      porOrigem[origem].pago_cents += valor
      if (estornada) totais.a_descontar_cents += valor
    } else {
      totais.por_pagar_cents += valor
      porOrigem[origem].por_pagar_cents += valor
    }
  }

  totais.saldo_cents = totais.por_pagar_cents - totais.a_descontar_cents

  return {
    pessoaId,
    linhas,
    totais,
    totaisLegiveis: Object.fromEntries(Object.entries(totais).map(([k, v]) => [k, centimosEmEuros(v)])),
    porOrigem,
  }
}
