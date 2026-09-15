import { destinoDaOferta, jaTemOferta } from './oferta-clientes'

/**
 * ENTRADA DE QUEM TEM A OFERTA DE GRATIDÃO MAS NÃO TEM PACK ACTIVO (browser).
 *
 * O login (/login, pós-OAuth, /auth/finish e o do WebTrader) recusa quem não é membro registado
 * — `isRegisteredMember` — e isso incluía os clientes inactivos a quem se ofereceu a conta. Esta
 * função abre UMA excepção estreita: se o destino pedido for o WebTrader ou o link das credenciais
 * E o servidor confirmar (pela sessão, não pelo browser) que a pessoa tem uma conta com a marca da
 * oferta, devolve esse destino. Em qualquer outro caso devolve null e o login recusa como sempre.
 *
 * Nada da app abre: /app-mobile e /member-area continuam fechados pelo middleware.
 */
export async function destinoPelaOferta(accessToken: string | null | undefined, redirect: string | null | undefined): Promise<string | null> {
  const destino = destinoDaOferta(redirect)
  if (!destino || !accessToken) return null
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 5000)
    const res = await fetch('/api/mtmfunded/simulado/contas?leve=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: ctl.signal,
    }).finally(() => clearTimeout(t))
    if (!res.ok) return null
    const d = (await res.json()) as { contas?: Array<{ metricas?: Record<string, unknown> | null }> }
    return jaTemOferta(d.contas ?? []) ? destino : null
  } catch {
    return null
  }
}
