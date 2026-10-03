/**
 * AS EQUIPAS — criar, renomear, arquivar, e ler quem está em cada uma.
 *
 * Isto governa QUEM VÊ DINHEIRO DE QUEM. Cada equipa dá ao líder o extracto, as leads, o pipeline e
 * as tarefas dos membros (ver `lib/backoffice-papeis.ts` e a migração 131). Por isso:
 *
 * · Só admin, pelo `verifyAdminAccess` da casa (cookies OU Bearer, para as apps nativas).
 * · Quem criou e quem arquivou ficam GRAVADOS. Uma equipa sem autor é um acesso que ninguém deu.
 * · Arquivar NÃO apaga: o acesso que já foi dado tem de ficar provado. Uma equipa apagada é
 *   indistinguível de uma equipa que nunca existiu — e é justamente sobre ela que alguém vai
 *   perguntar «quem é que andou a ver as minhas comissões».
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'

const T_EQUIPAS = 'backoffice_equipas'
const T_MEMBROS = 'backoffice_equipa_membros'

/**
 * O retrato completo para o painel: equipas activas, membros de cada uma, e os nomes.
 *
 * `?historico=1` traz também as arquivadas e as pertenças fechadas — é a resposta à pergunta «em
 * que equipa é que esta pessoa estava em Outubro», que é a razão de nada ser apagado.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  const incluirHistorico = new URL(request.url).searchParams.get('historico') === '1'

  let qEquipas = supabase
    .from(T_EQUIPAS)
    .select('id, nome, lider_id, criada_em, criada_por, arquivada_em, arquivada_por, nota')
    .order('criada_em', { ascending: true })
  if (!incluirHistorico) qEquipas = qEquipas.is('arquivada_em', null)

  const { data: equipas, error } = await qEquipas
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (equipas || []).map((e) => e.id as string)

  let membros: Array<Record<string, unknown>> = []
  if (ids.length) {
    let qMembros = supabase
      .from(T_MEMBROS)
      .select('id, equipa_id, membro_id, desde, posto_por, ate, retirado_por, nota')
      .in('equipa_id', ids)
      .order('desde', { ascending: true })
    if (!incluirHistorico) qMembros = qMembros.is('ate', null)
    const res = await qMembros
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    membros = (res.data || []) as Array<Record<string, unknown>>
  }

  // Nomes numa volta só: o painel mostra líder e membros lado a lado, e ir buscá-los um a um dava
  // N+1 chamadas num ecrã que o Ricardo abre para montar a equipa inteira de uma vez.
  const pessoas = [
    ...new Set([
      ...(equipas || []).map((e) => e.lider_id as string),
      ...membros.map((m) => String(m.membro_id)),
    ]),
  ].filter(Boolean)

  const perfis = pessoas.length
    ? (await supabase.from('profiles').select('id, email, username, full_name').in('id', pessoas)).data || []
    : []
  const nome = new Map(perfis.map((p) => [p.id as string, p]))

  const comPessoa = (id: string) => {
    const p = nome.get(id) as Record<string, unknown> | undefined
    return {
      user_id: id,
      email: (p?.email as string) ?? null,
      username: (p?.username as string) ?? null,
      full_name: (p?.full_name as string) ?? null,
    }
  }

  return NextResponse.json({
    equipas: (equipas || []).map((e) => ({
      id: e.id,
      nome: e.nome,
      lider: comPessoa(e.lider_id as string),
      criada_em: e.criada_em,
      arquivada_em: e.arquivada_em,
      nota: e.nota,
      membros: membros
        .filter((m) => m.equipa_id === e.id)
        .map((m) => ({
          id: m.id,
          desde: m.desde,
          ate: m.ate ?? null,
          nota: m.nota ?? null,
          pessoa: comPessoa(String(m.membro_id)),
        })),
    })),
  })
}

/**
 * Criar uma equipa. O líder tem de existir — e o painel avisa quando ele não tem o papel de
 * `team_leader`, mas NÃO se recusa aqui: dar o papel e montar a equipa são dois passos, e obrigar à
 * ordem certa só fazia o Ricardo perder o trabalho de montar a lista por causa de um clique que
 * falta. Sem o papel, a equipa existe e não dá acesso a nada — que é o resultado correcto.
 */
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

  const liderId = typeof body.lider_id === 'string' ? body.lider_id.trim() : ''
  const nome = typeof body.nome === 'string' ? body.nome.trim().slice(0, 120) : ''
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : null

  if (!liderId) return NextResponse.json({ error: 'Falta o líder' }, { status: 400 })
  if (!nome) return NextResponse.json({ error: 'Falta o nome da equipa' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: lider } = await supabase.from('profiles').select('id').eq('id', liderId).maybeSingle()
  if (!lider) return NextResponse.json({ error: 'Líder não encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from(T_EQUIPAS)
    .insert({ nome, lider_id: liderId, criada_por: auth.userId, nota })
    .select('id, nome')
    .maybeSingle()

  if (error) {
    // 23505 = o índice único de equipa activa. Dizer-lhe que já existe é mais útil do que o texto
    // do Postgres, e evita que ele crie «Closers PT 2» a pensar que o primeiro se perdeu.
    const duplicada = error.code === '23505'
    return NextResponse.json(
      { error: duplicada ? `Já existe uma equipa activa com o nome "${nome}" para este líder.` : error.message },
      { status: duplicada ? 409 : 500 },
    )
  }

  return NextResponse.json({ success: true, equipa: data })
}

/**
 * Renomear ou ARQUIVAR. Arquivar é o «apagar» desta tabela: fecha o acesso imediatamente (as
 * leituras em `lib/backoffice-equipas.ts` filtram por `arquivada_em is null`) e deixa a prova.
 *
 * As pertenças da equipa arquivada NÃO se fecham à mão de propósito: já não dão acesso, e fechá-las
 * escrevia uma data de saída que não aconteceu. Se a equipa for reaberta, a composição volta como
 * estava — que é o que quem reabre espera.
 */
export async function PUT(request: NextRequest) {
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

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return NextResponse.json({ error: 'Falta a equipa' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.nome === 'string' && body.nome.trim()) patch.nome = body.nome.trim().slice(0, 120)
  if (typeof body.nota === 'string') patch.nota = body.nota.trim().slice(0, 500) || null

  if (body.arquivar === true) {
    patch.arquivada_em = new Date().toISOString()
    patch.arquivada_por = auth.userId
  } else if (body.arquivar === false) {
    // Reabrir: quem reabre também fica gravado — em `nota` não, no `arquivada_por` a null e no
    // histórico da própria decisão. Reabrir volta a dar acesso, e isso tem de ser um acto explícito.
    patch.arquivada_em = null
    patch.arquivada_por = null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para mudar' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(T_EQUIPAS).update(patch).eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Equipa não encontrada' }, { status: 404 })

  return NextResponse.json({ success: true })
}
