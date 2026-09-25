/**
 * O PIPELINE: negócios, quem fez o quê, e o percurso de cada um.
 *
 * A atribuição (prospector/setter/closer/afiliado/team leader) vive aqui e é ela que depois paga —
 * por isso cada mudança de estado e cada mudança de atribuição deixam rasto em
 * `vendas_negocio_eventos`. Um negócio que muda de closer sem se saber quando é uma discussão
 * futura sobre quem fechou a venda.
 *
 * Nada nesta rota cria dinheiro: marcar um negócio como 'ganho' não gera comissão nenhuma. A
 * comissão nasce do pagamento confirmado (webhook do Stripe → `lib/vendas/livro.ts`).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS, type PapelVendas } from '@/lib/vendas/calculo'

const supabase = getSupabaseAdmin()

const ESTADOS = ['lead', 'contactado', 'qualificado', 'marcado', 'no_show', 'apresentado', 'ganho', 'perdido'] as const
type Estado = (typeof ESTADOS)[number]

const COLUNA_DO_PAPEL: Record<PapelVendas, string> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

const SELECT = `
  id, nome, email, telefone, telegram_id, comprador_id, pack_previsto, origem,
  prospector_id, setter_id, closer_id, team_leader_id, afiliado_id,
  estado, motivo_perda, nota, criado_por, criado_em, atualizado_em, fechado_em
`

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')
  const pessoa = searchParams.get('pessoa')
  const papel = searchParams.get('papel') as PapelVendas | null
  const id = searchParams.get('id')

  // Um negócio só: vem com o percurso completo, que é o que responde a «quanto tempo levou».
  if (id) {
    const [{ data: negocio, error }, { data: eventos }, { data: vendas }, { data: tarefas }] = await Promise.all([
      supabase.from('vendas_negocios').select(SELECT).eq('id', id).maybeSingle(),
      supabase.from('vendas_negocio_eventos').select('de, para, por, nota, em').eq('negocio_id', id).order('em'),
      supabase.from('vendas_vendas').select('id, fonte, referencia, pack, valor_cents, moeda, tipo, pago_em, estornada_em').eq('negocio_id', id).order('pago_em'),
      supabase.from('vendas_tarefas').select('id, titulo, responsavel_id, papel, prazo, estado, feita_em').eq('negocio_id', id).order('prazo', { nullsFirst: false }),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!negocio) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })
    return NextResponse.json({ negocio, eventos: eventos ?? [], vendas: vendas ?? [], tarefas: tarefas ?? [] })
  }

  let query = supabase.from('vendas_negocios').select(SELECT).order('atualizado_em', { ascending: false }).limit(500)
  if (estado && (ESTADOS as readonly string[]).includes(estado)) query = query.eq('estado', estado)
  if (pessoa && papel && PAPEIS_VENDAS.includes(papel)) query = query.eq(COLUNA_DO_PAPEL[papel], pessoa)
  // Pessoa sem papel: «tudo em que esta pessoa mexeu», em qualquer posição.
  else if (pessoa) {
    const ors = PAPEIS_VENDAS.map((p) => `${COLUNA_DO_PAPEL[p]}.eq.${pessoa}`).join(',')
    query = query.or(ors)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // O funil por estado vem junto: é a primeira pergunta que se faz a um pipeline, e calculá-lo no
  // cliente sobre uma lista truncada dava números errados.
  const porEstado: Record<string, number> = {}
  for (const estadoPossivel of ESTADOS) porEstado[estadoPossivel] = 0
  for (const n of data ?? []) porEstado[(n as { estado: string }).estado] = (porEstado[(n as { estado: string }).estado] ?? 0) + 1

  return NextResponse.json({ negocios: data ?? [], porEstado })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const nome = String(body.nome || '').trim()
  if (!nome) return NextResponse.json({ error: 'O negócio tem de ter um nome — é por ele que a equipa o encontra.' }, { status: 400 })

  const linha: Record<string, unknown> = {
    nome,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    telefone: body.telefone ? String(body.telefone).trim() : null,
    telegram_id: body.telegram_id ? String(body.telegram_id).trim() : null,
    comprador_id: body.comprador_id ?? null,
    pack_previsto: body.pack_previsto ?? null,
    origem: body.origem ?? null,
    estado: (ESTADOS as readonly string[]).includes(body.estado) ? (body.estado as Estado) : 'lead',
    nota: body.nota ?? null,
    criado_por: auth.userId ?? null,
  }
  for (const papel of PAPEIS_VENDAS) {
    if (body[COLUNA_DO_PAPEL[papel]]) linha[COLUNA_DO_PAPEL[papel]] = body[COLUNA_DO_PAPEL[papel]]
  }

  const { data, error } = await supabase.from('vendas_negocios').insert(linha).select(SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('vendas_negocio_eventos').insert({
    negocio_id: (data as { id: string }).id,
    de: null,
    para: linha.estado as string,
    por: auth.userId ?? null,
    nota: 'Negócio criado.',
  })

  return NextResponse.json({ negocio: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Falta o id do negócio' }, { status: 400 })

  const { data: antes } = await supabase.from('vendas_negocios').select(SELECT).eq('id', id).maybeSingle()
  if (!antes) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const mudancas: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const campo of ['nome', 'email', 'telefone', 'telegram_id', 'comprador_id', 'pack_previsto', 'origem', 'nota', 'motivo_perda']) {
    if (campo in body) mudancas[campo] = body[campo] === '' ? null : body[campo]
  }
  for (const papel of PAPEIS_VENDAS) {
    const coluna = COLUNA_DO_PAPEL[papel]
    if (coluna in body) mudancas[coluna] = body[coluna] || null
  }

  const novoEstado = body.estado as string | undefined
  if (novoEstado) {
    if (!(ESTADOS as readonly string[]).includes(novoEstado)) {
      return NextResponse.json({ error: `Estado desconhecido: ${novoEstado}` }, { status: 400 })
    }
    mudancas.estado = novoEstado
    // 'ganho' e 'perdido' fecham o negócio. Fechar é uma data, não um estado a mais: é ela que
    // permite medir quanto tempo levou do lead ao fecho.
    if (novoEstado === 'ganho' || novoEstado === 'perdido') mudancas.fechado_em = new Date().toISOString()
  }

  const { data, error } = await supabase.from('vendas_negocios').update(mudancas).eq('id', id).select(SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // O RASTO. Mudanças de estado e de atribuição ficam registadas com autor — é o que permite
  // responder, meses depois, a «quem é que fechou esta venda».
  const anterior = antes as unknown as Record<string, unknown>
  const notas: string[] = []
  for (const papel of PAPEIS_VENDAS) {
    const coluna = COLUNA_DO_PAPEL[papel]
    if (coluna in mudancas && mudancas[coluna] !== anterior[coluna]) {
      notas.push(`${papel}: ${anterior[coluna] ?? '—'} → ${mudancas[coluna] ?? '—'}`)
    }
  }
  if (novoEstado && novoEstado !== anterior.estado) {
    await supabase.from('vendas_negocio_eventos').insert({
      negocio_id: id,
      de: String(anterior.estado),
      para: novoEstado,
      por: auth.userId ?? null,
      nota: body.nota_evento ?? (novoEstado === 'perdido' ? body.motivo_perda ?? null : null),
    })
  }
  if (notas.length) {
    await supabase.from('vendas_negocio_eventos').insert({
      negocio_id: id,
      de: String(anterior.estado),
      para: String(mudancas.estado ?? anterior.estado),
      por: auth.userId ?? null,
      nota: `Atribuição alterada — ${notas.join(' · ')}`,
    })
  }

  return NextResponse.json({ negocio: data })
}
