import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { buildStripeReturnUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O CHECKOUT DE UM PROGRAMA DE AVALIAÇÃO.
 *
 * O preço vem da BASE DE DADOS, nunca do pedido. Aceitar um valor enviado pelo browser é
 * deixar qualquer pessoa comprar um programa de 499 € por um cêntimo — e o Stripe cobraria
 * exactamente o que lhe mandássemos, sem se queixar.
 *
 * A conta não se cria aqui. Cria-se quando o pagamento for CONFIRMADO pelo webhook: emitir
 * a conta na abertura do checkout dava contas a quem abandonasse o pagamento a meio.
 */
export async function POST(request: NextRequest) {
  const config = await getMtmFundedConfig()
  if (!config.ativo || !config.vendas_abertas) {
    // Falha fechada, e no servidor: o botão pode estar escondido no cliente e alguém chamar
    // esta rota à mão. O interruptor tem de valer aqui.
    return NextResponse.json({ error: 'As inscrições nos programas não estão abertas' }, { status: 403 })
  }

  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: userData, error: authErr } = await db.auth.getUser(auth)
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  }
  const user = userData.user

  const body = await request.json().catch(() => ({}))
  const slug = String(body?.programa ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'programa em falta' }, { status: 400 })

  const { data: programa } = await db
    .from('mtm_funded_programs')
    .select('id, slug, nome, saldo, preco_cents, moeda, stripe_price_id, ativo')
    .eq('slug', slug)
    .maybeSingle()

  if (!programa || !programa.ativo) {
    return NextResponse.json({ error: 'Programa não encontrado' }, { status: 404 })
  }

  /**
   * Os mesmos dados que o torneio pede, e pela mesma razão: são o que a corretora exige no
   * formulário da conta. Pedem-se ANTES do pagamento — descobrir que faltam depois de a
   * pessoa pagar deixava-a paga e sem conta, à espera de um email nosso.
   */
  const telefone = String(body?.telefone ?? '').replace(/\D/g, '')
  const nascimento = String(body?.dataNascimento ?? '').trim()
  const nome = String(body?.nome ?? '').trim()
  if (nome.length < 3) return NextResponse.json({ error: 'Indica o teu nome' }, { status: 400 })
  if (telefone.length < 9) return NextResponse.json({ error: 'Indica um telemóvel válido' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
    return NextResponse.json({ error: 'Indica a data de nascimento' }, { status: 400 })
  }
  const anos = (Date.now() - new Date(nascimento).getTime()) / (365.25 * 24 * 3600 * 1000)
  if (!(anos >= 18 && anos <= 100)) {
    return NextResponse.json({ error: 'A data de nascimento não é válida' }, { status: 400 })
  }

  const email = user.email ?? ''
  if (!email) return NextResponse.json({ error: 'A conta não tem email' }, { status: 400 })

  // A compra fica registada como PENDENTE antes de ir para o Stripe. Assim, se o webhook
  // chegar antes de qualquer outra coisa, encontra a linha à espera dele em vez de ter de a
  // inventar a partir de metadados.
  const { data: compra } = await db
    .from('mtm_funded_purchases')
    .insert({
      user_id: user.id,
      program_id: programa.id,
      valor_cents: programa.preco_cents,
      moeda: programa.moeda ?? 'eur',
      estado: 'pendente',
      email,
    })
    .select('id')
    .single()

  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: programa.stripe_price_id
      ? [{ price: programa.stripe_price_id, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: programa.moeda ?? 'eur',
              unit_amount: programa.preco_cents,
              product_data: {
                name: `MTM Funded · ${programa.nome}`,
                description: `Avaliação em conta simulada de ${Number(programa.saldo).toLocaleString('pt-PT')} USD`,
              },
            },
          },
        ],
    success_url: buildStripeReturnUrl('/mtmfunded/tradingtournament/dashboard', {
      programa: programa.slug,
    }),
    cancel_url: buildStripeReturnUrl('/mtmfunded', {}, { includeSessionPlaceholder: false }),
    metadata: {
      source: 'mtmfunded_program',
      compra_id: compra?.id ?? '',
      program_id: programa.id,
      user_id: user.id,
      nome,
      telefone,
      data_nascimento: nascimento,
    },
  })

  if (compra?.id) {
    await db.from('mtm_funded_purchases').update({ stripe_session_id: session.id }).eq('id', compra.id)
  }

  return NextResponse.json({ url: session.url })
}
