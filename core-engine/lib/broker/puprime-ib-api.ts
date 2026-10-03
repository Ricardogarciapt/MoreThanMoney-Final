/**
 * API de IB da PU Prime — o caminho automático que EXISTE, e o que ele não resolve.
 *
 * ADORMECIDO DE PROPÓSITO: nada neste ficheiro é chamado por ninguém. A chave de acesso ainda não
 * existe — tem de ser o dono a gerá-la no portal (`ibportal.puprime.org` → API Settings, com 2FA)
 * e a pô-la nas variáveis de ambiente. Fica aqui escrito para, no dia em que a chave existir, ser
 * uma linha a ligar e não uma tarde a descobrir de novo.
 *
 * O que a API DÁ (documentação «IB Access API», confirmada viva a 2026-09-24 — um POST sem
 * credenciais responde `{"code":500,"msg":"No access permission..."}`):
 *   POST /api/ibData/leadsData       — leads
 *   POST /api/ibData/accountData     — contas: UID, número de conta, plataforma, moeda, datas
 *   POST /api/ibData/allocationData  — movimentos de alocação
 * Autenticação por `userId` + `secret` NO CORPO (não em header). Janela por `startTime`/`endTime`
 * em `yyyy-MM-dd HH:mm:ss`.
 *
 * O que a API NÃO DÁ, e é o mais importante saber: **depósitos, saldo, equity e volume**. Para
 * esses continua a não haver caminho automático — é o export manual do Funds/Rebate Report (máx.
 * 90 dias por download), que é o que o importador em `/api/admin/broker-clients/importar` come.
 * Também não há relatórios agendados por email com dados financeiros, nem plataforma de
 * afiliados de terceiros: o tracking da PU Prime é interno.
 *
 * Ou seja: isto serve para UMA coisa concreta — a CORRESPONDÊNCIA DOS UIDs. Saber se o UID que um
 * lead escreveu no Telegram é mesmo uma conta nossa, sem esperar pelo próximo export. Era o que
 * faltava aos dois leads que a 2026-09-24 estavam em grace permanente com UIDs inexistentes. O
 * dinheiro continua a entrar pelo CSV.
 */

export const IB_API_BASE = process.env.PUPRIME_IB_API_BASE?.trim() || 'https://openapi.puprime.com'

export interface CredenciaisIb {
  userId: string
  secret: string
}

/** As credenciais só podem vir do ambiente. Nunca no código, nunca na base, nunca no repositório. */
export function credenciaisIb(): CredenciaisIb | null {
  const userId = process.env.PUPRIME_IB_USER_ID?.trim()
  const secret = process.env.PUPRIME_IB_SECRET?.trim()
  return userId && secret ? { userId, secret } : null
}

/** A API está ligada? Enquanto for `false`, a correspondência de UIDs vive só do export. */
export function ibApiDisponivel(): boolean {
  return credenciaisIb() != null
}

/** `yyyy-MM-dd HH:mm:ss` em UTC — o único formato que a API aceita nas janelas. */
export function formatarInstante(d: Date): string {
  const p = (n: number, c = 2) => String(n).padStart(c, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  )
}

/**
 * O corpo do pedido. As credenciais vão no corpo (é assim que a API é), por isso este objeto
 * NUNCA pode ser registado nem devolvido numa resposta — daí existir uma função só para o montar,
 * em vez de o espalhar por cada chamada.
 */
export function construirCorpo(cred: CredenciaisIb, inicio: Date, fim: Date): Record<string, string> {
  return {
    userId: cred.userId,
    secret: cred.secret,
    startTime: formatarInstante(inicio),
    endTime: formatarInstante(fim),
  }
}

export type EndpointIb = 'leadsData' | 'accountData' | 'allocationData'

export interface ContaIb {
  uid: string
  conta: string | null
  plataforma: string | null
  moeda: string | null
}

/**
 * Tira os UIDs e as contas de uma resposta de `accountData`, sem assumir a forma exata do JSON.
 *
 * Tolerante de propósito: a documentação é um PDF e a resposta real pode vir em `data`,
 * `data.list` ou já como array. Uma integração que rebenta por causa do invólucro é uma
 * integração que ninguém liga.
 */
export function normalizarContas(resposta: unknown): ContaIb[] {
  const raiz = resposta as { data?: unknown } | unknown[]
  const bruto = Array.isArray(raiz)
    ? raiz
    : Array.isArray((raiz as { data?: unknown })?.data)
      ? ((raiz as { data: unknown[] }).data)
      : Array.isArray((raiz as { data?: { list?: unknown } })?.data?.list)
        ? ((raiz as { data: { list: unknown[] } }).data.list)
        : []
  const contas: ContaIb[] = []
  for (const item of bruto) {
    const o = (item ?? {}) as Record<string, unknown>
    const uid = String(o.uid ?? o.userId ?? o.clientUid ?? o.customerId ?? '').trim()
    if (!uid) continue
    contas.push({
      uid,
      conta: o.accountNo != null ? String(o.accountNo) : o.account != null ? String(o.account) : null,
      plataforma: o.platform != null ? String(o.platform) : null,
      moeda: o.currency != null ? String(o.currency) : null,
    })
  }
  return contas
}

/**
 * Chama a API. Não é usada por nada — é o fio deixado à espera da chave.
 *
 * Devolve `null` quando não há credenciais, para quem a chamar um dia não ter de se lembrar de
 * verificar primeiro: sem chave, o comportamento correto é seguir sem ela.
 */
export async function pedirIb(
  endpoint: EndpointIb,
  inicio: Date,
  fim: Date,
  timeoutMs = 15_000,
): Promise<unknown | null> {
  const cred = credenciaisIb()
  if (!cred) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${IB_API_BASE}/api/ibData/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(construirCorpo(cred, inicio, fim)),
      signal: ctrl.signal,
    })
    return await r.json()
  } catch {
    // O segredo vai no corpo: um erro que arrastasse o pedido para os logs seria uma fuga.
    console.error('[puprime-ib] pedido falhou', endpoint)
    return null
  } finally {
    clearTimeout(t)
  }
}
