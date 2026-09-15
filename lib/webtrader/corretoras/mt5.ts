/**
 * Adaptador MT5 — conta REAL na corretora, pela MetaApi. A regra que manda neste ficheiro é o CUSTO.
 *
 * Leituras (a MetaApi cobra créditos por pedido):
 *  · NUNCA por ligação RPC. O RPC tem uma cache de 12 ligações quentes (lib/mtmcopy/metaapi.ts) que
 *    serve a ENTREGA aos subscritores; uma conta aberta no WebTrader a entrar nessa cache podia
 *    empurrar para fora a ligação de uma conta que está à espera de um sinal. Por isso as leituras
 *    vão pelo REST (account-information, positions, orders), que não ocupa ligação nenhuma.
 *  · Contas em streaming (PREMIUM_STREAMING_CONTAS) leem a fotografia `metaapi_snapshot`.
 *  · Limitador por conta, partilhado por todos os pedidos da instância: no máximo 1 leitura real a
 *    cada 5 s por conta (INTERVALO_MIN_LEITURA_MS.mt5), histórico a cada 60 s. O ecrã só pede com o
 *    separador visível e pára quando fica escondido.
 *  · Lista de símbolos: a cache de 1 hora de sempre (simbolosDaContaCache) — nunca getSymbols por pedido.
 *  · Preço para o gráfico/ticket: o nosso feed (funded_precos, grátis), marcado como indicativo.
 *    A ordem a mercado executa ao preço da corretora.
 *
 * Ordens: os helpers de execução de sempre (placeOrder com resolução de símbolo negociável conforme
 * o tradeMode, modifyPositionSlTp, closePositionById). Cancelar/mover pendente pelo REST /trade.
 */
import {
  closePositionById, lerHistorico, modifyPositionSlTp, placeOrder,
  type MetaApiDeal, type MetaApiPendingOrder, type MetaApiPosition, type OrderRequest, type OrderResult,
} from '@/lib/mtmcopy/metaapi'
import { simbolosDaContaCache } from '@/lib/mtmcopy/metaapi-cache'
import { contaEmStreaming, lerPosicoesMotor } from '@/lib/mtmcopy/metaapi-snapshot'
import { isoDe, limitador, numOuNull, precoIndicativo } from './comum'
import { INTERVALO_HISTORICO_MS, INTERVALO_MIN_LEITURA_MS, canonicoDe } from './regras'
import { CAPACIDADES, ErroCorretora, validarPedido, type AdaptadorCorretora, type OrdemWT, type PosicaoWT } from './tipos'

const PROVISIONING = process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

export interface DepsMt5 {
  /** GET/POST ao REST cliente da conta (caminho depois de /users/current/accounts/{id}). */
  rest: (accountId: string, caminho: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => Promise<unknown>
  placeOrder: (req: OrderRequest) => Promise<OrderResult>
  modifyPositionSlTp: typeof modifyPositionSlTp
  closePositionById: typeof closePositionById
  lerHistorico: (accountId: string, de: Date, ate: Date) => Promise<MetaApiDeal[] | null>
  posicoesStreaming: (accountId: string) => Promise<MetaApiPosition[] | null> | null
}

// ── REST ─────────────────────────────────────────────────────────────────────────────────────

const regioes = new Map<string, string>()
const ultimoDeploy = new Map<string, number>()

async function regiaoDe(accountId: string, token: string): Promise<string> {
  const g = regioes.get(accountId)
  if (g) return g
  const r = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, { headers: { 'auth-token': token }, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
  if (r.status === 404) throw new ErroCorretora(404, 'Esta conta já não existe na MetaApi. Remove-a e liga-a de novo.')
  if (!r.ok) throw new ErroCorretora(502, 'A MetaApi não respondeu. Tenta daqui a pouco.')
  const j = (await r.json()) as { region?: string }
  const reg = String(j.region ?? 'london')
  regioes.set(accountId, reg)
  return reg
}

/**
 * Conta não ligada (a MetaApi faz undeploy de contas paradas): pede UM deploy a cada 5 min por
 * conta, só porque alguém está a usá-la no WebTrader. Nunca em ciclo.
 */
async function acordar(accountId: string, token: string) {
  const t = Date.now()
  if (t - (ultimoDeploy.get(accountId) ?? 0) < 5 * 60_000) return
  ultimoDeploy.set(accountId, t)
  await fetch(`${PROVISIONING}/users/current/accounts/${accountId}/deploy`, { method: 'POST', headers: { 'auth-token': token } }).catch(() => null)
}

async function restReal(accountId: string, caminho: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<unknown> {
  const token = process.env.METAAPI_TOKEN
  if (!token) throw new ErroCorretora(503, 'MetaApi indisponível no servidor.')
  const regiao = await regiaoDe(accountId, token)
  let r: Response
  try {
    r = await fetch(`https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${accountId}${caminho}`, {
      method: init.method ?? 'GET',
      headers: { 'auth-token': token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ErroCorretora(504, 'A MetaApi demorou demasiado a responder.')
  }
  const j = await r.json().catch(() => null) as { message?: string; error?: string } | null
  if (!r.ok) {
    const msg = String(j?.message ?? j?.error ?? '')
    if (/not connected|not deployed|NotConnected|timed out waiting/i.test(msg) || r.status === 504) {
      await acordar(accountId, token)
      throw new ErroCorretora(503, 'A conta MT5 está a ligar à corretora — tenta daqui a um minuto.', 'mt5_a_ligar')
    }
    if (r.status === 404) throw new ErroCorretora(404, 'A MetaApi não encontrou a conta ou o recurso.')
    throw new ErroCorretora(502, msg ? `MetaApi: ${msg.slice(0, 200)}` : 'A MetaApi recusou o pedido.')
  }
  return j
}

export const DEPS_MT5: DepsMt5 = {
  rest: restReal,
  placeOrder,
  modifyPositionSlTp,
  closePositionById,
  lerHistorico,
  posicoesStreaming: (accountId) => (contaEmStreaming(accountId) ? lerPosicoesMotor(accountId).then((l) => l.posicoes) : null),
}

// ── mapeamento puro ──────────────────────────────────────────────────────────────────────────

export function posicaoMt5(p: MetaApiPosition): PosicaoWT {
  return {
    id: String(p.id), symbol: canonicoDe(p.symbol), simboloCorretora: p.symbol,
    direcao: /SELL/i.test(p.type) ? 'sell' : 'buy', volume: Number(p.volume ?? 0), precoEntrada: Number(p.openPrice),
    precoAtual: numOuNull(p.currentPrice), sl: numOuNull(p.stopLoss) || null, tp: numOuNull(p.takeProfit) || null,
    lucro: numOuNull(p.profit), abertaEm: isoDe(p.time),
  }
}

export function ordemMt5(o: MetaApiPendingOrder & { volume?: number; currentVolume?: number }): OrdemWT | null {
  const t = String(o.type ?? '').toUpperCase()
  const tipo = t.includes('LIMIT') ? 'limit' : t.includes('STOP') ? 'stop' : null
  if (!tipo || t.includes('STOP_LIMIT')) return null
  return {
    id: String(o.id), symbol: canonicoDe(o.symbol), simboloCorretora: o.symbol, direcao: t.includes('SELL') ? 'sell' : 'buy', tipo,
    volume: Number(o.currentVolume ?? o.volume ?? 0), preco: Number(o.openPrice ?? 0),
    sl: numOuNull(o.stopLoss) || null, tp: numOuNull(o.takeProfit) || null, criadaEm: isoDe(o.time),
  }
}

// ── adaptador ────────────────────────────────────────────────────────────────────────────────

export function adaptadorMt5(accountId: string, opcoes: { podeNegociar: boolean }, deps: DepsMt5 = DEPS_MT5): AdaptadorCorretora {
  const k = `mt5:${accountId}:`
  const intervalo = INTERVALO_MIN_LEITURA_MS.mt5
  const exigir = () => {
    if (!opcoes.podeNegociar) throw new ErroCorretora(403, 'Esta conta está só em leitura no WebTrader.')
  }
  const depois = () => limitador.invalidarPrefixo(k)
  const posicoesCruas = () => limitador.ler(`${k}posicoes`, intervalo, async () => {
    const streaming = deps.posicoesStreaming(accountId)
    if (streaming) {
      const p = await streaming
      if (p) return p
    }
    const r = await deps.rest(accountId, '/positions')
    return (Array.isArray(r) ? r : []) as MetaApiPosition[]
  })
  const ordensCruas = () => limitador.ler(`${k}ordens`, intervalo, async () => {
    const r = await deps.rest(accountId, '/orders')
    return (Array.isArray(r) ? r : []) as MetaApiPendingOrder[]
  })
  const resultado = (r: { success: boolean; error?: string; orderId?: string }, id?: string) => {
    depois()
    if (!r.success) throw new ErroCorretora(422, r.error ? `A corretora recusou: ${r.error}` : 'A corretora recusou o pedido.')
    return { ok: true as const, id: r.orderId ?? id ?? null }
  }

  return {
    plataforma: 'mt5',
    capacidades: CAPACIDADES.mt5,
    real: true,
    podeNegociar: opcoes.podeNegociar,

    conta: async () => {
      const i = (await limitador.ler(`${k}info`, intervalo, () => deps.rest(accountId, '/account-information'))) as Record<string, unknown> | null
      const saldo = numOuNull(i?.balance)
      const equity = numOuNull(i?.equity)
      return {
        saldo, equity, margem: numOuNull(i?.margin), margemLivre: numOuNull(i?.freeMargin),
        flutuante: saldo != null && equity != null ? Number((equity - saldo).toFixed(2)) : null, moeda: (i?.currency as string) ?? null,
      }
    },
    posicoes: async () => (await posicoesCruas()).map(posicaoMt5),
    ordens: async () => (await ordensCruas()).map(ordemMt5).filter((o): o is OrdemWT => o != null),

    historico: async (dias = 30) => {
      const d = Math.min(90, Math.max(1, dias))
      const deals = await limitador.ler(`${k}historico:${d}`, INTERVALO_HISTORICO_MS, async () => {
        const r = await deps.lerHistorico(accountId, new Date(Date.now() - d * 86_400_000), new Date())
        if (r == null) throw new ErroCorretora(502, 'Não foi possível ler o histórico na MetaApi.')
        return r
      })
      return deals
        .filter((x) => /DEAL_TYPE_(BUY|SELL)/i.test(String(x.type ?? '')))
        .sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')))
        .slice(0, 300)
        .map((x) => ({
          id: String(x.id ?? `${x.positionId}-${x.time}`), symbol: canonicoDe(String(x.symbol ?? '')), simboloCorretora: String(x.symbol ?? ''),
          direcao: /SELL/i.test(String(x.type)) ? 'sell' as const : 'buy' as const, volume: numOuNull(x.volume), preco: numOuNull(x.price),
          lucro: x.profit == null ? null : Number(((x.profit ?? 0) + (x.commission ?? 0) + (x.swap ?? 0)).toFixed(2)),
          em: isoDe(x.time), estado: /OUT/i.test(String(x.entryType ?? '')) ? 'fechado' : 'aberto',
        }))
    },

    enviarOrdem: async (bruto) => {
      exigir()
      const p = validarPedido(bruto)
      const r = await deps.placeOrder({
        accountId, symbol: p.symbol, direction: p.direcao, volume: p.volume,
        orderType: p.tipo === 'mercado' ? 'market' : p.tipo, openPrice: p.preco ?? null,
        stopLoss: p.sl ?? null, takeProfit: p.tp ?? null, comment: 'MTM WebTrader',
      })
      return { ...resultado(r), mensagem: r.brokerSymbol ? `executada em ${r.brokerSymbol}` : undefined }
    },

    modificar: async (m) => {
      exigir()
      if (m.alvo === 'posicao') return resultado(await deps.modifyPositionSlTp(accountId, m.id, m.sl ?? null, m.tp ?? null), m.id)
      const atual = (await ordensCruas()).find((o) => String(o.id) === m.id)
      if (!atual) throw new ErroCorretora(404, 'Ordem pendente não encontrada.')
      try {
        await deps.rest(accountId, '/trade', {
          method: 'POST',
          body: {
            actionType: 'ORDER_MODIFY', orderId: m.id,
            openPrice: m.preco ?? atual.openPrice,
            ...(m.sl != null ? { stopLoss: m.sl } : {}), ...(m.tp != null ? { takeProfit: m.tp } : {}),
          },
        })
      } finally {
        depois()
      }
      return { ok: true as const, id: m.id }
    },

    fechar: async (positionId, volume) => {
      exigir()
      return resultado(await deps.closePositionById(accountId, positionId, volume ?? undefined), positionId)
    },

    cancelar: async (orderId) => {
      exigir()
      try {
        await deps.rest(accountId, '/trade', { method: 'POST', body: { actionType: 'ORDER_CANCEL', orderId } })
      } finally {
        depois()
      }
      return { ok: true as const, id: orderId }
    },

    simbolos: async (q = '') => {
      const lista = await simbolosDaContaCache(accountId, async () => {
        const r = await deps.rest(accountId, '/symbols')
        return Array.isArray(r) ? r.map(String) : []
      })
      const termo = q.trim().toUpperCase()
      return lista
        .map((s) => ({ symbol: canonicoDe(s), simboloCorretora: s, nome: null }))
        .filter((s) => !termo || s.symbol.includes(termo) || s.simboloCorretora.toUpperCase().includes(termo))
        .slice(0, 80)
    },

    preco: (symbol) => precoIndicativo(symbol),
  }
}
