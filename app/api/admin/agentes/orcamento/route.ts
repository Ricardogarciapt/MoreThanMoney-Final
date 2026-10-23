import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerTeto, lerValor } from '@/lib/agentes/orcamento-agente'
import { orcamentosDaEquipa } from '@/lib/agentes/orcamento-db'

/**
 * O ORÇAMENTO DA EQUIPA — dar saldo, registar despesa, pôr tetos, e o livro do dinheiro.
 *
 * Os movimentos passam pela função `agentes_movimentar` (migração 207): o evento no livro e a soma
 * na linha vão na mesma transacção. Os tetos são da linha e a mudança fica no livro como `teto`.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()

  const [{ data: linhas, error }, orc] = await Promise.all([
    db.from('agentes_equipa').select('id, nome, pilar, estado, pausado').order('pilar').order('criado_em'),
    orcamentosDaEquipa(db, new Date()),
  ])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (orc.erro) return NextResponse.json({ ok: false, error: orc.erro }, { status: 500 })

  const agentes = (linhas ?? []).flatMap((l) => {
    const o = orc.orcamentos.get(String(l.id))
    return o ? [{ id: String(l.id), nome: String(l.nome ?? ''), pilar: String(l.pilar ?? ''), estado: String(l.estado ?? ''), pausado: l.pausado === true, ...o }] : []
  })
  const totais = agentes.reduce(
    (t, a) => ({ saldo: t.saldo + a.saldo, gasto_dia: t.gasto_dia + a.gasto_dia, gasto_mes: t.gasto_mes + a.gasto_mes, bloqueados: t.bloqueados + (a.bloqueado ? 1 : 0) }),
    { saldo: 0, gasto_dia: 0, gasto_mes: 0, bloqueados: 0 },
  )

  // O livro mostra os últimos 150 movimentos (32 dias chegam para o mês corrente em Lisboa).
  return NextResponse.json({ ok: true, semTetos: orc.semTetos, agentes, totais, livro: orc.movimentos.slice(0, 150) })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao ?? '')
  const id = String(body.id ?? '')
  const porque = String(body.porque ?? '').trim().slice(0, 300)
  if (!id) return NextResponse.json({ ok: false, error: 'Falta o agente.' }, { status: 400 })

  const { data: ag } = await db.from('agentes_equipa').select('id, nome').eq('id', id).maybeSingle()
  if (!ag) return NextResponse.json({ ok: false, error: 'Agente não existe.' }, { status: 404 })

  if (acao === 'carregar' || acao === 'despesa') {
    const v = lerValor(body.valor)
    if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 })
    if (acao === 'despesa' && !porque) return NextResponse.json({ ok: false, error: 'Escreve em que se gastou: fica no livro.' }, { status: 400 })
    const detalhe = acao === 'carregar' ? `dono deu saldo${porque ? ` — ${porque}` : ''}` : `despesa registada pelo dono — ${porque}`
    const { data, error } = await db.rpc('agentes_movimentar', {
      p_agente: id,
      p_tipo: acao === 'carregar' ? 'credito' : 'gastou',
      p_valor: v.valor,
      p_detalhe: detalhe,
    })
    if (error) {
      const falta = /agentes_movimentar|function/i.test(error.message) ? ' (a migração 207 já foi aplicada?)' : ''
      return NextResponse.json({ ok: false, error: `${error.message}${falta}` }, { status: 500 })
    }
    const linha = Array.isArray(data) ? data[0] : data
    const saldo = linha ? Math.max(0, Number(linha.orcamento) - Number(linha.gasto)) : null
    return NextResponse.json({
      ok: true,
      porque: `${acao === 'carregar' ? `+${v.valor} no saldo de` : `Despesa de ${v.valor} registada em`} «${ag.nome}»${saldo != null ? `. Saldo agora: ${saldo.toFixed(2)}.` : '.'}`,
    })
  }

  if (acao === 'tetos') {
    const d = lerTeto(body.teto_dia)
    const m = lerTeto(body.teto_mes)
    if (!d.ok) return NextResponse.json({ ok: false, error: `Teto do dia: ${d.erro}` }, { status: 400 })
    if (!m.ok) return NextResponse.json({ ok: false, error: `Teto do mês: ${m.erro}` }, { status: 400 })
    if (d.valor != null && m.valor != null && d.valor > m.valor) {
      return NextResponse.json({ ok: false, error: 'O teto do dia não pode passar o do mês.' }, { status: 400 })
    }
    const { error } = await db.from('agentes_equipa').update({ teto_dia: d.valor, teto_mes: m.valor, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: `${error.message} (a migração 207 já foi aplicada?)` }, { status: 500 })
    const txt = `dia ${d.valor ?? 'sem teto'} · mês ${m.valor ?? 'sem teto'}`
    await db.from('agentes_eventos').insert({ agente_id: id, tipo: 'teto', valor: d.valor, detalhe: `tetos: ${txt}${porque ? ` — ${porque}` : ''}` })
    return NextResponse.json({ ok: true, porque: `Tetos de «${ag.nome}»: ${txt}.` })
  }

  return NextResponse.json({ ok: false, error: 'Acção desconhecida.' }, { status: 400 })
}
