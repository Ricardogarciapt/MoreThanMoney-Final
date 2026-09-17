/**
 * Adaptador MT5 — conta REAL na corretora, pela MetaApi. A regra que manda neste ficheiro é o CUSTO
 * e NÃO COMPETIR COM A ENTREGA AOS SUBSCRITORES.
 *
 * Canal: SÓ o REST cliente regional (mt-client-api-v1.<região>.agiliumtrade.ai), leituras E ordens.
 *  · Nenhuma ligação RPC/streaming do SDK. A cache de 12 ligações quentes de lib/mtmcopy/metaapi.ts
 *    serve a entrega de sinais (subscritores/provider); o WebTrader nunca lá entra nem despeja ninguém.
 *    Escolhido em vez de um pool isolado porque o REST não abre socket nenhum: não há ligação para
 *    limitar, fechar por inactividade nem sincronizar, e cada pedido é independente.
 *  · Ordens/modificar/fechar/cancelar: POST /users/current/accounts/{id}/trade (actionType MT5).
 *    Símbolo negociável conforme o tradeMode (mesma regra do caminho de execução: candidatos
 *    ordenados por rankedBrokerSymbols, salta DISABLED/CLOSEONLY), volume ajustado à spec e SL/TP
 *    afastados até ao stopsLevel — tudo por REST, com as caches de 1 h de símbolos/specs.
 *  · Leituras com limitador por conta (≥5 s posições/ordens/saldo, 60 s histórico). Contas em
 *    streaming (PREMIUM_STREAMING_CONTAS) leem a fotografia `metaapi_snapshot` quando está fresca;
 *    senão REST — nunca o fallback RPC do motor.
 *  · Conta desligada (a MetaApi faz undeploy às ociosas): o WebTrader NÃO faz deploy sozinho. Responde
 *    503 `mt5_desligada` e o ecrã oferece «Ligar conta» (acção explícita, com aviso de ~1 min) →
 *    `ligarContaMt5`. A política de undeploy das ociosas continua a mandar depois disso.
 */
import { clampStopsToMinDistance, clampVolume, type MetaApiDeal, type MetaApiPendingOrder, type MetaApiPosition, type MetaApiSymbolSpecification } from '@/lib/mtmcopy/metaapi'
import { invalidarLeiturasDeSimbolos, simbolosDaContaCache, specDoSimboloCache } from '@/lib/mtmcopy/metaapi-cache'
import { contasStreaming, decidirFonte, type MetaApiSnapshot } from '@/lib/mtmcopy/metaapi-snapshot-regras'
import { orderCommentFor } from '@/lib/mtmcopy/no-comment-accounts'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isoDe, limitador, numOuNull, precoIndicativo } from './comum'
import { INTERVALO_HISTORICO_MS, INTERVALO_MIN_LEITURA_MS, canonicoDe } from './regras'
import { CAPACIDADES, ErroCorretora, validarPedido, type AdaptadorCorretora, type OrdemWT, type PosicaoWT } from './tipos'

const PROVISIONING = process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

export interface DepsMt5 {
  /** GET/POST ao REST cliente da conta (caminho depois de /users/current/accounts/{id}). */
  rest: (accountId: string, caminho: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => Promise<unknown>
  /** Fotografia de streaming fresca, ou null (sem streaming / velha) → REST. */
  snapshot: (accountId: string) => Promise<MetaApiSnapshot | null>
}

// ── REST ─────────────────────────────────────────────────────────────────────────────────────

const regioes = new Map<string, string>()

async function provisioning(accountId: string, token: string, caminho = '', method: 'GET' | 'POST' = 'GET') {
  const r = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}${caminho}`, { method, headers: { 'auth-token': token }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (r.status === 404) throw new ErroCorretora(404, 'Esta conta já não existe na MetaApi. Remove-a e liga-a de novo.')
  if (!r.ok && r.status !== 204) throw new ErroCorretora(502, 'A MetaApi não respondeu. Tenta daqui a pouco.')
  return (await r.json().catch(() => ({}))) as { region?: string; state?: string; connectionStatus?: string }
}

async function regiaoDe(accountId: string, token: string): Promise<string> {
  const g = regioes.get(accountId)
  if (g) return g
  const reg = String((await provisioning(accountId, token)).region ?? 'london')
  regioes.set(accountId, reg)
  return reg
}

async function restReal(accountId: string, caminho: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<unknown> {
  const token = process.env.METAAPI_TOKEN
  if (!token) throw new ErroCorretora(503, 'MetaApi indisponível no servidor.')
  return restComToken(token, accountId, caminho, init)
}

/**
 * REST cliente com uma chave EXPLÍCITA — contas de equipas MTM Auto vivem noutra chave MetaApi
 * (lib/copia-contas/tokens.ts decide qual). Mesmos erros e prazos do REST da casa.
 */
export function restMt5ComToken(token: string): DepsMt5['rest'] {
  return (accountId, caminho, init) => restComToken(token, accountId, caminho, init ?? {})
}

async function restComToken(token: string, accountId: string, caminho: string, init: { method?: 'GET' | 'POST'; body?: unknown }): Promise<unknown> {
  const regiao = await regiaoDe(accountId, token)
  let r: Response
  try {
    r = await fetch(`https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${accountId}${caminho}`, {
      method: init.method ?? 'GET',
      headers: { 'auth-token': token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.method === 'POST' ? 20_000 : 10_000),
    })
  } catch {
    throw new ErroCorretora(504, 'A MetaApi demorou demasiado a responder.')
  }
  const j = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
  if (!r.ok) {
    const msg = String(j?.message ?? j?.error ?? '')
    if (/not connected|not deployed|NotConnected|undeployed|timed out waiting/i.test(msg) || r.status === 504) {
      // Sem deploy automático: só a acção explícita «Ligar conta» o faz.
      throw new ErroCorretora(503, 'A conta MT5 está desligada da corretora (a MetaApi desliga contas paradas). Carrega em «Ligar conta» — pode demorar cerca de 1 minuto.', 'mt5_desligada')
    }
    if (r.status === 404) throw new ErroCorretora(404, 'A MetaApi não encontrou a conta ou o recurso.')
    throw new ErroCorretora(502, msg ? `MetaApi: ${msg.slice(0, 200)}` : 'A MetaApi recusou o pedido.')
  }
  return j
}

async function snapshotReal(accountId: string): Promise<MetaApiSnapshot | null> {
  if (!contasStreaming(process.env.PREMIUM_STREAMING_CONTAS).includes(accountId)) return null
  try {
    const { data } = await getSupabaseAdmin().from('metaapi_snapshot').select('account_id, posicoes, precos, sincronizado, em').eq('account_id', accountId).maybeSingle()
    if (!data) return null
    const snap: MetaApiSnapshot = {
      account_id: String(data.account_id), posicoes: Array.isArray(data.posicoes) ? data.posicoes : [],
      precos: (data.precos as MetaApiSnapshot['precos']) ?? {}, sincronizado: data.sincronizado === true, em: String(data.em),
    }
    return decidirFonte(snap, Date.now()).fonte === 'snapshot' ? snap : null
  } catch {
    return null
  }
}

export const DEPS_MT5: DepsMt5 = { rest: restReal, snapshot: snapshotReal }

/**
 * «Ligar conta» — deploy EXPLÍCITO pedido pelo utilizador (nunca ao abrir a página). Não espera pela
 * ligação: devolve logo; o ecrã volta a ler dali a pouco.
 */
export async function ligarContaMt5(accountId: string, tokenDaConta?: string): Promise<{ estado: string }> {
  // Contas de equipas vivem na chave da equipa: com a da casa o deploy dava 404.
  const token = tokenDaConta ?? process.env.METAAPI_TOKEN
  if (!token) throw new ErroCorretora(503, 'MetaApi indisponível no servidor.')
  const conta = await provisioning(accountId, token)
  const deployed = String(conta.state ?? '').toUpperCase() === 'DEPLOYED'
  if (deployed && String(conta.connectionStatus ?? '').toUpperCase() === 'CONNECTED') return { estado: 'ligada' }
  if (!deployed) await provisioning(accountId, token, '/deploy', 'POST')
  return { estado: 'a_ligar' }
}

// ── resultado das acções /trade ──────────────────────────────────────────────────────────────

const CODIGOS_OK = new Set(['ERR_NO_ERROR', 'TRADE_RETCODE_DONE', 'TRADE_RETCODE_PLACED', 'TRADE_RETCODE_DONE_PARTIAL', 'TRADE_RETCODE_NO_CHANGES'])
const NUMERICOS_OK = new Set([0, 10008, 10009, 10010, 10025])

/** Resposta do POST /trade → ids, ou ErroCorretora 422 com a mensagem da corretora (puro — testado). */
export function lerRespostaTrade(r: unknown): { orderId: string | null; positionId: string | null } {
  const j = (r ?? {}) as { numericCode?: number; stringCode?: string; message?: string; orderId?: string; positionId?: string }
  const ok = (j.stringCode != null && CODIGOS_OK.has(j.stringCode)) || (j.stringCode == null && typeof j.numericCode === 'number' && NUMERICOS_OK.has(j.numericCode))
  if (!ok) throw new ErroCorretora(422, `A corretora recusou: ${j.message ?? j.stringCode ?? 'erro desconhecido'}`, 'mt5_recusada')
  return { orderId: j.orderId ? String(j.orderId) : null, positionId: j.positionId ? String(j.positionId) : null }
}

function tradeModePermite(tradeMode: string | undefined, direcao: 'buy' | 'sell'): boolean | null {
  if (!tradeMode) return null
  const t = tradeMode.toUpperCase()
  if (t.includes('DISABLED') || t.includes('CLOSE')) return false
  if (t.includes('LONG')) return direcao === 'buy'
  if (t.includes('SHORT')) return direcao === 'sell'
  return true
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
  const trade = async (corpo: Record<string, unknown>) => {
    try {
      return lerRespostaTrade(await deps.rest(accountId, '/trade', { method: 'POST', body: corpo }))
    } finally {
      limitador.invalidarPrefixo(k)
    }
  }
  const simbolosConta = (canonicos: string[] = []) => simbolosDaContaCache(
    accountId,
    async () => {
      const r = await deps.rest(accountId, '/symbols')
      return Array.isArray(r) ? r.map(String) : []
    },
    canonicos.length ? (lista) => canonicos.every((c) => rankedBrokerSymbols(c, lista).length > 0) : undefined,
  )
  const spec = (simbolo: string) => specDoSimboloCache<MetaApiSymbolSpecification>(accountId, simbolo, async () =>
    (await deps.rest(accountId, `/symbols/${encodeURIComponent(simbolo)}/specification`)) as MetaApiSymbolSpecification)
  const posicoesCruas = () => limitador.ler(`${k}posicoes`, intervalo, async () => {
    const snap = await deps.snapshot(accountId)
    if (snap) return snap.posicoes as MetaApiPosition[]
    const r = await deps.rest(accountId, '/positions')
    return (Array.isArray(r) ? r : []) as MetaApiPosition[]
  })
  const ordensCruas = () => limitador.ler(`${k}ordens`, intervalo, async () => {
    const r = await deps.rest(accountId, '/orders')
    return (Array.isArray(r) ? r : []) as MetaApiPendingOrder[]
  })

  /** 1.ª variante negociável para a direcção (tradeMode), como no caminho de execução. */
  const resolverSimbolo = async (canonico: string, direcao: 'buy' | 'sell') => {
    const lista = await simbolosConta([canonico])
    const candidatos = rankedBrokerSymbols(canonico, lista).slice(0, 8)
    if (!candidatos.length) throw new ErroCorretora(422, `${canonico} não existe nesta conta MT5.`)
    let desconhecido: { simbolo: string; spec: MetaApiSymbolSpecification | null } | null = null
    for (const c of candidatos) {
      const s = await spec(c).catch(() => null)
      const permite = tradeModePermite(s?.tradeMode, direcao)
      if (permite === true) return { simbolo: c, spec: s }
      if (permite === null && !desconhecido) desconhecido = { simbolo: c, spec: s }
    }
    if (desconhecido) return desconhecido
    throw new ErroCorretora(422, `${canonico} não está negociável nesta conta (modo de negociação da corretora).`)
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
        const de = encodeURIComponent(new Date(Date.now() - d * 86_400_000).toISOString())
        const ate = encodeURIComponent(new Date().toISOString())
        const r = (await deps.rest(accountId, `/history-deals/time/${de}/${ate}`)) as MetaApiDeal[] | { deals?: MetaApiDeal[] } | null
        return Array.isArray(r) ? r : (r?.deals ?? [])
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
      const { simbolo, spec: s } = await resolverSimbolo(p.symbol, p.direcao)
      const volume = clampVolume(p.volume, s)
      let sl = p.sl ?? undefined
      let tp = p.tp ?? undefined
      if ((sl != null || tp != null) && s?.stopsLevel) {
        let ref = p.tipo === 'mercado' ? null : p.preco ?? null
        if (ref == null) {
          const q = (await deps.rest(accountId, `/symbols/${encodeURIComponent(simbolo)}/current-price`).catch(() => null)) as { bid?: number; ask?: number } | null
          ref = p.direcao === 'buy' ? q?.ask ?? null : q?.bid ?? null
        }
        ;({ sl, tp } = clampStopsToMinDistance(s, ref, p.direcao, sl, tp))
      }
      const tipoMt5 = `ORDER_TYPE_${p.direcao.toUpperCase()}${p.tipo === 'mercado' ? '' : `_${p.tipo.toUpperCase()}`}`
      const comentario = orderCommentFor(accountId, 'MTM WebTrader')
      try {
        const r = await trade({
          actionType: tipoMt5, symbol: simbolo, volume,
          ...(p.tipo !== 'mercado' ? { openPrice: p.preco } : {}),
          ...(sl != null ? { stopLoss: sl } : {}), ...(tp != null ? { takeProfit: tp } : {}),
          ...(comentario ? { comment: comentario } : {}),
        })
        return { ok: true as const, id: r.positionId ?? r.orderId, mensagem: `${volume} lote(s) em ${simbolo}` }
      } catch (e) {
        // Recusa pode vir de configuração da corretora que mudou: a próxima lê símbolos/specs frescos.
        invalidarLeiturasDeSimbolos(accountId)
        throw e
      }
    },

    modificar: async (m) => {
      exigir()
      if (m.alvo === 'posicao') {
        await trade({ actionType: 'POSITION_MODIFY', positionId: m.id, ...(m.sl != null ? { stopLoss: m.sl } : {}), ...(m.tp != null ? { takeProfit: m.tp } : {}) })
        return { ok: true as const, id: m.id }
      }
      const atual = (await ordensCruas()).find((o) => String(o.id) === m.id)
      if (!atual) throw new ErroCorretora(404, 'Ordem pendente não encontrada.')
      await trade({ actionType: 'ORDER_MODIFY', orderId: m.id, openPrice: m.preco ?? atual.openPrice, ...(m.sl != null ? { stopLoss: m.sl } : {}), ...(m.tp != null ? { takeProfit: m.tp } : {}) })
      return { ok: true as const, id: m.id }
    },

    fechar: async (positionId, volume) => {
      exigir()
      await trade(volume != null && volume > 0
        ? { actionType: 'POSITION_PARTIAL', positionId, volume }
        : { actionType: 'POSITION_CLOSE_ID', positionId })
      return { ok: true as const, id: positionId }
    },

    cancelar: async (orderId) => {
      exigir()
      await trade({ actionType: 'ORDER_CANCEL', orderId })
      return { ok: true as const, id: orderId }
    },

    simbolos: async (q = '') => {
      const termo = q.trim().toUpperCase()
      return (await simbolosConta())
        .map((s) => ({ symbol: canonicoDe(s), simboloCorretora: s, nome: null }))
        .filter((s) => !termo || s.symbol.includes(termo) || s.simboloCorretora.toUpperCase().includes(termo))
        .slice(0, 80)
    },

    preco: (symbol) => precoIndicativo(symbol),
  }
}
