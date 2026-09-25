/**
 * DAR E TIRAR PAPÉIS — a rota que decide quem entra no backoffice e o que lá vê.
 *
 * Isto governa dinheiro. Por isso:
 *
 * · Só admin, verificado pelo `verifyAdminAccess` da casa (cookies OU Bearer, para as apps nativas).
 * · Quem atribui fica GRAVADO (`atribuido_por`), e quem retira também. Um papel que aparece sem
 *   autor é indistinguível de um papel que alguém se deu a si mesmo.
 * · Retirar NÃO apaga a linha: marca `retirado_at`. Quando alguém disser «eu era closer em Outubro»,
 *   a resposta tem de estar na base. Uma linha apagada não responde a nada.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS, capacidadesDoPapel, ehPapel, type Papel } from '@/lib/backoffice-papeis'
import { normalizarAreas } from '@/lib/backoffice-acessos-site'

/** O catálogo + quem tem o quê. É o que o painel precisa para desenhar a lista sem adivinhar. */
export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const incluirHistorico = searchParams.get('historico') === '1'

  let query = supabase
    .from('backoffice_papeis')
    .select('id, user_id, papel, rank_key, atribuido_por, atribuido_at, retirado_at, retirado_por, nota')
    .order('atribuido_at', { ascending: false })

  // Por omissão só os activos: o histórico é grande e a pergunta do dia-a-dia é «quem é setter hoje».
  if (!incluirHistorico) query = query.is('retirado_at', null)

  const { data: linhas, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = [...new Set((linhas || []).map((l) => l.user_id as string))]

  // Os perfis e as restrições de área numa volta só — a lista mostra nome, email e acessos juntos, e
  // ir buscá-los pessoa a pessoa dava N+1 chamadas num painel que o Ricardo abre todos os dias.
  const [perfisRes, acessosRes] = await Promise.all([
    ids.length
      ? supabase.from('profiles').select('id, email, username, full_name, user_type, is_active, profile_data').in('id', ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ids.length
      ? supabase.from('backoffice_acessos_site').select('user_id, areas').in('user_id', ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const perfil = new Map((perfisRes.data || []).map((p) => [p.id as string, p]))
  const areas = new Map((acessosRes.data || []).map((a) => [a.user_id as string, normalizarAreas(a.areas)]))

  const pessoas = ids.map((id) => {
    const p = perfil.get(id) as Record<string, unknown> | undefined
    const minhas = (linhas || []).filter((l) => l.user_id === id)
    return {
      user_id: id,
      email: (p?.email as string) ?? null,
      username: (p?.username as string) ?? null,
      full_name: (p?.full_name as string) ?? null,
      user_type: (p?.user_type as string) ?? null,
      is_active: (p?.is_active as boolean) ?? false,
      /** Conta criada só para o backoffice — não é cliente, e o painel tem de o dizer. */
      so_backoffice: readSoBackoffice(p?.profile_data),
      areas_restritas: areas.get(id) ?? [],
      papeis: minhas.map((l) => ({
        id: l.id,
        papel: l.papel,
        rank_key: l.rank_key,
        atribuido_at: l.atribuido_at,
        atribuido_por: l.atribuido_por,
        retirado_at: l.retirado_at,
        retirado_por: l.retirado_por,
        nota: l.nota,
      })),
    }
  })

  return NextResponse.json({
    pessoas,
    catalogo: PAPEIS.map((p) => ({ papel: p, capacidades: capacidadesDoPapel(p) })),
  })
}

function readSoBackoffice(profileData: unknown): boolean {
  if (!profileData || typeof profileData !== 'object') return false
  return (profileData as Record<string, unknown>).backoffice_only === true
}

/**
 * Atribuir um papel a alguém que JÁ tem conta.
 *
 * Criar uma conta de raiz é outra rota (`/api/admin/backoffice/afiliado`), de propósito: criar um
 * login é uma operação com consequências diferentes de mexer numa lista, e misturá-las numa rota só
 * fazia com que um engano de nome de campo criasse uma conta sem ninguém pedir.
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

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const papel = body.papel
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : null
  const rankKey = typeof body.rank_key === 'string' ? body.rank_key.trim().slice(0, 60) : null

  if (!userId) return NextResponse.json({ error: 'Falta o utilizador' }, { status: 400 })
  // Papel fora do catálogo é recusado aqui E pelo `check` da base. Duas fechaduras porque uma delas
  // (o catálogo em código) muda com um deploy e a outra não.
  if (!ehPapel(papel)) {
    return NextResponse.json({ error: `Papel inválido. Válidos: ${PAPEIS.join(', ')}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // A conta tem de existir. Sem isto, um id mal copiado criava uma linha órfã que só se descobria
  // quando o painel mostrasse um papel sem nome nenhum ao lado.
  const { data: alvo } = await supabase.from('profiles').select('id, email').eq('id', userId).maybeSingle()
  if (!alvo) return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })

  // Já activo? Devolve-se sucesso sem escrever nada. Repetir o pedido (duplo clique no painel) não
  // pode dar erro nem reiniciar a data de atribuição — a antiguidade no papel é um facto.
  const { data: jaTem } = await supabase
    .from('backoffice_papeis')
    .select('id')
    .eq('user_id', userId)
    .eq('papel', papel as Papel)
    .is('retirado_at', null)
    .maybeSingle()

  if (jaTem) {
    return NextResponse.json({ success: true, ja_tinha: true, id: jaTem.id })
  }

  const { data: criado, error } = await supabase
    .from('backoffice_papeis')
    .insert({
      user_id: userId,
      papel,
      rank_key: rankKey,
      atribuido_por: auth.userId,
      nota,
    })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, id: criado?.id ?? null })
}

/**
 * Retirar um papel. Marca `retirado_at` e fica lá.
 *
 * O efeito é imediato: o middleware e as rotas só contam papéis com `retirado_at is null`, e não há
 * cache de permissões em sítio nenhum. Se houvesse, tirar um papel demorava a fazer efeito — e uma
 * permissão que sobrevive à decisão de a tirar é a pior espécie de bug de acessos.
 */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  const userId = searchParams.get('user_id')?.trim()
  const papel = searchParams.get('papel')?.trim()

  const supabase = getSupabaseAdmin()
  const patch = { retirado_at: new Date().toISOString(), retirado_por: auth.userId }

  // Aceita pela id da linha ou pelo par (pessoa, papel): o painel tem a id, um script de correcção
  // raramente tem.
  let query = supabase.from('backoffice_papeis').update(patch).is('retirado_at', null)

  if (id) {
    query = query.eq('id', id)
  } else if (userId && ehPapel(papel)) {
    query = query.eq('user_id', userId).eq('papel', papel)
  } else {
    return NextResponse.json({ error: 'Indica `id`, ou `user_id` + `papel` válido' }, { status: 400 })
  }

  const { data, error } = await query.select('id, user_id, papel')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Zero linhas não é sucesso silencioso: o dono clicou para tirar um papel e é preciso saber se
  // saiu. Devolver 200 vazio deixava-o a pensar que tinha retirado algo que continuava activo.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Nenhum papel activo correspondente' }, { status: 404 })
  }

  return NextResponse.json({ success: true, retirados: data })
}
