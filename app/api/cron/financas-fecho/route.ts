/**
 * Cron diário (07:10 UTC) — FINANÇAS DA CASA.
 *
 *  1. No dia 2 de cada mês fecha o mês anterior: dossier Stripe + despesas MTM no bucket privado
 *     `financas` (fechos/YYYY-MM/) e resumo em `financas_fechos`; manda o resumo ao admin por Telegram.
 *     Lógica em `lib/financas/fecho-mes.ts`. Se o mês já está fechado, não repete.
 *  2. Todos os dias avisa o admin dos prazos fiscais a 7, 3, 1 e 0 dias (`lib/financas/prazos-fiscais.ts`).
 *
 * Não submete nada à AT nem paga nada: prepara e avisa.
 *
 *   ?mes=YYYY-MM  fecha esse mês agora (refaz se já existir)
 *   ?ensaio=1     devolve o resumo e os prazos sem gravar nem avisar
 *
 * O regime vem de `site_settings.financas_regime` ({ entidade: 'eni'|'empresa', iva: 'mensal'|'trimestral'|'isento' });
 * enquanto não for confirmado, os avisos mostram as duas hipóteses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { fecharMes, lerDespesas, lerMovimentos, lerVendas, mesAnterior, resumir, resumoEmTexto } from '@/lib/financas/fecho-mes'
import { prazosParaAvisar, type Regime } from '@/lib/financas/prazos-fiscais'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const pedido = req.nextUrl.searchParams.get('mes')
  const agora = new Date()
  const hoje = agora.toISOString().slice(0, 10)

  const { data: cfg } = await db.from('site_settings').select('value').eq('key', 'financas_regime').maybeSingle()
  const regime: Regime = { entidade: null, iva: null, ...((cfg?.value as Partial<Regime>) ?? {}) }

  const out: Record<string, unknown> = { hoje, regime }

  // 1. Fecho do mês
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : agora.getUTCDate() === 2 ? mesAnterior(agora) : null
  if (mes) {
    try {
      const stripe = getStripeClient()
      if (ensaio) {
        const [vendas, movimentos, despesas] = await Promise.all([lerVendas(stripe, mes), lerMovimentos(stripe, mes), lerDespesas(db, mes)])
        out.fecho = resumir(mes, vendas, movimentos, despesas)
      } else {
        const { data: ja } = await db.from('financas_fechos').select('mes').eq('mes', mes).maybeSingle()
        if (ja && !pedido) out.fecho = { mes, ja_fechado: true }
        else {
          const { resumo, caminhos } = await fecharMes(stripe, db, mes)
          out.fecho = { mes, ficheiros: caminhos, avisos: resumo.avisos }
          await avisarAdmin(db, `📒 ${resumoEmTexto(resumo).slice(0, 3500)}\nDossier no Supabase: bucket financas/fechos/${mes}/`)
        }
      }
    } catch (e) {
      out.fecho_erro = e instanceof Error ? e.message : String(e)
      if (!ensaio) await avisarAdmin(db, `⚠️ Fecho de ${mes} falhou: ${out.fecho_erro}. Volta a tentar amanhã com ?mes=${mes}.`)
    }
  }

  // 2. Avisos de prazos
  const avisos = prazosParaAvisar(hoje, regime)
  out.prazos = avisos
  if (avisos.length && !ensaio) {
    const linhas = avisos.map((p) => `• ${p.faltam === 0 ? 'HOJE' : `em ${p.faltam} dia(s)`} (${p.data}): ${p.titulo}${p.confirmar ? ' — confirmar com o contabilista' : ''}`)
    await avisarAdmin(db, `🗓️ Prazos fiscais\n${linhas.join('\n')}${regime.entidade ? '' : '\n(Regime por confirmar: aparecem prazos de IRS e de IRC.)'}`)
  }

  return NextResponse.json(out)
}
