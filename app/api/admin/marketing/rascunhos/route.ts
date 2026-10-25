import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { aplicarCampanha, aplicarLancamento, validarLancamento } from '@/lib/marketing/rascunhos'
import type { NovaCampanhaMeta } from '@/lib/trafego/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET → os rascunhos do assistente (os por decidir primeiro).
 * POST { id, accao: 'aplicar' | 'descartar' } → só o dono. Aplicar cria tudo desligado/em pausa.
 */
export async function GET(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  const { data, error } = await getSupabaseAdmin()
    .from('marketing_rascunhos')
    .select('id, tipo, titulo, conteudo, estado, resultado, origem, criado_em, decidido_em')
    .order('criado_em', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ordem = (e: string) => (e === 'rascunho' ? 0 : 1)
  return NextResponse.json({ rascunhos: (data ?? []).sort((a, b) => ordem(a.estado) - ordem(b.estado)) })
}

export async function POST(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.gestao_comercial')
  if (g.negado) return g.negado
  if (!g.admin) return NextResponse.json({ error: 'Só o dono aplica ou descarta rascunhos.' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as { id?: string; accao?: string }
  const db = getSupabaseAdmin()
  const { data: r } = await db.from('marketing_rascunhos').select('id, tipo, conteudo, estado').eq('id', String(b.id ?? '')).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Rascunho não encontrado.' }, { status: 404 })
  if (r.estado === 'aplicado') return NextResponse.json({ error: 'Já foi aplicado.' }, { status: 409 })

  const decidir = (estado: string, resultado: unknown) =>
    db.from('marketing_rascunhos').update({ estado, resultado, decidido_em: new Date().toISOString(), decidido_por: g.userId }).eq('id', r.id)

  if (b.accao === 'descartar') {
    await decidir('descartado', null)
    return NextResponse.json({ ok: true })
  }
  if (b.accao !== 'aplicar') return NextResponse.json({ error: 'Acção desconhecida.' }, { status: 400 })

  try {
    let resultado: Record<string, unknown>
    if (r.tipo === 'lancamento') {
      const v = validarLancamento(r.conteudo)
      if (!v.ok) throw new Error(`Kit incompleto: ${v.erros.join(', ')}.`)
      resultado = await aplicarLancamento(v.kit)
    } else {
      resultado = await aplicarCampanha(r.conteudo as NovaCampanhaMeta)
    }
    await decidir('aplicado', resultado)
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    await decidir('falhou', { erro })
    return NextResponse.json({ error: erro }, { status: 502 })
  }
}
