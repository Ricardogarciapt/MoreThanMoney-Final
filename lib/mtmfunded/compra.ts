import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Pagamento confirmado de um programa de avaliação → conta emitida.
 *
 * Corre no webhook do Stripe, e é aí que tem de correr: só o webhook sabe que o dinheiro
 * entrou mesmo. Emitir a conta na abertura do checkout dava contas a quem abandonasse o
 * pagamento a meio; emiti-la no `success_url` dava contas a quem soubesse escrever o
 * endereço à mão.
 *
 * IDEMPOTENTE de propósito. O Stripe repete eventos — por desenho, não por defeito — e o
 * segundo `checkout.session.completed` da mesma sessão não pode dar uma segunda conta ao
 * mesmo participante. A linha da compra é a marca: passando a `paga`, já cá esteve.
 */
export async function emitirContaDoProgramaPago(session: Stripe.Checkout.Session): Promise<void> {
  const db = getSupabaseAdmin()
  const meta = session.metadata ?? {}
  const compraId = meta.compra_id
  const programId = meta.program_id
  const userId = meta.user_id

  if (!programId || !userId) {
    console.warn('[MTMFUNDED] checkout sem program_id/user_id:', session.id)
    return
  }

  // Já tratado? Sai. Vale para a repetição do evento e para dois eventos ao mesmo tempo.
  if (compraId) {
    const { data: compra } = await db
      .from('mtm_funded_purchases')
      .select('id, estado, account_id')
      .eq('id', compraId)
      .maybeSingle()
    if (compra?.estado === 'paga' || compra?.account_id) {
      return
    }
  }

  const { data: programa } = await db
    .from('mtm_funded_programs')
    .select('id, slug, nome, saldo, fases')
    .eq('id', programId)
    .maybeSingle()
  if (!programa) {
    console.error('[MTMFUNDED] programa desconhecido no checkout:', programId)
    return
  }

  const { data: perfil } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle()

  const email = String(meta.email || perfil?.email || session.customer_details?.email || '')
  const primeiroNome = String(meta.primeiro_nome || perfil?.full_name?.split(/\s+/)[0] || 'Trader')
  const apelido = String(meta.apelido || 'Desafio')
  const nome = `${primeiroNome} ${apelido}`.trim()
  if (!email) {
    console.error('[MTMFUNDED] compra sem email:', session.id)
    return
  }

  // A conta primeiro — é ela que o pedido da fila referencia.
  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: userId,
      tipo: 'desafio',
      program_id: programa.id,
      servidor: 'TheTradingMaster-Live',
      saldo_inicial: programa.saldo,
      alavancagem: 100,
      estado: 'pedida',
    })
    .select('id')
    .single()

  if (erroConta || !conta) {
    console.error('[MTMFUNDED] falhou a criar a conta:', erroConta)
    return
  }

  /**
   * A compra passa a `paga` ANTES de a fila ser escrita.
   *
   * Se o processo morrer entre uma coisa e outra, fica uma conta sem pedido — que se vê no
   * painel de admin e se repete com um clique. Pela ordem inversa, ficaria uma compra por
   * pagar com a conta já emitida, e a repetição do evento emitia uma segunda.
   */
  if (compraId) {
    await db
      .from('mtm_funded_purchases')
      .update({
        estado: 'paga',
        account_id: conta.id,
        stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        pago_em: new Date().toISOString(),
      })
      .eq('id', compraId)
  }

  const { apelidoComTipo } = await import('@/lib/mtmfunded/metaapi')
  await db.from('mtm_account_requests').insert({
    account_id: conta.id,
    primeiro_nome: primeiroNome,
    sobrenome: apelidoComTipo(apelido, 'desafio'),
    email,
    telefone: String(meta.telefone || '').replace(/\D/g, '') || null,
    indicativo: String(meta.indicativo || '+351'),
    pais: String(meta.pais || 'PT'),
    data_nascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(meta.data_nascimento ?? ''))
      ? String(meta.data_nascimento)
      : null,
    servidor: 'TheTradingMaster-Live',
    tipo_conta: 'ECN',
    deposito: programa.saldo,
    alavancagem: 100,
    estado: 'em_fila',
  })

  console.log(`✅ [MTMFUNDED] ${programa.nome} pago por ${email} — conta ${conta.id} na fila`)
}
