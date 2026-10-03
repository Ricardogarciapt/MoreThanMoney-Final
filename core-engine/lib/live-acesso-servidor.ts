import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getEducatorCookieName, verifyEducatorToken } from '@/lib/lms-educator-auth'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { ehAdminUi, podeVerReproducaoDaSala, type PerfilUi } from '@/lib/perfil-ui'

/**
 * Quem está a ver uma sala ao vivo — para o servidor decidir se entrega a reprodução.
 *
 * A regra é `podeVerReproducaoDaSala` (lib/perfil-ui). Aqui só se lê quem pede:
 *   • educador com sessão de educador (cookie próprio) → equipa: transmite, opera e testa salas;
 *   • conta MTM pelo token (apps nativas, webviews) ou pelo cookie (browser) → o perfil;
 *   • admin do site → equipa.
 *
 * A leitura é preguiçosa: numa lista só de salas `free` (a /FreeSession, sem login) não se
 * pergunta nada à base.
 */
export interface Espectador {
  perfil: PerfilUi | null
  equipa: boolean
}

export function criarLeitorDeEspectador(request: Request): () => Promise<Espectador> {
  let promessa: Promise<Espectador> | null = null
  return () => {
    if (!promessa) promessa = lerEspectador(request)
    return promessa
  }
}

async function lerEspectador(request: Request): Promise<Espectador> {
  try {
    const token = (await cookies()).get(getEducatorCookieName())?.value
    if (token && verifyEducatorToken(token)) return { perfil: null, equipa: true }
  } catch {
    /* sem cookies (fora de um pedido) — segue para a conta MTM */
  }

  const userId = await userIdDoPedido(request)
  if (!userId) return { perfil: null, equipa: false }

  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_type, member_category, membership_level, subscription_plan, is_active')
    .eq('id', userId)
    .maybeSingle()
  const perfil = (data as PerfilUi | null) ?? null
  return { perfil, equipa: ehAdminUi(perfil) }
}

export type SalaBloqueada<T> = Omit<T, 'playback_url' | 'hls_manifest_url'> & {
  playback_url: null
  hls_manifest_url: null
  reproducao_bloqueada: true
}

/** A sala sem nada que se possa reproduzir. O resto (título, educador, horário) fica — é a montra. */
export function ocultarReproducao<T extends Record<string, unknown>>(row: T): SalaBloqueada<T> {
  return { ...row, playback_url: null, hls_manifest_url: null, reproducao_bloqueada: true }
}

/** Decide e aplica, linha a linha. Só lê o espectador se houver alguma sala que não seja `free`. */
export async function aplicarAcessoAReproducao<T extends Record<string, unknown>>(
  rows: T[],
  lerEspectador: () => Promise<Espectador>,
): Promise<Array<T | SalaBloqueada<T>>> {
  const out: Array<T | SalaBloqueada<T>> = []
  for (const row of rows) {
    const tier = (row.access_tier as string | null | undefined) ?? null
    if (podeVerReproducaoDaSala(null, tier)) {
      out.push(row)
      continue
    }
    const quem = await lerEspectador()
    out.push(podeVerReproducaoDaSala(quem.perfil, tier, { equipa: quem.equipa }) ? row : ocultarReproducao(row))
  }
  return out
}
