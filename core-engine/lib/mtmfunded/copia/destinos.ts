import {
  placeOrder, modifyPositionSlTp, closePositionById, readOpenPositions, lerContextoDeCopia,
  type MetaApiPosition, type MetaApiSymbolSpecification,
} from '@/lib/mtmcopy/metaapi'
import { orderCommentFor } from '@/lib/mtmcopy/no-comment-accounts'

/**
 * O CONDUTOR DO DESTINO — a única porta por onde a cópia toca numa corretora.
 *
 * O serviço fala com um `CondutorDestino` e não com a MetaApi: é assim que o teste do consumidor
 * troca a corretora por uma falsa (crash depois da ordem, leitura nula, destino em pausa) sem
 * ninguém ter de ligar uma conta.
 *
 * Regra que atravessa tudo: uma LEITURA que falha devolve `null`, nunca `[]`. Uma lista vazia
 * quer dizer «não há posições» e leva a marcar cópias como fechadas; um `null` quer dizer «não sei»
 * e não leva a nada.
 */

export interface ContextoDestino {
  brokerSymbol: string
  spec: MetaApiSymbolSpecification | null
  bid: number | null
  ask: number | null
  balance: number | null
  equity: number | null
  tickSize: number | null
  tickValue: number | null
}

export interface PosicaoDestino {
  id: string
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number
  openPrice: number
  clientId: string | null
  comment: string | null
  time: string | null
}

export interface OrdemCopia {
  accountId: string
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number
  sl: number | null
  tp: number | null
  comentario: string
  clientId: string
}

export interface CondutorDestino {
  contexto(accountId: string, symbol: string, direcao: 'buy' | 'sell'): Promise<ContextoDestino | null>
  posicoes(accountId: string): Promise<PosicaoDestino[] | null>
  abrir(o: OrdemCopia): Promise<{ ok: true; positionId: string | null; brokerSymbol: string | null } | { ok: false; erro: string }>
  modificar(accountId: string, positionId: string, sl: number | null, tp: number | null): Promise<{ ok: boolean; erro?: string }>
  fechar(accountId: string, positionId: string, volume?: number): Promise<{ ok: boolean; erro?: string }>
  /** O clientId viaja nesta conta? (não viaja em contas sem comentário — ver no-comment-accounts) */
  aceitaClientId(accountId: string): boolean
}

function daMetaApi(p: MetaApiPosition): PosicaoDestino {
  const t = String(p.type ?? '').toUpperCase()
  return {
    id: String(p.id), symbol: String(p.symbol), direcao: t.includes('SELL') ? 'sell' : 'buy',
    volume: Number(p.volume ?? 0), openPrice: Number(p.openPrice ?? 0),
    clientId: p.clientId ?? null, comment: p.comment ?? null, time: p.time ?? null,
  }
}

/** MT5 via MetaApi — reutiliza as primitivas do MTM Copy (símbolo negociável, lote mínimo, stops). */
export const condutorMetaApi: CondutorDestino = {
  async contexto(accountId, symbol, direcao) {
    return lerContextoDeCopia(accountId, symbol, direcao)
  },
  async posicoes(accountId) {
    const lista = await readOpenPositions(accountId)
    return lista == null ? null : lista.map(daMetaApi)
  },
  async abrir(o) {
    const r = await placeOrder({
      accountId: o.accountId, symbol: o.symbol, direction: o.direcao, volume: o.volume, orderType: 'market',
      stopLoss: o.sl, takeProfit: o.tp, comment: o.comentario,
      clientId: condutorMetaApi.aceitaClientId(o.accountId) ? o.clientId : undefined,
    })
    return r.success
      ? { ok: true, positionId: r.positionId ?? null, brokerSymbol: r.brokerSymbol ?? null }
      : { ok: false, erro: r.error ?? 'ordem recusada' }
  },
  async modificar(accountId, positionId, sl, tp) {
    const r = await modifyPositionSlTp(accountId, positionId, sl, tp)
    return { ok: r.success, erro: r.error }
  },
  async fechar(accountId, positionId, volume) {
    const r = await closePositionById(accountId, positionId, volume)
    return { ok: r.success, erro: r.error }
  },
  aceitaClientId(accountId) {
    return orderCommentFor(accountId, 'x') !== undefined
  },
}

/**
 * TradeLocker — FASE 2. A interface é a mesma; falta a implementação.
 * TODO(fase 2): autenticação TradeLocker (email/password/servidor → JWT + refresh), resolução de
 * instrumentId por símbolo, POST /trade/accounts/{id}/orders (market) com strategyId = clientId,
 * GET /trade/accounts/{id}/positions, PATCH /trade/positions/{id}, DELETE /trade/positions/{id}
 * com qty para parciais. Até lá o destino recusa e o ecrã não o oferece.
 */
export const condutorTradeLocker: CondutorDestino = {
  async contexto() { return null },
  async posicoes() { return null },
  async abrir() { return { ok: false, erro: 'TradeLocker ainda não suportado (fase 2)' } },
  async modificar() { return { ok: false, erro: 'TradeLocker ainda não suportado (fase 2)' } },
  async fechar() { return { ok: false, erro: 'TradeLocker ainda não suportado (fase 2)' } },
  aceitaClientId() { return false },
}

/** Comentário das ordens copiadas (o helper de comentários decide se viaja). */
export function comentarioDaCopia(login: string | null | undefined): string {
  return `MTM Funded ${login ?? ''}`.trim()
}
