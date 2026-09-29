/**
 * A VENDA DO MARKETPLACE ENTRA NO LIVRO DA EQUIPA.
 *
 * ── O BURACO QUE ISTO TAPA ────────────────────────────────────────────────────────────────
 *
 * O ramo `source === 'marketplace_product'` do webhook do Stripe faz `return` depois de entregar a
 * compra. Nunca chegava ao `registarVendaDaEquipa` que todas as outras vendas chamam — o que
 * significa que uma compra no marketplace não existia para o livro de vendas, não aparecia em
 * extracto nenhum e não pagava comissão a ninguém, em silêncio.
 *
 * ── PORQUE É QUE PRECISA DE UM NEGÓCIO ────────────────────────────────────────────────────
 *
 * `lib/vendas/livro.ts` só sabe pagar a partir de um `vendas_negocios`: lê os cinco papéis
 * (prospector, setter, closer, team_leader, afiliado) dessa linha e mais nada. Um código de
 * indicação, por si, não paga nada — tem de virar um papel numa linha de negócio. É o que o
 * `negocioParaComissao` faz, pondo quem indicou como `afiliado`.
 *
 * Uma venda SEM referral regista-se na mesma, sem negócio. Não é um caso esquecido: é o que a
 * vista `vendas_sem_atribuicao` espera encontrar — uma venda com `negocio_id` nulo e zero negócios
 * candidatos lê-se como «compra directa, não há ninguém a quem pagar», que é exactamente a verdade.
 * O que não podia acontecer era a venda não existir de todo.
 *
 * ── O TECTO ───────────────────────────────────────────────────────────────────────────────
 *
 * Numa venda de marketplace há DOIS a receber e não são o mesmo: o educador, 90% por acordo, e quem
 * indicou, pela regra de comissão. As duas contas são feitas por sistemas diferentes que não se
 * conhecem — e não existe, em lado nenhum desta casa, uma verificação de que a soma das comissões
 * de uma venda cabe no valor dela. Nada impede hoje uma regra de 40% para três papéis.
 *
 * Numa venda normal isso é um problema teórico. Aqui não: 90% já estão prometidos ao educador antes
 * de a comissão sequer ser calculada, e a casa só tem 10% de onde a pagar.
 *
 * Por isso a comissão é limitada à PARTE DA CASA, e o limite viaja para o livro. Ver
 * `lib/vendas/livro.ts` (`tectoComissaoCents`), que é opcional e não muda nada para quem não o passa.
 */

import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { negocioParaComissao } from './referral-servidor'

/**
 * O `pack` com que esta venda entra no livro.
 *
 * Fixo, e não `marketplace:<slug>`, de propósito: o `pack` é o que escolhe a regra de comissão em
 * `vendas_regras_comissao`, e um pack por produto obrigaria o dono a definir uma regra por cada
 * curso que um educador criasse. Com um pack único, define-se uma regra para o marketplace inteiro.
 * O produto fica identificado na `nota`, que é onde se vai ler e não onde se decide.
 */
export const PACK_MARKETPLACE = 'marketplace'

export async function registarVendaDoMarketplace(entrada: {
  session: Stripe.Checkout.Session
  compradorId: string
  referralId: string | null
  produto: { id: string; titulo: string; slug: string }
  /** O que sobra para a casa depois da partilha. É o tecto da comissão. */
  parteCasaCents: number
}): Promise<void> {
  try {
    const db = getSupabaseAdmin()
    const { registarVendaConfirmada } = await import('@/lib/vendas/livro')

    // Só há negócio quando há alguém a quem pagar. Criar um negócio vazio em cada compra enchia o
    // pipeline comercial da equipa de ruído — e é de lá que saem as comissões de gente a sério.
    const negocioId = entrada.referralId
      ? await negocioParaComissao({
          compradorId: entrada.compradorId,
          emailComprador: entrada.session.customer_details?.email ?? null,
          referralUserId: entrada.referralId,
          produtoTitulo: entrada.produto.titulo,
          db,
        })
      : null

    const r = await registarVendaConfirmada(db, {
      // 'stripe' e não 'marketplace': o `check` da coluna aceita ('stripe','apple','manual'), e a
      // fonte descreve por onde o dinheiro entrou, não o que foi vendido. O que foi vendido é o
      // `pack`.
      fonte: 'stripe',
      // A MESMA referência que `marketplace_compras` usa. Não colide: são tabelas diferentes, cada
      // uma com o seu índice único — e usar a mesma é o que faz o estorno do Stripe encontrar as
      // duas quando um pagamento é devolvido.
      referencia: entrada.session.id,
      compradorId: entrada.compradorId,
      emailComprador: entrada.session.customer_details?.email ?? null,
      negocioId: negocioId ?? undefined,
      pack: PACK_MARKETPLACE,
      valorCents: entrada.session.amount_total ?? 0,
      moeda: entrada.session.currency ?? 'eur',
      tipo: 'primeira',
      // O tecto: a comissão não pode passar o que sobra para a casa depois de o educador ser pago.
      tectoComissaoCents: Math.max(0, Math.round(entrada.parteCasaCents)),
      nota: `Marketplace — ${entrada.produto.titulo} (${entrada.produto.slug})`,
    })

    if (r.resultado?.semRegra?.length) {
      // O dono nunca definiu percentagem para o pack 'marketplace'. A venda ficou escrita, ninguém
      // recebe, e isto é o único sítio onde isso aparece. Gritado de propósito.
      console.warn(
        '[marketplace] venda registada mas SEM REGRA de comissão para o pack "marketplace":',
        entrada.session.id,
        r.resultado.semRegra,
      )
    }
  } catch (e) {
    // Engolido de propósito, como o `registarVendaDaEquipa` do webhook faz. O dinheiro já entrou e
    // o acesso já foi dado: uma comissão por registar é um problema humano, resolúvel à mão; um
    // webhook a falhar faz o Stripe repetir o evento inteiro e é um problema pior.
    console.error('[marketplace] não foi possível registar a venda no livro da equipa:', e)
  }
}
