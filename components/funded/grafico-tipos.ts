"use client"

import type { Direcao, MapaPrecos } from "@/lib/mtmfunded/simulado/matematica"
import type { SimboloFicha, PrecoVivo } from "./api"
import type { SinalEstudo } from "./use-sinais-estudos"

/**
 * O CONTRATO DOS GRÁFICOS DO WEBTRADER.
 *
 * Há dois motores de gráfico e ambos recebem exactamente isto:
 *  · `grafico-tradingview.tsx` — a biblioteca licenciada do TradingView (Advanced Charts / Trading
 *    Platform), quando os ficheiros estão em public/charting_library/;
 *  · `grafico-leve.tsx` — lightweight-charts com a mecânica do TradingView desenhada por cima.
 * O trader (funded-trader.tsx) não sabe qual está a correr: dá posições, ordens e callbacks, e
 * recebe as mesmas acções (modificar SL/TP, mover pendente, fechar, cancelar, confirmar ferramenta).
 */

export interface PosicaoGrafico {
  id: string; direcao: Direcao; volume: number; preco_entrada: number; sl: number | null; tp: number | null
  /** TPs parciais da gestão automática (072): linhas finas, só referência. */
  tps?: Array<{ preco: number; pct: number; atingido: boolean }> | null
}
/** Alerta de preço do trader (funded_alertas): linha fina amarela, não arrasta. */
export interface AlertaGrafico { id: string; preco: number; nota?: string | null }
export interface OrdemGrafico { id: string; direcao: Direcao; tipo: "limit" | "stop"; volume: number; preco: number; sl: number | null; tp: number | null }
export interface Ferramenta { direcao: Direcao; entrada: number; sl: number; tp: number }
export type FerramentaConfirmada = Ferramenta & { tipo: "mercado" | "limit" | "stop" }

export interface GraficoProps {
  simbolo: SimboloFicha
  preco?: PrecoVivo
  precos: MapaPrecos
  volume: number
  posicoes: PosicaoGrafico[]
  ordens: OrdemGrafico[]
  podeNegociar: boolean
  /**
   * false = sem a ferramenta Long/Short nem «Usar este sinal» (contas reais: o ticket delas não é o
   * rascunho partilhado). Arrastar SL/TP/pendentes e fechar no gráfico continuam.
   */
  ferramenta?: boolean
  ferramentaInicial?: Ferramenta | null
  /** Classe Tailwind da altura da área do gráfico (a app standalone usa quase o ecrã inteiro). */
  alturaClasse?: string
  /** Ocupar a altura toda do pai (painéis redimensionáveis do modo PRO e ecrã inteiro do SIMPLE). */
  preencher?: boolean
  /** Sufixo da chave do timeframe guardado — cada gráfico do multi-gráfico lembra o seu. */
  chaveTf?: string
  alertas?: AlertaGrafico[]
  /**
   * As acções sobre a conta. Devolvem a promessa do pedido: o gráfico passa-as pela negociação num
   * clique (um-clique.tsx), que confirma ou não, e repõe a linha se falhar ou for cancelada.
   */
  onModificarPosicao: (id: string, sl: number | null, tp: number | null) => Promise<unknown>
  onModificarPendente: (id: string, preco: number, sl: number | null, tp: number | null) => Promise<unknown>
  onFecharPosicao: (id: string) => Promise<unknown>
  onCancelarPendente: (id: string) => Promise<unknown>
  /** Obsoleto: a ferramenta envia pelo rascunho partilhado (rascunho-ordem.tsx). */
  onConfirmarFerramenta?: (f: FerramentaConfirmada) => Promise<void>
  /** Sinais dos estudos MTM (GoldKiller/Sensei/MTM Scanner) para este símbolo: setas no gráfico. */
  sinais?: SinalEstudo[]
  /** O sinal activo mais recente: linhas ténues de entrada/SL/TP. */
  sinalAtivo?: SinalEstudo | null
  /** «Usar este sinal» → pré-preenche o ticket (origem scanner). */
  onUsarSinal?: (s: SinalEstudo) => void
  /** A biblioteca do TradingView tem pesquisa de símbolos própria: quando se muda lá, o trader segue. */
  onMudarSimbolo?: (symbol: string) => void
}

/**
 * Timeframes: a chave é a do endpoint /velas, `seg` o tamanho da vela, `tv` a resolução do
 * TradingView e `rotulo` o botão da barra (como o TradingView os escreve).
 */
export const TIMEFRAMES = [
  { chave: "M1", seg: 60, tv: "1", rotulo: "1m" },
  { chave: "M5", seg: 300, tv: "5", rotulo: "5m" },
  { chave: "M15", seg: 900, tv: "15", rotulo: "15m" },
  { chave: "H1", seg: 3600, tv: "60", rotulo: "1h" },
  { chave: "H4", seg: 14400, tv: "240", rotulo: "4h" },
  { chave: "D1", seg: 86400, tv: "1D", rotulo: "1D" },
] as const
export type Tf = (typeof TIMEFRAMES)[number]["chave"]
export const tfPorChave = (c: string) => TIMEFRAMES.find((t) => t.chave === c) ?? TIMEFRAMES[1]
export const tfPorResolucaoTv = (r: string) =>
  TIMEFRAMES.find((t) => t.tv === r || (t.tv === "1D" && (r === "D" || r === "1D"))) ?? null

/** A paleta escura do TradingView — o nosso gráfico veste-a para não parecer outra app. */
export const TV = {
  fundo: "#131722",
  painel: "#1E222D",
  grelha: "#2A2E39",
  borda: "#2A2E39",
  texto: "#D1D4DC",
  textoFraco: "#787B86",
  sobe: "#26A69A",
  desce: "#EF5350",
  azul: "#2962FF",
  compra: "#2962FF",
  venda: "#F7525F",
  sl: "#F23645",
  tp: "#089981",
  mira: "#758696",
} as const
