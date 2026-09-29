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
import { referralAceitavel } from './referral'
import { perfilDoEducador } from './referral-servidor'
import { registarVendaDoMarketplace } from './venda-equipa'
import { registarPasso } from './leads'
import { compraEntregue } from './comprador'
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
    .select('id, educator_id, titulo, slug, partilha_pct, dono')
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

  // ── Quem indicou: RECONFIRMADO, não aceite ──────────────────────────────────────────────
  //
  // O uuid chega resolvido na metadata para não se adivinhar duas vezes, mas a identidade volta a
  // passar pela tabela. A regra do dono — o educador não pode ser referral de si próprio — é
  // verificada aqui outra vez porque este caminho pode ser alcançado sem passar pelo checkout.
  const referralDaMetadata = session.metadata?.referral_id || null
  let referralId: string | null = null
  if (referralDaMetadata) {
    const { data: quem } = await db
      .from('profiles')
      .select('id, is_active')
      .eq('id', referralDaMetadata)
      .maybeSingle()
    const perfilEducador = await perfilDoEducador(produto.educator_id, db)
    const r = referralAceitavel({
      referral: quem?.id ? { userId: quem.id as string, codigo: session.metadata?.referral_codigo ?? '', activo: quem.is_active !== false } : null,
      codigoEscrito: session.metadata?.referral_codigo ?? '',
      compradorId,
      perfilDoEducadorDoProduto: perfilEducador,
    })
    if (r.ok) referralId = r.userId
    else console.warn('[marketplace] referral recusado no webhook:', session.id, r.motivo)
  }

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
      precoTabelaCents: Number(session.metadata?.preco_tabela_cents) || null,
      descontoPct: Number(session.metadata?.desconto_pct) || 0,
      cupaoId: session.metadata?.cupao_id || null,
      cupaoCodigo: session.metadata?.cupao_codigo || null,
      referralId,
      referralCodigo: referralId ? session.metadata?.referral_codigo ?? null : null,
    })
    if (!r.novo) {
      console.log('[marketplace] evento repetido, compra já existia:', session.id)
      return
    }
    // A conta que foi criada no checkout para esta compra deixa de estar «pendente de pagamento» e
    // recebe o convite para definir a password. Sem isto, quem comprou sem login tem a compra na
    // conta e não tem como entrar nela — que é igual a não ter comprado. Ver
    // `lib/marketplace/comprador.ts` (é idempotente: a marca cai à primeira passagem).
    await compraEntregue(compradorId)

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

    // O consumo do cupão fica registado DEPOIS do pagamento confirmado, nunca na validação. É a
    // mesma doutrina do MTM Funded, e a razão é simples: quem escreve um código e desiste no
    // Stripe não pode ficar sem ele.
    if (session.metadata?.cupao_id && r.compraId) {
      await db
        .from('coupon_usages')
        .insert({
          coupon_id: session.metadata.cupao_id,
          user_id: compradorId,
          context: 'marketplace',
          marketplace_compra_id: r.compraId,
        })
        // UNIQUE(coupon_id, user_id): repetir não é erro, é o índice a fazer o trabalho dele.
        .then(({ error }) => { if (error) console.log('[marketplace] uso de cupão já registado:', session.id) })
    }

    // A venda entra no livro da equipa, para gerar comissão como qualquer venda de pack.
    await registarVendaDoMarketplace({
      session,
      compradorId,
      referralId,
      produto: { id: produto.id, titulo: produto.titulo as string, slug: (produto.slug as string) ?? '' },
      parteCasaCents: Math.max(0, (session.amount_total ?? 0) - Math.round(((session.amount_total ?? 0) * pct) / 100)),
    })
  } catch (e) {
    // Rebenta de propósito: se a compra não ficou escrita, o comprador pagou e não tem acesso, e
    // isso tem de aparecer como falha do webhook (que o Stripe volta a tentar) e não como sucesso.
    console.error('[marketplace] falhou registar a compra:', session.id, e)
    throw e
  }
}
