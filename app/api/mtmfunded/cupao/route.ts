import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { validarCupao } from '@/lib/mtmfunded/cupao'

export const dynamic = 'force-dynamic'

/**
 * Verifica um cupão contra um programa, e diz quanto fica.
 *
 * O preço vem da BASE DE DADOS, não do pedido: pedir ao browser o preço a descontar era
 * deixar qualquer pessoa dizer que o desafio custa um cêntimo.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const slug = String(body?.programa ?? '').trim()
  const codigo = String(body?.codigo ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'programa em falta' }, { status: 400 })

  const { data: programa } = await getSupabaseAdmin()
    .from('mtm_funded_programs')
    .select('preco_cents, ativo')
    .eq('slug', slug)
    .maybeSingle()
  if (!programa?.ativo) return NextResponse.json({ error: 'Programa não encontrado' }, { status: 404 })

  const r = await validarCupao(codigo, Number(programa.preco_cents))
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })

  return NextResponse.json({
    ok: true,
    codigo: r.codigo,
    descontoPct: r.descontoPct,
    centsOriginais: Number(programa.preco_cents),
    centsFinais: r.centsFinais,
  })
}
