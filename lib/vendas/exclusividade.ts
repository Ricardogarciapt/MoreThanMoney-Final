/**
 * A REGRA QUE IMPEDE O PLANO DE SANGRAR: o mesmo euro não paga duas vezes.
 *
 * Numa venda com papéis atribuídos (prospector, setter, closer, afiliado, team leader), paga a
 * TABELA DE PAPÉIS e **não** o MLM binário. O binário continua a pagar nas vendas SEM equipa
 * atribuída — é o que ele sempre foi: membros a trazer membros.
 *
 * PORQUE É QUE ISTO TEM DE VIVER NUM SÍTIO SÓ
 * O primeiro pagamento de uma subscrição já reparte 35 % pela equipa (5 prospector + 10 setter +
 * 20 closer) e o residual reparte 10 % por mês. O MLM, em paralelo, paga `direct_commission_pct`
 * — que hoje está a 50 % — ao patrocinador, sobre a mesma factura. Somados, o primeiro mês de um
 * Premium de 65 € sai a 35 % + 50 % = 85 % antes de Stripe, infra e entrega do serviço. Não é um
 * plano apertado: é um plano que não fecha. E como as duas cadeias correm em ficheiros diferentes
 * (o webhook chama o MLM, o livro chama a tabela de papéis), sem um ponto único de decisão isto
 * volta a acontecer na primeira alteração que alguém fizer a um dos lados sem olhar para o outro.
 *
 * Esta função é esse ponto único. Quem a chama são as duas portas do MLM:
 *   · `lib/mlm-checkout-commission.ts` (primeira compra)
 *   · `lib/mlm-renewal-commission.ts` (residual directo + residual de rank)
 *
 * NA DÚVIDA, PAGA-SE O BINÁRIO. Se a consulta falhar, devolve-se «não atribuída»: o binário é o
 * que já existia e é o que está prometido a quem cá está. Suprimi-lo por causa de um erro de
 * leitura seria tirar dinheiro a alguém por causa de uma falha nossa — e isso não se desfaz com
 * um deploy.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverNegocioDoComprador } from './atribuicao-leitura'
import { PAPEIS_VENDAS, type PapelVendas } from './calculo'

/** As colunas de atribuição do negócio, na ordem dos papéis. */
const COLUNA_DO_PAPEL: Record<PapelVendas, string> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

export type EquipaNaVenda = {
  atribuida: boolean
  negocioId: string | null
  papeis: PapelVendas[]
}

/**
 * Há equipa atribuída a este comprador?
 *
 * A procura do negócio é a MESMA que o livro usa (`lib/vendas/atribuicao-leitura.ts`), e tem de o
 * ser: quando as duas portas procuravam de maneiras diferentes, podiam responder diferente sobre o
 * mesmo pagamento — e aí ou pagava duas vezes (papéis + binário) ou não pagava a ninguém. Basta UM
 * papel preenchido para a venda ser «de equipa»: se houve um setter a marcar a reunião, a venda não
 * é do patrocinador da árvore, mesmo que o closer tenha sido o próprio dono.
 */
export async function equipaAtribuidaAoComprador(
  supabase: SupabaseClient,
  compradorId: string | null | undefined,
): Promise<EquipaNaVenda> {
  const vazio: EquipaNaVenda = { atribuida: false, negocioId: null, papeis: [] }
  if (!compradorId) return vazio

  let resolvido: Awaited<ReturnType<typeof resolverNegocioDoComprador>>
  try {
    resolvido = await resolverNegocioDoComprador(supabase, {
      compradorId,
      colunasExtra: Object.values(COLUNA_DO_PAPEL),
    })
  } catch {
    // Sem tabela (migração ainda não aplicada), ou com erro: o binário paga, como sempre pagou. Ver
    // o comentário do topo — na dúvida preserva-se o que está prometido.
    return vazio
  }

  if (!resolvido.negocio) return vazio

  const linha = resolvido.negocio
  const papeis = PAPEIS_VENDAS.filter((papel) => {
    const valor = linha[COLUNA_DO_PAPEL[papel]]
    return typeof valor === 'string' && valor.length > 0
  })

  return {
    atribuida: papeis.length > 0,
    negocioId: typeof linha.id === 'string' ? linha.id : null,
    papeis,
  }
}

/**
 * Atalho para as portas do MLM: `true` significa «não cries comissão binária, esta venda é da
 * equipa». Existe como função própria para o motivo ficar escrito no sítio onde se decide, e para
 * a guarda (`exclusividade.check.ts`) poder verificar que as duas portas a chamam.
 */
export async function vendaPagaPelaEquipa(
  supabase: SupabaseClient,
  compradorId: string | null | undefined,
): Promise<boolean> {
  const { atribuida } = await equipaAtribuidaAoComprador(supabase, compradorId)
  return atribuida
}
