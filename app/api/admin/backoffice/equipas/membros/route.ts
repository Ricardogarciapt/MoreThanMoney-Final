/**
 * PÔR E TIRAR PESSOAS DE UMA EQUIPA.
 *
 * Cada linha aqui é um acesso: a partir do momento em que a Ana entra na equipa do João, o João
 * passa a ver o extracto, as leads, o pipeline e as tarefas dela. É o efeito mais forte de todo o
 * backoffice, e por isso esta rota é a mais chata de propósito:
 *
 * · Só admin, e quem pôs / quem retirou ficam gravados.
 * · Tirar é `ate` preenchido, NUNCA um delete. «O João viu as minhas comissões em Outubro» tem de
 *   ter resposta na base, com datas.
 * · Uma pessoa só pode estar numa equipa activa (índice único da migração 131). Mudar de equipa é
 *   um pedido só — fecha a anterior e abre a nova — porque deixar isso ao painel garantia o estado
 *   em que ela ficava fora das duas se o segundo clique falhasse.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'

const T_EQUIPAS = 'backoffice_equipas'
const T_MEMBROS = 'backoffice_equipa_membros'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const equipaId = typeof body.equipa_id === 'string' ? body.equipa_id.trim() : ''
  const membroId = typeof body.membro_id === 'string' ? body.membro_id.trim() : ''
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : null
  // Mover alguém que já está noutra equipa. Por omissão RECUSA-SE: tirar uma pessoa a um líder sem
  // ele saber é o tipo de coisa que se faz por engano ao clicar na linha errada.
  const mover = body.mover === true

  if (!equipaId || !membroId) {
    return NextResponse.json({ error: 'Falta a equipa ou a pessoa' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: equipa } = await supabase
    .from(T_EQUIPAS)
    .select('id, nome, lider_id, arquivada_em')
    .eq('id', equipaId)
    .maybeSingle()
  if (!equipa) return NextResponse.json({ error: 'Equipa não encontrada' }, { status: 404 })
  // Equipa arquivada não recebe gente: era escrever uma pertença que não dá acesso a nada e deixar
  // o painel a mostrar uma equipa com membros que ninguém lidera.
  if (equipa.arquivada_em) {
    return NextResponse.json({ error: 'Esta equipa está arquivada. Reabre-a primeiro.' }, { status: 409 })
  }
  if (equipa.lider_id === membroId) {
    return NextResponse.json(
      { error: 'O líder não entra na sua própria equipa — já se vê a si pelo âmbito próprio.' },
      { status: 400 },
    )
  }

  const { data: pessoa } = await supabase.from('profiles').select('id').eq('id', membroId).maybeSingle()
  if (!pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  // Já está em alguma equipa activa?
  const { data: actual } = await supabase
    .from(T_MEMBROS)
    .select('id, equipa_id')
    .eq('membro_id', membroId)
    .is('ate', null)
    .maybeSingle()

  if (actual) {
    // Repetir o pedido (duplo clique) não pode dar erro nem reiniciar a data de entrada: a
    // antiguidade na equipa é um facto.
    if (actual.equipa_id === equipaId) {
      return NextResponse.json({ success: true, ja_estava: true, id: actual.id })
    }
    if (!mover) {
      const { data: outra } = await supabase.from(T_EQUIPAS).select('nome').eq('id', actual.equipa_id).maybeSingle()
      return NextResponse.json(
        {
          error: `Esta pessoa já está na equipa "${outra?.nome ?? '(outra)'}". Confirma a mudança para a tirar de lá.`,
          precisa_mover: true,
        },
        { status: 409 },
      )
    }
    const { error: fecharErro } = await supabase
      .from(T_MEMBROS)
      .update({ ate: new Date().toISOString(), retirado_por: auth.userId, nota: 'Movida para outra equipa' })
      .eq('id', actual.id)
    if (fecharErro) {
      return NextResponse.json({ error: `Não foi possível tirá-la da equipa anterior: ${fecharErro.message}` }, { status: 500 })
    }
  }

  const { data, error } = await supabase
    .from(T_MEMBROS)
    .insert({ equipa_id: equipaId, membro_id: membroId, posto_por: auth.userId, nota })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data?.id ?? null })
}

/**
 * Tirar da equipa. O acesso fecha no pedido seguinte: não há cache de equipas em sítio nenhum, e um
 * acesso que sobrevive à decisão de o tirar é a pior espécie de bug de permissões.
 */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  const membroId = searchParams.get('membro_id')?.trim()
  const motivo = searchParams.get('motivo')?.trim().slice(0, 500) || null

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from(T_MEMBROS)
    .update({ ate: new Date().toISOString(), retirado_por: auth.userId, ...(motivo ? { nota: motivo } : {}) })
    .is('ate', null)

  // Pela id da linha (o painel tem-na) ou pela pessoa (um script de correcção raramente tem).
  if (id) query = query.eq('id', id)
  else if (membroId) query = query.eq('membro_id', membroId)
  else return NextResponse.json({ error: 'Indica `id` ou `membro_id`' }, { status: 400 })

  const { data, error } = await query.select('id, membro_id, equipa_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Zero linhas não é sucesso silencioso: o dono clicou para tirar um acesso e precisa de saber se
  // saiu. Um 200 vazio deixava-o a pensar que tinha fechado algo que continuava aberto.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Nenhuma pertença activa correspondente' }, { status: 404 })
  }

  return NextResponse.json({ success: true, retirados: data })
}
