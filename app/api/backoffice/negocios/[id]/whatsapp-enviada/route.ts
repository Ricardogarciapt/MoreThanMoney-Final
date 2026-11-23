/**
 * «Marquei enviada» na fila de WhatsApp (/backoffice/pipeline/whatsapp): lead → contactado, etiqueta
 * `wa_1a_enviada` e linha no histórico do negócio. Só a gestão comercial (é quem vê a fila toda).
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehUuid } from '@/lib/backoffice-negocios'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCapacidade(request, 'bo.gestao_comercial')
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: n, error } = await db.from('vendas_negocios').select('id, estado, etiquetas').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!n) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const etiquetas = [...new Set([...((n.etiquetas as string[] | null) ?? []), 'wa_1a_enviada'])]
  const novoEstado = n.estado === 'lead' ? 'contactado' : n.estado
  const { error: e2 } = await db
    .from('vendas_negocios')
    .update({ estado: novoEstado, etiquetas, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const { error: eEv } = await db.from('vendas_negocio_eventos').insert({
    negocio_id: id, de: n.estado, para: novoEstado, por: ctx.userId, nota: 'WhatsApp: 1.ª mensagem enviada à mão (fila do back-office)',
  })
  return NextResponse.json({ ok: true, estado: novoEstado, historico: !eEv })
}
