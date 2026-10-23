import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { PERIODOS, inicioDoPeriodo, lerCampanhasMeta, type PeriodoMeta } from '@/lib/trafego/meta'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/trafego?periodo=last_7d — o que se gastou na Meta e o que entrou no CRM na mesma
 * janela, lado a lado. O «custo por lead do CRM» é uma divisão simples (gasto ÷ negócios novos) e diz
 * isso mesmo no ecrã: sem UTM ligada a cada negócio, não se sabe que lead veio de que anúncio.
 */
export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.gestao_comercial')
  if (g.negado) return g.negado

  const pedido = request.nextUrl.searchParams.get('periodo') as PeriodoMeta | null
  const periodo: PeriodoMeta = pedido && PERIODOS.includes(pedido) ? pedido : 'last_7d'
  const { de, ate } = inicioDoPeriodo(periodo)

  const [meta, crm, agenda] = await Promise.all([
    lerCampanhasMeta(periodo),
    getSupabaseAdmin().from('vendas_negocios').select('origem').gte('criado_em', de.toISOString()).lt('criado_em', ate.toISOString()).limit(5000),
    getSupabaseAdmin().from('agenda_marcacoes').select('id, utm').gte('created_at', de.toISOString()).lt('created_at', ate.toISOString()).limit(2000),
  ])

  const porOrigem: Record<string, number> = {}
  for (const n of crm.data ?? []) porOrigem[String(n.origem ?? '—')] = (porOrigem[String(n.origem ?? '—')] ?? 0) + 1
  const marcacoes = agenda.data ?? []
  const comUtmPago = marcacoes.filter((m) => /facebook|instagram|meta|fb|ig/i.test(JSON.stringify(m.utm ?? ''))).length

  return NextResponse.json({
    periodo,
    janela: { de: de.toISOString(), ate: ate.toISOString() },
    meta,
    crm: { novos: (crm.data ?? []).length, porOrigem, erro: crm.error?.message ?? null },
    agenda: { marcacoes: marcacoes.length, comUtmMeta: comUtmPago },
    // As escritas (pausar, orçamento) são só do dono — o ecrã esconde os botões a quem não as pode fazer.
    podeEscrever: g.admin,
  })
}
