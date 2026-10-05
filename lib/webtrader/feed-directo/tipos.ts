/**
 * FEED DIRECTO DO WEBTRADER — os tipos que o browser e o servidor partilham.
 *
 * A ideia (05/10): quando o cliente liga a SUA conta MT4/MT5 (MetaApi) ou TradeLocker, as
 * cotações, as velas e as posições vêm DIRECTAMENTE da ligação dessa conta à corretora, puxadas
 * pelo browser dele — não do nosso VPS. O WebTrader comporta-se como um «fork do MetaTrader» com o
 * nosso estilo: o cliente opera com os dados dele, nós poupamos o VPS. As ORDENS continuam a sair
 * pelo servidor (auditadas) — por isso a credencial que o browser recebe é SÓ DE LEITURA.
 *
 * Nada aqui importa React, base de dados ou SDKs: só contratos.
 */
import type { ContaWT, OrdemWT, PosicaoWT } from '@/lib/webtrader/corretoras/tipos'
import type { VelaC } from '@/lib/webtrader/velas'

/** O que o servidor entrega ao browser para ele ler a conta (nunca uma credencial de escrita). */
export type CredenciaisFeed =
  | {
      plataforma: 'metaapi'
      /** Token MetaApi restrito a ESTA conta, papel `reader`, validade curta. */
      token: string
      accountId: string
      regiao: string
      versao: 'mt4' | 'mt5'
      /** DEPLOYED+CONNECTED → 'ligada'; senão o ecrã mostra «Ligar conta» (acção explícita). */
      estadoConta: 'ligada' | 'desligada'
      expiraEm: string
    }
  | {
      plataforma: 'tradelocker'
      /** Bearer da TradeLocker. O refreshToken NUNCA vem. */
      accessToken: string
      accountId: string
      accNum: string
      /** https://live.tradelocker.com/backend-api | https://demo.tradelocker.com/backend-api */
      baseUrl: string
      /** Rotas INFO conhecidas (os instrumentos trazem a sua; isto poupa um pedido no arranque). */
      routeIds: { info: number[] }
      expiraEm: string
    }

export type EstadoFeed = 'ligado' | 'indicativo' | 'caido'

export interface CotacaoFeed {
  bid: number
  ask: number
  /** ms desde a época. */
  em: number
}

/** Ficha mínima de um símbolo que só existe na corretora (derivada da spec MetaApi / instrumento TL). */
export interface FichaMinima {
  symbol: string
  simboloCorretora: string
  classe: 'forex' | 'metal' | 'indice' | 'cripto' | 'acao' | 'energia' | 'commodity'
  digits: number
  contract_size: number
  pip_size: number
  volume_min: number
  volume_step: number
  volume_max: number
  moeda_lucro?: string | null
  nome?: string | null
}

/** Mapa símbolo corretora ↔ canónico do catálogo MTM, por conta (o cliente pode ter XAUUSD.r, GOLD…). */
export interface MapaSimbolos {
  /** canónico → símbolo da corretora escolhido para o ler. */
  paraCorretora: Record<string, string>
  /** símbolo da corretora → canónico. */
  paraCanonico: Record<string, string>
}

/**
 * A INTERFACE ÚNICA — MetaApi (SDK web) e TradeLocker (fetch directo) implementam-na; o hook
 * `useFeedConta` só conhece isto. As leituras de estado são síncronas (o feed guarda o último
 * retrato); `aoMudar` avisa quando há algo novo, coalescido a ~1/s para o render não ir atrás de
 * cada tick.
 */
export interface FeedConta {
  readonly plataforma: 'metaapi' | 'tradelocker'
  readonly estado: EstadoFeed
  /** Mensagem curta do último problema (para o ecrã), ou null. */
  readonly erro: string | null
  readonly mapa: MapaSimbolos
  ligar(): Promise<void>
  /** Os símbolos canónicos que o ecrã está a ver: subscreve-os, desubscreve os outros. */
  verSimbolos(canonicos: string[]): void
  cotacao(canonico: string): CotacaoFeed | null
  cotacoes(): Record<string, CotacaoFeed>
  /** Velas do timeframe (chave do gráfico: M1, M5, H1…). `ate` em segundos (época) = mais antigas. */
  velas(canonico: string, tf: string, limite: number, ate?: number): Promise<VelaC[]>
  posicoes(): PosicaoWT[] | null
  ordens(): OrdemWT[] | null
  conta(): ContaWT | null
  /** Os símbolos da corretora (para a pesquisa, sem ir ao servidor). */
  simbolos(): string[]
  ficha(canonico: string): FichaMinima | null
  /** Depois de uma ordem: pede já o retrato novo (TL é por sondagem; MetaApi é empurrado). */
  actualizarAgora(): void
  /** Credenciais novas antes de expirarem (o hook renova 2 min antes). */
  renovar(c: CredenciaisFeed): Promise<void>
  aoMudar(cb: () => void): () => void
  desligar(): void
}

/** Timeframes que cada plataforma dá em velas (segundos por vela). */
export const TF_METAAPI_MT5: Record<string, number> = {
  '1m': 60, '2m': 120, '3m': 180, '4m': 240, '5m': 300, '6m': 360, '10m': 600, '12m': 720, '15m': 900, '20m': 1200, '30m': 1800,
  '1h': 3600, '2h': 7200, '3h': 10800, '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200, '1d': 86400, '1w': 604800, '1mn': 2592000,
}
export const TF_METAAPI_MT4: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1mn': 2592000,
}
export const TF_TRADELOCKER: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800, '1M': 2592000,
}

/** Limites públicos de cada plataforma — ficam aqui para quem lê o código os ver ao lado do contrato. */
export const LIMITES = {
  metaapi: { velasPorPedido: 1000, historicosConcorrentes: 5, ticksMinMs: 2500 },
  tradelocker: { velasPorPedido: 20_000, cotacoesPorSegundo: 10, historicoPorSegundo: 3, sondagemPosicoesMs: 3000, cotacaoMs: 1500 },
} as const
