import { clampStopsToMinDistance, clampVolume, type MetaApiPosition, type MetaApiSymbolSpecification } from '@/lib/mtmcopy/metaapi'
import { simbolosPartilhados, specPartilhada } from '@/lib/mtmcopy/metaapi-simbolos-partilhados'
import { isNoCommentAccount } from '@/lib/mtmcopy/no-comment-accounts'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { decifrar } from '@/lib/mtmfunded/credenciais'
import { carregarPrecos, carregarSimbolos, lerConta } from '@/lib/mtmfunded/simulado/execucao'
import { TradeLockerSessao, type TLDetalheInstrumento, type TLInstrumento } from '@/lib/tradelocker/client'
import { envValido, sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { DEPS_MT5, adaptadorMt5, lerRespostaTrade, restMt5ComToken, type DepsMt5 } from '@/lib/webtrader/corretoras/mt5'
import { adaptadorMtmFunded } from '@/lib/webtrader/corretoras/mtmfunded'
import { adaptadorTradeLocker } from '@/lib/webtrader/corretoras/tradelocker'
import type { AdaptadorCorretora } from '@/lib/webtrader/corretoras/tipos'
import { lerRef } from '../regras'
import { neutralizarErroDeEquipa, type TokenResolvido } from '../tokens'
import {
  TTL_DETALHE_TL_MS, TTL_INSTRUMENTOS_TL_MS, cacheComPrazo, contextoTradeLocker, nomesNegociaveis, resolverInstrumentoDestino,
} from '../tradelocker'
import type { EscritorDestino, PosicaoDestinoLida } from '../motor'
import type { ContextoDestino, Direcao, PosicaoOrigem } from '../tipos'
import { db } from './base'
import { lerContaPorRef, tokenDaConta, type ContaPorRef } from './refs'

/**
 * OS ESCRITORES DE DESTINO — a única porta por onde a cópia entre contas toca numa corretora.
 * Só adaptadores que já existem (lib/webtrader/corretoras):
 *
 *  · MT4/MT5 → REST cliente da MetaApi, POST /trade, com a CHAVE DA CONTA (casa ou equipa —
 *    lib/copia-contas/tokens.ts). Nunca a cache de ligações RPC da entrega de sinais; símbolos e specs
 *    pela tabela partilhada `metaapi_simbolos_cache` (080) — nunca getSymbols por pedido.
 *  · TradeLocker → adaptadorTradeLocker; contexto (lote, valor do tick) pelo detalhe do instrumento em
 *    cache de 12 h por conta+instrumento; lista de instrumentos 6 h; sessão partilhada por conta.
 *  · MTM Funded → adaptadorMtmFunded (funções atómicas funded_* do motor simulado).
 *
 * Leituras de conta limitadas a 1 por 5 s por destino (equity para o lote). Em sombra o motor só
 * chama `contexto`, `simbolos` e `posicoes`.
 */

const cacheInfo = new Map<string, { v: { equity: number | null; saldo: number | null; moeda: string | null }; em: number }>()

function depsDoToken(t: TokenResolvido): DepsMt5 {
  if (t.chave === 'casa') return DEPS_MT5
  const rest = restMt5ComToken(t.token)
  // snapshot só existe para as contas da casa (premium-streaming); nas de equipa, REST.
  return {
    rest: async (id, caminho, init) => {
      try { return await rest(id, caminho, init) } catch (e) { throw neutralizarErroDeEquipa(e, t.chave) }
    },
    snapshot: async () => null,
  }
}

async function infoMt(accountId: string, deps: DepsMt5) {
  const c = cacheInfo.get(accountId)
  if (c && Date.now() - c.em < 5_000) return c.v
  const i = (await deps.rest(accountId, '/account-information')) as Record<string, unknown> | null
  const v = { equity: i?.equity == null ? null : Number(i.equity), saldo: i?.balance == null ? null : Number(i.balance), moeda: (i?.currency as string) ?? null }
  cacheInfo.set(accountId, { v, em: Date.now() })
  return v
}

function escritorMt(accountId: string, t: TokenResolvido): EscritorDestino {
  const deps = depsDoToken(t)
  const adaptador = adaptadorMt5(accountId, { podeNegociar: true }, deps)
  // A tabela partilhada regista sozinha os erros de quota da CASA; os de uma equipa chegam-lhe já
  // neutralizados (depsDoToken) e não bloqueiam as leituras dos subscritores da MTM.
  const simbolos = (serve?: (l: string[]) => boolean) => simbolosPartilhados(accountId, async () => {
    const r = await deps.rest(accountId, '/symbols')
    return Array.isArray(r) ? r.map(String) : []
  }, serve)
  const spec = (s: string) => specPartilhada<MetaApiSymbolSpecification & { contractSize?: number; profitCurrency?: string }>(accountId, s, async () =>
    (await deps.rest(accountId, `/symbols/${encodeURIComponent(s)}/specification`)) as never)
  const preco = async (s: string) => (await deps.rest(accountId, `/symbols/${encodeURIComponent(s)}/current-price`).catch(() => null)) as { bid?: number; ask?: number } | null

  return {
    simbolos: async () => (await simbolos().catch(() => [])) || null,
    async contexto(simbolo) {
      const lista = await simbolos((l) => l.includes(simbolo) || rankedBrokerSymbols(simbolo, l).length > 0)
      const s = lista.includes(simbolo) ? simbolo : rankedBrokerSymbols(simbolo, lista)[0]
      if (!s) return null
      const [sp, info, q] = await Promise.all([spec(s), infoMt(accountId, deps), preco(s)])
      const mesmaMoeda = sp?.profitCurrency && info.moeda && sp.profitCurrency.toUpperCase() === info.moeda.toUpperCase()
      return {
        simbolo: s,
        regra: { min: sp?.minVolume ?? 0.01, max: sp?.maxVolume ?? null, step: sp?.volumeStep ?? 0.01 },
        equity: info.equity, saldo: info.saldo,
        valorPorPrecoPorLote: mesmaMoeda && sp?.contractSize ? Number(sp.contractSize) : null,
        bid: q?.bid ?? null, ask: q?.ask ?? null, digits: sp?.digits ?? null,
      } satisfies ContextoDestino
    },
    async posicoes() {
      try {
        const r = await deps.rest(accountId, '/positions')
        return (Array.isArray(r) ? (r as MetaApiPosition[]) : []).map((p) => ({
          id: String(p.id), symbol: p.symbol, direcao: /SELL/i.test(p.type) ? 'sell' : 'buy', volume: Number(p.volume ?? 0), clientId: p.clientId ?? null,
        }) satisfies PosicaoDestinoLida)
      } catch {
        return null
      }
    },
    async abrir(o) {
      const sp = await spec(o.simbolo)
      const volume = clampVolume(o.volume, sp ?? undefined)
      let sl = o.sl ?? undefined
      let tp = o.tp ?? undefined
      if ((sl != null || tp != null) && sp?.stopsLevel) {
        const q = await preco(o.simbolo)
        ;({ sl, tp } = clampStopsToMinDistance(sp, o.direcao === 'buy' ? q?.ask : q?.bid, o.direcao, sl, tp))
      }
      const r = lerRespostaTrade(await deps.rest(accountId, '/trade', {
        method: 'POST',
        body: {
          actionType: `ORDER_TYPE_${o.direcao.toUpperCase()}`, symbol: o.simbolo, volume,
          ...(sl != null ? { stopLoss: sl } : {}), ...(tp != null ? { takeProfit: tp } : {}),
          // O clientId viaja no campo do comentário: não vai em contas sem comentário (no-comment-accounts).
          ...(isNoCommentAccount(accountId) ? {} : { clientId: o.clientId }),
        },
      }))
      return { positionId: r.positionId ?? r.orderId, simbolo: o.simbolo }
    },
    async modificar(positionId, sl, tp) { await adaptador.modificar({ alvo: 'posicao', id: positionId, sl, tp }) },
    async fechar(positionId, volume) { await adaptador.fechar(positionId, volume ?? null) },
  }
}

// ── TradeLocker: sessão partilhada por conta, caches longas ─────────────────

const sessoes = cacheComPrazo<TradeLockerSessao | null>(10 * 60_000)
const instrumentosTL = cacheComPrazo<TLInstrumento[]>(TTL_INSTRUMENTOS_TL_MS)
const detalhesTL = cacheComPrazo<TLDetalheInstrumento | null>(TTL_DETALHE_TL_MS)
const moedasTL = cacheComPrazo<string | null>(TTL_DETALHE_TL_MS)

async function credenciaisTL(coluna: 'mtmauto_account_id' | 'mtmauto_provider_id', id: string) {
  const { data } = await db().from('tradelocker_credenciais').select('tl_email, tl_password_cifrada, tl_server, tl_env').eq(coluna, id).maybeSingle()
  const password = data ? decifrar(String(data.tl_password_cifrada)) : null
  const env = envValido(data?.tl_env)
  return data && password && env ? { email: String(data.tl_email), password, server: String(data.tl_server), env } : null
}

/** Sessão TradeLocker da conta (site / auto / provider), partilhada 10 min — sem ler credenciais a cada sondagem. */
async function sessaoTradeLocker(conta: Pick<ContaPorRef, 'ref' | 'linha'>): Promise<TradeLockerSessao | null> {
  return sessoes.obter(conta.ref, async () => {
    const r = lerRef(conta.ref)
    const linha = conta.linha
    if (r?.origem === 'site') return (await sessaoDaLigacao(linha as never)).sessao
    if ((r?.origem !== 'auto' && r?.origem !== 'prov') || !linha.tl_account_id || !linha.tl_acc_num) return null
    const cred = await credenciaisTL(r.origem === 'auto' ? 'mtmauto_account_id' : 'mtmauto_provider_id', r.id)
    return cred ? new TradeLockerSessao(cred, String(linha.tl_account_id), String(linha.tl_acc_num)) : null
  })
}

/** Moeda da conta TradeLocker (lista de contas do login; cache 12 h). */
async function moedaTL(sessao: TradeLockerSessao): Promise<string | null> {
  return moedasTL.obter(`${sessao.env}:${sessao.accountId}`, async () => {
    const r = await sessao.pedido<{ accounts?: Array<Record<string, unknown>> }>({ path: '/auth/jwt/all-accounts', semAccNum: true }).catch(() => null)
    const c = (r?.accounts ?? []).find((a) => String(a.id) === sessao.accountId)
    return c?.currency ? String(c.currency) : null
  })
}

/** Contexto TradeLocker pelo detalhe do instrumento (exportado para os testes de integração do escritor). */
export async function contextoTL(sessao: TradeLockerSessao, simbolo: string): Promise<ContextoDestino | null> {
  const lista = await instrumentosTL.obter(`${sessao.env}:${sessao.accountId}`, () => sessao.instrumentos())
  const inst = resolverInstrumentoDestino(simbolo, lista)
  if (!inst) return null
  const id = inst.instrumento.tradableInstrumentId
  const [detalhe, est, q, moeda] = await Promise.all([
    detalhesTL.obter(`${sessao.env}:${sessao.accountId}:${id}`, () => sessao.detalhe(id, inst.routeTrade).catch(() => null)),
    sessao.estado().catch(() => null),
    sessao.cotacao(id, inst.routeInfo).catch(() => ({ bid: null, ask: null })),
    moedaTL(sessao),
  ])
  if (!detalhe) return null
  return contextoTradeLocker({ instrumento: inst, detalhe, equity: est?.equity ?? null, saldo: est?.balance ?? null, moedaConta: moeda, bid: q.bid, ask: q.ask })
}

function escritorAdaptador(adaptador: AdaptadorCorretora, extra: { contexto: EscritorDestino['contexto']; simbolos: EscritorDestino['simbolos'] }): EscritorDestino {
  return {
    ...extra,
    async posicoes() {
      try {
        return (await adaptador.posicoes()).map((p) => ({ id: p.id, symbol: p.simboloCorretora, direcao: p.direcao, volume: p.volume, clientId: null }))
      } catch {
        return null
      }
    },
    async abrir(o) {
      const r = await adaptador.enviarOrdem({ symbol: o.simbolo, direcao: o.direcao, volume: o.volume, sl: o.sl, tp: o.tp })
      return { positionId: r.id ?? null, simbolo: o.simbolo }
    },
    async modificar(id, sl, tp) { await adaptador.modificar({ alvo: 'posicao', id, sl, tp }) },
    async fechar(id, volume) { await adaptador.fechar(id, volume ?? null) },
  }
}

/** Escritor para a conta de destino de uma rota, ou null (conta removida, credenciais em falta, sem chave). */
export async function escritorPara(destinoRef: string): Promise<EscritorDestino | null> {
  const conta = await lerContaPorRef(destinoRef)
  if (!conta || conta.soLeitura || conta.provider) return null
  if (conta.plataforma === 'mt4' || conta.plataforma === 'mt5') {
    if (!conta.metaapiAccountId) return null
    const t = await tokenDaConta(conta)
    return t ? escritorMt(conta.metaapiAccountId, t) : null
  }

  if (conta.plataforma === 'tradelocker') {
    const sessao = await sessaoTradeLocker(conta)
    if (!sessao) return null
    const adaptador = adaptadorTradeLocker(sessao, { podeNegociar: true })
    return escritorAdaptador(adaptador, {
      simbolos: async () => {
        try { return nomesNegociaveis(await instrumentosTL.obter(`${sessao.env}:${sessao.accountId}`, () => sessao.instrumentos())) } catch { return null }
      },
      contexto: (simbolo) => contextoTL(sessao, simbolo),
    })
  }

  // MTM Funded (motor simulado)
  const fundedId = conta.fundedAccountId ?? lerRef(conta.ref)?.id
  const c = fundedId ? await lerConta(fundedId) : null
  if (!c) return null
  const adaptador = adaptadorMtmFunded(c, 'master')
  return escritorAdaptador(adaptador, {
    simbolos: async () => null,
    async contexto(simbolo, direcao: Direcao) {
      const s = (await carregarSimbolos([simbolo]))[simbolo]
      if (!s) return null
      const [{ precos }, atual] = await Promise.all([carregarPrecos([simbolo]), lerConta(c.id)])
      const p = precos[simbolo]
      const saldo = Number(atual?.sim_saldo ?? 0)
      void direcao
      return {
        simbolo, regra: { min: Number(s.volume_min) || 0.01, max: null, step: Number(s.volume_step) || 0.01 },
        equity: saldo, saldo, valorPorPrecoPorLote: s.moeda_lucro && s.moeda_lucro !== 'USD' ? null : Number(s.contract_size) || null,
        bid: p?.bid ?? null, ask: p?.ask ?? null, digits: s.digits ?? null,
      }
    },
  })
}

// ── vista do admin (só leitura) ──────────────────────────────────────────────

/**
 * «Ver no WebTrader (admin)»: conta + posições abertas de QUALQUER conta, sem sessão do cliente e
 * sem poder negociar. Os mesmos adaptadores do WebTrader com `podeNegociar:false`; MT5 por REST com o
 * limitador de 5 s (nunca RPC), só leitura, na chave da conta.
 */
export async function vistaAdminConta(ref: string) {
  const conta = await lerContaPorRef(ref)
  if (!conta) return { erro: 'Conta não encontrada.' }
  let adaptador: AdaptadorCorretora | null = null
  if ((conta.plataforma === 'mt4' || conta.plataforma === 'mt5') && conta.metaapiAccountId) {
    const t = await tokenDaConta(conta)
    if (!t) return { erro: 'Conta de equipa sem chave MetaApi utilizável.' }
    adaptador = adaptadorMt5(conta.metaapiAccountId, { podeNegociar: false }, depsDoToken(t))
  } else if (conta.plataforma === 'tradelocker') {
    const sessao = await sessaoTradeLocker(conta)
    if (sessao) adaptador = adaptadorTradeLocker(sessao, { podeNegociar: false })
  } else if (conta.plataforma === 'mtmfunded') {
    const c = await lerConta(conta.fundedAccountId ?? lerRef(conta.ref)!.id)
    if (c) adaptador = adaptadorMtmFunded(c, 'investor')
  }
  if (!adaptador) return { erro: 'Sem forma de ler esta conta (sem conta MetaApi ou credenciais).' }
  try {
    const [info, posicoes] = await Promise.all([adaptador.conta(), adaptador.posicoes()])
    return { plataforma: adaptador.plataforma, real: adaptador.real, conta: info, posicoes }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) }
  }
}

// ── leitores de ORIGEM que não são streaming ────────────────────────────────

/**
 * Posições TradeLocker normalizadas (SL/TP das ordens de protecção). null = não deu para ler.
 * A conta lê-se da base UMA vez por fonte (o serviço guarda-a) e a sessão é partilhada.
 */
export async function lerPosicoesTradeLocker(conta: Pick<ContaPorRef, 'ref' | 'linha' | 'plataforma'>): Promise<PosicaoOrigem[] | null> {
  if (conta.plataforma !== 'tradelocker') return null
  const sessao = await sessaoTradeLocker(conta)
  if (!sessao) return null
  try {
    const pos = await adaptadorTradeLocker(sessao, { podeNegociar: false }).posicoes()
    return pos.map((p) => ({ id: p.id, symbol: p.simboloCorretora, direcao: p.direcao, volume: p.volume, preco: p.precoEntrada, sl: p.sl, tp: p.tp, abertaEm: p.abertaEm }))
  } catch {
    return null
  }
}

/** Saldo da origem (proporcional ao saldo): MTM Funded pela base; MT pela info (5 s) na chave da conta; TradeLocker pelo estado. */
export async function saldoDaOrigem(origemRef: string): Promise<number | null> {
  const conta = await lerContaPorRef(origemRef)
  if (!conta) return null
  if (conta.plataforma === 'mtmfunded') {
    if (conta.provider) {
      if (!conta.fundedAccountId) return null
      const { data } = await db().from('mtm_trading_accounts').select('sim_saldo').eq('id', conta.fundedAccountId).maybeSingle()
      return data?.sim_saldo == null ? null : Number(data.sim_saldo)
    }
    return conta.linha.sim_saldo == null ? null : Number(conta.linha.sim_saldo)
  }
  if ((conta.plataforma === 'mt4' || conta.plataforma === 'mt5') && conta.metaapiAccountId) {
    const t = await tokenDaConta(conta)
    return t ? (await infoMt(conta.metaapiAccountId, depsDoToken(t)).catch(() => null))?.equity ?? null : null
  }
  if (conta.plataforma === 'tradelocker') {
    const s = await sessaoTradeLocker(conta)
    return s ? (await s.estado().catch(() => null))?.equity ?? null : null
  }
  return null
}
