/**
 * CONVERSÃO REAL (Gestão → Conversão). Só leitura. Números vindos de `vendas_negocios` e do
 * histórico `vendas_negocio_eventos`; o cálculo está em `lib/vendas/conversao.ts`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { conversaoPorOrigem, quentesSemResposta, type LinhaNegocio, type PrimeiroContacto } from '@/lib/vendas/conversao'

export const dynamic = 'force-dynamic'

const PAGINA = 1000
const TECTO = 20_000

async function tudo<T>(ler: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; de < TECTO; de += PAGINA) {
    const { data, error } = await ler(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return linhas
}

export async function GET(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.gestao_crm')
  if (ctx instanceof NextResponse) return ctx
  const db = getSupabaseAdmin()
  try {
    const [negocios, primeiros] = await Promise.all([
      tudo<LinhaNegocio>((a, b) => db.from('vendas_negocios').select('id, nome, origem, estado, criado_em').order('criado_em').range(a, b)),
      tudo<PrimeiroContacto>((a, b) => db.from('vendas_negocio_eventos').select('negocio_id, em').eq('de', 'lead').order('em').range(a, b)),
    ])
    return NextResponse.json({
      ok: true,
      porOrigem: conversaoPorOrigem(negocios, primeiros),
      quentesParados: quentesSemResposta(negocios, new Date()),
      total: negocios.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falhou' }, { status: 500 })
  }
}
