/**
 * COMPRAR UM PRODUTO DO MARKETPLACE.
 *
 * POST { produtoId, email? } → { url } (sessão Stripe Checkout)
 *                            → { externo: url } quando o produto da casa usa o caminho de compra ANTIGO
 *
 * ── COMPRAR NÃO EXIGE LOGIN ───────────────────────────────────────────────────────────────
 *
 * Esta rota devolvia 401 a quem não tinha sessão. Uma montra pública com um botão que responde
 * «Autenticação necessária» é uma montra que só vende a quem já é cliente — e o marketplace existe
 * para vender a quem ainda não é.
 *
 * Com sessão, nada muda: compra-se como sempre. Sem sessão, o `email` é obrigatório e a CONTA
 * cria-se aqui, antes do pagamento — porque o acesso ao produto vive numa linha de
 * `marketplace_compras` com um `comprador_id`, e sem conta não há a quem entregar.
 *
 * Essa conta nasce SEM DIREITOS NENHUNS, o email é a chave (nunca se cria uma segunda conta para o
 * mesmo endereço) e o preço é o de visitante mesmo que o email seja de um Premium. O porquê de cada
 * uma destas três decisões, e o que acontece a um pagamento abandonado, está em
 * `lib/marketplace/comprador.ts`.
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
import { destinoDeCompraValido, donoValido, modoStripe, podeComprarAqui, precoEfectivo } from '@/lib/marketplace/regras'
import {
  AMBITO_MARKETPLACE, TEXTO_RECUSA, descontoQueVale, normalizarCodigo, validarCupao,
} from '@/lib/marketplace/cupoes'
import { TEXTO_REFERRAL } from '@/lib/marketplace/referral'
import { validarReferralParaCompra } from '@/lib/marketplace/referral-servidor'
import { lerDefinicoes, lerVendedor, pctDoProduto } from '@/lib/marketplace/servidor'
import { cupaoDaCampanha, cupaoStripeDePercentagem } from '@/lib/marketplace/stripe-preco'
import { registarPasso } from '@/lib/marketplace/leads'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { contaDoComprador, emailServeParaComprar } from '@/lib/marketplace/comprador'
import type { PerfilUi } from '@/lib/perfil-ui'

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

    const corpo = await request.json().catch(() => ({}))
    const produtoId = corpo?.produtoId ?? null
    if (!produtoId) return NextResponse.json({ error: 'produtoId é obrigatório' }, { status: 400 })

    /**
     * QUEM COMPRA — a sessão, ou o email de um visitante.
     *
     * `perfil: null` no caso do visitante não é descuido: é o que faz `precoEfectivo` cotar a compra
     * como visitante. Ver a nota do preço em `lib/marketplace/comprador.ts`.
     *
     * A conta cria-se ANTES de se falar com o Stripe. A ordem importa: se falhar a criação, não há
     * cobrança nenhuma para desfazer.
     */
    const sessao = await sessaoDoMembro(request)
    let quem: { userId: string; email: string | null; perfil: PerfilUi | null }
    if (sessao) {
      quem = { userId: sessao.userId, email: sessao.email, perfil: sessao.perfil }
    } else {
      const email = String(corpo?.email ?? '')
      if (!emailServeParaComprar(email)) {
        return NextResponse.json(
          { error: 'Escreve o teu email para a compra ficar agarrada a uma conta.', code: 'email_necessario', campo: 'email' },
          { status: 400 },
        )
      }
      // O IP vai para o limite de criações (ver `contaDoComprador`). `x-forwarded-for` traz a
      // cadeia inteira em proxy; o primeiro é o cliente.
      const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip')
      const conta = await contaDoComprador({ email, nome: corpo?.nome ?? null, ip })
      if (!conta) {
        return NextResponse.json(
          {
            error: 'Não foi possível preparar a tua conta. Tenta outra vez daqui a pouco, ou entra com a conta que já tens.',
            code: 'conta_falhou',
            campo: 'email',
          },
          { status: 409 },
        )
      }
      quem = { userId: conta.userId, email: conta.email, perfil: null }
    }
    const codigoCupao = normalizarCodigo(corpo?.cupao)
    const codigoReferral = String(corpo?.referral ?? '').trim()

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
      .eq('comprador_id', quem.userId)
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
    //
    // O destino pode ser ABSOLUTO (`https://…`) ou um caminho INTERNO (`/upgrade?plan=…`), e o
    // segundo caso faltava. Os catorze produtos da casa publicados apontam todos para páginas
    // nossas — `/upgrade`, `/scanner-access`, `/sensei-ea` — e o teste era só `^https?://`. Ou
    // seja: nenhum deles passava por aqui, caíam no `sem_preco` logo a seguir, e os catorze botões
    // da montra respondiam «este produto ainda não tem cobrança ligada». O marketplace abriu com
    // catorze produtos e zero caminhos de compra a funcionar.
    //
    // `//` fica de fora de propósito: `//evil.com` é um caminho relativo ao protocolo, o browser
    // lê-o como outro domínio, e aceitá-lo aqui era abrir uma porta de redireccionamento a partir
    // de um campo de texto do painel.
    const externo = String(produto.checkout_externo_url ?? '').trim()
    if (daCasa && destinoDeCompraValido(externo)) {
      await registarPasso({
        etapa: 'iniciou_checkout',
        produtoId: produto.id,
        userId: quem.userId,
        email: quem.email,
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

    const agora = new Date().toISOString()

    // O MESMO cálculo que a montra usou para desenhar o preço. Se isto divergisse do cartão, o
    // cliente via um número e pagava outro.
    const preco = precoEfectivo(produto, agora, quem.perfil)

    // ── O cupão ───────────────────────────────────────────────────────────────────────────
    //
    // Validado ANTES de cobrar. Um código errado tem de ser dito — se falhasse em silêncio, a
    // pessoa pagava o preço inteiro convencida de que o desconto se aplicou.
    let cupaoValidado: { pct: number; cupaoId: string; codigo: string } | null = null
    if (codigoCupao) {
      const { data: linha } = await db
        .from('coupons')
        .select('id, code, type, discount_value, plan_override, max_uses, valid_from, valid_until, is_active, grant_days, grants_vip, marketplace_produto_id, marketplace_educator_id, criado_por_educador')
        .eq('code', codigoCupao)
        .maybeSingle()

      // O consumo conta-se em `coupon_usages` e NUNCA em `coupons.used_count`: esse contador está
      // partido desde 25/09 (nunca foi incrementado) e um limite que nunca dispara não é um limite.
      const [{ count: usos }, { data: meu }] = await Promise.all([
        linha?.id
          ? db.from('coupon_usages').select('id', { count: 'exact', head: true }).eq('coupon_id', linha.id)
          : Promise.resolve({ count: 0 } as { count: number | null }),
        linha?.id
          ? db.from('coupon_usages').select('id').eq('coupon_id', linha.id).eq('user_id', quem.userId).maybeSingle()
          : Promise.resolve({ data: null } as { data: { id: string } | null }),
      ])

      const v = validarCupao({
        cupao: linha,
        produto,
        agoraIso: agora,
        usosFeitos: usos ?? 0,
        jaUsadoPorEstaPessoa: Boolean(meu?.id),
      })
      if (!v.ok) {
        return NextResponse.json(
          { error: TEXTO_RECUSA[v.motivo], code: `cupao_${v.motivo}`, campo: 'cupao' },
          { status: 400 },
        )
      }
      cupaoValidado = { pct: v.pct, cupaoId: v.cupaoId, codigo: codigoCupao }
    }

    // Campanha e cupão NÃO se somam: vale o maior. Ver `descontoQueVale`.
    const desconto = descontoQueVale({ campanhaPct: preco.descontoPct, cupao: cupaoValidado })
    const precoFinalCents = Math.max(0, preco.baseCents - Math.floor((preco.baseCents * desconto.pct) / 100))

    // ── Quem indicou ──────────────────────────────────────────────────────────────────────
    let referralId: string | null = null
    if (codigoReferral) {
      const r = await validarReferralParaCompra({
        codigo: codigoReferral,
        compradorId: quem.userId,
        educatorIdDoProduto: produto.educator_id,
        db,
      })
      if (!r.ok) {
        // Recusa explícita, incluindo o caso «este código é do autor do produto». O dono decidiu:
        // o educador não pode ser referral de si próprio, e a compra NÃO avança em silêncio com a
        // comissão a zero — quem compra tem de saber que o código não se aplicou.
        return NextResponse.json(
          { error: TEXTO_REFERRAL[r.motivo], code: `referral_${r.motivo}`, campo: 'referral' },
          { status: 400 },
        )
      }
      referralId = r.userId
    }

    // O cupão do Stripe: o da campanha quando é ela que vale, um ad-hoc quando é o código.
    const cupao = desconto.pct > 0
      ? desconto.veioDoCupao
        ? await cupaoStripeDePercentagem(desconto.pct, `cupao:${cupaoValidado?.codigo ?? ''}`)
        : await cupaoDaCampanha(produto)
      : null

    const stripe = getStripeClient()
    const checkout = await stripe.checkout.sessions.create({
      mode: modoStripe(produto),
      line_items: [{ price: produto.stripe_price_id, quantity: 1 }],
      customer_email: quem.email ?? undefined,
      ...(cupao ? { discounts: [{ coupon: cupao }] } : {}),
      // Merchandise é uma caixa que alguém tem de enviar. Sem isto, chegava uma encomenda paga
      // sem morada e alguém tinha de a ir pedir por email — que é o momento em que metade das
      // encomendas fica sem resposta.
      ...(produto.requer_morada === true ? { shipping_address_collection: { allowed_countries: ['PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'BE', 'LU', 'IE', 'AT', 'GB', 'BR'] as const } } : {}),
      success_url: buildStripeReturnUrl('/marketplace/biblioteca', { comprado: produto.slug }),
      cancel_url: buildStripeReturnUrl(`/marketplace/${produto.slug}`, { cancelado: '1' }, { includeSessionPlaceholder: false }),
      /**
       * O DISCRIMINADOR TAMBÉM NA SUBSCRIÇÃO, e não só na sessão.
       *
       * A metadata da sessão de checkout NÃO se propaga para a subscrição criada por ela. Os eventos
       * `customer.subscription.*` e `invoice.*` de uma mentoria recorrente chegavam ao webhook sem
       * nenhum sinal de que eram de marketplace — e era por aí que o comprador de um produto de
       * educador ficava Membro pago da casa. Ver `lib/marketplace/subscricao-stripe.ts`.
       */
      ...(modoStripe(produto) === 'subscription'
        ? { subscription_data: { metadata: { source: 'marketplace_product', product_id: produto.id } } }
        : {}),
      metadata: {
        // `source` é o discriminador que o webhook lê primeiro — a mesma convenção do MTM Funded
        // e das licenças do EA. Sem isto a compra caía na lógica dos planos do site e mexia na
        // categoria de membro de quem só queria comprar um curso.
        source: 'marketplace_product',
        user_id: quem.userId,
        product_id: produto.id,
        educator_id: produto.educator_id ?? '',
        dono: daCasa ? 'casa' : 'educador',
        // Congelada aqui e reconfirmada no webhook: o extracto não pode mudar por alguém ter
        // editado uma percentagem entre o clique e o pagamento.
        partilha_pct: String(pctDoProduto(produto, vendedor)),
        // O contexto do preço, para a compra se poder explicar no extracto do educador. Sem isto,
        // uma venda descontada lê-se como «a casa pagou-me menos do que devia».
        preco_tabela_cents: String(preco.baseCents),
        desconto_pct: String(desconto.pct),
        cupao_id: cupaoValidado?.cupaoId ?? '',
        cupao_codigo: cupaoValidado?.codigo ?? '',
        // A identidade de quem indicou viaja resolvida, mas o webhook volta a verificá-la: um
        // acordo vale o que valia no clique, uma identidade confirma-se sempre contra a tabela.
        referral_id: referralId ?? '',
        referral_codigo: referralId ? codigoReferral : '',
      },
    })

    await registarPasso({
      etapa: 'iniciou_checkout',
      produtoId: produto.id,
      userId: quem.userId,
      email: quem.email,
      referencia: checkout.id,
      origem: 'stripe',
      contexto: {
        cents: precoFinalCents,
        descontoPct: desconto.pct,
        veioDoCupao: desconto.veioDoCupao,
        temReferral: Boolean(referralId),
        modo: modoStripe(produto),
      },
    })

    return NextResponse.json({ url: checkout.url, sessionId: checkout.id })
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
