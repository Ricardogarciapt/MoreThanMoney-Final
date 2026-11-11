/**
 * Acesso ao Estúdio por separador. O admin entra em tudo; outras pessoas só nas áreas que o dono
 * lhes deu no backoffice (tabela `estudio_acessos`). Quem tem acesso trabalha na MESMA biblioteca
 * da casa (takes, ativos, guiões, projectos): é uma equipa, não contas separadas.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

import { AREAS_ESTUDIO, normalizarAreas, type AreaEstudio } from './areas'
export { AREAS_ESTUDIO, NOMES_AREAS, normalizarAreas, type AreaEstudio } from './areas'

export type QuemEstudio = { userId: string; admin: boolean; areas: Set<AreaEstudio> }

export async function quemNoEstudio(request: Request): Promise<QuemEstudio | null> {
  const userId = await userIdDoPedido(request)
  if (!userId) return null
  const db = getSupabaseAdmin()
  const [{ data: p }, { data: a }] = await Promise.all([
    db.from('profiles').select('user_type, is_active').eq('id', userId).maybeSingle(),
    db.from('estudio_acessos').select('areas').eq('user_id', userId).maybeSingle(),
  ])
  const admin = p?.user_type === 'admin' && p?.is_active !== false
  const areas = new Set<AreaEstudio>(admin ? AREAS_ESTUDIO : p?.is_active === false ? [] : normalizarAreas(a?.areas))
  return { userId, admin, areas }
}

/** Para as rotas: devolve `{ quem }` ou `{ erro }` (401 sem sessão, 403 sem a área). */
export async function exigirEstudio(request: Request, ...areas: AreaEstudio[]) {
  const quem = await quemNoEstudio(request)
  if (!quem) return { erro: NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 }) }
  if (!areas.some((a) => quem.areas.has(a))) {
    return { erro: NextResponse.json({ erro: 'Não tens acesso a esta parte do estúdio.' }, { status: 403 }) }
  }
  return { quem }
}
