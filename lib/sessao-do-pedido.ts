import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { jwtVerify } from 'jose'
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
 *
 * ── SEM UMA IDA À REDE POR PEDIDO ───────────────────────────────────────────────────────────
 *
 * Até 05/10 cada pedido fazia `auth.getUser(token)` — uma chamada de REDE ao Auth do Supabase —
 * incluindo as sondagens de 4–10 s do WebTrader. O JWT de acesso é assinado: validá-lo é
 * trabalho local, não uma pergunta a outro servidor.
 *
 *  · Com `SUPABASE_JWT_SECRET` (Supabase → Settings → API → JWT Secret) a assinatura verifica-se
 *    AQUI (HS256, emissor do projecto, prazo). Zero rede. Um token que não passa cai na rede —
 *    o segredo pode ter sido rodado — e só então se recusa.
 *  · Sem o segredo (hoje: o projecto é HS256 legado e o JWKS está vazio, por isso não há chave
 *    pública para verificar), o resultado de `getUser` fica 60 s em memória por token (hash do
 *    token, nunca o token): as sondagens dentro desse minuto não vão à rede. Um token expirado
 *    recusa-se sem rede (o `exp` lê-se do próprio JWT). A revogação de uma sessão pode demorar
 *    até 60 s a chegar a estas rotas — é o preço de não bater no Auth 15 vezes por minuto.
 *
 * O cookie passa pelo MESMO caminho: lê-se o access token da sessão guardada no cookie (sem rede,
 * `getSession` só descodifica) e valida-se como o Bearer. A nota do Supabase de que `getSession`
 * «não verifica» aplica-se a quem CONFIA nele — nós não: a verificação é a de cima.
 */

const CACHE_MS = 60_000
const CACHE_MAX = 5_000

/** userId por hash do token, com o prazo (o menor entre 60 s e o `exp` do token). */
const cache = new Map<string, { userId: string; ate: number }>()

/** Só para a guarda: contar as idas à rede e trocar o verificador. */
export interface DepsSessao {
  getUser: (token: string) => Promise<string | null>
  agora: () => number
  segredo: () => string | null
}

const DEPS: DepsSessao = {
  getUser: async (token) => {
    const { data } = await getSupabaseAdmin().auth.getUser(token)
    return data?.user?.id ?? null
  },
  agora: () => Date.now(),
  segredo: () => (process.env.SUPABASE_JWT_SECRET ?? '').trim() || null,
}

function emissorDoProjecto(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
  return url ? `${url}/auth/v1` : null
}

/** O corpo do JWT sem verificar (para o `exp` e o `sub`) — nunca serve de prova por si só. */
export function descodificarJwt(token: string): { sub?: unknown; exp?: unknown; iss?: unknown } | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Valida um access token do Supabase e devolve o `sub` (user id), ou null.
 * Ver o cabeçalho: segredo local → zero rede; senão cache de 60 s à frente de `getUser`.
 */
export async function validarAccessToken(token: string, deps: DepsSessao = DEPS): Promise<string | null> {
  if (!token) return null
  const agora = deps.agora()
  const corpo = descodificarJwt(token)
  if (!corpo) return null
  const exp = typeof corpo.exp === 'number' ? corpo.exp * 1000 : null
  // Expirado: recusa-se aqui, sem rede e sem cache — o cliente vai renovar e voltar com outro.
  if (exp != null && exp <= agora) return null

  const segredo = deps.segredo()
  if (segredo) {
    try {
      const iss = emissorDoProjecto()
      const { payload } = await jwtVerify(token, new TextEncoder().encode(segredo), {
        algorithms: ['HS256'],
        ...(iss ? { issuer: iss } : {}),
        currentDate: new Date(agora),
      })
      if (typeof payload.sub === 'string' && payload.sub) return payload.sub
    } catch {
      // Assinatura ou emissor fora do esperado: segue para a rede (segredo rodado?) antes de recusar.
    }
  }

  const chave = createHash('sha256').update(token).digest('hex')
  const guardado = cache.get(chave)
  if (guardado && guardado.ate > agora) return guardado.userId

  const userId = await deps.getUser(token)
  if (!userId) return null
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(chave, { userId, ate: Math.min(agora + CACHE_MS, exp ?? Infinity) })
  return userId
}

/** Só para a guarda. */
export function esquecerSessoesValidadas() {
  cache.clear()
}

export async function userIdDoPedido(request?: Request): Promise<string | null> {
  const bearer = request?.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (bearer) {
    try {
      const id = await validarAccessToken(bearer)
      if (id) return id
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
    // `getSession` lê o cookie (sem rede); a prova de que o token é bom é `validarAccessToken`.
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return null
    return await validarAccessToken(token)
  } catch {
    return null
  }
}
