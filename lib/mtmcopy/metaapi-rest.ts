/**
 * METAAPI PELO REST — o caminho RÁPIDO, para quando alguém está à espera do outro lado.
 *
 * O Tap to Trade demorava porque o caminho de sempre abre uma ligação RPC do SDK
 * (`connect()` + `waitSynchronized()`, até 55 s em `CONNECT_TIMEOUT_MS`) e, numa função sem estado
 * como a do site, essa ligação está fria quase sempre: quem toca no sinal paga a ligação inteira
 * antes de a ordem sair. O motor do VPS nunca teve esse problema porque manda as ordens por REST
 * (services/motor-real/live.ts) — aqui é a mesma ideia, para o toque do cliente.
 *
 * Medido a 23/09 na conta 8049310 (FXIFY): `account-information` **0,7 s**, `positions` **0,3 s**,
 * contra os «até 55 s» da ligação fria. É a mesma MetaApi, a mesma conta, a mesma ordem — só muda
 * o cano.
 *
 * O que ESTE ficheiro não faz: substituir o SDK. Não há streaming, não há estado sincronizado, e
 * quem precisa de ler posições a cada tick continua no caminho de sempre. Quem chama isto trata o
 * `null`/`ok:false` como «não deu» e volta ao SDK — nunca se adivinha um resultado de uma ordem.
 *
 * Região: pergunta-se uma vez por conta ao provisioning e fica em memória (o mesmo que o motor faz);
 * sem resposta, assume-se `london`, que é onde todas as nossas contas vivem hoje.
 */
import { contaMarcadaInexistente, marcarContaInexistente } from './metaapi-inexistentes'

const PROVISIONING = process.env.METAAPI_PROVISIONING_URL || 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
/** Um pedido REST que passe disto já não é «rápido» — desiste e deixa o caminho de sempre tentar. */
const TIMEOUT_MS = Number(process.env.METAAPI_REST_TIMEOUT_MS ?? 8_000)

const regioes = new Map<string, string>()

export interface ContaRest {
  balance: number | null
  equity: number | null
  currency: string | null
  leverage: number | null
  tradeAllowed: boolean
}

export interface PrecoRest { bid: number | null; ask: number | null }

export interface EspecificacaoRest {
  symbol: string
  digits: number | null
  volumeMin: number | null
  volumeMax: number | null
  volumeStep: number | null
  contractSize: number | null
  stopsLevel: number | null
  tickSize: number | null
  tickValue: number | null
}

export type AccaoRest =
  | 'ORDER_TYPE_BUY' | 'ORDER_TYPE_SELL'
  | 'ORDER_TYPE_BUY_LIMIT' | 'ORDER_TYPE_SELL_LIMIT'
  | 'ORDER_TYPE_BUY_STOP' | 'ORDER_TYPE_SELL_STOP'

export interface PedidoOrdemRest {
  accountId: string
  symbol: string
  direcao: 'buy' | 'sell'
  tipo: 'market' | 'limit' | 'stop'
  volume: number
  preco?: number | null
  sl?: number | null
  tp?: number | null
  comentario?: string | null
}

export interface RespostaOrdemRest {
  ok: boolean
  orderId?: string | null
  positionId?: string | null
  erro?: string
  /** true = o REST não serve para esta conta/pedido; quem chamou deve tentar o caminho de sempre. */
  tentarSdk?: boolean
}

/** O `actionType` da MetaApi para a direcção e o tipo de ordem. Puro (testado). */
export function accaoDaOrdem(direcao: 'buy' | 'sell', tipo: 'market' | 'limit' | 'stop'): AccaoRest {
  const lado = direcao === 'buy' ? 'BUY' : 'SELL'
  if (tipo === 'limit') return `ORDER_TYPE_${lado}_LIMIT` as AccaoRest
  if (tipo === 'stop') return `ORDER_TYPE_${lado}_STOP` as AccaoRest
  return `ORDER_TYPE_${lado}` as AccaoRest
}

/**
 * A resposta da MetaApi lida como sucesso ou falha. `10009` (TRADE_RETCODE_DONE) e `10008`
 * (PLACED, para as pendentes) são as boas; o resto é recusa da corretora e vai com a mensagem
 * dela, que é a que ajuda quem está a ver («no money», «market closed», «invalid stops»).
 * Puro (testado).
 */
export function lerRespostaOrdem(corpo: unknown, status: number): RespostaOrdemRest {
  const c = (corpo ?? {}) as Record<string, unknown>
  const codigo = Number(c.numericCode ?? NaN)
  const texto = String(c.stringCode ?? c.message ?? c.error ?? '')
  if (status === 200 && (codigo === 10009 || codigo === 10008)) {
    return { ok: true, orderId: c.orderId ? String(c.orderId) : null, positionId: c.positionId ? String(c.positionId) : null }
  }
  // 401/403/404: é um problema DESTE cano (chave, conta, região), não uma recusa da corretora.
  if (status === 401 || status === 403 || status === 404 || status >= 500) {
    return { ok: false, erro: texto || `REST ${status}`, tentarSdk: true }
  }
  return { ok: false, erro: texto || `ordem recusada (${codigo || status})` }
}

function token(): string | null {
  return process.env.METAAPI_TOKEN?.trim() || null
}

async function pedir<T>(url: string, init?: RequestInit): Promise<{ status: number; corpo: T | null }> {
  const t = token()
  if (!t) return { status: 0, corpo: null }
  try {
    const r = await fetch(url, {
      ...init,
      headers: { 'auth-token': t, ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers as Record<string, string>) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const corpo = (await r.json().catch(() => null)) as T | null
    return { status: r.status, corpo }
  } catch {
    return { status: 0, corpo: null }
  }
}

/** A região da conta (uma pergunta por conta, depois memória). */
export async function regiaoDaConta(accountId: string): Promise<string> {
  const guardada = regioes.get(accountId)
  if (guardada) return guardada
  const { status, corpo } = await pedir<{ region?: string }>(`${PROVISIONING}/users/current/accounts/${accountId}`)
  if (status === 404) {
    await marcarContaInexistente(accountId, Object.assign(new Error('NotFoundError'), { name: 'NotFoundError', status: 404 }), { nivelConta: true, origem: 'metaapi-rest' })
  }
  const reg = String(corpo?.region ?? 'london')
  if (status === 200) regioes.set(accountId, reg)
  return reg
}

async function base(accountId: string): Promise<string> {
  return `https://mt-client-api-v1.${await regiaoDaConta(accountId)}.agiliumtrade.ai/users/current/accounts/${accountId}`
}

/** Saldo e equity da conta. `null` = não deu (quem chamou vai pelo caminho de sempre). */
export async function contaRest(accountId: string): Promise<ContaRest | null> {
  if (contaMarcadaInexistente(accountId)) return null
  const { status, corpo } = await pedir<Record<string, unknown>>(`${await base(accountId)}/account-information`)
  if (status !== 200 || !corpo) return null
  return {
    balance: typeof corpo.balance === 'number' ? corpo.balance : null,
    equity: typeof corpo.equity === 'number' ? corpo.equity : null,
    currency: typeof corpo.currency === 'string' ? corpo.currency : null,
    leverage: typeof corpo.leverage === 'number' ? corpo.leverage : null,
    tradeAllowed: corpo.tradeAllowed !== false,
  }
}

/** Preço actual do símbolo NA CORRETORA da conta. */
export async function precoRest(accountId: string, symbol: string): Promise<PrecoRest | null> {
  if (contaMarcadaInexistente(accountId)) return null
  const url = `${await base(accountId)}/symbols/${encodeURIComponent(symbol)}/current-price?keepSubscription=false`
  const { status, corpo } = await pedir<Record<string, unknown>>(url)
  if (status !== 200 || !corpo) return null
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return { bid: n(corpo.bid), ask: n(corpo.ask) }
}

/** Especificação do símbolo (lotes, passo, dígitos) — o que o dimensionamento precisa. */
export async function especificacaoRest(accountId: string, symbol: string): Promise<EspecificacaoRest | null> {
  if (contaMarcadaInexistente(accountId)) return null
  const url = `${await base(accountId)}/symbols/${encodeURIComponent(symbol)}/specification`
  const { status, corpo } = await pedir<Record<string, unknown>>(url)
  if (status !== 200 || !corpo) return null
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return {
    symbol: String(corpo.symbol ?? symbol),
    digits: n(corpo.digits),
    volumeMin: n(corpo.minVolume),
    volumeMax: n(corpo.maxVolume),
    volumeStep: n(corpo.volumeStep),
    contractSize: n(corpo.contractSize),
    stopsLevel: n(corpo.stopsLevel),
    tickSize: n(corpo.tickSize),
    tickValue: n(corpo.tickValue ?? corpo.lossTickValue),
  }
}

/**
 * A ORDEM. Só sai com volume > 0 e símbolo — um pedido incompleto devolve `tentarSdk` em vez de
 * chegar à corretora mal formado.
 */
export async function ordemRest(p: PedidoOrdemRest): Promise<RespostaOrdemRest> {
  if (!p.accountId?.trim() || !p.symbol?.trim() || !(p.volume > 0)) {
    return { ok: false, erro: 'pedido incompleto para o REST', tentarSdk: true }
  }
  if (contaMarcadaInexistente(p.accountId)) {
    return { ok: false, erro: 'conta marcada como inexistente na MetaApi — ordem não enviada' }
  }
  if (!token()) return { ok: false, erro: 'METAAPI_TOKEN em falta', tentarSdk: true }
  if (p.tipo !== 'market' && !(p.preco && p.preco > 0)) {
    return { ok: false, erro: 'ordem pendente sem preço', tentarSdk: true }
  }
  const corpo: Record<string, unknown> = {
    actionType: accaoDaOrdem(p.direcao, p.tipo),
    symbol: p.symbol,
    volume: p.volume,
  }
  if (p.tipo !== 'market') corpo.openPrice = p.preco
  if (p.sl != null) corpo.stopLoss = p.sl
  if (p.tp != null) corpo.takeProfit = p.tp
  if (p.comentario) corpo.comment = p.comentario.slice(0, 31)

  const { status, corpo: resposta } = await pedir<Record<string, unknown>>(`${await base(p.accountId)}/trade`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  })
  // Sem resposta nenhuma (rede, timeout): NÃO se tenta o SDK. Uma ordem que pode ter chegado à
  // corretora não se repete por outro cano — é assim que se abrem duas posições com um toque.
  if (status === 0) return { ok: false, erro: 'MetaApi não respondeu a tempo (ordem pode ter saído — confirma na conta)' }
  return lerRespostaOrdem(resposta, status)
}
