/**
 * O CLIENTE DA API DO ZOHO MAIL.
 *
 * ═══ O QUE FOI VISTO A CORRER, E O QUE NÃO FOI ═════════════════════════════════════════════
 *
 * **Observado a 01/10/2026, com credenciais reais:** a troca do código por refresh token e o
 * `GET /api/organization/{zoid}/accounts`, que devolveu `{"status":{"code":200}}` e a conta
 * `geral@morethanmoney.pt`. **Ainda não observados:** criar conta e ligar reencaminhamento — as
 * duas que escrevem. Os corpos dessas vêm da documentação, e a documentação de qualquer fornecedor
 * mente por omissão.
 *
 * E já mentiu aqui: a documentação manda ir buscar o `zoid` a `GET /api/organization`, e essa
 * chamada devolve `INVALID_OAUTHSCOPE` mesmo com `ZohoMail.organization.accounts.ALL` — precisa de
 * outro scope. O `zoid` tirou-se do painel (Organização → ID da organização) e vive na variável
 * `ZOHO_MAIL_ZOID`. Quem for acrescentar funções: confirma contra a API, não contra a página.
 *
 * Por isso este ficheiro faz três coisas em vez de duas:
 *  · chama;
 *  · **verifica que a resposta é mesmo um êxito** (o Zoho devolve 200 com `status.code` 500 lá
 *    dentro — tratar o HTTP como verdade seria dar por criado o que não foi);
 *  · devolve o corpo em bruto no erro, para quem estiver a ver os registos perceber o que o
 *    fornecedor realmente disse em vez de ler «falhou».
 *
 * Regra: a chamada real manda mais do que este comentário. Se discordar da documentação, é a
 * documentação que está errada.
 *
 * ═══ AS CREDENCIAIS ════════════════════════════════════════════════════════════════════════
 *
 * Quatro variáveis, geradas pelo dono em api-console.zoho.eu (Self Client) e guardadas na Vercel:
 *   ZOHO_MAIL_CLIENT_ID / ZOHO_MAIL_CLIENT_SECRET / ZOHO_MAIL_REFRESH_TOKEN / ZOHO_MAIL_ZOID
 * Sem elas, tudo aqui devolve `{ ok: false, codigo: 'sem_credenciais' }` e o ecrã diz o que falta.
 * Nunca lança: um painel que rebenta por não ter chaves é pior do que um painel que as pede.
 */

/** Região europeia — a conta desta casa foi criada em `zoho.eu`, e os domínios não são iguais. */
const BASE = 'https://mail.zoho.eu'
const CONTAS = 'https://accounts.zoho.eu'

export interface Falha { ok: false; codigo: string; porque: string; bruto?: string }
export interface Exito<T> { ok: true; dados: T }
export type Resposta<T> = Exito<T> | Falha

function limpo(v: string | undefined): string {
  return String(v ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/[\r\n]+/g, '')
}

export function credenciaisZoho(): { creds: { clientId: string; secret: string; refresh: string; zoid: string } | null; falta: string } {
  const clientId = limpo(process.env.ZOHO_MAIL_CLIENT_ID)
  const secret = limpo(process.env.ZOHO_MAIL_CLIENT_SECRET)
  const refresh = limpo(process.env.ZOHO_MAIL_REFRESH_TOKEN)
  const zoid = limpo(process.env.ZOHO_MAIL_ZOID)
  const falta = [
    !clientId ? 'ZOHO_MAIL_CLIENT_ID' : null,
    !secret ? 'ZOHO_MAIL_CLIENT_SECRET' : null,
    !refresh ? 'ZOHO_MAIL_REFRESH_TOKEN' : null,
    !zoid ? 'ZOHO_MAIL_ZOID' : null,
  ].filter(Boolean).join(', ')
  if (falta) return { creds: null, falta }
  return { creds: { clientId, secret, refresh, zoid }, falta: '' }
}

/**
 * O token de acesso dura uma hora. Guarda-se em memória com margem de 5 minutos: pedir um token
 * novo a cada chamada é gastar o limite de pedidos do Zoho em autenticação.
 */
let cache: { token: string; expira: number } | null = null

async function token(): Promise<Resposta<string>> {
  const { creds, falta } = credenciaisZoho()
  if (!creds) return { ok: false, codigo: 'sem_credenciais', porque: `Faltam variáveis: ${falta}` }
  if (cache && cache.expira > Date.now()) return { ok: true, dados: cache.token }

  const url = `${CONTAS}/oauth/v2/token?refresh_token=${encodeURIComponent(creds.refresh)}` +
    `&client_id=${encodeURIComponent(creds.clientId)}&client_secret=${encodeURIComponent(creds.secret)}` +
    `&grant_type=refresh_token`
  try {
    const r = await fetch(url, { method: 'POST' })
    const bruto = await r.text()
    let corpo: { access_token?: string; expires_in?: number; error?: string } = {}
    try { corpo = JSON.parse(bruto) } catch { /* fica o bruto */ }
    if (!corpo.access_token) {
      return { ok: false, codigo: 'token_recusado', porque: corpo.error ?? 'O Zoho não devolveu token.', bruto: bruto.slice(0, 400) }
    }
    cache = { token: corpo.access_token, expira: Date.now() + Math.max(60, (corpo.expires_in ?? 3600) - 300) * 1000 }
    return { ok: true, dados: corpo.access_token }
  } catch (e) {
    return { ok: false, codigo: 'rede', porque: e instanceof Error ? e.message : 'Falha de rede a pedir o token.' }
  }
}

/**
 * Uma chamada à API, com a verificação que a documentação não obriga a fazer e que é a diferença
 * entre saber e supor: o Zoho responde **200 com o erro dentro do corpo** (`status.code` != 200).
 */
async function chamar<T>(caminho: string, init: RequestInit): Promise<Resposta<T>> {
  const t = await token()
  if (!t.ok) return t
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${t.dados}`,
        ...(init.headers ?? {}),
      },
    })
    const bruto = await r.text()
    let corpo: { status?: { code?: number; description?: string }; data?: T } = {}
    try { corpo = JSON.parse(bruto) } catch {
      return { ok: false, codigo: 'resposta_ilegivel', porque: `HTTP ${r.status} sem JSON.`, bruto: bruto.slice(0, 400) }
    }
    const codigo = corpo.status?.code
    if (!r.ok || (typeof codigo === 'number' && codigo !== 200)) {
      return {
        ok: false,
        codigo: `zoho_${codigo ?? r.status}`,
        porque: corpo.status?.description ?? `O Zoho recusou (HTTP ${r.status}).`,
        bruto: bruto.slice(0, 400),
      }
    }
    return { ok: true, dados: (corpo.data ?? corpo) as T }
  } catch (e) {
    return { ok: false, codigo: 'rede', porque: e instanceof Error ? e.message : 'Falha de rede.' }
  }
}

export interface ContaZoho {
  accountId?: string
  zuid?: number | string
  primaryEmailAddress?: string
  displayName?: string
  accountDisplayName?: string
  status?: string
}

/** As contas da organização. `GET /api/organization/{zoid}/accounts` */
export async function listarContas(): Promise<Resposta<ContaZoho[]>> {
  const { creds } = credenciaisZoho()
  if (!creds) return { ok: false, codigo: 'sem_credenciais', porque: 'Faltam as credenciais do Zoho.' }
  const r = await chamar<ContaZoho[]>(`/api/organization/${creds.zoid}/accounts`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, dados: Array.isArray(r.dados) ? r.dados : [] }
}

/**
 * Criar uma caixa. `POST /api/organization/{zoid}/accounts`
 * Campos obrigatórios segundo a documentação: `primaryEmailAddress` e `password`.
 *
 * A password NÃO É ESCOLHIDA AQUI e não fica em lado nenhum nosso: quem chama gera-a e entrega-a
 * à pessoa. Guardar passwords de caixas na nossa base seria criar um alvo que não temos de ter.
 */
export async function criarCaixa(p: {
  endereco: string
  password: string
  nome?: string
  apelido?: string
  mostrarComo?: string
}): Promise<Resposta<ContaZoho>> {
  const { creds } = credenciaisZoho()
  if (!creds) return { ok: false, codigo: 'sem_credenciais', porque: 'Faltam as credenciais do Zoho.' }
  return chamar<ContaZoho>(`/api/organization/${creds.zoid}/accounts`, {
    method: 'POST',
    body: JSON.stringify({
      primaryEmailAddress: p.endereco,
      password: p.password,
      ...(p.nome ? { firstName: p.nome } : {}),
      ...(p.apelido ? { lastName: p.apelido } : {}),
      ...(p.mostrarComo ? { displayName: p.mostrarComo } : {}),
      country: 'pt',
      timeZone: 'Europe/Lisbon',
      language: 'pt',
    }),
  })
}

/**
 * Ligar o reencaminhamento. `PUT /api/organization/{zoid}/accounts/{accountId}`, `mode:
 * addMailForward`.
 *
 * ATENÇÃO, e isto a documentação não diz: o destino **fica por verificar**. O Zoho manda um código
 * para o endereço de destino e o reencaminhamento só começa quando alguém o introduzir. Vimo-lo
 * acontecer à mão a 30/09 com o `morethanmoneypt@gmail.com`. Quem chamar isto tem de contar com
 * um estado «à espera de confirmação» — dizer «ligado» é mentir à pessoa que confia no ecrã.
 */
export async function ligarReencaminhamento(p: {
  accountId: string
  zuid?: string | number
  para: string
}): Promise<Resposta<unknown>> {
  const { creds } = credenciaisZoho()
  if (!creds) return { ok: false, codigo: 'sem_credenciais', porque: 'Faltam as credenciais do Zoho.' }
  return chamar(`/api/organization/${creds.zoid}/accounts/${p.accountId}`, {
    method: 'PUT',
    body: JSON.stringify({
      mode: 'addMailForward',
      mailForward: [{ mailForwardTo: p.para }],
      ...(p.zuid ? { zuid: Number(p.zuid) } : {}),
    }),
  })
}

/** Desligar. `mode: removeMailForward` — mesmo caminho. */
export async function desligarReencaminhamento(p: {
  accountId: string
  zuid?: string | number
  para: string
}): Promise<Resposta<unknown>> {
  const { creds } = credenciaisZoho()
  if (!creds) return { ok: false, codigo: 'sem_credenciais', porque: 'Faltam as credenciais do Zoho.' }
  return chamar(`/api/organization/${creds.zoid}/accounts/${p.accountId}`, {
    method: 'PUT',
    body: JSON.stringify({
      mode: 'removeMailForward',
      mailForward: [{ mailForwardTo: p.para }],
      ...(p.zuid ? { zuid: Number(p.zuid) } : {}),
    }),
  })
}
