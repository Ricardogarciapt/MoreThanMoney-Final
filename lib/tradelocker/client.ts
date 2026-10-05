/**
 * Cliente da API pública TradeLocker.
 *
 * Documentação consultada (2026-09-14) — cada função cita a página de onde saiu:
 *   Índice ............ https://public-api.tradelocker.com/llms.txt
 *   Primeiros passos .. https://public-api.tradelocker.com/docs/getting-started.md
 *   Receita abrir/fechar https://public-api.tradelocker.com/recipes/open-and-close-a-position.md
 *
 * Diferenças face ao que se esperava antes de ler a documentação (ficam aqui para não voltarem):
 *   - modificar/fechar posição NÃO têm o accountId no caminho: PATCH/DELETE /trade/positions/{id}.
 *   - o fecho leva `{"qty": n}` no CORPO do DELETE (0 = fecha tudo), não na query.
 *   - colocar ordem devolve só `orderId`; o `positionId` lê-se depois em /ordersHistory.
 *   - /state e /positions devolvem ARRAYS sem nomes; os nomes das colunas vêm de /trade/config
 *     (accountDetailsConfig, positionsConfig, ordersHistoryConfig). Nada de índices fixos.
 *   - lotSize/lotStep/minLot/tickSize/tickCost não vêm na lista de instrumentos: vêm do detalhe
 *     GET /trade/instruments/{tradableInstrumentId}?routeId=… (routeId de INFO ou TRADE).
 *   - validity: IOC obrigatório em `market`, GTC em `limit`/`stop`.
 *   - a chave de programador é o header `developer-api-key` (opcional, limites mais largos).
 *
 * Quantidades: a receita da documentação abre "0.02 lots" com `qty: 0.02` — o qty é em LOTES.
 */

export type TLEnv = 'live' | 'demo'

export interface TLCredenciais {
  email: string
  password: string
  server: string
  env: TLEnv
}

export interface TLTokens {
  accessToken: string
  refreshToken: string
  /** ISO. Pode faltar — nesse caso confia-se no 401 para renovar. */
  expireDate?: string | null
}

export interface TLContaResumo {
  id: string
  name: string
  currency: string
  status: string
  accNum: string
  accountBalance: number | null
}

export interface TLRoute {
  id: number
  type: 'TRADE' | 'INFO' | string
}

export interface TLInstrumento {
  tradableInstrumentId: number
  name: string
  description?: string
  type?: string
  routes: TLRoute[]
}

export interface TLFaixa {
  leftRangeLimit: number
  tickSize?: number
  tickCost?: number
}

export interface TLDetalheInstrumento {
  name: string
  type?: string
  symbolStatus?: string
  lotSize?: number
  lotStep?: number
  minLot?: number
  maxLot?: number
  tickSize?: TLFaixa[]
  tickCost?: TLFaixa[]
  quotingCurrency?: string
  baseCurrency?: string
}

export interface TLEstadoConta {
  balance: number | null
  /** `projectedBalance` = saldo + P/L aberto (o que noutros sítios se chama equity). */
  equity: number | null
  availableFunds: number | null
  positionsCount: number | null
  bruto: Record<string, number>
}

export interface TLPosicao {
  id: string
  tradableInstrumentId: number
  routeId: number
  side: 'buy' | 'sell'
  qty: number
  avgPrice: number
  stopLossId: string | null
  takeProfitId: string | null
  openDate: number | null
  unrealizedPl: number | null
}

export interface TLOrdemPedido {
  tradableInstrumentId: number
  routeId: number
  side: 'buy' | 'sell'
  qty: number
  type: 'market' | 'limit' | 'stop'
  price?: number
  stopPrice?: number
  stopLoss?: number | null
  takeProfit?: number | null
  strategyId?: string
}

export const TL_BASE_URL: Record<TLEnv, string> = {
  live: 'https://live.tradelocker.com/backend-api',
  demo: 'https://demo.tradelocker.com/backend-api',
}

const TIMEOUT_MS = 8_000
const MAX_TENTATIVAS_429 = 2

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

// ── Erros ────────────────────────────────────────────────────────────────────────────────────

export class TradeLockerError extends Error {
  constructor(
    /** Mensagem pronta a mostrar ao cliente (PT). */
    message: string,
    readonly status: number,
    readonly codigo: 'credenciais' | 'sem_permissao' | 'nao_encontrado' | 'limite' | 'timeout' | 'rede' | 'recusado' | 'servidor',
    /** Texto original da TradeLocker, para logs (nunca contém a password). */
    readonly detalhe?: string,
  ) {
    super(message)
    this.name = 'TradeLockerError'
  }
}

/** Traduz a resposta de erro da TradeLocker para uma frase que o cliente percebe. */
export function erroAmigavel(status: number, detalhe?: string, contexto?: 'auth' | 'ordem'): TradeLockerError {
  const d = (detalhe ?? '').slice(0, 300)
  if (status === 401 || (status === 400 && contexto === 'auth')) {
    return new TradeLockerError(
      'A TradeLocker recusou o login. Confirma o email, a password, o nome do servidor e se a conta é Live ou Demo.',
      status, 'credenciais', d,
    )
  }
  if (status === 403) {
    return new TradeLockerError('A TradeLocker não deixou fazer esta operação nesta conta.', status, 'sem_permissao', d)
  }
  if (status === 404) {
    return new TradeLockerError('A TradeLocker não encontrou a conta, o instrumento ou a posição.', status, 'nao_encontrado', d)
  }
  if (status === 429) {
    return new TradeLockerError('Demasiados pedidos seguidos à TradeLocker. Tenta dentro de alguns segundos.', status, 'limite', d)
  }
  if (status >= 500) {
    return new TradeLockerError('A TradeLocker está com problemas neste momento. Tenta mais tarde.', status, 'servidor', d)
  }
  return new TradeLockerError(
    contexto === 'ordem'
      ? `A corretora recusou a ordem${d ? `: ${d}` : ''}.`
      : `Pedido recusado pela TradeLocker${d ? `: ${d}` : ''}.`,
    status, 'recusado', d,
  )
}

// ── Transporte ───────────────────────────────────────────────────────────────────────────────

export interface TLPedido {
  env: TLEnv
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  accessToken?: string
  accNum?: string | number
  contexto?: 'auth' | 'ordem'
  fetchImpl?: FetchLike
}

/** Espera respeitando `Retry-After` quando existe (segundos). */
function atraso(tentativa: number, retryAfter: string | null): number {
  const s = Number(retryAfter)
  if (Number.isFinite(s) && s > 0) return Math.min(5_000, s * 1000)
  return 600 * 2 ** tentativa
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Pedido HTTP cru. Timeout de 8s; um 429 volta a tentar (até 2×) porque um pedido limitado não
 * foi executado. Um 5xx NÃO repete ordens (POST/PATCH/DELETE): a ordem pode ter entrado e
 * repetir abria duas posições — só os GET repetem.
 */
export async function tlRequest<T>(p: TLPedido): Promise<T> {
  const f: FetchLike = p.fetchImpl ?? (globalThis.fetch as FetchLike)
  const method = p.method ?? 'GET'
  const qs = p.query
    ? '?' + Object.entries(p.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  const url = `${TL_BASE_URL[p.env]}${p.path}${qs === '?' ? '' : qs}`

  const headers: Record<string, string> = { accept: 'application/json' }
  if (p.body !== undefined) headers['content-type'] = 'application/json'
  if (p.accessToken) headers.Authorization = `Bearer ${p.accessToken}`
  if (p.accNum !== undefined && p.accNum !== null) headers.accNum = String(p.accNum)
  const devKey = process.env.TRADELOCKER_DEVELOPER_API_KEY
  if (devKey) headers['developer-api-key'] = devKey

  for (let tentativa = 0; ; tentativa++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await f(url, {
        method,
        headers,
        body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
        signal: ctrl.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      const abortado = (e as { name?: string })?.name === 'AbortError'
      if (method === 'GET' && tentativa < 1) continue
      throw abortado
        ? new TradeLockerError('A TradeLocker demorou demasiado a responder (8s).', 0, 'timeout')
        : new TradeLockerError('Sem ligação à TradeLocker. Verifica a rede e tenta de novo.', 0, 'rede', String(e))
    }
    clearTimeout(timer)

    if (res.status === 429 && tentativa < MAX_TENTATIVAS_429) {
      await dormir(atraso(tentativa, res.headers.get('retry-after')))
      continue
    }
    if (res.status >= 500 && method === 'GET' && tentativa < 1) {
      await dormir(atraso(tentativa, null))
      continue
    }

    const texto = await res.text().catch(() => '')
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      const msg = (json as { errmsg?: string; message?: string } | null)?.errmsg
        ?? (json as { message?: string } | null)?.message
        ?? texto
      throw erroAmigavel(res.status, msg, p.contexto)
    }
    // Envelope {s:'error', errmsg} com HTTP 200 também acontece.
    const env = json as { s?: string; errmsg?: string } | null
    if (env && env.s === 'error') {
      throw erroAmigavel(400, env.errmsg, p.contexto === 'auth' ? undefined : p.contexto)
    }
    return json as T
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────────────────────

/** POST /auth/jwt/token — https://public-api.tradelocker.com/reference/getjwttokens.md */
export async function autenticar(c: TLCredenciais, fetchImpl?: FetchLike): Promise<TLTokens> {
  const r = await tlRequest<TLTokens>({
    env: c.env,
    method: 'POST',
    path: '/auth/jwt/token',
    body: { email: c.email, password: c.password, server: c.server },
    contexto: 'auth',
    fetchImpl,
  })
  if (!r?.accessToken) throw erroAmigavel(401, 'sem accessToken', 'auth')
  return r
}

/** POST /auth/jwt/refresh — https://public-api.tradelocker.com/reference/getjwtrefreshtokens.md */
export async function refrescar(env: TLEnv, refreshToken: string, fetchImpl?: FetchLike): Promise<TLTokens> {
  return tlRequest<TLTokens>({ env, method: 'POST', path: '/auth/jwt/refresh', body: { refreshToken }, contexto: 'auth', fetchImpl })
}

/** GET /auth/jwt/all-accounts — https://public-api.tradelocker.com/reference/getallaccounts.md */
export async function listarContas(env: TLEnv, accessToken: string, fetchImpl?: FetchLike): Promise<TLContaResumo[]> {
  const r = await tlRequest<{ accounts?: Array<Record<string, unknown>> }>({ env, path: '/auth/jwt/all-accounts', accessToken, fetchImpl })
  return (r?.accounts ?? []).map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    currency: String(a.currency ?? ''),
    status: String(a.status ?? ''),
    accNum: String(a.accNum ?? ''),
    accountBalance: a.accountBalance != null && Number.isFinite(Number(a.accountBalance)) ? Number(a.accountBalance) : null,
  }))
}

// ── Leitura das colunas do /trade/config ─────────────────────────────────────────────────────

export interface TLConfig {
  accountDetails: string[]
  positions: string[]
  /** Colunas de /orders (ordens não finais) — `ordersConfig`. */
  orders: string[]
  ordersHistory: string[]
  rateLimits: Array<{ rateLimitType: string; measure: string; intervalNum: number; limit: number }>
}

function colunas(bloco: unknown): string[] {
  const cols = (bloco as { columns?: Array<{ id?: string } | string> } | undefined)?.columns
  if (!Array.isArray(cols)) return []
  return cols.map((c) => (typeof c === 'string' ? c : String(c?.id ?? '')))
}

/** GET /trade/config — https://public-api.tradelocker.com/reference/getconfigusingget.md */
export function lerConfig(json: unknown): TLConfig {
  const d = ((json as { d?: unknown })?.d ?? json) as Record<string, unknown>
  return {
    accountDetails: colunas(d?.accountDetailsConfig),
    positions: colunas(d?.positionsConfig),
    orders: colunas(d?.ordersConfig),
    ordersHistory: colunas(d?.ordersHistoryConfig),
    rateLimits: Array.isArray(d?.rateLimits) ? (d.rateLimits as TLConfig['rateLimits']) : [],
  }
}

/** Colunas documentadas — só se usam se o /config não trouxer as suas (nunca devia acontecer). */
const COLUNAS_CONTA_DOC = [
  'balance', 'projectedBalance', 'availableFunds', 'blockedBalance', 'cashBalance', 'unsettledCash',
  'withdrawalAvailable', 'stocksValue', 'optionValue', 'initialMarginReq', 'maintMarginReq',
  'marginWarningLevel', 'blockedForStocks', 'stockOrdersReq', 'stopOutLevel', 'warningMarginReq',
  'marginBeforeWarning', 'todayGross', 'todayNet', 'todayFees', 'todayVolume', 'todayTradesCount',
  'openGrossPnL', 'openNetPnL', 'positionsCount', 'ordersCount',
]
const COLUNAS_POSICAO_DOC = [
  'id', 'tradableInstrumentId', 'routeId', 'side', 'qty', 'avgPrice', 'stopLossId', 'takeProfitId',
  'openDate', 'unrealizedPl', 'strategyId',
]

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function lerEstado(json: unknown, cols: string[]): TLEstadoConta {
  const arr = ((json as { d?: { accountDetailsData?: unknown[] } })?.d?.accountDetailsData ?? []) as unknown[]
  const nomes = cols.length ? cols : COLUNAS_CONTA_DOC
  const bruto: Record<string, number> = {}
  nomes.forEach((n, i) => {
    const v = num(arr[i])
    if (v != null) bruto[n] = v
  })
  return {
    balance: bruto.balance ?? null,
    equity: bruto.projectedBalance ?? bruto.balance ?? null,
    availableFunds: bruto.availableFunds ?? null,
    positionsCount: bruto.positionsCount ?? null,
    bruto,
  }
}

export function lerPosicoes(json: unknown, cols: string[]): TLPosicao[] {
  const linhas = ((json as { d?: { positions?: unknown[][] } })?.d?.positions ?? []) as unknown[][]
  const nomes = cols.length ? cols : COLUNAS_POSICAO_DOC
  return linhas.map((l) => {
    const o: Record<string, unknown> = {}
    nomes.forEach((n, i) => { o[n] = l[i] })
    return {
      id: String(o.id ?? ''),
      tradableInstrumentId: Number(o.tradableInstrumentId),
      routeId: Number(o.routeId),
      side: String(o.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
      qty: Number(o.qty),
      avgPrice: Number(o.avgPrice),
      stopLossId: o.stopLossId != null ? String(o.stopLossId) : null,
      takeProfitId: o.takeProfitId != null ? String(o.takeProfitId) : null,
      openDate: num(o.openDate),
      unrealizedPl: num(o.unrealizedPl),
    }
  })
}

/** Ordem da TradeLocker (activa ou do histórico), com os nomes das colunas do /trade/config. */
export interface TLOrdem {
  id: string
  tradableInstrumentId: number
  routeId: number
  side: 'buy' | 'sell'
  qty: number
  type: string
  status: string
  price: number | null
  stopPrice: number | null
  avgPrice: number | null
  filledQty: number | null
  positionId: string | null
  stopLoss: number | null
  takeProfit: number | null
  createdDate: number | null
  lastModified: number | null
}

/** Colunas documentadas de /orders e /ordersHistory — só quando o /config não as traz. */
const COLUNAS_ORDEM_DOC = [
  'id', 'tradableInstrumentId', 'routeId', 'qty', 'side', 'type', 'status', 'filledQty', 'avgPrice',
  'price', 'stopPrice', 'validity', 'expireDate', 'createdDate', 'lastModified', 'isOpen', 'positionId',
  'stopLoss', 'stopLossType', 'takeProfit', 'takeProfitType', 'strategyId',
]

/**
 * Linhas de /orders (`d.orders`) ou /ordersHistory (`d.ordersHistory`).
 * https://public-api.tradelocker.com/reference/getorders.md · getordershistory.md
 */
export function lerOrdens(json: unknown, cols: string[], campo: 'orders' | 'ordersHistory' = 'orders'): TLOrdem[] {
  const linhas = (((json as { d?: Record<string, unknown> })?.d?.[campo]) ?? []) as unknown[][]
  const nomes = cols.length ? cols : COLUNAS_ORDEM_DOC
  const idTxt = (v: unknown) => (v == null || String(v) === '0' || String(v) === '' ? null : String(v))
  return linhas.map((l) => {
    const o: Record<string, unknown> = {}
    nomes.forEach((n, i) => { o[n] = l[i] })
    return {
      id: String(o.id ?? ''),
      tradableInstrumentId: Number(o.tradableInstrumentId),
      routeId: Number(o.routeId),
      side: String(o.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
      qty: Number(o.qty),
      type: String(o.type ?? '').toLowerCase(),
      status: String(o.status ?? '').toLowerCase(),
      price: num(o.price),
      stopPrice: num(o.stopPrice),
      avgPrice: num(o.avgPrice),
      filledQty: num(o.filledQty),
      positionId: idTxt(o.positionId),
      stopLoss: num(o.stopLoss),
      takeProfit: num(o.takeProfit),
      createdDate: num(o.createdDate),
      lastModified: num(o.lastModified),
    }
  })
}

/**
 * Corpo do POST /orders — https://public-api.tradelocker.com/reference/placeorder.md
 * Pura, para se poder testar sem rede.
 */
export function montarCorpoOrdem(o: TLOrdemPedido): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    qty: o.qty,
    routeId: o.routeId,
    side: o.side,
    tradableInstrumentId: o.tradableInstrumentId,
    type: o.type,
    // "Validity must be IOC for market orders and GTC for limit and stop orders."
    validity: o.type === 'market' ? 'IOC' : 'GTC',
    price: o.type === 'limit' ? o.price ?? 0 : 0,
  }
  if (o.type === 'stop') corpo.stopPrice = o.stopPrice ?? o.price
  if (o.stopLoss != null && o.stopLoss > 0) {
    corpo.stopLoss = o.stopLoss
    corpo.stopLossType = 'absolute'
  }
  if (o.takeProfit != null && o.takeProfit > 0) {
    corpo.takeProfit = o.takeProfit
    corpo.takeProfitType = 'absolute'
  }
  if (o.strategyId) corpo.strategyId = o.strategyId.slice(0, 31)
  return corpo
}

// ── Sessão (token em cache por ligação) ──────────────────────────────────────────────────────

const tokensEmCache = new Map<string, { tokens: TLTokens; em: number }>()
const configEmCache = new Map<string, { cfg: TLConfig; em: number }>()
const instrumentosEmCache = new Map<string, { lista: TLInstrumento[]; em: number }>()
const detalheEmCache = new Map<string, { d: TLDetalheInstrumento; em: number }>()
const loginsEmCurso = new Map<string, Promise<string>>()

const TTL_TOKEN_MS = 10 * 60_000
const TTL_CONFIG_MS = 60 * 60_000
const TTL_INSTRUMENTOS_MS = 30 * 60_000

/** Só para testes. */
export function limparCachesTradeLocker() {
  tokensEmCache.clear()
  configEmCache.clear()
  instrumentosEmCache.clear()
  detalheEmCache.clear()
  loginsEmCurso.clear()
}

/**
 * Semeia a cache com tokens obtidos antes (sessão do WebTrader sem password guardada). Se o
 * access e o refresh caducarem, o login completo falha e quem chama pede novo login.
 */
export function semearTokensTradeLocker(c: Pick<TLCredenciais, 'email' | 'server' | 'env'>, tokens: TLTokens): void {
  const chave = `${c.env}|${c.server.toLowerCase()}|${c.email.toLowerCase()}`
  if (!tokensEmCache.has(chave)) tokensEmCache.set(chave, { tokens, em: Date.now() })
}

/**
 * O COFRE — onde a ficha de sessão sobrevive ao fim do processo.
 *
 * 25/09: o Ricardo foi expulso da TradeLocker dele. A causa: a cache acima vive na MEMÓRIA, e na
 * Vercel cada execução pode cair numa instância nova — o cron da gestão automática fazia, de minuto
 * a minuto, um LOGIN COMPLETO com as credenciais do dono. A TradeLocker, com uma sessão por
 * utilizador, deitava abaixo a sessão que ele tinha aberta.
 *
 * Com um cofre, o login completo passa a ser raro: carrega-se a ficha guardada, e quando ela
 * caduca usa-se o `refreshToken` (que já era o caminho preferido do `obterToken`) em vez de voltar
 * a autenticar. Quem guarda é o servidor — este ficheiro não sabe de bases de dados nem de cifras,
 * só avisa que há ficha nova.
 */
type AoGuardarTokens = (c: Pick<TLCredenciais, 'email' | 'server' | 'env'>, t: TLTokens) => void
let cofre: AoGuardarTokens | null = null
export function definirCofreTradeLocker(fn: AoGuardarTokens | null): void { cofre = fn }

/** Tokens actuais em cache (para renovar a sessão do WebTrader do lado do cliente). */
export function tokensTradeLockerEmCache(c: Pick<TLCredenciais, 'email' | 'server' | 'env'>): TLTokens | null {
  return tokensEmCache.get(`${c.env}|${c.server.toLowerCase()}|${c.email.toLowerCase()}`)?.tokens ?? null
}

export class TradeLockerSessao {
  private readonly chave: string

  constructor(
    private readonly cred: TLCredenciais,
    readonly accountId: string,
    readonly accNum: string,
    private readonly fetchImpl?: FetchLike,
  ) {
    this.chave = `${cred.env}|${cred.server.toLowerCase()}|${cred.email.toLowerCase()}`
  }

  get env(): TLEnv {
    return this.cred.env
  }

  private tokenValido(t: { tokens: TLTokens; em: number }): boolean {
    const exp = t.tokens.expireDate ? Date.parse(t.tokens.expireDate) : NaN
    if (Number.isFinite(exp)) return exp - Date.now() > 60_000
    return Date.now() - t.em < TTL_TOKEN_MS
  }

  /** Pedidos em paralelo (config + estado) partilham o MESMO login em vez de abrir um cada. */
  private token(forcar = false): Promise<string> {
    const atual = tokensEmCache.get(this.chave)
    if (atual && !forcar && this.tokenValido(atual)) return Promise.resolve(atual.tokens.accessToken)
    const pendente = loginsEmCurso.get(this.chave)
    if (pendente) return pendente
    const p = this.obterToken(forcar).finally(() => loginsEmCurso.delete(this.chave))
    loginsEmCurso.set(this.chave, p)
    return p
  }

  private async obterToken(forcar: boolean): Promise<string> {
    const atual = tokensEmCache.get(this.chave)
    if (atual && !forcar && this.tokenValido(atual)) return atual.tokens.accessToken
    if (atual?.tokens.refreshToken) {
      try {
        const novo = await refrescar(this.cred.env, atual.tokens.refreshToken, this.fetchImpl)
        if (novo?.accessToken) {
          tokensEmCache.set(this.chave, { tokens: novo, em: Date.now() })
          // A TradeLocker pode devolver um refreshToken novo e queimar o anterior: guardar SEMPRE
          // depois de renovar, senão a próxima instância pegava num refresh já gasto e caía no
          // login completo — que é exactamente o que se está a evitar.
          try { cofre?.(this.cred, novo) } catch { /* o cofre nunca trava a sessão */ }
          return novo.accessToken
        }
      } catch {
        /* refresh caducado → login completo abaixo */
      }
    }
    const tokens = await autenticar(this.cred, this.fetchImpl)
    tokensEmCache.set(this.chave, { tokens, em: Date.now() })
    try { cofre?.(this.cred, tokens) } catch { /* o cofre nunca trava a sessão */ }
    return tokens.accessToken
  }

  /**
   * A FICHA SÓ DE LEITURA PARA O BROWSER — o accessToken e quando expira, e NADA mais.
   *
   * O feed directo do WebTrader (lib/webtrader/feed-directo) põe o browser do cliente a ler
   * cotações, velas e posições directamente na TradeLocker. Para isso precisa do Bearer. O
   * `refreshToken` fica cá: quem o tiver renova sessões para sempre, e é ele que a TradeLocker usa
   * para expulsar a sessão anterior do utilizador. Quando o access caducar o browser volta a pedir
   * ao servidor, que renova pelo caminho de sempre (cofre + refresh).
   */
  async fichaSoLeitura(): Promise<{ accessToken: string; expiraEm: string }> {
    const accessToken = await this.token()
    const t = tokensEmCache.get(this.chave)
    const exp = t?.tokens.expireDate ? Date.parse(t.tokens.expireDate) : NaN
    // Sem data da TradeLocker assume-se o mesmo TTL com que a cache a daria por válida.
    const expiraEm = Number.isFinite(exp) ? new Date(exp).toISOString() : new Date((t?.em ?? Date.now()) + TTL_TOKEN_MS).toISOString()
    return { accessToken, expiraEm }
  }

  /** Pedido autenticado; um 401 renova o token e repete UMA vez. */
  async pedido<T>(p: Omit<TLPedido, 'env' | 'accessToken' | 'accNum' | 'fetchImpl'> & { semAccNum?: boolean }): Promise<T> {
    const base = { ...p, env: this.cred.env, accNum: p.semAccNum ? undefined : this.accNum, fetchImpl: this.fetchImpl }
    try {
      return await tlRequest<T>({ ...base, accessToken: await this.token() })
    } catch (e) {
      if (e instanceof TradeLockerError && e.status === 401) {
        tokensEmCache.delete(this.chave)
        return tlRequest<T>({ ...base, accessToken: await this.token(true) })
      }
      throw e
    }
  }

  async config(): Promise<TLConfig> {
    const c = configEmCache.get(this.chave)
    if (c && Date.now() - c.em < TTL_CONFIG_MS) return c.cfg
    const cfg = lerConfig(await this.pedido<unknown>({ path: '/trade/config' }))
    configEmCache.set(this.chave, { cfg, em: Date.now() })
    return cfg
  }

  /** GET /trade/accounts/{accountId}/state — https://public-api.tradelocker.com/reference/getstate.md */
  async estado(): Promise<TLEstadoConta> {
    const [cfg, json] = await Promise.all([
      this.config(),
      this.pedido<unknown>({ path: `/trade/accounts/${this.accountId}/state` }),
    ])
    return lerEstado(json, cfg.accountDetails)
  }

  /** GET /trade/accounts/{accountId}/instruments — https://public-api.tradelocker.com/reference/getinstruments.md */
  async instrumentos(): Promise<TLInstrumento[]> {
    const k = `${this.chave}|${this.accountId}`
    const c = instrumentosEmCache.get(k)
    if (c && Date.now() - c.em < TTL_INSTRUMENTOS_MS) return c.lista
    const json = await this.pedido<{ d?: { instruments?: TLInstrumento[] } }>({ path: `/trade/accounts/${this.accountId}/instruments` })
    const lista = (json?.d?.instruments ?? []).map((i) => ({
      tradableInstrumentId: Number(i.tradableInstrumentId),
      name: String(i.name ?? ''),
      description: i.description,
      type: i.type,
      routes: Array.isArray(i.routes) ? i.routes.map((r) => ({ id: Number(r.id), type: String(r.type) })) : [],
    }))
    instrumentosEmCache.set(k, { lista, em: Date.now() })
    return lista
  }

  /** GET /trade/instruments/{id}?routeId= — https://public-api.tradelocker.com/reference/getinstrumentdetails.md */
  async detalhe(tradableInstrumentId: number, routeId: number): Promise<TLDetalheInstrumento> {
    const k = `${this.chave}|${tradableInstrumentId}`
    const c = detalheEmCache.get(k)
    if (c && Date.now() - c.em < TTL_INSTRUMENTOS_MS) return c.d
    const json = await this.pedido<{ d?: TLDetalheInstrumento }>({ path: `/trade/instruments/${tradableInstrumentId}`, query: { routeId } })
    const d = json?.d ?? ({ name: '' } as TLDetalheInstrumento)
    detalheEmCache.set(k, { d, em: Date.now() })
    return d
  }

  /** GET /trade/quotes (route INFO) — https://public-api.tradelocker.com/reference/getquotes.md */
  async cotacao(tradableInstrumentId: number, routeInfo: number): Promise<{ bid: number | null; ask: number | null }> {
    const json = await this.pedido<{ d?: { ap?: number; bp?: number } }>({
      path: '/trade/quotes',
      query: { routeId: routeInfo, tradableInstrumentId },
    })
    return { bid: num(json?.d?.bp), ask: num(json?.d?.ap) }
  }

  /** GET /trade/accounts/{accountId}/positions — https://public-api.tradelocker.com/reference/getpositions.md */
  async posicoes(): Promise<TLPosicao[]> {
    const [cfg, json] = await Promise.all([
      this.config(),
      this.pedido<unknown>({ path: `/trade/accounts/${this.accountId}/positions` }),
    ])
    return lerPosicoes(json, cfg.positions)
  }

  /** POST /trade/accounts/{accountId}/orders — https://public-api.tradelocker.com/reference/placeorder.md */
  async colocarOrdem(o: TLOrdemPedido): Promise<{ orderId: string }> {
    const json = await this.pedido<{ d?: { orderId?: string | number } }>({
      method: 'POST',
      path: `/trade/accounts/${this.accountId}/orders`,
      body: montarCorpoOrdem(o),
      contexto: 'ordem',
    })
    const orderId = json?.d?.orderId
    if (orderId === undefined || orderId === null) throw erroAmigavel(400, 'resposta sem orderId', 'ordem')
    return { orderId: String(orderId) }
  }

  /**
   * positionId de uma ordem executada — GET /trade/accounts/{id}/ordersHistory, linha com o orderId.
   * https://public-api.tradelocker.com/docs/difference-between-orderid-and-positionid.md
   * Devolve null quando a ordem ainda não encheu (limit/stop) ou o histórico não a trouxe.
   */
  async posicaoDaOrdem(orderId: string): Promise<string | null> {
    const [cfg, json] = await Promise.all([
      this.config(),
      this.pedido<{ d?: { ordersHistory?: unknown[][] } }>({ path: `/trade/accounts/${this.accountId}/ordersHistory` }),
    ])
    const cols = cfg.ordersHistory
    const iId = cols.indexOf('id')
    const iPos = cols.indexOf('positionId')
    if (iId < 0 || iPos < 0) return null
    const linha = (json?.d?.ordersHistory ?? []).find((l) => String(l[iId]) === orderId)
    const pos = linha?.[iPos]
    return pos != null && String(pos) !== '0' ? String(pos) : null
  }

  /** GET /trade/accounts/{accountId}/orders — ordens não finais (pendentes, SL/TP das posições). */
  async ordens(): Promise<TLOrdem[]> {
    const [cfg, json] = await Promise.all([
      this.config(),
      this.pedido<unknown>({ path: `/trade/accounts/${this.accountId}/orders` }),
    ])
    return lerOrdens(json, cfg.orders, 'orders')
  }

  /** GET /trade/accounts/{accountId}/ordersHistory?from= — ordens finais (executadas, canceladas). */
  async historicoOrdens(desdeMs?: number): Promise<TLOrdem[]> {
    const [cfg, json] = await Promise.all([
      this.config(),
      this.pedido<unknown>({ path: `/trade/accounts/${this.accountId}/ordersHistory`, query: { from: desdeMs } }),
    ])
    return lerOrdens(json, cfg.ordersHistory, 'ordersHistory')
  }

  /** DELETE /trade/orders/{orderId} — https://public-api.tradelocker.com/reference/cancelorder.md */
  async cancelarOrdem(orderId: string): Promise<void> {
    await this.pedido<unknown>({ method: 'DELETE', path: `/trade/orders/${orderId}`, contexto: 'ordem' })
  }

  /** PATCH /trade/orders/{orderId} — https://public-api.tradelocker.com/reference/modifyorder.md */
  async modificarOrdem(orderId: string, alteracao: { price?: number | null; stopPrice?: number | null; stopLoss?: number | null; takeProfit?: number | null }): Promise<void> {
    const body: Record<string, number | string> = {}
    if (alteracao.price != null && alteracao.price > 0) body.price = alteracao.price
    if (alteracao.stopPrice != null && alteracao.stopPrice > 0) body.stopPrice = alteracao.stopPrice
    if (alteracao.stopLoss != null && alteracao.stopLoss > 0) { body.stopLoss = alteracao.stopLoss; body.stopLossType = 'absolute' }
    if (alteracao.takeProfit != null && alteracao.takeProfit > 0) { body.takeProfit = alteracao.takeProfit; body.takeProfitType = 'absolute' }
    if (!Object.keys(body).length) return
    await this.pedido<unknown>({ method: 'PATCH', path: `/trade/orders/${orderId}`, body, contexto: 'ordem' })
  }

  /** PATCH /trade/positions/{positionId} — https://public-api.tradelocker.com/reference/modifyposition.md */
  async modificarPosicao(positionId: string, alteracao: { stopLoss?: number | null; takeProfit?: number | null }): Promise<void> {
    const body: Record<string, number> = {}
    if (alteracao.stopLoss != null && alteracao.stopLoss > 0) body.stopLoss = alteracao.stopLoss
    if (alteracao.takeProfit != null && alteracao.takeProfit > 0) body.takeProfit = alteracao.takeProfit
    if (!Object.keys(body).length) return
    await this.pedido<unknown>({ method: 'PATCH', path: `/trade/positions/${positionId}`, body, contexto: 'ordem' })
  }

  /** DELETE /trade/positions/{positionId} {qty} (0 = tudo) — https://public-api.tradelocker.com/reference/closeposition.md */
  async fecharPosicao(positionId: string, qty = 0): Promise<void> {
    await this.pedido<unknown>({ method: 'DELETE', path: `/trade/positions/${positionId}`, body: { qty }, contexto: 'ordem' })
  }
}
