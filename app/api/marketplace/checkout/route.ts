/**
 * COMPRAR UM PRODUTO DO MARKETPLACE.
 *
 * POST { produtoId } → { url } (sessão Stripe Checkout)
 *                    → { externo: url } quando o produto da casa usa o caminho de compra ANTIGO
 *
 * ── A REGRA DA APPLE, NO SERVIDOR ─────────────────────────────────────────────────────────
 *
 * `isIosAppRequest` é a PRIMEIRA coisa que acontece, antes de autenticar sequer. Esconder o botão
 * no ecrã não chega — o pedido chega à mesma se alguém o fizer à mão, e foi exactamente assim que
 * o iPad em modo secretária abriu checkout Stripe dentro da app (está contado em
 * `lib/is-native-request.ts`). Um curso é conteúdo digital consumido na app: Guideline 3.1.1.
 *
 * Isto vale TAMBÉM para o `externo`: devolver a um pedido da app iOS o endereço de uma página de
 * compra do site é a 3.1.1 à letra, e é por isso que o travão está antes de tudo e não num `if`
 * mais abaixo por ramo.
 *
 * ── PRODUTOS DA CASA: O CAMINHO ANTIGO CONTINUA A SER O CAMINHO ───────────────────────────
 *
 * Um scanner, uma subscrição e uma licença de EA vendem-se HOJE, e cada um desses fluxos faz mais
 * do que cobrar: provisiona o acesso, manda o email, mexe na categoria de membro, credita a rede
 * MLM. Um checkout `source: 'marketplace_product'` cobrava o dinheiro e NÃO fazia nada disso — o
 * cliente pagava o scanner e não recebia scanner nenhum.
 *
 * Por isso um produto da casa com `checkout_externo_url` não é cobrado aqui: a montra mostra-o, e
 * o botão leva a pessoa ao caminho que já funciona. É coexistência de propósito, e é o que permite
 * o marketplace abrir com produtos lá dentro sem tocar num único caminho de compra vivo.
 *
 * ── O PREÇO ───────────────────────────────────────────────────────────────────────────────
 *
 * O desconto de campanha vai como CUPÃO do Stripe e não como preço novo. O `amount_total` chega ao
 * webhook já descontado, e é sobre ele que a partilha do educador é calculada — ou seja, o
 * desconto é repartido entre a casa e o educador na mesma proporção do acordo. Isso é uma decisão
 * de negócio e está escrita aqui para que se possa discutir: a alternativa (a casa comer o
 * desconto inteiro) faz uma campanha de 30% custar à casa 30% de uma venda em que ela só ficava
 * com 5% — ou seja, a casa pagava para o educador vender.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { donoValido, modoStripe, podeComprarAqui, precoEfectivo } from '@/lib/marketplace/regras'
import { lerDefinicoes, lerVendedor, pctDoProduto } from '@/lib/marketplace/servidor'
import { cupaoDaCampanha } from '@/lib/marketplace/stripe-preco'
import { registarPasso } from '@/lib/marketplace/leads'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'

export const dynamic = 'force-dynamic'

const COLUNAS =
  'id, slug, titulo, educator_id, preco_cents, moeda, estado, activo, partilha_pct, stripe_price_id, ' +
  'dono, recorrente, requer_morada, checkout_externo_url, campanha_pct, campanha_inicio, campanha_fim, ' +
  'campanha_tier, campanha_stripe_coupon_id'

/**
 * A forma da linha que este ficheiro lê.
 *
 * Escrita à mão porque a lista de colunas é uma string montada com `+` (para caber legível em
 * várias linhas) e, quando isso acontece, o Supabase deixa de conseguir inferir o tipo do `select`
 * e devolve `GenericStringError`. Declarar a forma é melhor do que um `any`: se amanhã alguém tirar
 * uma coluna da string, o `tsc` continua calado, mas quem lê o ficheiro sabe exactamente o que
 * esperar — e é a mesma lista, logo acima.
 */
type LinhaCheckout = {
  id: string
  slug: string
  titulo: string
  educator_id: string | null
  preco_cents: number
  moeda: string
  estado: string
  activo: boolean
  partilha_pct: number | null
  stripe_price_id: string | null
  dono: string
  recorrente: boolean
  requer_morada: boolean
  checkout_externo_url: string | null
  campanha_pct: number | null
  campanha_inicio: string | null
  campanha_fim: string | null
  campanha_tier: string | null
  campanha_stripe_coupon_id: string | null
}

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
    const { data: lido } = await db
      .from('marketplace_produtos')
      .select(COLUNAS)
      .eq('id', produtoId)
      .maybeSingle()
    if (!lido) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    const produto = lido as unknown as LinhaCheckout

    const def = await lerDefinicoes()
    const daCasa = donoValido(produto.dono) === 'casa'
    const vendedor = daCasa || !produto.educator_id ? null : await lerVendedor(produto.educator_id)

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
      return NextResponse.json(
        { error: 'Este produto não está disponível para compra.', code: decisao.motivo },
        { status: estado },
      )
    }

    // ── O caminho antigo, para os produtos da casa que já vendem ──────────────────────────
    const externo = String(produto.checkout_externo_url ?? '').trim()
    if (daCasa && /^https?:\/\//i.test(externo)) {
      await registarPasso({
        etapa: 'iniciou_checkout',
        produtoId: produto.id,
        userId: sessao.userId,
        email: sessao.email,
        origem: 'checkout_externo',
        contexto: { destino: externo },
      })
      return NextResponse.json({ externo })
    }

    if (!produto.stripe_price_id) {
      return NextResponse.json(
        { error: 'Este produto ainda não tem cobrança ligada. Falta o preço Stripe.', code: 'sem_preco' },
        { status: 409 },
      )
    }

    // O MESMO cálculo que a montra usou para desenhar o preço. Se isto divergisse do cartão, o
    // cliente via um número e pagava outro.
    const preco = precoEfectivo(produto, new Date().toISOString(), sessao.perfil)
    const cupao = preco.emCampanha ? await cupaoDaCampanha(produto) : null

    const stripe = getStripeClient()
    const checkout = await stripe.checkout.sessions.create({
      mode: modoStripe(produto),
      line_items: [{ price: produto.stripe_price_id, quantity: 1 }],
      customer_email: sessao.email ?? undefined,
      ...(cupao ? { discounts: [{ coupon: cupao }] } : {}),
      // Merchandise é uma caixa que alguém tem de enviar. Sem isto, chegava uma encomenda paga
      // sem morada e alguém tinha de a ir pedir por email — que é o momento em que metade das
      // encomendas fica sem resposta.
      ...(produto.requer_morada === true ? { shipping_address_collection: { allowed_countries: ['PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'BE', 'LU', 'IE', 'AT', 'GB', 'BR'] as const } } : {}),
      success_url: buildStripeReturnUrl('/marketplace/biblioteca', { comprado: produto.slug }),
      cancel_url: buildStripeReturnUrl(`/marketplace/${produto.slug}`, { cancelado: '1' }, { includeSessionPlaceholder: false }),
      metadata: {
        // `source` é o discriminador que o webhook lê primeiro — a mesma convenção do MTM Funded
        // e das licenças do EA. Sem isto a compra caía na lógica dos planos do site e mexia na
        // categoria de membro de quem só queria comprar um curso.
        source: 'marketplace_product',
        user_id: sessao.userId,
        product_id: produto.id,
        educator_id: produto.educator_id ?? '',
        dono: daCasa ? 'casa' : 'educador',
        // Congelada aqui e reconfirmada no webhook: o extracto não pode mudar por alguém ter
        // editado uma percentagem entre o clique e o pagamento.
        partilha_pct: String(pctDoProduto(produto, vendedor)),
        campanha_pct: String(preco.descontoPct),
      },
    })

    await registarPasso({
      etapa: 'iniciou_checkout',
      produtoId: produto.id,
      userId: sessao.userId,
      email: sessao.email,
      referencia: checkout.id,
      origem: 'stripe',
      contexto: { cents: preco.cents, campanha: preco.emCampanha, modo: modoStripe(produto) },
    })

    return NextResponse.json({ url: checkout.url, sessionId: checkout.id })
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
