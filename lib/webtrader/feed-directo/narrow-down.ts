/**
 * O PEDIDO DE TOKEN RESTRITO À METAAPI — puro, para a guarda poder provar o caso mau.
 *
 * `POST https://profile-api-v1.agiliumtrade.agiliumtrade.ai/users/current/narrow-down-auth-token?validity-in-hours=N`
 * com o header `auth-token: <chave mestra>` devolve um token que só vê UMA conta e só lê. É esse
 * que vai para o browser. A regra que este ficheiro guarda: o corpo NUNCA contém o papel `trade`
 * nem a aplicação `trading-account-management-api` — um token com isso no browser permitia a um
 * cliente (ou a quem lhe roubasse o separador) negociar ou apagar a conta fora do nosso servidor.
 */

export const NARROW_DOWN_URL = 'https://profile-api-v1.agiliumtrade.agiliumtrade.ai/users/current/narrow-down-auth-token'
export const VALIDADE_TOKEN_HORAS = 2

export interface CorpoNarrowDown {
  applications: string[]
  roles: string[]
  resources: Array<{ entity: 'account'; id: string }>
}

/** Formato simples (papel `reader`): cobre ler a conta, estado do terminal, streaming e histórico. */
export function corpoNarrowDown(accountId: string): CorpoNarrowDown {
  const id = String(accountId ?? '').trim()
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) throw new Error('accountId MetaApi inválido')
  return { applications: ['metaapi-api'], roles: ['reader'], resources: [{ entity: 'account', id }] }
}

const PROIBIDOS = ['trade', 'writer', 'trading-account-management-api']

/**
 * A guarda: verdadeiro só se o corpo não dá escrita nenhuma. Olha para TODO o JSON (papéis,
 * aplicações e `methodGroups`, se alguém mudar para o formato detalhado) e não só para `roles`.
 */
export function corpoSoLeitura(corpo: unknown): boolean {
  const txt = JSON.stringify(corpo ?? {}).toLowerCase()
  if (PROIBIDOS.some((p) => new RegExp(`"${p}"`).test(txt))) return false
  const c = corpo as Partial<CorpoNarrowDown> | null
  if (!c || !Array.isArray(c.roles) || !c.roles.length) return false
  if (c.roles.some((r) => r !== 'reader')) return false
  if (!Array.isArray(c.resources) || c.resources.length !== 1 || c.resources[0]?.entity !== 'account') return false
  return true
}

/** Resposta do narrow-down: o token pode vir como `{token}`, `{authToken}` ou texto puro. */
export function lerTokenDaResposta(corpo: unknown): string | null {
  if (typeof corpo === 'string') return /^[\w.-]{20,}$/.test(corpo.trim()) ? corpo.trim() : null
  const o = corpo as { token?: unknown; authToken?: unknown } | null
  const t = o?.token ?? o?.authToken
  return typeof t === 'string' && t.length > 20 ? t : null
}
