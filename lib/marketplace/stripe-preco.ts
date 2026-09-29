/**
 * O PREÇO NO STRIPE, FEITO DO ECRÃ — criar, e mudar.
 *
 * ── O QUE TORNA ISTO MENOS ÓBVIO DO QUE PARECE ────────────────────────────────────────────
 *
 * No Stripe um PREÇO É IMUTÁVEL. Não há «editar o preço»: há criar um preço novo e arquivar o
 * antigo. Quem não sabe isto escreve um `prices.update({ unit_amount })`, recebe um erro, e a
 * saída mais fácil dali é criar também um PRODUTO novo a cada mudança — e ao terceiro ajuste de
 * preço o catálogo Stripe tem três «Curso de Cripto» e ninguém sabe qual é o que vende.
 *
 * Por isso o produto guarda-se (`stripe_product_id`) e reutiliza-se; só o preço é que nasce de
 * novo. É a mesma coisa que o `scripts/mtmfunded-precos-plataforma.ts` já faz quando muda os
 * preços dos programas, e é de lá que este desenho vem.
 *
 * ── PORQUE É QUE O PREÇO ANTIGO SE ARQUIVA E NÃO SE APAGA ─────────────────────────────────
 *
 * Um preço do Stripe não se apaga quando tem subscrições vivas em cima dele — e não deve. Quem
 * comprou uma subscrição a 35 € continua a pagar 35 € até mudar de plano; arquivar impede que
 * alguém NOVO o compre, sem mexer em quem já cá está. Apagar seria mexer.
 *
 * ── A CAMPANHA NÃO É UM PREÇO ─────────────────────────────────────────────────────────────
 *
 * Um desconto de campanha NÃO cria um preço novo. Cria-se um CUPÃO no Stripe e aplica-se à sessão
 * de checkout. Se a campanha fosse um segundo preço, o produto ficava com dois preços vivos ao
 * mesmo tempo e o `stripe_price_id` da tabela deixava de responder à pergunta «quanto custa isto?».
 *
 * NADA AQUI É CHAMADO SEM UM ADMIN OU O EDUCADOR DONO DO PRODUTO POR TRÁS. Estas funções mexem no
 * catálogo Stripe da casa; as rotas que as chamam é que garantem quem pode.
 */

import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe-client'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type ProdutoParaStripe = {
  id: string
  titulo: string
  subtitulo?: string | null
  slug?: string | null
  preco_cents: number
  moeda?: string | null
  recorrente?: boolean | null
  stripe_product_id?: string | null
  stripe_price_id?: string | null
  dono?: string | null
  educator_id?: string | null
}

export type ResultadoSync = {
  stripeProductId: string
  stripePriceId: string
  /** Falso quando o preço que já lá estava servia — nada foi criado. */
  criouPreco: boolean
  arquivou: string | null
}

/**
 * Põe o produto e o preço no Stripe a bater com o que está na nossa tabela, e escreve os ids de
 * volta.
 *
 * Idempotente no que importa: chamada duas vezes com o mesmo preço não cria dois preços. É isso
 * que permite ao ecrã chamá-la a cada gravação sem encher o Stripe de lixo.
 */
export async function sincronizarPrecoNoStripe(produto: ProdutoParaStripe): Promise<ResultadoSync> {
  const stripe = getStripeClient()
  const db = getSupabaseAdmin()

  const moeda = String(produto.moeda ?? 'eur').toLowerCase()
  const montante = Math.max(0, Math.round(Number(produto.preco_cents) || 0))
  if (montante <= 0) {
    // Um preço de zero no Stripe não é um preço: o Checkout recusa a sessão. Um produto gratuito
    // entrega-se com uma compra de fonte 'oferta', que não passa por aqui.
    throw new Error('Um produto a 0 não precisa de preço no Stripe — usa uma oferta.')
  }
  const recorrente = produto.recorrente === true

  // ── O produto ───────────────────────────────────────────────────────────────────────────
  let productId = produto.stripe_product_id?.trim() || ''
  const nome = `MTM Marketplace · ${produto.titulo}`.slice(0, 250)
  const descricao = (produto.subtitulo ?? '').trim().slice(0, 500) || undefined

  if (productId) {
    try {
      // Mantém o nome alinhado com o título que o educador editou. Se o produto foi apagado no
      // Stripe à mão, isto falha e caímos na criação — em vez de rebentar a gravação toda.
      await stripe.products.update(productId, { name: nome, ...(descricao ? { description: descricao } : {}) })
    } catch {
      productId = ''
    }
  }
  if (!productId) {
    const criado = await stripe.products.create({
      name: nome,
      ...(descricao ? { description: descricao } : {}),
      metadata: {
        origem: 'marketplace',
        produto_id: produto.id,
        slug: produto.slug ?? '',
        dono: String(produto.dono ?? 'educador'),
        educator_id: produto.educator_id ?? '',
      },
    })
    productId = criado.id
  }

  // ── O preço ─────────────────────────────────────────────────────────────────────────────
  //
  // Se o que já lá está bate certo (montante, moeda, recorrência) não se cria nada. Sem esta
  // verificação, cada gravação do formulário — mesmo só para corrigir uma vírgula na descrição —
  // criava um preço novo e arquivava o anterior.
  const antigo = produto.stripe_price_id?.trim() || ''
  if (antigo) {
    try {
      const p = await stripe.prices.retrieve(antigo)
      const bate =
        p.active &&
        p.unit_amount === montante &&
        p.currency === moeda &&
        Boolean(p.recurring) === recorrente &&
        (!recorrente || p.recurring?.interval === 'month')
      if (bate) {
        return { stripeProductId: productId, stripePriceId: antigo, criouPreco: false, arquivou: null }
      }
    } catch {
      // Preço apagado ou de outra conta. Segue para criar um novo.
    }
  }

  const preco = await stripe.prices.create({
    product: productId,
    currency: moeda,
    unit_amount: montante,
    ...(recorrente ? { recurring: { interval: 'month' as const } } : {}),
    nickname: `marketplace · ${produto.slug ?? produto.id}`,
    metadata: { origem: 'marketplace', produto_id: produto.id },
  })

  // ESCREVER OS IDS ANTES DE ARQUIVAR O ANTIGO.
  //
  // A ordem é a decisão. Se arquivássemos primeiro e a escrita falhasse, o produto ficava com um
  // `stripe_price_id` arquivado na tabela — ou seja, à venda com um preço que o Stripe recusa, e
  // o defeito só aparecia ao primeiro cliente que tentasse comprar. Assim, o pior caso é um preço
  // antigo por arquivar (lixo inofensivo no catálogo), e não uma loja que não vende.
  const { error } = await db
    .from('marketplace_produtos')
    .update({ stripe_product_id: productId, stripe_price_id: preco.id, updated_at: new Date().toISOString() })
    .eq('id', produto.id)

  if (error) {
    // Gritado, com o id do preço órfão no log: alguém tem de o poder ir buscar à mão.
    console.error('[marketplace] preço criado no Stripe mas NÃO gravado:', preco.id, produto.id, error.message)
    throw new Error(`O preço foi criado no Stripe (${preco.id}) mas não ficou gravado. Fala com o suporte.`)
  }

  let arquivou: string | null = null
  if (antigo && antigo !== preco.id) {
    try {
      await stripe.prices.update(antigo, { active: false })
      arquivou = antigo
    } catch {
      // Não é fatal: um preço antigo activo que ninguém referencia não vende nada.
    }
  }

  return { stripeProductId: productId, stripePriceId: preco.id, criouPreco: true, arquivou }
}

/**
 * O cupão do Stripe que aplica a campanha à sessão de checkout.
 *
 * Guardado em `campanha_stripe_coupon_id` e reutilizado: criar um cupão por clique enchia a conta
 * Stripe de milhares de cupões de 20% iguais. Quando a percentagem muda, o cupão antigo deixa de
 * servir e faz-se outro — o nome dele leva a percentagem justamente para isso se poder verificar
 * numa chamada e não num campo extra na tabela.
 *
 * `duration: 'once'` mesmo nas subscrições, e é deliberado: uma campanha de lançamento desconta a
 * PRIMEIRA cobrança. Um `forever` dava 20% de desconto vitalício a quem entrou numa semana de
 * promoção, e isso é uma decisão de negócio que o dono tem de tomar por escrito — não um efeito
 * secundário de uma escolha de implementação.
 */
export async function cupaoDaCampanha(produto: {
  id: string
  campanha_pct?: number | null
  campanha_stripe_coupon_id?: string | null
}): Promise<string | null> {
  const pct = Number(produto.campanha_pct ?? 0)
  if (!Number.isFinite(pct) || pct <= 0) return null

  const stripe = getStripeClient()
  const existente = produto.campanha_stripe_coupon_id?.trim() || ''
  if (existente) {
    try {
      const c = await stripe.coupons.retrieve(existente)
      if (c.valid && c.percent_off === pct) return existente
    } catch {
      // Apagado no Stripe. Faz-se outro.
    }
  }

  const cupao = await stripe.coupons.create({
    percent_off: pct,
    duration: 'once',
    name: `Marketplace ${pct}% · ${produto.id.slice(0, 8)}`,
    metadata: { origem: 'marketplace', produto_id: produto.id },
  })

  await getSupabaseAdmin()
    .from('marketplace_produtos')
    .update({ campanha_stripe_coupon_id: cupao.id })
    .eq('id', produto.id)

  return cupao.id
}

/** O preço, tal como o Stripe o tem. Para o ecrã poder mostrar se está alinhado com a tabela. */
export async function lerPrecoDoStripe(priceId: string): Promise<{
  activo: boolean; cents: number | null; moeda: string; recorrente: boolean
} | null> {
  try {
    const p: Stripe.Price = await getStripeClient().prices.retrieve(priceId)
    return { activo: p.active, cents: p.unit_amount, moeda: p.currency, recorrente: Boolean(p.recurring) }
  } catch {
    return null
  }
}

/**
 * Um cupão do Stripe para uma percentagem avulsa — o caso do CÓDIGO escrito pelo comprador.
 *
 * Diferente do `cupaoDaCampanha`: aquele é do produto e guarda-se na linha dele. Este é o desconto
 * de um código da tabela `coupons`, que pode valer em muitos produtos, e por isso não tem onde ser
 * guardado por produto.
 *
 * A chave de reutilização é a PERCENTAGEM, não o código: dois códigos de 20% precisam exactamente
 * do mesmo cupão Stripe, e criar um por código enchia a conta de cupões idênticos. O `lookup` pela
 * metadata evita a criação repetida; falhar essa procura cria um novo, o que é inofensivo.
 *
 * `duration: 'once'` como nas campanhas — ver a nota lá. Um desconto de lançamento desconta a
 * primeira cobrança, e um desconto vitalício é uma decisão que alguém tem de tomar por escrito.
 */
export async function cupaoStripeDePercentagem(pct: number, nota = ''): Promise<string | null> {
  const p = Math.round(Number(pct) || 0)
  if (!(p > 0)) return null

  const stripe = getStripeClient()
  const id = `mkt_pct_${p}`

  try {
    const existente = await stripe.coupons.retrieve(id)
    if (existente.valid && existente.percent_off === p) return existente.id
  } catch {
    // Não existe ainda.
  }

  try {
    const criado = await stripe.coupons.create({
      // Id fixo e previsível: é o que torna a reutilização possível sem guardar nada do nosso lado.
      id,
      percent_off: p,
      duration: 'once',
      name: `Marketplace ${p}%`,
      metadata: { origem: 'marketplace', pct: String(p), nota: nota.slice(0, 200) },
    })
    return criado.id
  } catch {
    // Corrida: outro pedido criou-o entre o `retrieve` e o `create`. Ele existe, e serve.
    try {
      const agora = await stripe.coupons.retrieve(id)
      return agora.valid ? agora.id : null
    } catch {
      return null
    }
  }
}
