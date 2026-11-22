/**
 * BOOTCAMP WEBTRADER MTM — seis vídeos narrados pelo Ricardo (voz clone, sem gémeo no ecrã).
 *
 * Vive em dois sítios com o mesmo conteúdo:
 *  · a sala «WebTrader MTM» no canal do educador MTM (lms_streams, chave_sistema 'webtrader-mtm');
 *  · o botão «Tutorial» dentro do próprio WebTrader.
 *
 * A playlist do YouTube muda-se SEM deploy: cola-se o link no campo da sala em /admin?tab=education
 * (lms_streams.playlist_url). Enquanto não houver link, os dois sítios mostram a lista dos vídeos
 * com «a caminho». Guiões e motor: video/bootcamp/guioes/webtrader.pt.json + video/bootcamp/webtrader.js.
 */

export type LinguaBootcamp = "pt" | "en"

/** A sala no LMS (criada a 22/11/2026). */
export const SALA_WEBTRADER_ID = "ec4aa472-1faa-465f-b12d-481145792f68"
export const CHAVE_SALA_WEBTRADER = "webtrader-mtm"
/** Canal do educador MTM onde a sala aparece. */
export const CANAL_SALA_WEBTRADER = "/live/9739ae1a-884d-4d03-8e4a-6da498e51c63#webtrader-mtm"

export type EpisodioBootcamp = {
  n: number
  minutos: number
  titulo: Record<LinguaBootcamp, string>
  resumo: Record<LinguaBootcamp, string>
}

export const EPISODIOS_WEBTRADER: EpisodioBootcamp[] = [
  {
    n: 1,
    minutos: 4,
    titulo: { pt: "O que é o WebTrader MTM e para que serve", en: "What the MTM WebTrader is and what it is for" },
    resumo: {
      pt: "O terminal da casa no browser e no telemóvel: contas, gráfico, sinais e gestão num só ecrã.",
      en: "The house terminal in the browser and on your phone: accounts, chart, signals and management on one screen.",
    },
  },
  {
    n: 2,
    minutos: 4,
    titulo: { pt: "Simple e PRO: as diferenças e quando usar cada um", en: "Simple and PRO: the differences and when to use each" },
    resumo: {
      pt: "O modo Simple para decidir depressa e o PRO com o gráfico completo, separadores e registo.",
      en: "Simple mode to decide fast and PRO with the full chart, tabs and log.",
    },
  },
  {
    n: 3,
    minutos: 4,
    titulo: { pt: "A primeira ordem com risco controlado e como usar os sinais", en: "Your first order with controlled risk and how to use signals" },
    resumo: {
      pt: "Ticket com risco em percentagem, SL e TP, e o caminho de um sinal até à confirmação.",
      en: "Order ticket with risk in percent, SL and TP, and how a signal reaches confirmation.",
    },
  },
  {
    n: 4,
    minutos: 12,
    titulo: { pt: "Treino 1: entrar, ligar contas MetaTrader e TradeLocker", en: "Training 1: sign in, connect MetaTrader and TradeLocker accounts" },
    resumo: {
      pt: "Entrar, ligar MT4/MT5 e TradeLocker, preparar o ecrã, temporalidades e camadas do gráfico.",
      en: "Sign in, connect MT4/MT5 and TradeLocker, set up the screen, timeframes and chart layers.",
    },
  },
  {
    n: 5,
    minutos: 12,
    titulo: { pt: "Treino 2: ticket profissional, Trailing Stop e Auto Break-Even", en: "Training 2: pro ticket, Trailing Stop and Auto Break-Even" },
    resumo: {
      pt: "Ordens pendentes, parciais, Trailing Stop e Auto Break-Even passo a passo, em câmara lenta.",
      en: "Pending orders, partials, Trailing Stop and Auto Break-Even step by step, in slow motion.",
    },
  },
  {
    n: 6,
    minutos: 12,
    titulo: { pt: "Treino 3: estratégias MTM, sinais, diário e auditoria", en: "Training 3: MTM strategies, signals, journal and audit" },
    resumo: {
      pt: "Uma estratégia de cada vez no gráfico, sinais das outras estratégias, histórico, diário, estatísticas e link de auditoria.",
      en: "One strategy at a time on the chart, signals from the other strategies, history, journal, stats and audit link.",
    },
  },
]

export const TEXTO_BOOTCAMP = {
  pt: {
    selo: "Sala · WebTrader MTM",
    titulo: "Bootcamp WebTrader MTM",
    sub: "Três vídeos curtos para começares e três treinos completos. Vê pela ordem e repete os passos numa conta demo antes de ires para a conta real.",
    aCaminho: "Os vídeos estão a caminho. Fica aqui a lista do que vais aprender.",
    videos: "Vídeos",
    abrirSala: "Abrir a sala na Academia",
    min: "min",
    aviso: "Conteúdo educativo, não é aconselhamento financeiro. O trading tem risco.",
  },
  en: {
    selo: "Room · MTM WebTrader",
    titulo: "MTM WebTrader Bootcamp",
    sub: "Three short videos to get started and three full training sessions. Watch them in order and repeat the steps on a demo account before going live.",
    aCaminho: "The videos are on their way. Here is what you will learn.",
    videos: "Videos",
    abrirSala: "Open the room in the Academy",
    min: "min",
    aviso: "Educational content, not financial advice. Trading carries risk.",
  },
} as const
