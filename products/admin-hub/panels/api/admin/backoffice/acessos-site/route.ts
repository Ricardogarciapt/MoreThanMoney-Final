/**
 * A QUE PARTES DO SITE é que esta pessoa tem acesso.
 *
 * A regra que esta rota NÃO pode quebrar: a lista só APERTA. Guardar `['sinais']` para alguém não
 * lhe dá os sinais — dá-lhe, no máximo, os sinais que ele já teria direito a ver. Quem decide se há
 * direito continua a ser o `is_active` e o portão de activação, como em todas as portas do site.
 *
 * Isso vive em `lib/backoffice-acessos-site.ts` (`areasPermitidas`), e não aqui, porque a leitura é
 * feita em quatro sítios (middleware, páginas, rotas, apps) e uma regra repetida quatro vezes é uma
 * regra que vai divergir. Esta rota só guarda a escolha.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { AREAS_SITE, AREA_NOME, normalizarAreas } from '@/lib/backoffice-acessos-site'

/** O catálogo das áreas + a escolha guardada para uma pessoa (se `user_id` vier). */
export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const userId = new URL(request.url).searchParams.get('user_id')?.trim()
  const catalogo = AREAS_SITE.map((a) => ({ area: a, nome: AREA_NOME[a] }))

  if (!userId) return NextResponse.json({ catalogo })

  const { data } = await getSupabaseAdmin()
    .from('backoffice_acessos_site')
    .select('areas, definido_por, atualizado_at, nota')
    .eq('user_id', userId)
    .maybeSingle()

  return NextResponse.json({
    catalogo,
    // Lista vazia = SEM restrição, e não «sem acesso a nada». A diferença tem de chegar ao painel,
    // senão o Ricardo lê «vazio» como «bloqueado» e vai ligar áreas que já estavam ligadas.
    areas: normalizarAreas(data?.areas),
    sem_restricao: !data || normalizarAreas(data.areas).length === 0,
    definido_por: data?.definido_por ?? null,
    atualizado_at: data?.atualizado_at ?? null,
    nota: data?.nota ?? null,
  })
}

/** Guardar a escolha. Lista vazia (ou `areas: null`) remove a restrição. */
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

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  if (!userId) return NextResponse.json({ error: 'Falta o utilizador' }, { status: 400 })

  // Áreas fora do catálogo são DEITADAS FORA em silêncio, não recusadas: um nome novo escrito à mão
  // seria guardado, nenhuma porta o conheceria, e o painel mostrava um acesso que não existe.
  const areas = normalizarAreas(body.areas)
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : null

  const supabase = getSupabaseAdmin()

  const { data: alvo } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!alvo) return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })

  const { error } = await supabase.from('backoffice_acessos_site').upsert(
    {
      user_id: userId,
      areas,
      definido_por: auth.userId,
      atualizado_at: new Date().toISOString(),
      nota,
    },
    { onConflict: 'user_id' },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ignoradas = Array.isArray(body.areas)
    ? (body.areas as unknown[]).filter((a) => typeof a === 'string' && !areas.includes(a as never))
    : []

  return NextResponse.json({
    success: true,
    areas,
    sem_restricao: areas.length === 0,
    // Devolvido em vez de escondido: se o painel mandou uma área que não existe, quem clicou tem de
    // saber que ela não foi guardada.
    ignoradas,
  })
}
