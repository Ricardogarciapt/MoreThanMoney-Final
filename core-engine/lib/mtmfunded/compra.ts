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
    if (compra?.estado === 'pago' || compra?.account_id) {
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

  /**
   * A PLATAFORMA escolhida no checkout manda: `mtmfunded` → motor simulado (activa já, credenciais
   * por link seguro); `mt5` → fila do agente na corretora. Sessões sem a escolha (anteriores a
   * ela) seguem o lançamento, como antes. Ver lib/mtmfunded/plataforma.ts.
   */
  const { camposDeContaSimulada, camposDeContaMt5 } = await import('./simulado/motor')
  const { getMtmFundedConfig } = await import('./config')
  const { planoDaEmissao } = await import('./plataforma')
  const plano = planoDaEmissao(meta.plataforma, Boolean((await getMtmFundedConfig()).sim_lancado_em))
  const motor = plano.motor

  // A conta primeiro — é ela que o pedido da fila referencia.
  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: userId,
      tipo: 'desafio',
      program_id: programa.id,
      saldo_inicial: programa.saldo,
      alavancagem: 100,
      ...(motor === 'sim' ? await camposDeContaSimulada(Number(programa.saldo)) : camposDeContaMt5()),
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
        estado: 'pago',
        account_id: conta.id,
        stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        pago_em: new Date().toISOString(),
      })
      .eq('id', compraId)
    // A plataforma à parte e best-effort (migração 097): se a coluna faltar, esta escrita falha
    // sozinha e NÃO leva consigo a marca de `pago`, que é a que impede uma segunda conta.
    await db.from('mtm_funded_purchases').update({ plataforma: plano.plataforma }).eq('id', compraId)
  }

  const { apelidoComTipo } = await import('@/lib/mtmfunded/metaapi')
  // Conta simulada: já está activa, não há fila nem agente.
  if (plano.pedidoNaFila) await db.from('mtm_account_requests').insert({
    account_id: conta.id,
    primeiro_nome: primeiroNome,
    // A conta nasce sempre na PRIMEIRA fase. A segunda é outra conta, emitida quando esta
    // passar — e é por isso que a etiqueta tem de dizer em qual se está.
    sobrenome: apelidoComTipo(apelido, 'desafio', { fases: Number(programa.fases ?? 0), fase: 1 }),
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

  // O uso conta-se AGORA, e não na validação: contá-lo quando alguém escreve o código para
  // «ver quanto fica» gastava um cupão de 10 usos sem ninguém comprar nada.
  if (meta.cupao) {
    const { registarUsoDoCupao } = await import('./cupao')
    await registarUsoDoCupao(String(meta.cupao), userId).catch(() => undefined)
  }

  // Conta simulada: credenciais por email (login + link seguro, nunca a password) — lib/mtmfunded/credenciais-servico.ts
  if (plano.enviarCredenciais) {
    const { enviarCredenciaisDaConta } = await import('./credenciais-servico')
    await enviarCredenciaisDaConta(conta.id, 'criacao')
  }

  console.log(`✅ [MTMFUNDED] ${programa.nome} pago por ${email} — conta ${conta.id} ${motor === 'sim' ? 'simulada, activa' : 'na fila'}`)
}
