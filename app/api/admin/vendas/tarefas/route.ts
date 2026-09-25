/**
 * TAREFAS da equipa de vendas: o que cada um tem para fazer e o que já fez.
 *
 * Deliberadamente pequeno — não é um CRM, é a lista de quem vende. Quem quiser relatórios de
 * actividade tem-nos em `/api/admin/vendas/relatorios`; aqui é só a lista e o «feito».
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS, type PapelVendas } from '@/lib/vendas/calculo'

const supabase = getSupabaseAdmin()

const SELECT =
  'id, titulo, descricao, responsavel_id, negocio_id, papel, prazo, estado, feita_em, criado_por, criado_em, atualizado_em'

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const pessoa = searchParams.get('pessoa')
  const estado = searchParams.get('estado') ?? 'aberta'
  const negocio = searchParams.get('negocio')

  let query = supabase.from('vendas_tarefas').select(SELECT).order('prazo', { nullsFirst: false }).limit(500)
  if (pessoa) query = query.eq('responsavel_id', pessoa)
  if (negocio) query = query.eq('negocio_id', negocio)
  if (estado !== 'todas') query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // «Atrasada» é uma leitura, não um estado guardado: guardá-lo obrigava a um cron a mexer em
  // linhas que ninguém tocou, e a lista ficava errada entre as duas passagens.
  const hoje = new Date().toISOString().slice(0, 10)
  const tarefas = (data ?? []).map((t) => {
    const linha = t as unknown as Record<string, unknown>
    return { ...linha, atrasada: linha.estado === 'aberta' && !!linha.prazo && String(linha.prazo) < hoje }
  })

  return NextResponse.json({ tarefas })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const titulo = String(body.titulo || '').trim()
  const responsavel = String(body.responsavel_id || '')
  if (!titulo) return NextResponse.json({ error: 'A tarefa tem de dizer o que é para fazer.' }, { status: 400 })
  if (!responsavel) return NextResponse.json({ error: 'Uma tarefa sem responsável não é de ninguém.' }, { status: 400 })

  const papel = body.papel as PapelVendas | undefined
  const { data, error } = await supabase
    .from('vendas_tarefas')
    .insert({
      titulo,
      descricao: body.descricao ?? null,
      responsavel_id: responsavel,
      negocio_id: body.negocio_id ?? null,
      papel: papel && PAPEIS_VENDAS.includes(papel) ? papel : null,
      prazo: body.prazo ?? null,
      criado_por: auth.userId ?? null,
    })
    .select(SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarefa: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Falta o id da tarefa' }, { status: 400 })

  const mudancas: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const campo of ['titulo', 'descricao', 'prazo', 'negocio_id', 'responsavel_id']) {
    if (campo in body) mudancas[campo] = body[campo] === '' ? null : body[campo]
  }
  if (body.estado) {
    if (!['aberta', 'feita', 'cancelada'].includes(body.estado)) {
      return NextResponse.json({ error: `Estado desconhecido: ${body.estado}` }, { status: 400 })
    }
    mudancas.estado = body.estado
    // A data do «feito» só existe quando está feito. Reabrir uma tarefa limpa-a, senão ficava a
    // dizer que foi feita numa data em que não estava.
    mudancas.feita_em = body.estado === 'feita' ? new Date().toISOString() : null
  }

  const { data, error } = await supabase.from('vendas_tarefas').update(mudancas).eq('id', id).select(SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarefa: data })
}
