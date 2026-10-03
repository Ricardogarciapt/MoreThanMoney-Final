/**
 * Adaptador TRADELOCKER — conta REAL na corretora, pela API pública TradeLocker (lib/tradelocker).
 *
 * Leituras com limitador partilhado por conta (≥2 s): a TradeLocker tem limites por minuto e um
 * WebTrader aberto em dois separadores não pode gastar o dobro. As ordens usam o executor de
 * sempre (colocarOrdemTL: resolução de instrumento com rota TRADE + lote ajustado ao passo).
 *
 * O que a TradeLocker não tem aqui: TPs parciais em bracket, trailing do motor, OCO, regras. O SL/TP
 * de uma posição são ordens próprias da corretora (stopLossId/takeProfitId) — lêem-se de /orders.
 * Limitação da API: PATCH de posição só aceita valores > 0, por isso «tirar» um SL não é possível
 * pelo WebTrader (move-se).
 */
import { TradeLockerError, type TLInstrumento, type TLOrdem, type TradeLockerSessao } from '@/lib/tradelocker/client'
import { colocarOrdemTL } from '@/lib/tradelocker/executor'
import { ajustarQty, regraDeLote, resolverInstrumento } from '@/lib/tradelocker/sizing'
import { isoDe, limitador, numOuNull, precoIndicativo } from './comum'
import { INTERVALO_HISTORICO_MS, INTERVALO_MIN_LEITURA_MS, canonicoDe } from './regras'
import { CAPACIDADES, ErroCorretora, validarPedido, type AdaptadorCorretora, type OrdemWT, type PosicaoWT } from './tipos'

async function comErros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ErroCorretora) throw e
    if (e instanceof TradeLockerError) {
      const status = e.codigo === 'credenciais' ? 401 : e.codigo === 'limite' ? 429 : e.codigo === 'nao_encontrado' ? 404 : e.codigo === 'recusado' ? 422 : 502
      throw new ErroCorretora(status, e.message, `tradelocker_${e.codigo}`)
    }
    throw e
  }
}

/** Posições + pendentes a partir das linhas cruas (puro — testado). */
export function montarPosicoesEOrdensTL(
  posicoes: Awaited<ReturnType<TradeLockerSessao['posicoes']>>,
  ordens: TLOrdem[],
  instrumentos: TLInstrumento[],
): { posicoes: PosicaoWT[]; ordens: OrdemWT[] } {
  const nomes = new Map(instrumentos.map((i) => [i.tradableInstrumentId, i.name]))
  const porId = new Map(ordens.map((o) => [o.id, o]))
  const protecoes = new Set<string>()
  const outP: PosicaoWT[] = posicoes.map((p) => {
    const nome = nomes.get(p.tradableInstrumentId) ?? String(p.tradableInstrumentId)
    const slOrdem = p.stopLossId ? porId.get(p.stopLossId) : undefined
    const tpOrdem = p.takeProfitId ? porId.get(p.takeProfitId) : undefined
    if (p.stopLossId) protecoes.add(p.stopLossId)
    if (p.takeProfitId) protecoes.add(p.takeProfitId)
    return {
      id: p.id, symbol: canonicoDe(nome), simboloCorretora: nome, direcao: p.side, volume: p.qty, precoEntrada: p.avgPrice,
      precoAtual: null, sl: slOrdem ? slOrdem.stopPrice ?? slOrdem.price : null, tp: tpOrdem ? tpOrdem.price ?? tpOrdem.stopPrice : null,
      lucro: p.unrealizedPl, abertaEm: isoDe(p.openDate),
    }
  })
  const outO: OrdemWT[] = ordens
    .filter((o) => !protecoes.has(o.id) && (o.type === 'limit' || o.type === 'stop') && !['filled', 'cancelled', 'canceled', 'rejected', 'expired'].includes(o.status))
    // Ordens de protecção de uma posição trazem positionId; uma pendente de entrada não.
    .filter((o) => !o.positionId)
    .map((o) => {
      const nome = nomes.get(o.tradableInstrumentId) ?? String(o.tradableInstrumentId)
      return {
        id: o.id, symbol: canonicoDe(nome), simboloCorretora: nome, direcao: o.side, tipo: o.type as 'limit' | 'stop', volume: o.qty,
        preco: Number((o.type === 'stop' ? o.stopPrice ?? o.price : o.price ?? o.stopPrice) ?? 0), sl: o.stopLoss, tp: o.takeProfit,
        criadaEm: isoDe(o.createdDate),
      }
    })
  return { posicoes: outP, ordens: outO }
}

export function adaptadorTradeLocker(sessao: TradeLockerSessao, opcoes: { podeNegociar: boolean }): AdaptadorCorretora {
  const k = `tl:${sessao.env}:${sessao.accountId}:`
  const intervalo = INTERVALO_MIN_LEITURA_MS.tradelocker
  const leitura = () => limitador.ler(`${k}leitura`, intervalo, async () => {
    const [pos, ord, inst] = await Promise.all([sessao.posicoes(), sessao.ordens(), sessao.instrumentos()])
    return montarPosicoesEOrdensTL(pos, ord, inst)
  })
  const exigir = () => {
    if (!opcoes.podeNegociar) throw new ErroCorretora(403, 'Esta conta está só em leitura no WebTrader.')
  }
  const depoisDeEscrever = () => limitador.invalidarPrefixo(k)

  return {
    plataforma: 'tradelocker',
    capacidades: CAPACIDADES.tradelocker,
    real: true,
    podeNegociar: opcoes.podeNegociar,

    conta: () => comErros(async () => {
      const e = await limitador.ler(`${k}estado`, intervalo, () => sessao.estado())
      const margem = numOuNull(e.bruto.initialMarginReq)
      return {
        saldo: e.balance, equity: e.equity, margemLivre: e.availableFunds,
        margem, flutuante: numOuNull(e.bruto.openNetPnL ?? e.bruto.openGrossPnL), moeda: null,
        // A TradeLocker não dá a percentagem: sai da mesma conta que o MetaTrader faz.
        nivelMargem: margem && margem > 0 && e.equity != null ? Math.round((e.equity / margem) * 100) : null,
      }
    }),
    posicoes: () => comErros(async () => (await leitura()).posicoes),
    ordens: () => comErros(async () => (await leitura()).ordens),

    historico: (dias = 30) => comErros(async () => {
      const desde = Date.now() - Math.min(90, Math.max(1, dias)) * 86_400_000
      const [linhas, inst] = await Promise.all([
        limitador.ler(`${k}historico:${dias}`, INTERVALO_HISTORICO_MS, () => sessao.historicoOrdens(desde)),
        sessao.instrumentos(),
      ])
      const nomes = new Map(inst.map((i) => [i.tradableInstrumentId, i.name]))
      return linhas.slice(0, 300).map((o) => {
        const nome = nomes.get(o.tradableInstrumentId) ?? String(o.tradableInstrumentId)
        return {
          id: o.id, symbol: canonicoDe(nome), simboloCorretora: nome, direcao: o.side, volume: o.filledQty ?? o.qty,
          preco: o.avgPrice ?? o.price ?? o.stopPrice, lucro: null, em: isoDe(o.lastModified ?? o.createdDate),
          estado: o.status === 'filled' ? 'executada' : o.status || '—',
        }
      })
    }),

    enviarOrdem: (bruto) => comErros(async () => {
      exigir()
      const p = validarPedido(bruto)
      const r = await colocarOrdemTL(sessao, {
        symbol: p.symbol, direction: p.direcao, volume: p.volume,
        orderType: p.tipo === 'mercado' ? 'market' : p.tipo, openPrice: p.preco ?? null, stopLoss: p.sl ?? null, takeProfit: p.tp ?? null,
      })
      depoisDeEscrever()
      if (!r.success) throw new ErroCorretora(422, r.error ?? 'A TradeLocker recusou a ordem.')
      return { ok: true as const, id: r.positionId ?? r.orderId ?? null, mensagem: r.qty ? `${r.qty} lote(s) em ${r.brokerSymbol}` : undefined }
    }),

    modificar: (m) => comErros(async () => {
      exigir()
      if (m.alvo === 'posicao') {
        if (m.sl == null && m.tp == null) throw new ErroCorretora(400, 'Na TradeLocker o SL/TP só se move — não se tira pelo WebTrader.')
        await sessao.modificarPosicao(m.id, { stopLoss: m.sl ?? null, takeProfit: m.tp ?? null })
      } else {
        const ordens = await sessao.ordens()
        const o = ordens.find((x) => x.id === m.id)
        if (!o) throw new ErroCorretora(404, 'Ordem não encontrada na TradeLocker.')
        await sessao.modificarOrdem(m.id, {
          price: o.type === 'limit' ? m.preco ?? null : null,
          stopPrice: o.type === 'stop' ? m.preco ?? null : null,
          stopLoss: m.sl ?? null, takeProfit: m.tp ?? null,
        })
      }
      depoisDeEscrever()
      return { ok: true as const, id: m.id }
    }),

    fechar: (positionId, volume) => comErros(async () => {
      exigir()
      let qty = 0
      if (volume != null && volume > 0) {
        const pos = (await sessao.posicoes()).find((p) => p.id === positionId)
        if (!pos) throw new ErroCorretora(404, 'Posição não encontrada na TradeLocker.')
        const detalhe = await sessao.detalhe(pos.tradableInstrumentId, pos.routeId).catch(() => null)
        const q = ajustarQty(volume, regraDeLote(detalhe))
        qty = q >= pos.qty - 1e-9 ? 0 : q
      }
      await sessao.fecharPosicao(positionId, qty)
      depoisDeEscrever()
      return { ok: true as const, id: positionId }
    }),

    cancelar: (orderId) => comErros(async () => {
      exigir()
      await sessao.cancelarOrdem(orderId)
      depoisDeEscrever()
      return { ok: true as const, id: orderId }
    }),

    simbolos: (q = '') => comErros(async () => {
      const termo = q.trim().toUpperCase()
      const lista = await sessao.instrumentos()
      return lista
        .filter((i) => i.routes.some((r) => r.type === 'TRADE'))
        .map((i) => ({ symbol: canonicoDe(i.name), simboloCorretora: i.name, nome: i.description ?? null }))
        .filter((s) => !termo || s.symbol.includes(termo) || s.simboloCorretora.toUpperCase().includes(termo))
        .slice(0, 80)
    }),

    preco: (symbol) => comErros(async () => {
      const s = symbol.toUpperCase()
      try {
        return await limitador.ler(`${k}preco:${s}`, 1_000, async () => {
          const inst = resolverInstrumento(s, await sessao.instrumentos())
          if (!inst) throw new ErroCorretora(404, `${s} não existe nesta conta TradeLocker`)
          const q = await sessao.cotacao(inst.instrumento.tradableInstrumentId, inst.routeInfo)
          if (q.bid == null || q.ask == null) throw new ErroCorretora(404, 'sem cotação')
          return { symbol: s, bid: q.bid, ask: q.ask, em: new Date().toISOString(), indicativo: false }
        })
      } catch {
        return precoIndicativo(s)
      }
    }),
  }
}
