/**
 * O GRÁFICO DE CADA ESTRATÉGIA — marca e indicadores próprios por cima das velas do sinal
 * (pedido do dono, 26/10/2026: «imagens de chart como as que geram, mas para cada estratégia»).
 *
 * As velas e as linhas Entry/SL/TP são as de sempre (lib/sinais/grafico-velas). Aqui decide-se o
 * que distingue uma estratégia da outra no desenho:
 *   · a marca — nome (nunca traduzido) e cor, as mesmas cores do WebTrader (lib/scanners/estudos);
 *   · os indicadores — calculados pelos MESMOS motores que o WebTrader usa (lib/estudos/*), sobre
 *     as velas do sinal: TrendShot EMA 20/50, GoldKiller Supertrend + linha central, MTM Scanner
 *     DEMA 15/50 + POC, Sensei cloud + POC.
 *
 * Nada aqui decide trades: só desenho. Um motor que falhe devolve [] e o gráfico sai sem a linha.
 */
import { calcularGoldKiller } from '@/lib/estudos/goldkiller'
import { calcularMTMScanner } from '@/lib/estudos/mtmscanner'
import { calcularSensei } from '@/lib/estudos/sensei'
import { calcularTrendShot } from '@/lib/estudos/trendshot/motor'
import type { Vela } from '@/lib/estudos/comum/velas'
import { ESTUDOS_WEBTRADER } from '@/lib/scanners/estudos'

export type ChaveGrafico = 'sensei' | 'goldkiller' | 'mtm-scanner' | 'trendshot' | 'premium-scanner' | 'aurum' | 'perps' | 'outro'

export interface MarcaEstrategia {
  chave: ChaveGrafico
  /** Nome como aparece no cartão do sinal — nunca traduzido. */
  nome: string
  cor: string
}

export interface LinhaEstrategia {
  nome: string
  cor: string
  /** Um valor por vela (NaN = sem valor). Mesmo comprimento que as velas passadas. */
  valores: number[]
  tracejada?: boolean
  espessura?: number
}

const corDoEstudo = (chave: string, reserva: string) =>
  ESTUDOS_WEBTRADER.find((e) => e.chave === chave)?.cor ?? reserva

const MARCAS: Record<ChaveGrafico, MarcaEstrategia> = {
  sensei: { chave: 'sensei', nome: 'MTM Auto Sensei', cor: corDoEstudo('Sensei', '#F472B6') },
  goldkiller: { chave: 'goldkiller', nome: 'MTM Auto GoldKiller', cor: corDoEstudo('Goldkiller', '#EAB308') },
  'mtm-scanner': { chave: 'mtm-scanner', nome: 'MTM Scanner', cor: corDoEstudo('MTMScanner', '#A78BFA') },
  trendshot: { chave: 'trendshot', nome: 'MTM Auto Trendshot', cor: corDoEstudo('TrendShot', '#38BDF8') },
  // Sem linhas: o Premium Scanner desenha zona/alvos, que já são as linhas Entry/SL/TP do gráfico.
  'premium-scanner': { chave: 'premium-scanner', nome: 'MTM Auto Premium II', cor: corDoEstudo('PremiumScanner', '#E9C46A') },
  aurum: { chave: 'aurum', nome: 'MTM Aurum Flow Cripto', cor: '#F59E0B' },
  perps: { chave: 'perps', nome: 'MTM Perps', cor: '#FB923C' },
  outro: { chave: 'outro', nome: 'MTM', cor: '#D2A63C' },
}

/**
 * A estratégia do sinal pela coluna `estrategia` (a fonte de verdade desde a 199) e, sem ela, pelo
 * nome do alerta.
 */
export function marcaDaEstrategia(estrategia: string | null | undefined, alertName?: string | null): MarcaEstrategia {
  const e = String(estrategia ?? '').toLowerCase()
  const a = String(alertName ?? '').toLowerCase()
  const t = `${e} ${a}`
  if (/premium[\s-]*(scanner|ii)/.test(t)) return MARCAS['premium-scanner']
  if (/trend\s*shot/.test(t)) return MARCAS.trendshot
  if (/gold\s*killer/.test(t)) return MARCAS.goldkiller
  if (/sensei/.test(t)) return MARCAS.sensei
  if (/aurum/.test(t)) return MARCAS.aurum
  if (/mtm[\s-]*scanner|mtmscanner/.test(t)) return MARCAS['mtm-scanner']
  if (/perp/.test(t)) return MARCAS.perps
  if (alertName && alertName.trim()) return { ...MARCAS.outro, nome: alertName.trim() }
  return MARCAS.outro
}

/** Mais claro (mistura com branco) para a 2.ª linha da mesma estratégia. */
function clarear(hex: string, f = 0.45): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x + (255 - x) * f))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

const seguro = (f: () => LinhaEstrategia[]): LinhaEstrategia[] => {
  try {
    return f().filter((l) => l.valores.some((v) => Number.isFinite(v)))
  } catch {
    return []
  }
}

/**
 * Os indicadores da estratégia, um valor por vela. `velas` deve trazer histórico antes da janela
 * desenhada (as médias precisam de aquecer); quem desenha corta depois.
 */
export function linhasDaEstrategia(marca: MarcaEstrategia, velas: Vela[], simbolo: string): LinhaEstrategia[] {
  if (velas.length < 20) return []
  const cor = marca.cor
  const extra = { ultimaConfirmada: true }
  switch (marca.chave) {
    case 'trendshot':
      return seguro(() => {
        const r = calcularTrendShot(velas, { simbolo })
        return [
          { nome: 'EMA 20', cor, valores: r.emaRapida, espessura: 2.2 },
          { nome: 'EMA 50', cor: clarear(cor), valores: r.emaLenta, espessura: 2 },
        ]
      })
    case 'goldkiller':
      return seguro(() => {
        const r = calcularGoldKiller(velas, {}, extra)
        return [
          { nome: 'Supertrend', cor, valores: r.series.superTrend, espessura: 2.2 },
          { nome: 'Linha central', cor: clarear(cor), valores: r.series.entrada, tracejada: true, espessura: 1.6 },
        ]
      })
    case 'mtm-scanner':
      return seguro(() => {
        const r = calcularMTMScanner(velas, {}, extra)
        return [
          { nome: 'DEMA 15', cor, valores: r.series.dema15, espessura: 2 },
          { nome: 'DEMA 50', cor: clarear(cor), valores: r.series.dema50, espessura: 2 },
          { nome: 'POC', cor: '#E9C46A', valores: r.series.poc, tracejada: true, espessura: 1.6 },
        ]
      })
    case 'sensei':
      return seguro(() => {
        const r = calcularSensei(velas, {}, { ultimaConfirmada: true, agoraMs: (velas[velas.length - 1].t + 1) * 1000 })
        return [
          { nome: 'Cloud rápida', cor, valores: r.series.cloudRapida, espessura: 2 },
          { nome: 'Cloud lenta', cor: clarear(cor), valores: r.series.cloudLenta, espessura: 2 },
          { nome: 'POC', cor: '#E9C46A', valores: r.series.poc, tracejada: true, espessura: 1.6 },
        ]
      })
    default:
      return []
  }
}
