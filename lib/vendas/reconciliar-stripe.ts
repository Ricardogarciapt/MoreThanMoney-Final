/**
 * O LIVRO FECHA COM O STRIPE — todos os dias, sozinho.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * A 10/11 o Stripe tinha cobrado 460 € nos últimos 30 dias e o livro (`vendas_vendas`) tinha 330 €.
 * Os 130 € que faltavam eram pagamentos reais que o webhook recebeu e deitou fora:
 *  · as renovações do addon de 20 € saíam por um `return` sem nunca chegar ao livro;
 *  · uma fatura de um cliente cujo `stripe_customer_id` não estava no perfil saía no `if (!profile)
 *    return` — o dinheiro entrou, a venda não existiu;
 *  · e um evento perdido (deploy a meio, timeout) não tem segunda oportunidade.
 *
 * O webhook continua a ser o caminho rápido. Isto é a rede: lê o que o Stripe diz que foi PAGO e
 * regista o que falta, pela mesma porta (`registarVendaConfirmada`, idempotente pela referência).
 * Também preenche o código do agente nas primeiras faturas com valor que ficaram sem ele (ver
 * `lib/vendas/fatura-agente.ts`).
 *
 * O que NÃO faz: não mexe em perfis, acessos, MLM nem notificações. Isso é do webhook. Uma venda
 * registada aqui é só contabilidade — e as comissões da equipa, que o livro calcula, ficam pendentes
 * como todas as outras, à espera de aprovação humana.
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registarVendaConfirmada } from './livro'
import {
  codigoParaFatura,
  metadataDaSubscricaoNaFatura,
  subscricaoDaFatura,
  type CodigoDaFatura,
} from './fatura-agente'
import { normalizar } from '@/lib/agentes/atribuicao'
import { PLANO_ADDON_MTMCOPY, faturaEhAddon } from '@/lib/mtmcopy/addon-stripe'
import { ehFaturaDeMarketplace } from '@/lib/marketplace/subscricao-stripe'
import { getPlanIdFromPriceId } from '@/lib/stripe-prices'
import { stripeInvoiceLinePrice } from '@/lib/stripe-client'

type Fatura = Stripe.Invoice

/**
 * O código do agente para uma fatura paga — lendo o Stripe e o livro. Só devolve código quando a
 * fatura é o primeiro pagamento com valor da subscrição (a regra pura decide; isto só lê).
 */
export async function codigoDoAgenteDaFatura(
  stripe: Stripe,
  db: SupabaseClient,
  invoice: Fatura,
): Promise<CodigoDaFatura> {
  const pago = invoice.amount_paid ?? 0
  const subId = subscricaoDaFatura(invoice)
  if (!(pago > 0) || !subId) return { codigo: null, origem: null, motivo: pago > 0 ? 'sem_codigo' : 'sem_valor' }

  // Faturas pagas ANTERIORES desta subscrição com valor. 100 chega: uma subscrição mensal com mais
  // do que isso já não está no primeiro pagamento de certeza.
  const pagas = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 100 })
  const criada = invoice.created ?? 0
  const anteriores = pagas.data.filter(
    (i) => i.id !== invoice.id && (i.amount_paid ?? 0) > 0 && (i.created ?? 0) <= criada,
  ).length
  if (anteriores > 0) return codigoParaFatura({ pagoCents: pago, pagamentosAnterioresComValor: anteriores })

  let codigoNaSubscricao: string | null = metadataDaSubscricaoNaFatura(invoice).agente_codigo ?? null
  if (!codigoNaSubscricao) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId)
      codigoNaSubscricao = sub.metadata?.agente_codigo ?? null
    } catch {
      /* sem subscrição legível, segue para o checkout */
    }
  }

  let codigoDoCheckoutGratis: string | null = null
  if (!normalizar(codigoNaSubscricao)) {
    try {
      const sessoes = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 })
      const s = sessoes.data[0]
      codigoDoCheckoutGratis = s?.metadata?.agente_codigo ?? null
      if (!codigoDoCheckoutGratis && s?.id) {
        const { data } = await db
          .from('vendas_vendas')
          .select('agente_codigo')
          .eq('fonte', 'stripe')
          .eq('referencia', s.id)
          .maybeSingle()
        codigoDoCheckoutGratis = (data?.agente_codigo as string | null) ?? null
      }
    } catch {
      /* sem checkout, fica sem código — que é a verdade */
    }
  }

  return codigoParaFatura({ pagoCents: pago, pagamentosAnterioresComValor: 0, codigoNaSubscricao, codigoDoCheckoutGratis })
}

/** O plano pago de uma fatura, pelas mesmas fontes que o webhook usa. */
function planoDaFatura(invoice: Fatura): string | null {
  if (faturaEhAddon(invoice as unknown as Parameters<typeof faturaEhAddon>[0])) return PLANO_ADDON_MTMCOPY
  const preco = stripeInvoiceLinePrice(invoice.lines?.data?.[0])
  return (preco?.metadata?.plan as string | undefined) || (preco?.id ? getPlanIdFromPriceId(preco.id) : null) || null
}

/** Quem pagou: pelo cliente Stripe no perfil, e depois pelo email (só se for um perfil único). */
export async function compradorDoCliente(
  db: SupabaseClient,
  customerId: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  if (customerId) {
    const { data } = await db.from('profiles').select('id').eq('stripe_customer_id', customerId).limit(2)
    if (data && data.length === 1) return String(data[0].id)
  }
  const e = String(email ?? '').trim()
  if (e) {
    const { data } = await db.from('profiles').select('id').ilike('email', e).limit(2)
    if (data && data.length === 1) return String(data[0].id)
  }
  return null
}

export interface LinhaDoEnsaio {
  referencia: string
  accao: 'registada' | 'codigo_preenchido' | 'ignorada' | 'falhou'
  valorCents: number
  pack: string | null
  agenteCodigo: string | null
  motivo?: string
}

export interface ResultadoReconciliacao {
  dias: number
  ensaio: boolean
  vistas: number
  registadas: number
  codigosPreenchidos: number
  /** Pagamentos que não se conseguiram gravar nesta corrida (base lenta, 503…). A próxima tenta outra vez. */
  falhadas: number
  linhas: LinhaDoEnsaio[]
}

/** Uma escrita que falha (a base deu 503 a 11/11 às 06:20) não pode parar a corrida inteira. */
async function tentar(res: ResultadoReconciliacao, linha: LinhaDoEnsaio, escrever: () => Promise<void>): Promise<boolean> {
  try {
    await escrever()
    return true
  } catch (e) {
    res.falhadas++
    res.linhas.push({ ...linha, accao: 'falhou', motivo: e instanceof Error ? e.message.slice(0, 200) : String(e) })
    console.error('[vendas-reconciliar] não gravou', linha.referencia, e)
    return false
  }
}

/**
 * Lê faturas pagas e checkouts concluídos dos últimos `dias` e põe no livro o que lá falta.
 *
 * As primeiras compras ficam com a referência da SESSÃO de checkout (é assim que o webhook as
 * grava); por isso as faturas `subscription_create` só entram quando a subscrição não nasceu num
 * checkout — senão contava-se o mesmo dinheiro duas vezes.
 */
export async function reconciliarStripe(
  stripe: Stripe,
  db: SupabaseClient,
  opcoes: { dias?: number; ensaio?: boolean } = {},
): Promise<ResultadoReconciliacao> {
  const dias = Math.min(Math.max(Math.round(opcoes.dias ?? 3), 1), 90)
  const ensaio = Boolean(opcoes.ensaio)
  const desde = Math.floor(Date.now() / 1000) - dias * 86400
  const res: ResultadoReconciliacao = { dias, ensaio, vistas: 0, registadas: 0, codigosPreenchidos: 0, falhadas: 0, linhas: [] }

  // O que o livro já tem, numa só leitura.
  const { data: noLivro, error: erroLivro } = await db
    .from('vendas_vendas')
    .select('referencia, agente_codigo, tipo')
    .eq('fonte', 'stripe')
    .gte('pago_em', new Date((desde - 86400) * 1000).toISOString())
  // Sem saber o que o livro já tem não se adivinha: pára aqui e a próxima corrida repete a janela.
  if (erroLivro) throw new Error(`Não consegui ler o livro: ${erroLivro.message}`)
  const livro = new Map((noLivro ?? []).map((r) => [String(r.referencia), r as { agente_codigo: string | null; tipo: string }]))

  // ── 1. CHECKOUTS CONCLUÍDOS (primeiras compras, scanners, licenças, Funded) ──
  for await (const s of stripe.checkout.sessions.list({ created: { gte: desde }, status: 'complete', limit: 100 })) {
    res.vistas++
    if (s.payment_status === 'unpaid') continue
    // O marketplace tem o seu próprio registo (com o tecto do educador) em `lib/marketplace/venda-equipa.ts`.
    if (s.metadata?.source === 'marketplace_product') continue
    if (livro.has(s.id)) continue
    const pack =
      s.metadata?.plan || (s.metadata?.source === 'mtmfunded_program' ? 'mtmfunded' : s.metadata?.source) || null
    const agenteCodigo = normalizar(s.metadata?.agente_codigo)
    const linha: LinhaDoEnsaio = { referencia: s.id, accao: 'registada', valorCents: s.amount_total ?? 0, pack, agenteCodigo }
    const gravou = ensaio || (await tentar(res, linha, async () => {
      const compradorId =
        s.metadata?.user_id ||
        (await compradorDoCliente(db, typeof s.customer === 'string' ? s.customer : s.customer?.id, s.customer_details?.email))
      await registarVendaConfirmada(db, {
        fonte: 'stripe',
        referencia: s.id,
        compradorId: compradorId ?? null,
        emailComprador: s.customer_details?.email ?? s.metadata?.email ?? null,
        pack,
        valorCents: s.amount_total ?? 0,
        moeda: s.currency ?? 'eur',
        tipo: 'primeira',
        pagoEm: new Date((s.created ?? desde) * 1000).toISOString(),
        nota: 'Registada pela reconciliação diária com o Stripe (o webhook não a tinha gravado).',
        agenteCodigo,
      })
    }))
    if (!gravou) continue
    res.registadas++
    res.linhas.push(linha)
  }

  // ── 2. FATURAS PAGAS COM VALOR (renovações, fim de trial, addon, mudanças de plano) ──
  for await (const inv of stripe.invoices.list({ created: { gte: desde }, status: 'paid', limit: 100 })) {
    res.vistas++
    if (!inv.id || !((inv.amount_paid ?? 0) > 0)) continue
    await tentar(res, { referencia: inv.id, accao: 'registada', valorCents: inv.amount_paid ?? 0, pack: null, agenteCodigo: null }, () =>
      faturaParaOLivro(stripe, db, inv, livro, ensaio, desde, res),
    )
  }

  return res
}

/** Uma fatura paga com valor: regista-a, ou preenche-lhe o código, se for preciso. Lança se a escrita falhar. */
async function faturaParaOLivro(
  stripe: Stripe,
  db: SupabaseClient,
  inv: Fatura,
  livro: Map<string, { agente_codigo: string | null; tipo: string }>,
  ensaio: boolean,
  desde: number,
  res: ResultadoReconciliacao,
): Promise<void> {
  if (!inv.id) return
  {
    if (await ehFaturaDeMarketplace(inv as unknown as Parameters<typeof ehFaturaDeMarketplace>[0])) return

    const subId = subscricaoDaFatura(inv)
    if (inv.billing_reason === 'subscription_create' && subId) {
      const sessoes = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 })
      if (sessoes.data.length) return // a primeira compra está no livro pela sessão
    }

    const ja = livro.get(inv.id)
    if (ja?.agente_codigo) return
    const codigo = await codigoDoAgenteDaFatura(stripe, db, inv)

    if (ja) {
      // Já está no livro, sem código: preenche-o se esta fatura é o primeiro pagamento com valor.
      if (!codigo.codigo) return
      if (!ensaio) {
        const { error } = await db
          .from('vendas_vendas')
          .update({ agente_codigo: codigo.codigo })
          .eq('fonte', 'stripe')
          .eq('referencia', inv.id)
          .is('agente_codigo', null)
        if (error) throw new Error(`Não preenchi o código: ${error.message}`)
      }
      res.codigosPreenchidos++
      res.linhas.push({
        referencia: inv.id,
        accao: 'codigo_preenchido',
        valorCents: inv.amount_paid ?? 0,
        pack: null,
        agenteCodigo: codigo.codigo,
        motivo: codigo.origem ?? undefined,
      })
      return
    }

    const pack = planoDaFatura(inv)
    if (!ensaio) {
      const compradorId = await compradorDoCliente(
        db,
        typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
        inv.customer_email,
      )
      await registarVendaConfirmada(db, {
        fonte: 'stripe',
        referencia: inv.id,
        compradorId,
        emailComprador: inv.customer_email ?? null,
        pack,
        valorCents: inv.amount_paid ?? 0,
        moeda: inv.currency ?? 'eur',
        tipo: 'renovacao',
        pagoEm: new Date((inv.created ?? desde) * 1000).toISOString(),
        nota: 'Registada pela reconciliação diária com o Stripe (o webhook não a tinha gravado).',
        agenteCodigo: codigo.codigo,
      })
    }
    res.registadas++
    res.linhas.push({
      referencia: inv.id,
      accao: 'registada',
      valorCents: inv.amount_paid ?? 0,
      pack,
      agenteCodigo: codigo.codigo,
      motivo: codigo.origem ?? codigo.motivo,
    })
  }
}
