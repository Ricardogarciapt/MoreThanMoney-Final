/**
 * Cron diário — RECUPERAÇÃO DE PAGAMENTOS FALHADOS (regras em lib/cobranca/recuperar-falhados.ts).
 *
 * Lê no Stripe as faturas de renovação abertas e:
 *  - em curso (o Stripe ainda vai tentar) e sem aviso → manda o aviso da 1.ª falha (rede de
 *    segurança do webhook);
 *  - esgotadas (o Stripe desistiu) há menos de 45 dias → manda UM convite para reativar;
 *  - grava o resumo (em curso, perdido, recuperado este mês) em `site_settings.cobranca_recuperacao`,
 *    que a vista «Hoje» do Telegram mostra numa linha.
 *
 * Não cancela, não corta acesso e não anula faturas.
 * `?ensaio=1` devolve o que faria sem enviar nem gravar. `?backlog=1` alarga a janela a 120 dias
 * (só para correr uma vez, com o OK do Ricardo).
 */
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } from '@/lib/mail-transport'
import { buildAvisoCartaoFalhado, juntarMarca } from '@/lib/cobranca/aviso-cartao-falhado'
import {
  acaoParaFatura,
  buildEmailReativar,
  chaveRecuperacao,
  resumir,
  type FaturaAberta,
} from '@/lib/cobranca/recuperar-falhados'
import { ehFaturaDeMarketplace } from '@/lib/marketplace/subscricao-stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CHAVE = 'cobranca_recuperacao'

type Perfil = { id: string; email: string | null; full_name: string | null; stripe_customer_id: string; profile_data: Record<string, unknown> | null }

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const backlog = req.nextUrl.searchParams.get('backlog') === '1'
  const agoraMs = Date.now()
  const db = getSupabaseAdmin()
  const stripe = getStripeClient()

  // 1. Faturas de renovação abertas (cobrança automática).
  const brutas: Stripe.Invoice[] = []
  for await (const inv of stripe.invoices.list({ status: 'open', collection_method: 'charge_automatically', limit: 100 })) {
    if (inv.billing_reason === 'subscription_cycle' && inv.attempted) brutas.push(inv)
    if (brutas.length >= 300) break
  }

  // 2. Estado guardado (marcas de envio sem perfil + config).
  const { data: guardado } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const estado = (guardado?.value && typeof guardado.value === 'object' ? guardado.value : {}) as {
    marcas?: string[]
    reativar?: boolean
  }
  const reativarLigado = estado.reativar !== false

  const clientes = [...new Set(brutas.map((i) => String(i.customer)))]
  const { data: perfis } = clientes.length
    ? await db.from('profiles').select('id, email, full_name, stripe_customer_id, profile_data').in('stripe_customer_id', clientes)
    : { data: [] as Perfil[] }
  const perfilDe = new Map(((perfis ?? []) as Perfil[]).map((p) => [p.stripe_customer_id, p]))

  const abertas: Array<FaturaAberta & { marketplace: boolean }> = []
  for (const inv of brutas) {
    if (!inv.id) continue
    const p = perfilDe.get(String(inv.customer))
    abertas.push({
      id: inv.id,
      cliente: String(inv.customer),
      email: p?.email || inv.customer_email || null,
      nome: (p?.full_name || inv.customer_name || '').trim().split(/\s+/)[0] || null,
      valorCents: inv.amount_remaining ?? inv.amount_due ?? 0,
      moeda: inv.currency ?? 'eur',
      proximaTentativaMs: inv.next_payment_attempt ? inv.next_payment_attempt * 1000 : null,
      falhouEmMs: ((inv.effective_at ?? inv.created) || 0) * 1000,
      link: inv.hosted_invoice_url ?? null,
      marketplace: await ehFaturaDeMarketplace(inv as unknown as Parameters<typeof ehFaturaDeMarketplace>[0]).catch(() => false),
    })
  }

  // 3. Decidir e enviar.
  let marcasGlobais = Array.isArray(estado.marcas) ? estado.marcas.filter((m) => typeof m === 'string') : []
  const feitos: Array<{ fatura: string; momento: string; email: string; ok: boolean }> = []
  const transporter = ensaio ? null : createMailTransporter()
  for (const f of abertas) {
    const p = perfilDe.get(f.cliente)
    const marcasPerfil = Array.isArray(p?.profile_data?.avisos_cartao) ? (p!.profile_data!.avisos_cartao as string[]) : []
    const momento = acaoParaFatura(f, [...marcasPerfil, ...marcasGlobais], agoraMs, {
      reativar: reativarLigado && !f.marketplace,
      janelaDias: backlog ? 120 : undefined,
    })
    if (!momento || !f.email) continue
    const nome = f.nome || 'Olá'
    const mail =
      momento === 'primeira'
        ? buildAvisoCartaoFalhado({ nome, momento: 'primeira', valorCents: f.valorCents, moeda: f.moeda, linkFatura: f.link })
        : buildEmailReativar({ nome, valorCents: f.valorCents })
    const chave = chaveRecuperacao(f.id, momento)
    let ok = true
    if (transporter) {
      try {
        await transporter.sendMail({
          from: mailFrom(),
          to: f.email,
          subject: mail.subject,
          html: prepareBrandedEmailHtml(mail.html),
          text: mail.text,
          attachments: brandedMailAttachments(),
        })
        marcasGlobais = juntarMarca(marcasGlobais, chave).slice(-200)
        if (p) {
          const pd = p.profile_data ?? {}
          p.profile_data = { ...pd, avisos_cartao: juntarMarca(pd.avisos_cartao, chave) }
          await db.from('profiles').update({ profile_data: p.profile_data }).eq('id', p.id)
        }
      } catch (err) {
        ok = false
        console.error('[cobranca-recuperar] envio falhou', f.id, err)
      }
    }
    feitos.push({ fatura: f.id, momento, email: f.email, ok })
  }
  transporter?.close()

  // 4. O resultado: recuperadas este mês = faturas pagas que tinham falhado pelo menos uma vez.
  const inicioMes = new Date(agoraMs)
  inicioMes.setUTCDate(1)
  inicioMes.setUTCHours(0, 0, 0, 0)
  const recuperadas: number[] = []
  for await (const inv of stripe.invoices.list({ status: 'paid', created: { gte: Math.floor(inicioMes.getTime() / 1000) - 35 * 86400 }, limit: 100 })) {
    const pagaEm = (inv.status_transitions?.paid_at ?? 0) * 1000
    if ((inv.attempt_count ?? 0) > 1 && pagaEm >= inicioMes.getTime() && inv.amount_paid > 0) recuperadas.push(inv.amount_paid)
  }
  const resumo = resumir(abertas, recuperadas, feitos.filter((x) => x.ok).length, agoraMs)

  if (!ensaio) {
    await db.from('site_settings').upsert(
      {
        key: CHAVE,
        value: { ...estado, marcas: marcasGlobais, resumo },
        description: 'Recuperação de pagamentos falhados: marcas de envio, interruptor «reativar» e o último resumo',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  }

  return NextResponse.json({ ok: true, ensaio, resumo, enviados: feitos })
}
