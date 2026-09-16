import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { isIosAppRequest } from '@/lib/is-native-request'
import { PRAZO_MT5_HORAS } from '@/lib/mtmfunded/plataforma'
import { precoDaPlataforma, validarPlataformaDoPrograma, COLUNAS_PRECOS } from '@/lib/mtmfunded/precos'

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
  // App iOS nativa: nada de Stripe dentro da app (App Store 3.1.1) — o mesmo bloqueio do
  // checkout das subscrições. A compra faz-se no browser.
  if (isIosAppRequest(request)) {
    return NextResponse.json(
      { error: 'Os programas MTM Funded compram-se em morethanmoney.pt, no browser.', code: 'ios_web_only' },
      { status: 403 },
    )
  }

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
    .select(`id, slug, nome, saldo, moeda, ativo, regras, ${COLUNAS_PRECOS}`)
    .eq('slug', slug)
    .maybeSingle()

  if (!programa || !programa.ativo) {
    return NextResponse.json({ error: 'Programa não encontrado' }, { status: 404 })
  }

  /** As regras do programa. Mandam no cupão e na protecção de um-por-pessoa. */
  const regras = (programa.regras ?? {}) as Record<string, unknown>

  /**
   * A PLATAFORMA — validada contra o que está à venda agora (lançamento do simulado, interruptor
   * do MT5) E contra ESTE programa: sem preço próprio, a MTM Funded não se vende aqui. Recusa-se
   * o que não está à venda; nunca se troca em silêncio uma escolha explícita.
   */
  const escolha = validarPlataformaDoPrograma(body?.plataforma, config, programa)
  if (!escolha.ok) return NextResponse.json({ error: escolha.erro }, { status: 409 })
  const plataforma = escolha.plataforma
  /** O preço e o price id do Stripe da plataforma escolhida — nunca do pedido. */
  const preco = precoDaPlataforma(programa, plataforma)

  /**
   * Os mesmos dados que o torneio pede, e pela mesma razão: são o que a corretora exige no
   * formulário da conta. Pedem-se ANTES do pagamento — descobrir que faltam depois de a
   * pessoa pagar deixava-a paga e sem conta, à espera de um email nosso.
   */
  const { PAISES } = await import('@/lib/mtmfunded/paises')
  const primeiroNome = String(body?.primeiroNome ?? '').trim()
  const apelido = String(body?.apelido ?? '').trim()
  const telefone = String(body?.telefone ?? '').replace(/\D/g, '')
  const nascimento = String(body?.dataNascimento ?? '').trim()
  const pais = PAISES.find((p) => p.codigo === String(body?.pais ?? 'PT')) ?? PAISES[0]

  if (primeiroNome.length < 2 || apelido.length < 2) {
    return NextResponse.json({ error: 'Indica o primeiro nome e o apelido' }, { status: 400 })
  }
  if (telefone.length < 6) return NextResponse.json({ error: 'Indica um telemóvel válido' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
    return NextResponse.json({ error: 'Indica a data de nascimento' }, { status: 400 })
  }
  const anos = (Date.now() - new Date(nascimento).getTime()) / (365.25 * 24 * 3600 * 1000)
  if (!(anos >= 18 && anos <= 100)) {
    return NextResponse.json({ error: 'A data de nascimento não é válida' }, { status: 400 })
  }

  /**
   * O CUPÃO aplica-se aqui, no servidor, sobre o preço que veio da base de dados.
   *
   * O browser diz qual é o código; nunca quanto é que ele vale. Aceitar um valor já
   * descontado era deixar comprar um desafio de 169 € por um cêntimo, e o Stripe cobraria
   * exactamente o que lhe mandássemos, sem se queixar.
   */
  let cents = preco.cents
  let cupaoAplicado: string | null = null
  const codigoCupao = String(body?.cupao ?? '').trim()
  if (codigoCupao) {
    const { validarCupao } = await import('@/lib/mtmfunded/cupao')
    const r = await validarCupao(codigoCupao, cents, regras)
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })
    cents = r.centsFinais ?? cents
    cupaoAplicado = r.codigo ?? null
  }

  const email = user.email ?? ''
  if (!email) return NextResponse.json({ error: 'A conta não tem email' }, { status: 400 })

  /**
   * PROGRAMAS DE CAMPANHA: um por pessoa.
   *
   * O 10K de duas fases a 10 € do lançamento só faz sentido uma vez por pessoa — senão a
   * mesma pessoa compra dez e a campanha passa a ser a tabela de preços.
   *
   * Verifica-se pelo `user_id` E pelo email, porque criar uma conta nova com o mesmo email
   * não é possível, mas criar uma conta nova com outro email e a mesma pessoa é. As duas
   * chaves juntas apanham a repetição fácil; nenhuma protecção deste tipo apanha todas.
   *
   * Só contam as compras PAGAS. Um checkout abandonado não pode ficar a bloquear a pessoa
   * para sempre — e a conta só é emitida quando o pagamento confirma.
   */
  if (regras.um_por_pessoa === true) {
    // Duas consultas em vez de um `.or()` com o email interpolado: uma vírgula dentro do
    // endereço partiria o filtro do PostgREST e a protecção deixava de valer em silêncio.
    const compras = db
      .from('mtm_funded_purchases')
      .select('id')
      .eq('program_id', programa.id)
      .in('estado', ['pago', 'oferta'])

    const [porUser, porEmail] = await Promise.all([
      compras.eq('user_id', user.id).limit(1).maybeSingle(),
      db
        .from('mtm_funded_purchases')
        .select('id')
        .eq('program_id', programa.id)
        .in('estado', ['pago', 'oferta'])
        .ilike('email', email)
        .limit(1)
        .maybeSingle(),
    ])

    if (porUser.data || porEmail.data) {
      return NextResponse.json(
        {
          error:
            'Esta campanha é válida uma vez por pessoa, e já a usaste. Os restantes desafios continuam disponíveis.',
        },
        { status: 409 },
      )
    }
  }

  // A compra fica registada como PENDENTE antes de ir para o Stripe. Assim, se o webhook
  // chegar antes de qualquer outra coisa, encontra a linha à espera dele em vez de ter de a
  // inventar a partir de metadados.
  const linhaCompra = {
    user_id: user.id,
    program_id: programa.id,
    valor_cents: cents,
    moeda: programa.moeda ?? 'eur',
    estado: 'pendente',
    email: email.toLowerCase(),
  }
  let { data: compra, error: erroCompra } = await db
    .from('mtm_funded_purchases')
    .insert({ ...linhaCompra, plataforma })
    .select('id')
    .single()
  // Sem a coluna (migração 097 por aplicar) grava-se sem ela: a plataforma segue nos metadados
  // do Stripe, que é o que manda na emissão.
  if (erroCompra && /plataforma/i.test(erroCompra.message ?? '')) {
    ;({ data: compra, error: erroCompra } = await db
      .from('mtm_funded_purchases').insert(linhaCompra).select('id').single())
  }

  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    // Com cupão, o preço é sempre construído aqui: um `price` do Stripe tem valor fixo e
    // ignoraria o desconto.
    line_items: preco.stripePriceId && !cupaoAplicado
      ? [{ price: preco.stripePriceId, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: programa.moeda ?? 'eur',
              unit_amount: cents,
              product_data: {
                name: `MTM Funded · ${programa.nome}${cupaoAplicado ? ` (cupão ${cupaoAplicado})` : ''}`,
                description:
                  plataforma === 'mt5'
                    ? `Avaliação em conta demo MT5 de ${Number(programa.saldo).toLocaleString('pt-PT')} USD · criada em até ${PRAZO_MT5_HORAS} h`
                    : `Avaliação em conta simulada MTM Funded de ${Number(programa.saldo).toLocaleString('pt-PT')} USD · activa de imediato`,
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
      plataforma,
      primeiro_nome: primeiroNome,
      apelido,
      telefone,
      indicativo: pais.indicativo,
      pais: pais.codigo,
      data_nascimento: nascimento,
      ...(cupaoAplicado ? { cupao: cupaoAplicado } : {}),
    },
  })

  if (compra?.id) {
    await db.from('mtm_funded_purchases').update({ stripe_session_id: session.id }).eq('id', compra.id)
  }

  return NextResponse.json({ url: session.url })
}
