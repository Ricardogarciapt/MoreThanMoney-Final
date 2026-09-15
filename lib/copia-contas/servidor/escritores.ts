import { clampStopsToMinDistance, clampVolume, type MetaApiPosition, type MetaApiSymbolSpecification } from '@/lib/mtmcopy/metaapi'
import { simbolosDaContaCache, specDoSimboloCache } from '@/lib/mtmcopy/metaapi-cache'
import { isNoCommentAccount } from '@/lib/mtmcopy/no-comment-accounts'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { decifrar } from '@/lib/mtmfunded/credenciais'
import { carregarPrecos, carregarSimbolos, lerConta } from '@/lib/mtmfunded/simulado/execucao'
import { TradeLockerSessao } from '@/lib/tradelocker/client'
import { envValido, sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { regraDeLote, resolverInstrumento } from '@/lib/tradelocker/sizing'
import { DEPS_MT5, adaptadorMt5, lerRespostaTrade } from '@/lib/webtrader/corretoras/mt5'
import { adaptadorMtmFunded } from '@/lib/webtrader/corretoras/mtmfunded'
import { adaptadorTradeLocker } from '@/lib/webtrader/corretoras/tradelocker'
import type { AdaptadorCorretora } from '@/lib/webtrader/corretoras/tipos'
import { lerRef } from '../regras'
import type { EscritorDestino, PosicaoDestinoLida } from '../motor'
import type { ContextoDestino, Direcao, PosicaoOrigem } from '../tipos'
import { db } from './base'
import { lerContaPorRef, usaChaveMetaApiDaCasa } from './refs'

/**
 * OS ESCRITORES DE DESTINO — a única porta por onde a cópia entre contas toca numa corretora.
 * Só adaptadores que já existem (lib/webtrader/corretoras):
 *
 *  · MT4/MT5 → REST cliente da MetaApi, POST /trade (DEPS_MT5.rest). Nunca a cache de ligações RPC
 *    da entrega de sinais, nunca getSymbols por pedido (lista em cache de 1 h, specs 1 h).
 *  · TradeLocker → adaptadorTradeLocker (API TradeLocker; resolução de instrumento com rota TRADE).
 *  · MTM Funded → adaptadorMtmFunded (funções atómicas funded_* do motor simulado).
 *
 * Leituras de conta limitadas a 1 por 5 s por destino (equity para o lote). Em sombra o motor só
 * chama `contexto`, `simbolos` e `posicoes`.
 */

const cacheInfo = new Map<string, { v: { equity: number | null; saldo: number | null; moeda: string | null }; em: number }>()

async function infoMt(accountId: string) {
  const c = cacheInfo.get(accountId)
  if (c && Date.now() - c.em < 5_000) return c.v
  const i = (await DEPS_MT5.rest(accountId, '/account-information')) as Record<string, unknown> | null
  const v = { equity: i?.equity == null ? null : Number(i.equity), saldo: i?.balance == null ? null : Number(i.balance), moeda: (i?.currency as string) ?? null }
  cacheInfo.set(accountId, { v, em: Date.now() })
  return v
}

function escritorMt(accountId: string): EscritorDestino {
  const adaptador = adaptadorMt5(accountId, { podeNegociar: true })
  const simbolos = () => simbolosDaContaCache(accountId, async () => {
    const r = await DEPS_MT5.rest(accountId, '/symbols')
    return Array.isArray(r) ? r.map(String) : []
  })
  const spec = (s: string) => specDoSimboloCache<MetaApiSymbolSpecification & { contractSize?: number; profitCurrency?: string }>(accountId, s, async () =>
    (await DEPS_MT5.rest(accountId, `/symbols/${encodeURIComponent(s)}/specification`)) as never)
  const preco = async (s: string) => (await DEPS_MT5.rest(accountId, `/symbols/${encodeURIComponent(s)}/current-price`).catch(() => null)) as { bid?: number; ask?: number } | null

  return {
    simbolos: async () => (await simbolos().catch(() => [])) || null,
    async contexto(simbolo) {
      const lista = await simbolos()
      const s = lista.includes(simbolo) ? simbolo : rankedBrokerSymbols(simbolo, lista)[0]
      if (!s) return null
      const [sp, info, q] = await Promise.all([spec(s), infoMt(accountId), preco(s)])
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
        const r = await DEPS_MT5.rest(accountId, '/positions')
        return (Array.isArray(r) ? (r as MetaApiPosition[]) : []).map((p) => ({
          id: String(p.id), symbol: p.symbol, direcao: /SELL/i.test(p.type) ? 'sell' : 'buy', volume: Number(p.volume ?? 0), clientId: p.clientId ?? null,
        }) satisfies PosicaoDestinoLida)
      } catch {
        return null
      }
    },
    async abrir(o) {
      const sp = await spec(o.simbolo)
      const volume = clampVolume(o.volume, sp)
      let sl = o.sl ?? undefined
      let tp = o.tp ?? undefined
      if ((sl != null || tp != null) && sp?.stopsLevel) {
        const q = await preco(o.simbolo)
        ;({ sl, tp } = clampStopsToMinDistance(sp, o.direcao === 'buy' ? q?.ask : q?.bid, o.direcao, sl, tp))
      }
      const r = lerRespostaTrade(await DEPS_MT5.rest(accountId, '/trade', {
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

async function sessaoTradeLocker(ref: string, linha: Record<string, unknown>): Promise<TradeLockerSessao | null> {
  const r = lerRef(ref)
  if (r?.origem === 'site') return (await sessaoDaLigacao(linha as never)).sessao
  if (r?.origem !== 'auto' || !linha.tl_account_id || !linha.tl_acc_num) return null
  const { data } = await db().from('tradelocker_credenciais').select('tl_email, tl_password_cifrada, tl_server, tl_env').eq('mtmauto_account_id', r.id).maybeSingle()
  const password = data ? decifrar(String(data.tl_password_cifrada)) : null
  const env = envValido(data?.tl_env)
  if (!data || !password || !env) return null
  return new TradeLockerSessao({ email: String(data.tl_email), password, server: String(data.tl_server), env }, String(linha.tl_account_id), String(linha.tl_acc_num))
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

/** Escritor para a conta de destino de uma rota, ou null (conta removida, credenciais em falta). */
export async function escritorPara(destinoRef: string): Promise<EscritorDestino | null> {
  const conta = await lerContaPorRef(destinoRef)
  if (!conta || conta.soLeitura) return null
  if (conta.plataforma === 'mt4' || conta.plataforma === 'mt5') {
    return conta.metaapiAccountId && (await usaChaveMetaApiDaCasa(conta)) ? escritorMt(conta.metaapiAccountId) : null
  }

  if (conta.plataforma === 'tradelocker') {
    const sessao = await sessaoTradeLocker(conta.ref, conta.linha)
    if (!sessao) return null
    const adaptador = adaptadorTradeLocker(sessao, { podeNegociar: true })
    return escritorAdaptador(adaptador, {
      simbolos: async () => {
        try { return (await sessao.instrumentos()).filter((i) => i.routes.some((x) => x.type === 'TRADE')).map((i) => i.name) } catch { return null }
      },
      async contexto(simbolo) {
        const inst = resolverInstrumento(simbolo, await sessao.instrumentos())
        if (!inst) return null
        const [det, est, q] = await Promise.all([
          sessao.detalhe(inst.instrumento.tradableInstrumentId, inst.routeTrade).catch(() => null),
          sessao.estado(),
          sessao.cotacao(inst.instrumento.tradableInstrumentId, inst.routeInfo).catch(() => ({ bid: null, ask: null })),
        ])
        const r = regraDeLote(det)
        return { simbolo: inst.instrumento.name, regra: { min: r.min, max: r.max, step: r.passo }, equity: est.equity, saldo: est.balance, valorPorPrecoPorLote: null, bid: q.bid, ask: q.ask, digits: null }
      },
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
 * limitador de 5 s (nunca RPC), só leitura.
 */
export async function vistaAdminConta(ref: string) {
  const conta = await lerContaPorRef(ref)
  if (!conta) return { erro: 'Conta não encontrada.' }
  let adaptador: AdaptadorCorretora | null = null
  if ((conta.plataforma === 'mt4' || conta.plataforma === 'mt5') && conta.metaapiAccountId) {
    if (!(await usaChaveMetaApiDaCasa(conta))) return { erro: 'Conta de equipa MTM Auto (outra chave MetaApi).' }
    adaptador = adaptadorMt5(conta.metaapiAccountId, { podeNegociar: false })
  } else if (conta.plataforma === 'tradelocker') {
    const sessao = await sessaoTradeLocker(conta.ref, conta.linha)
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

/** Posições TradeLocker normalizadas (SL/TP das ordens de protecção). null = não deu para ler. */
export async function lerPosicoesTradeLocker(origemRef: string): Promise<PosicaoOrigem[] | null> {
  const conta = await lerContaPorRef(origemRef)
  if (!conta || conta.plataforma !== 'tradelocker') return null
  const sessao = await sessaoTradeLocker(conta.ref, conta.linha)
  if (!sessao) return null
  try {
    const pos = await adaptadorTradeLocker(sessao, { podeNegociar: false }).posicoes()
    return pos.map((p) => ({ id: p.id, symbol: p.simboloCorretora, direcao: p.direcao, volume: p.volume, preco: p.precoEntrada, sl: p.sl, tp: p.tp, abertaEm: p.abertaEm }))
  } catch {
    return null
  }
}

/** Saldo da origem (proporcional ao saldo): MTM Funded pela base; MT pela info (5 s); TradeLocker pelo estado. */
export async function saldoDaOrigem(origemRef: string): Promise<number | null> {
  const conta = await lerContaPorRef(origemRef)
  if (!conta) return null
  if (conta.plataforma === 'mtmfunded') return conta.linha.sim_saldo == null ? null : Number(conta.linha.sim_saldo)
  if ((conta.plataforma === 'mt4' || conta.plataforma === 'mt5') && conta.metaapiAccountId) return (await infoMt(conta.metaapiAccountId).catch(() => null))?.equity ?? null
  if (conta.plataforma === 'tradelocker') {
    const s = await sessaoTradeLocker(conta.ref, conta.linha)
    return s ? (await s.estado().catch(() => null))?.equity ?? null : null
  }
  return null
}
