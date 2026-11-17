/**
 * PAGAMENTOS POR FATURAR — o recibo do Stripe não é fatura em Portugal. Cada venda precisa de uma
 * fatura-recibo (isenta, art. 53.º) emitida num programa certificado ou no Portal das Finanças.
 *
 * Isto não emite nada: copia os pagamentos do Stripe para `financas_por_faturar`, manda ao admin
 * por Telegram a lista dos que faltam e dá um link assinado para marcar cada um como faturado.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PorFaturar = {
  charge_id: string
  data: string
  valor: number
  reembolsado: number
  moeda: string
  cliente_nome: string | null
  cliente_email: string | null
  pais: string | null
  produto: string | null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const euros = (v: number, m: string) => `${v.toFixed(2).replace('.', ',')} ${m}`

/** Assinatura do link «faturado»: só quem tem o segredo do servidor o consegue gerar. */
export function assinar(chargeId: string, segredo: string): string {
  return createHmac('sha256', segredo).update(`faturado:${chargeId}`).digest('hex').slice(0, 32)
}

export function assinaturaValida(chargeId: string, t: string, segredo: string): boolean {
  const certo = Buffer.from(assinar(chargeId, segredo))
  const dado = Buffer.from(t)
  return certo.length === dado.length && timingSafeEqual(certo, dado)
}

/** A mensagem do Telegram (HTML). Vazia quando não há nada por faturar. */
export function mensagem(lista: PorFaturar[], base: string, segredo: string, max = 25): string {
  if (!lista.length) return ''
  const linhas = lista.slice(0, max).map((p) => {
    const liquido = p.valor - p.reembolsado
    const link = `${base}/api/financas/faturado?c=${encodeURIComponent(p.charge_id)}&t=${assinar(p.charge_id, segredo)}`
    const quem = [p.cliente_nome, p.cliente_email].filter(Boolean).map((x) => esc(String(x))).join(' · ') || 'cliente sem nome'
    const extra = [p.produto ? esc(p.produto) : null, p.pais, p.reembolsado ? `reembolsado ${euros(p.reembolsado, p.moeda)}` : null].filter(Boolean).join(' · ')
    return `• ${p.data} · <b>${euros(liquido, p.moeda)}</b> · ${quem}${extra ? `\n  ${extra}` : ''}\n  <a href="${link}">✅ marcar faturado</a>`
  })
  const resto = lista.length > max ? `\n…e mais ${lista.length - max}.` : ''
  return `🧾 <b>${lista.length} pagamento(s) por faturar</b>\nFatura-recibo isenta (art. 53.º) no programa certificado ou no Portal das Finanças.\n\n${linhas.join('\n')}${resto}`
}

/** Copia os pagamentos dos últimos `dias` para a tabela (não mexe nos já existentes, exceto reembolsos). */
export async function sincronizar(stripe: Stripe, db: SupabaseClient, dias = 35): Promise<number> {
  const desde = Math.floor(Date.now() / 1000) - dias * 86400
  const linhas: PorFaturar[] = []
  for await (const c of stripe.charges.list({ created: { gte: desde }, limit: 100 })) {
    if (c.status !== 'succeeded' || !c.paid) continue
    linhas.push({
      charge_id: c.id,
      data: new Date(c.created * 1000).toISOString().slice(0, 10),
      valor: c.amount / 100,
      reembolsado: (c.amount_refunded ?? 0) / 100,
      moeda: c.currency.toUpperCase(),
      cliente_nome: c.billing_details?.name ?? null,
      cliente_email: c.billing_details?.email ?? c.receipt_email ?? null,
      pais: c.billing_details?.address?.country ?? c.payment_method_details?.card?.country ?? null,
      produto: c.description ?? null,
    })
  }
  if (!linhas.length) return 0
  const { error } = await db.from('financas_por_faturar').upsert(linhas, { onConflict: 'charge_id', ignoreDuplicates: true })
  if (error) throw new Error(`financas_por_faturar: ${error.message}`)
  // Reembolsos chegam depois do pagamento: atualizar só esse campo.
  for (const l of linhas.filter((x) => x.reembolsado > 0)) {
    await db.from('financas_por_faturar').update({ reembolsado: l.reembolsado }).eq('charge_id', l.charge_id)
  }
  return linhas.length
}

/** Pendentes: não faturados e não totalmente reembolsados. */
export async function pendentes(db: SupabaseClient): Promise<PorFaturar[]> {
  const { data, error } = await db
    .from('financas_por_faturar')
    .select('charge_id, data, valor, reembolsado, moeda, cliente_nome, cliente_email, pais, produto')
    .is('faturado_em', null)
    .order('data')
  if (error) throw new Error(`pendentes: ${error.message}`)
  return (data ?? [])
    .map((d) => ({ ...d, valor: Number(d.valor), reembolsado: Number(d.reembolsado) }) as PorFaturar)
    .filter((p) => p.valor - p.reembolsado > 0.004)
}
