import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * QUEM ESTÁ A PEDIR — pelo token OU pelo cookie.
 *
 * Há duas formas de a sessão do Supabase chegar ao servidor, e as rotas tinham de conhecer as
 * duas mas conheciam só uma:
 *
 * · No BROWSER normal, o `@supabase/ssr` guarda a sessão em cookies e eles viajam sozinhos.
 * · Nas APPS NATIVAS e no MTM System, a sessão vive no armazenamento do WebView e viaja como
 *   `Authorization: Bearer`. O mesmo acontece no Safari sempre que a página corre emoldurada,
 *   porque aí os nossos cookies passam a ser de terceiros.
 *
 * Ler só o cookie dava o pior modo de falhar que há: o ecrã mostrava o nome da pessoa no
 * cabeçalho — o cliente TEM sessão — e a lista vinha vazia, porque o servidor respondia 401 e o
 * `catch` do componente transformava isso em «não há nada». Sem erro, sem ecrã de entrada, só
 * zeros. Foi o que aconteceu aos Alertas de Trading.
 *
 * O TOKEN vem primeiro porque é o sinal explícito: quem o manda está a dizer quem é. O cookie
 * fica para o browser, onde não há token nenhum para mandar.
 */
export async function userIdDoPedido(request?: Request): Promise<string | null> {
  const bearer = request?.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (bearer) {
    try {
      const { data } = await getSupabaseAdmin().auth.getUser(bearer)
      if (data?.user?.id) return data.user.id
    } catch {
      // Token expirado ou inválido: cai para o cookie em vez de recusar já. Uma sessão válida
      // no cookie não tem culpa de o token ter caducado.
    }
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            /* só leitura */
          },
        },
      },
    )
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}
