/**
 * CÓPIA ENTRE CONTAS — os tipos partilhados pelo admin, pelo cliente e pelo motor do VPS.
 *
 * Puro: sem Supabase, sem MetaApi, sem Next. Tabelas na migração 078.
 */

export type PlataformaCopia = 'mtmfunded' | 'mt4' | 'mt5' | 'tradelocker'
export const PLATAFORMAS_COPIA: PlataformaCopia[] = ['mtmfunded', 'mt4', 'mt5', 'tradelocker']

export const NOME_PLATAFORMA_COPIA: Record<PlataformaCopia, string> = {
  mtmfunded: 'MTM Funded',
  mt4: 'MetaTrader 4',
  mt5: 'MetaTrader 5',
  tradelocker: 'TradeLocker',
}

/** Onde vive a linha da conta: site (mtmcopy_connections), auto (mtmauto_accounts), wt (webtrader_contas_mt5), funded (mtm_trading_accounts). */
export type OrigemRef = 'site' | 'auto' | 'wt' | 'funded'

export type ModoLoteCopia = 'multiplicador' | 'fixo' | 'risco_pct' | 'proporcional_saldo'
export const MODOS_LOTE_COPIA: ModoLoteCopia[] = ['multiplicador', 'fixo', 'risco_pct', 'proporcional_saldo']

export type Direcao = 'buy' | 'sell'
export type TipoEventoCopia = 'open' | 'modify' | 'partial' | 'close'
export type ModoRota = 'shadow' | 'live'
export type EstadoRota = 'pedido' | 'aprovada' | 'recusada'

export interface RotaCopia {
  id: string
  user_id: string
  origem_tipo: PlataformaCopia
  origem_ref: string
  origem_chave: string
  destino_tipo: PlataformaCopia
  destino_ref: string
  destino_chave: string
  rotulo: string | null
  modo_lote: ModoLoteCopia
  valor: number
  mapa_simbolos: Record<string, string>
  filtro_simbolos: string[]
  filtro_direcao: 'ambas' | Direcao
  lote_max: number | null
  max_abertas: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  copiar_parciais: boolean
  copiar_modificacoes: boolean
  fechar_com_origem: boolean
  ativa: boolean
  modo: ModoRota
  estado: EstadoRota
  pedido_pelo_cliente: boolean
  notas: string | null
  aprovada_em: string | null
  created_at: string
}

/** Uma posição tal como a origem a mostra, normalizada entre plataformas. */
export interface PosicaoOrigem {
  id: string
  symbol: string
  direcao: Direcao
  volume: number
  preco: number | null
  sl: number | null
  tp: number | null
  abertaEm: string | null
}

export interface EventoCopia {
  id: number
  rota_id: string
  origem_posicao_id: string
  tipo: TipoEventoCopia
  payload: {
    symbol?: string
    direcao?: Direcao
    volume?: number
    /** partial: volume que fechou */
    volume_fechado?: number
    preco?: number | null
    sl?: number | null
    tp?: number | null
    [k: string]: unknown
  }
  chave: string
  origem_em: string | null
  criado_em: string
  tentativas: number
}

export type EstadoCopiaPosicao = 'sombra' | 'enviando' | 'aberta' | 'fechada' | 'recusada' | 'erro'

export interface CopiaPosicao {
  id: string
  rota_id: string
  origem_posicao_id: string
  destino_posicao_id: string | null
  destino_simbolo: string | null
  direcao: Direcao | null
  volume_origem_abertura: number
  volume_destino_abertura: number | null
  fechado_pct: number
  estado: EstadoCopiaPosicao
  client_id: string | null
  preco_origem: number | null
  preco_destino: number | null
  erro: string | null
  enviado_em?: string | null
}

/** O que o motor faria (ou fez) no destino. */
export type AcaoDestino =
  | { tipo: 'abrir'; simbolo: string; direcao: Direcao; volume: number; sl: number | null; tp: number | null; clientId: string }
  | { tipo: 'modificar'; posicao: string | null; sl: number | null; tp: number | null }
  | { tipo: 'fechar_parcial'; posicao: string | null; volume: number; fechadoPct: number }
  | { tipo: 'fechar'; posicao: string | null }
  | { tipo: 'nada'; motivo: string }

export type ResultadoEvento = 'sombra' | 'ok' | 'recusado' | 'erro' | 'saltado'

/** Regras do lote no destino (MT: spec do símbolo; TradeLocker: detalhe do instrumento; Funded: símbolo). */
export interface RegraVolume {
  min: number
  max: number | null
  step: number
}

export interface ContextoDestino {
  simbolo: string | null
  regra: RegraVolume
  equity: number | null
  saldo: number | null
  /** valor (moeda da conta) de 1,0 de preço num lote — para risco %; null = desconhecido */
  valorPorPrecoPorLote: number | null
  bid: number | null
  ask: number | null
  digits: number | null
}
