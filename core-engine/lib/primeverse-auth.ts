// Validação de login contra a API do hub PrimeVerse (hub.primeverse.ca).
// Portado do projeto PrimeVerse (lib/auth.ts). 100% server-side — a password
// nunca fica no cliente nem no nosso storage. Sem API key: usa username/password.

export type HubUser = { id: string; email?: string; name?: string; role?: string }

export function getPrimeverseHubUrl(): string {
  return (process.env.PRIMEVERSE_HUB_URL || "https://hub.primeverse.ca").replace(/\/+$/, "")
}

/**
 * Valida credenciais contra o hub:
 *   POST /api/auth/login  { username, password }   (username = username OU email)
 *   GET  /api/auth/me     (com o cookie/token devolvido)
 * Devolve o utilizador do hub ou null.
 */
export async function validateHubLogin(username: string, password: string): Promise<HubUser | null> {
  const hub = getPrimeverseHubUrl()
  if (!username || !password) return null
  try {
    const loginRes = await fetch(`${hub}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
      redirect: "manual",
    })
    if (!loginRes.ok) return null

    const setCookies: string[] =
      (loginRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ")

    let body: Record<string, unknown> = {}
    try {
      body = (await loginRes.json()) as Record<string, unknown>
    } catch {
      /* pode não devolver JSON */
    }
    const bearer = (body.token || body.accessToken || (body.data as { token?: string } | undefined)?.token) as
      | string
      | undefined

    let user = (body.user ?? body) as Record<string, unknown> | null
    if (!user || !(user.id || user._id || user.email)) {
      if (cookieHeader || bearer) {
        const meRes = await fetch(`${hub}/api/auth/me`, {
          headers: {
            Accept: "application/json",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          cache: "no-store",
        })
        user = meRes.ok ? ((await meRes.json()) as Record<string, unknown>) : null
      }
    }
    if (!user) return null
    const id = user.id ?? user._id ?? user.email
    if (!id) return null
    return {
      id: String(id),
      email: typeof user.email === "string" ? user.email.toLowerCase() : undefined,
      name: (user.name || user.username || user.fullName) as string | undefined,
      role: typeof user.role === "string" ? user.role : undefined,
    }
  } catch {
    return null
  }
}
