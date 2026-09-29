/**
 * A ENTREGA — o que acontece quando o dinheiro de um produto de educador entra.
 *
 * Chamado pelo webhook do Stripe, no ramo `metadata.source === 'marketplace_product'`.
 *
 * ── O QUE ESTA FUNÇÃO GARANTE ─────────────────────────────────────────────────────────────
 *
 *   · A compra fica escrita UMA vez, mesmo que o Stripe reentregue o evento. A idempotência é
 *     por `(fonte, referencia)` e está presa por um índice único, não por boa vontade.
 *   · A partilha fica congelada na linha. A percentagem vem da metadata (o que valia no momento
 *     do clique) e, se faltar, recalcula-se do produto/vendedor. Nunca fica em branco.
 *   · Nada disto mexe no perfil do comprador. Comprar um curso não é mudar de pack.
 *
 * ── O QUE NÃO FAZ ─────────────────────────────────────────────────────────────────────────
 *
 * Não transfere dinheiro para ninguém. A parte do educador fica escrita e somada no extracto
 * dele; o pagamento é um acto separado, com aprovação humana, em `marketplace_payouts`. É a mesma
 * doutrina do livro de vendas da equipa: uma comissão nasce de um pagamento confirmado, e nada
 * aqui paga sozinho.
 */

import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { donoValido } from './regras'
import { registarPasso } from './leads'
import { lerVendedor, pctDoProduto, registarCompra } from './servidor'

export async function entregarCompraDoMarketplace(session: Stripe.Checkout.Session): Promise<void> {
  const produtoId = session.metadata?.product_id
  const compradorId = session.metadata?.user_id
  if (!produtoId || !compradorId) {
    console.error('[marketplace] checkout sem product_id/user_id na metadata:', session.id)
    return
  }

  const db = getSupabaseAdmin()
  const { data: produto } = await db
    .from('marketplace_produtos')
    .select('id, educator_id, titulo, partilha_pct, dono')
    .eq('id', produtoId)
    .maybeSingle()

  if (!produto) {
    // O produto foi apagado entre o clique e o pagamento. O dinheiro entrou na mesma, por isso
    // isto tem de ficar gritado no log e não engolido: é um reembolso a fazer à mão.
    console.error('[marketplace] PAGAMENTO SEM PRODUTO — reembolsar à mão:', session.id, produtoId)
    return
  }

  // O DONO vem da TABELA e não da metadata, ao contrário da percentagem.
  //
  // A diferença é deliberada. A percentagem é um acordo que pode mudar, e o que vale é o que valia
  // no momento do clique — por isso viaja na metadata. O dono não é um acordo: é o que o produto É.
  // Aceitá-lo da metadata era aceitar que um pedido forjado dissesse «este é da casa» e a venda
  // deixasse de pagar ao educador, ou o contrário — «este é de educador» e a casa ficar a dever
  // 90% de um scanner a alguém.
  const dono = donoValido(produto.dono)

  // A percentagem do momento do clique manda. Só se recalcula quando ela não veio — e aí vale a
  // do produto, depois a do educador, depois a do acordo por omissão (90).
  const daMetadata = Number(session.metadata?.partilha_pct)
  const pct = dono === 'casa'
    ? 0
    : Number.isFinite(daMetadata) && daMetadata > 0
      ? daMetadata
      : pctDoProduto(produto, produto.educator_id ? await lerVendedor(produto.educator_id) : null)

  try {
    const r = await registarCompra({
      produtoId: produto.id,
      educatorId: dono === 'casa' ? null : produto.educator_id ?? null,
      compradorId,
      fonte: 'stripe',
      referencia: session.id,
      dono,
      brutoCents: session.amount_total ?? 0,
      // Zero: no Stripe não há loja a levar nada antes de nós. A taxa do Stripe é custo da casa,
      // não sai da parte do educador — o acordo é 90% do que ele vende, não 90% do que
      // sobra depois das taxas de processamento.
      comissaoLojaCents: 0,
      partilhaPct: pct,
      moeda: session.currency ?? 'eur',
    })
    if (!r.novo) {
      console.log('[marketplace] evento repetido, compra já existia:', session.id)
      return
    }
    // O último passo do funil. Fica DEPOIS de a compra estar escrita e só quando ela é nova: um
    // evento reentregue pelo Stripe não pode aparecer no quadro como uma segunda venda.
    await registarPasso({
      etapa: 'pagou',
      produtoId: produto.id,
      userId: compradorId,
      referencia: session.id,
      origem: 'stripe',
      contexto: { cents: session.amount_total ?? 0, dono },
    })
  } catch (e) {
    // Rebenta de propósito: se a compra não ficou escrita, o comprador pagou e não tem acesso, e
    // isso tem de aparecer como falha do webhook (que o Stripe volta a tentar) e não como sucesso.
    console.error('[marketplace] falhou registar a compra:', session.id, e)
    throw e
  }
}
