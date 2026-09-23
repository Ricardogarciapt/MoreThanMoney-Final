/**
 * O CONTRATO DAS CORRETORAS DO WEBTRADER — uma interface, três plataformas.
 *
 *   mtmfunded   → conta simulada (motor `sim`, lib/mtmfunded/simulado). Tudo: bracket TP1-3,
 *                 trailing, OCO, regras/barras de quebra, diário, alertas.
 *   tradelocker → conta REAL na corretora, pela API TradeLocker (lib/tradelocker).
 *   mt5         → conta REAL na corretora, pela MetaApi (lib/mtmcopy/metaapi). Custa dinheiro por
 *                 conta e por leitura: ver mt5.ts e lib/contas/quota-metaapi.ts.
 *
 * As rotas /api/webtrader/[plataforma]/[acao] só falam com esta interface. O ecrã decide o que
 * mostra pelas `capacidades` — o que uma plataforma não tem fica escondido com uma nota curta.
 *
 * Puro (sem base, sem Next): testado em lib/webtrader/__tests__/corretoras.check.ts.
 */

export type PlataformaWT = 'mtmfunded' | 'tradelocker' | 'mt5'
export const PLATAFORMAS_WT: PlataformaWT[] = ['mtmfunded', 'tradelocker', 'mt5']

export type DirecaoWT = 'buy' | 'sell'

export interface ContaWT {
  saldo: number | null
  equity: number | null
  margem: number | null
  margemLivre: number | null
  /**
   * Equity ÷ margem usada, em %. Estava só no trader das contas MTM Funded, e é o número que diz
   * o quão perto se está da chamada de margem — não ter simetria aqui era a mesma conta a mostrar
   * mais ou menos coisas consoante a corretora. `null` quando não há margem usada (nada aberto).
   */
  nivelMargem: number | null
  flutuante: number | null
  moeda: string | null
}

export interface PosicaoWT {
  id: string
  /** Símbolo canónico (XAUUSD) — o do catálogo e do gráfico. */
  symbol: string
  /** Símbolo na corretora (XAUUSD.s, GOLD…). */
  simboloCorretora: string
  direcao: DirecaoWT
  volume: number
  precoEntrada: number
  precoAtual: number | null
  sl: number | null
  tp: number | null
  lucro: number | null
  abertaEm: string | null
}

export interface OrdemWT {
  id: string
  symbol: string
  simboloCorretora: string
  direcao: DirecaoWT
  tipo: 'limit' | 'stop'
  volume: number
  preco: number
  sl: number | null
  tp: number | null
  criadaEm: string | null
}

export interface NegocioWT {
  id: string
  symbol: string
  simboloCorretora: string
  direcao: DirecaoWT | null
  volume: number | null
  preco: number | null
  lucro: number | null
  em: string | null
  /** 'fechado' (saída), 'aberto' (entrada), 'cancelada', 'executada'… */
  estado: string
}

export interface SimboloWT {
  symbol: string
  simboloCorretora: string
  nome?: string | null
}

export interface PrecoWT {
  symbol: string
  bid: number
  ask: number
  em: string
  /** true = preço do nosso feed (indicativo), não da corretora — a execução é ao preço da corretora. */
  indicativo: boolean
}

export interface PedidoOrdemWT {
  symbol: string
  direcao: DirecaoWT
  tipo: 'mercado' | 'limit' | 'stop'
  volume: number
  preco?: number | null
  sl?: number | null
  tp?: number | null
}

/** O que chega de fora (o tipo por omissão é «mercado»); `validarPedido` devolve o PedidoOrdemWT completo. */
export type EntradaOrdemWT = Omit<PedidoOrdemWT, 'tipo'> & { tipo?: PedidoOrdemWT['tipo'] }

export interface ModificacaoWT {
  alvo: 'posicao' | 'ordem'
  id: string
  sl?: number | null
  tp?: number | null
  /** Só ordens pendentes. */
  preco?: number | null
}

export interface ResultadoWT {
  ok: true
  id?: string | null
  mensagem?: string
}

export interface CapacidadesWT {
  mercado: boolean
  limit: boolean
  stop: boolean
  slTp: boolean
  fechoParcial: boolean
  modificarPendente: boolean
  historico: boolean
  /** Só MTM Funded (motor simulado). */
  bracketTps: boolean
  trailing: boolean
  oco: boolean
  regras: boolean
  diario: boolean
  alertas: boolean
}

export const CAPACIDADES: Record<PlataformaWT, CapacidadesWT> = {
  mtmfunded: { mercado: true, limit: true, stop: true, slTp: true, fechoParcial: true, modificarPendente: true, historico: true, bracketTps: true, trailing: true, oco: true, regras: true, diario: true, alertas: true },
  tradelocker: { mercado: true, limit: true, stop: true, slTp: true, fechoParcial: true, modificarPendente: true, historico: true, bracketTps: false, trailing: false, oco: false, regras: false, diario: false, alertas: false },
  mt5: { mercado: true, limit: true, stop: true, slTp: true, fechoParcial: true, modificarPendente: true, historico: true, bracketTps: false, trailing: false, oco: false, regras: false, diario: false, alertas: false },
}

/** Conta real (dinheiro a sério) vs simulada. */
export const ehReal = (p: PlataformaWT) => p !== 'mtmfunded'

export interface AdaptadorCorretora {
  plataforma: PlataformaWT
  capacidades: CapacidadesWT
  /** true = a corretora executa com dinheiro real. */
  real: boolean
  /** false = só leitura (investor, conta quebrada, fora da quota). */
  podeNegociar: boolean
  conta(): Promise<ContaWT>
  posicoes(): Promise<PosicaoWT[]>
  ordens(): Promise<OrdemWT[]>
  historico(dias?: number): Promise<NegocioWT[]>
  enviarOrdem(p: EntradaOrdemWT): Promise<ResultadoWT>
  modificar(m: ModificacaoWT): Promise<ResultadoWT>
  /** volume em lotes; sem volume = fecha tudo. */
  fechar(positionId: string, volume?: number | null): Promise<ResultadoWT>
  cancelar(orderId: string): Promise<ResultadoWT>
  simbolos(q?: string): Promise<SimboloWT[]>
  preco(symbol: string): Promise<PrecoWT | null>
}

export class ErroCorretora extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly codigo?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(mensagem)
    this.name = 'ErroCorretora'
  }
}

/** Validação comum do pedido, antes de qualquer corretora (nunca confia no cliente). */
export function validarPedido(p: Partial<PedidoOrdemWT>): PedidoOrdemWT {
  const symbol = String(p.symbol ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9._#+-]{2,24}$/.test(symbol)) throw new ErroCorretora(400, 'símbolo inválido')
  if (p.direcao !== 'buy' && p.direcao !== 'sell') throw new ErroCorretora(400, 'direcção inválida')
  const tipo = p.tipo ?? 'mercado'
  if (tipo !== 'mercado' && tipo !== 'limit' && tipo !== 'stop') throw new ErroCorretora(400, 'tipo de ordem inválido')
  const volume = Number(p.volume)
  if (!(volume > 0) || volume > 100) throw new ErroCorretora(400, 'volume inválido')
  const pos = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN)
  const preco = pos(p.preco)
  const sl = pos(p.sl)
  const tp = pos(p.tp)
  if ([preco, sl, tp].some((v) => Number.isNaN(v))) throw new ErroCorretora(400, 'preço, SL ou TP inválido')
  if (tipo !== 'mercado' && preco == null) throw new ErroCorretora(400, 'falta o preço da ordem pendente')
  const ref = tipo === 'mercado' ? null : preco
  if (ref != null) {
    if (p.direcao === 'buy' && ((sl != null && sl >= ref) || (tp != null && tp <= ref))) throw new ErroCorretora(400, 'numa compra o SL fica abaixo e o TP acima do preço')
    if (p.direcao === 'sell' && ((sl != null && sl <= ref) || (tp != null && tp >= ref))) throw new ErroCorretora(400, 'numa venda o SL fica acima e o TP abaixo do preço')
  }
  return { symbol, direcao: p.direcao, tipo, volume, preco, sl, tp }
}
