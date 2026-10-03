/**
 * QUEM ESTÁ DO OUTRO LADO — a sessão do membro, pelos dois caminhos.
 *
 * O `getAuthenticatedUser` de `admin-api-helpers.ts` só lê COOKIES. As apps nativas (iOS e
 * Android) não têm cookies de sessão: mandam o access token do Supabase no cabeçalho. O
 * `verifyAdminAccess` já aprendeu isso da maneira difícil — enquanto só lia cookies, todas as
 * rotas admin devolviam 403 à app nativa e parecia bug de UI.
 *
 * Como o marketplace nasce ao mesmo tempo no site e na app-mobile, herdar só o caminho dos
 * cookies era garantir que metade dos ecrãs nascia vazia. Os dois caminhos ficam aqui, e a id
 * vem SEMPRE do `getUser` (que valida a assinatura do token) — nunca do corpo do pedido.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { PerfilUi } from '@/lib/perfil-ui'

export type SessaoMembro = { userId: string; email: string | null; perfil: PerfilUi } | null

/**
 * A sessão e o perfil, numa ida só.
 *
 * O perfil vem com os QUATRO campos que `perfil-ui.ts` lê. Trazer menos é a armadilha do VIP:
 * ele está marcado em `user_type`, em `member_category` e às vezes em `membership_level`, e quem
 * traz só um campo esconde metade do que a pessoa comprou.
 */
export async function sessaoDoMembro(req?: Request): Promise<SessaoMembro> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (lista) => lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      },
    )

    let { data: { user } } = await supabase.auth.getUser()

    if (!user && req) {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
      if (token) {
        const { data } = await supabase.auth.getUser(token)
        user = data?.user ?? null
      }
    }
    if (!user) return null

    const { data: perfil } = await getSupabaseAdmin()
      .from('profiles')
      .select('user_type, member_category, membership_level, subscription_plan, is_active')
      .eq('id', user.id)
      .maybeSingle()

    return { userId: user.id, email: user.email ?? null, perfil: (perfil ?? {}) as PerfilUi }
  } catch {
    return null
  }
}
