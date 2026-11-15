import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentAccess } from '@/lib/agent-site-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { validarPedidoPV } from '@/lib/publico-virtual/regras'

/**
 * PÚBLICO VIRTUAL — a ponte entre os agentes online e o MiroFish no Mac do dono.
 *
 * Auth: Bearer AGENT_SITE_API_KEY (o Mac: aios/publico_virtual `sincronizar`) ou sessão de admin.
 *  GET              → os últimos 30 testes (sem o relatório inteiro; ?id=<uuid> devolve um com relatório).
 *  GET ?pendentes=1 → o que o Mac ainda não trouxe (só para o Mac).
 *  POST {acao:'pedir', alvo, pergunta?, texto?, url?, rondas?, pedido_por?} → novo pedido (estado 'pendente').
 *  POST {acao:'estado', id, estado:'fila'|'recusado', motivo?}              → o Mac diz que o trouxe.
 *  POST {acao:'concluir', id, estado:'feito'|'falhou', relatorio?, erro?}     → o Mac devolve o relatório.
 * Nada aqui publica nem envia: é um pedido de simulação e o seu relatório.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const T = 'publico_virtual_testes'

async function autorizar(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  return 'error' in a ? { negado: NextResponse.json({ ok: false, erro: a.error }, { status: a.status }) } : { quem: a }
}

export async function GET(req: NextRequest) {
  const a = await autorizar(req)
  if ('negado' in a) return a.negado
  const db = getSupabaseAdmin()
  const p = req.nextUrl.searchParams
  if (p.get('id')) {
    const { data, error } = await db.from(T).select('*').eq('id', p.get('id')!).maybeSingle()
    return NextResponse.json(error ? { ok: false, erro: error.message } : { ok: true, teste: data })
  }
  if (p.get('pendentes')) {
    const { data, error } = await db.from(T).select('id, alvo, url, texto, pergunta, rondas, pedido_por')
      .eq('estado', 'pendente').order('criado_em', { ascending: true }).limit(10)
    return NextResponse.json(error ? { ok: false, erro: error.message } : { ok: true, pedidos: data ?? [] })
  }
  const { data, error } = await db.from(T).select('id, alvo, url, pergunta, rondas, pedido_por, estado, motivo, criado_em, actualizado_em')
    .order('criado_em', { ascending: false }).limit(30)
  return NextResponse.json(error ? { ok: false, erro: error.message } : { ok: true, testes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const a = await autorizar(req)
  if ('negado' in a) return a.negado
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()
  const acao = String(corpo.acao ?? 'pedir')
  if (acao === 'pedir') {
    const v = validarPedidoPV(corpo)
    if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 })
    const { data, error } = await db.from(T).insert(v.pedido).select('id, estado').single()
    return NextResponse.json(error ? { ok: false, erro: error.message } : { ok: true, ...data })
  }
  const id = String(corpo.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, erro: 'id inválido' }, { status: 400 })
  const estado = String(corpo.estado ?? '')
  const agora = new Date().toISOString()
  if (acao === 'estado' && ['fila', 'recusado'].includes(estado)) {
    const { error } = await db.from(T).update({ estado, motivo: corpo.motivo ? String(corpo.motivo).slice(0, 400) : null, actualizado_em: agora })
      .eq('id', id).eq('estado', 'pendente')
    return NextResponse.json({ ok: !error, erro: error?.message })
  }
  if (acao === 'concluir' && ['feito', 'falhou'].includes(estado)) {
    const { error } = await db.from(T).update({
      estado, relatorio: corpo.relatorio ? String(corpo.relatorio).slice(0, 60000) : null,
      motivo: corpo.erro ? String(corpo.erro).slice(0, 400) : null, actualizado_em: agora,
    }).eq('id', id)
    return NextResponse.json({ ok: !error, erro: error?.message })
  }
  return NextResponse.json({ ok: false, erro: 'acção desconhecida' }, { status: 400 })
}
