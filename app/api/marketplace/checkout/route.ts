/**
 * COMPRAR UM PRODUTO DE UM EDUCADOR.
 *
 * POST { produtoId } → { url } (sessão Stripe Checkout)
 *
 * ── O QUE ESTA ROTA NÃO FAZ ───────────────────────────────────────────────────────────────
 *
 * Não cobra nada hoje. Um produto só tem caminho de compra quando o dono lhe puser um
 * `stripe_price_id` — criado por ele, na conta Stripe dele, com as chaves dele. Sem isso a rota
 * devolve 409 `sem_preco` e diz-o. É de propósito: o caminho fica construído e testado, e quem o
 * liga é quem responde pelo dinheiro.
 *
 * ── A REGRA DA APPLE, NO SERVIDOR ─────────────────────────────────────────────────────────
 *
 * `isIosAppRequest` é a PRIMEIRA coisa que acontece, antes de autenticar sequer. Esconder o botão
 * no ecrã não chega — o pedido chega à mesma se alguém o fizer à mão, e foi exactamente assim que
 * o iPad em modo secretária abriu checkout Stripe dentro da app (está contado em
 * `lib/is-native-request.ts`). Um curso é conteúdo digital consumido na app: Guideline 3.1.1.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { podeComprarAqui } from '@/lib/marketplace/regras'
import { lerDefinicoes, lerVendedor, pctDoProduto } from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // App iOS: compras têm de ser via Apple In-App Purchase (Guideline 3.1.1).
    if (isIosAppRequest(request)) {
      return NextResponse.json(IOS_IAP_REQUIRED, { status: 403 })
    }

    const sessao = await sessaoDoMembro(request)
    if (!sessao) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

    const { produtoId } = await request.json().catch(() => ({ produtoId: null }))
    if (!produtoId) return NextResponse.json({ error: 'produtoId é obrigatório' }, { status: 400 })

    const db = getSupabaseAdmin()
    const { data: produto } = await db
      .from('marketplace_produtos')
      .select('id, slug, titulo, educator_id, preco_cents, moeda, estado, activo, partilha_pct, stripe_price_id')
      .eq('id', produtoId)
      .maybeSingle()
    if (!produto) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

    const def = await lerDefinicoes()
    const vendedor = await lerVendedor(produto.educator_id)

    // Já comprou? Não se cobra duas vezes pela mesma coisa.
    const { data: ja } = await db
      .from('marketplace_compras')
      .select('id')
      .eq('comprador_id', sessao.userId)
      .eq('produto_id', produto.id)
      .eq('estado', 'paga')
      .maybeSingle()

    const decisao = podeComprarAqui({
      iosNativo: false,
      def,
      produto,
      vendedor,
      jaComprou: Boolean(ja?.id),
    })
    if (!decisao.pode) {
      const estado = decisao.motivo === 'ja_comprado' ? 409 : 403
      return NextResponse.json({ error: 'Este produto não está disponível para compra.', code: decisao.motivo }, { status: estado })
    }

    if (!produto.stripe_price_id) {
      return NextResponse.json(
        {
          error: 'Este produto ainda não tem cobrança ligada. Falta o preço Stripe.',
          code: 'sem_preco',
        },
        { status: 409 },
      )
    }

    const stripe = getStripeClient()
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment', // um curso compra-se uma vez; não é uma subscrição do site.
      line_items: [{ price: produto.stripe_price_id, quantity: 1 }],
      customer_email: sessao.email ?? undefined,
      success_url: buildStripeReturnUrl('/marketplace/biblioteca', { comprado: produto.slug }),
      cancel_url: buildStripeReturnUrl(`/marketplace/${produto.slug}`, {}, { includeSessionPlaceholder: false }),
      metadata: {
        // `source` é o discriminador que o webhook lê primeiro — a mesma convenção do MTM Funded
        // e das licenças do EA. Sem isto a compra caía na lógica dos planos do site e mexia na
        // categoria de membro de quem só queria comprar um curso.
        source: 'marketplace_product',
        user_id: sessao.userId,
        product_id: produto.id,
        educator_id: produto.educator_id,
        // Congelada aqui e reconfirmada no webhook: o extracto não pode mudar por alguém ter
        // editado uma percentagem entre o clique e o pagamento.
        partilha_pct: String(pctDoProduto(produto, vendedor)),
      },
    })

    return NextResponse.json({ url: checkout.url, sessionId: checkout.id })
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
