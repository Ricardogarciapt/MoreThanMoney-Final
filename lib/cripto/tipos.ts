/**
 * AGENTE CRIPTO: o contrato entre as camadas (dados → decisão → guarda → execução).
 *
 * Fica num ficheiro só de tipos para o ecrã, o vigia e o executor da VPS importarem o mesmo contrato
 * sem arrastarem a base de dados ou a IA para o bundle. Mudar isto é mudar as três pontas.
 */
import { z } from 'zod'

export type Mercado = 'perp' | 'spot'
export type Lado = 'long' | 'short'
export type Modo = 'papel' | 'real'

/** Uma vela (OHLCV), do mais antigo para o mais recente. */
export interface Vela {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Livro de ordens resumido: [preço, quantidade], melhores primeiro. */
export interface Livro {
  bids: [number, number][]
  asks: [number, number][]
}

/** O que o filtro de rug sabe de um token Solana. Campos em falta = desconhecido (conta contra). */
export interface DadosRug {
  mint: string
  /** Pontuação de risco do RugCheck (0 = limpo). */
  rugcheckScore?: number | null
  rugcheckRiscos?: string[]
  mintAuthorityAtiva?: boolean | null
  freezeAuthorityAtiva?: boolean | null
  /** Fracção da oferta nas 10 maiores carteiras (0..1). */
  top10Fraccao?: number | null
  /** Fracção da liquidez bloqueada ou queimada (0..1). */
  lpBloqueadaFraccao?: number | null
  liquidezUsd?: number | null
  idadeHoras?: number | null
  /** Perda de vender agora (cotação de saída), em %. Muito alta = honeypot. */
  impactoVendaPct?: number | null
}

/**
 * O retrato de UM ativo que a IA chega a ver. Pequeno de propósito: números já calculados, nunca
 * velas nem logs em bruto (poupa quota e não dá à IA nada para "ler" à sua maneira).
 */
export interface Retrato {
  ativo: string
  mercado: Mercado
  /** Mint Solana nos spots; símbolo Bybit nos perps. */
  id: string
  preco: number
  em: string
  var5mPct: number | null
  var1hPct: number | null
  var24hPct: number | null
  rsi14: number | null
  atrPct: number | null
  volumeRelativo: number | null
  desequilibrioLivro: number | null
  fundingPct: number | null
  liquidezUsd: number | null
  /** Só memecoins. */
  rug?: { aprovado: boolean; motivos: string[] }
}

/** Um gatilho determinístico do AG-SCANNER. Sem gatilho, a IA nem é chamada. */
export interface Gatilho {
  tipo: 'rompimento' | 'rsi-extremo' | 'meme-momento'
  lado: Lado
  ativo: string
  mercado: Mercado
  id: string
  /** Plano em código: entrada ao preço actual, SL e TP a partir do ATR. */
  entrada: number
  sl: number
  tp: number
  porque: string
}

/** Parecer de um sub-agente. Os de código têm `veto` quando o resultado é eliminatório. */
export interface Parecer {
  agente: string
  favor: number // -1 (contra) .. 1 (a favor)
  nota: string
  veto?: boolean
}

export const ACOES = ['BUY_SPOT', 'SELL_SPOT', 'LONG_PERP', 'SHORT_PERP', 'CLOSE_POSITION', 'HOLD', 'ERROR'] as const
export type Acao = (typeof ACOES)[number]

/** O JSON que o AG-TRADER (IA) tem de devolver. Qualquer coisa fora disto vale HOLD. */
export const DecisaoIA = z.object({
  action: z.enum(ACOES),
  execution_details: z
    .object({
      leverage: z.number().int().min(1).max(5).default(1),
      max_slippage_pct: z.number().min(0).max(10).default(1),
    })
    .default({ leverage: 1, max_slippage_pct: 1 }),
  rationale: z.object({
    technical_trigger: z.string().max(400),
    confidence_score: z.number().min(0).max(1),
  }),
  risk_check: z.object({
    stop_loss_price: z.number().positive(),
    take_profit_price: z.number().positive(),
    is_within_safety_limits: z.boolean(),
  }),
})
export type DecisaoIA = z.infer<typeof DecisaoIA>

/** O JSON do trader de apoio (advogado do diabo). */
export const ParecerApoio = z.object({
  concorda: z.boolean(),
  motivo: z.string().max(400),
})

/** O JSON do analista de notícias e sentimento. */
export const ParecerContexto = z.object({
  sentimento: z.number().min(-1).max(1),
  evento_de_risco: z.boolean(),
  nota: z.string().max(400),
})

/** Uma ordem aprovada pela guarda, pronta para o executor (papel ou real). */
export interface OrdemAprovada {
  acao: Acao
  ativo: string
  mercado: Mercado
  id: string
  lado: Lado
  /** Valor nocional em USD (já com a alavancagem). */
  nocionalUsd: number
  alavancagem: number
  entrada: number
  sl: number
  tp: number
  slippageMaxPct: number
  exploracao: boolean
}

export interface PosicaoAberta {
  ativo: string
  mercado: Mercado
  lado: Lado
  nocionalUsd: number
  entrada: number
  sl: number
  tp: number
}
