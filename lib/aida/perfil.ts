/**
 * Perfil próprio da AIDA (pedido do Ricardo e da coordenação, 24/11/2026).
 *
 * A AIDA publica como membro da comunidade, com nome, avatar e papel de moderadora. O perfil não
 * tem login (não há conta de autenticação ligada a ele). Os posts e as mensagens dela apontam para
 * este perfil. Se o perfil ainda não existir, cai para o utilizador de sistema (resolveSystemUserId).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSystemUserId } from '@/lib/system-chat-user'

export const EMAIL_PERFIL_AIDA = 'aida@sistema.morethanmoney.invalid'

/**
 * Por enquanto devolve sempre o utilizador de sistema: `posts.user_id` e as mensagens apontam para
 * `auth.users`, e o perfil «AIDA» ainda não tem conta de autenticação. Quando essa conta existir,
 * esta função passa a devolver o id do perfil.
 */
export async function resolveAidaUserId(db: SupabaseClient): Promise<string> {
  return resolveSystemUserId(db)
}
