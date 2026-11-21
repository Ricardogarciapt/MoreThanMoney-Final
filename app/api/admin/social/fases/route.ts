import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirLeadsSociais } from '@/lib/social-acesso'
import { resumirFases, FASE_ACCAO, type LinhaFunil } from '@/lib/vendas/funil-fases'

/**
 * As 7 fases do funil de vendas (Prospeção → Onboarding) com os 5 papéis, para o Centro Social e o CRM.
 * Só leitura. Os importados do WhatsApp não entram nas contas (não se contactam).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const negado = await exigirLeadsSociais(req)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const linhas: LinhaFunil[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await db
      .from('vendas_negocios')
      .select('estado, funil, origem, interesse, broker_uid, etiquetas, criado_em, fechado_em')
      .neq('origem', 'whatsapp_import')
      .range(de, de + 999)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    linhas.push(...((data ?? []) as LinhaFunil[]))
    if (!data || data.length < 1000) break
  }
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ count: importados }, { count: pedidos7d }, { count: fila }, { data: exec }] = await Promise.all([
    db.from('vendas_negocios').select('id', { count: 'exact', head: true }).eq('origem', 'whatsapp_import'),
    db.from('pedidos_contacto').select('id', { count: 'exact', head: true }).gte('criado_em', desde),
    db.from('aios_tasks').select('id', { count: 'exact', head: true }).like('kind', 'envio:%').eq('status', 'pendente'),
    db.from('site_settings').select('value').eq('key', 'pipeline_executor').maybeSingle(),
  ])
  const v = (typeof exec?.value === 'string' ? JSON.parse(exec.value) : exec?.value) ?? {}
  return NextResponse.json({
    ok: true,
    ...resumirFases(linhas),
    accao: FASE_ACCAO,
    importadosParados: importados ?? 0,
    pedidosMeta7d: pedidos7d ?? 0,
    envioPendentes: fila ?? 0,
    executorLigado: v.ligado === true,
  })
}
