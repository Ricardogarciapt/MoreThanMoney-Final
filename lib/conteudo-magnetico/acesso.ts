/**
 * Quem está a pedir e o que pode usar.
 *
 * A página vive atrás do guarda de membros (middleware); as rotas voltam a confirmar a sessão
 * porque também são chamadas de dentro da app-mobile e das nativas, onde o cookie não chega
 * (ver `lib/sessao-do-pedido`). As marcas da casa (Ricardo Garcia, More Than Money) e o render
 * sem limite são só para admins.
 *
 * 10/11 (Ricardo): o Estúdio é só dele — todas as rotas do Conteúdo Magnético recusam (403)
 * quem não é admin.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

export type Quem = { userId: string; admin: boolean }

export async function quemPede(request: Request): Promise<Quem | null> {
  const userId = await userIdDoPedido(request)
  if (!userId) return null
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_type, is_active')
    .eq('id', userId)
    .maybeSingle()
  return { userId, admin: data?.user_type === 'admin' && data?.is_active !== false }
}

/** Renders de vídeo por dia para quem não é admin (o motor é uma máquina nossa, partilhada). */
export const RENDERS_POR_DIA_MEMBRO = 2

/** O segredo do motor de render (o mesmo CRON_SECRET dos crons). */
export function ehMotor(request: Request): boolean {
  const s = process.env.CRON_SECRET?.trim()
  return !!s && request.headers.get('authorization') === `Bearer ${s}`
}
