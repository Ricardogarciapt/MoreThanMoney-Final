/**
 * RocketNova — adaptador para Lightweight Charts v5 (5.2.1), com as cores do Pine «RocketNova by MTM»:
 *  - plot(emaF/emaS/emaL)  → EMA20 vermelha, EMA50 azul, EMA238 laranja grossa
 *  - estrelas ✦            → marcadores verdes por baixo dos mínimos e vermelhos por cima dos máximos
 *  - Rocket Candle         → marcador amarelo na vela
 *  - Buy / Sell            → etiqueta no cruzamento com estrela de lançamento
 *  - Entry/SL/TP1–TP4      → linhas de preço do último sinal, só enquanto está vivo (sem SL nem TP4 tocados),
 *                            como a caixa do Pine que acaba com a trade
 * As EMAs não entram na escala automática: o gráfico enquadra as velas (a EMA238 longe do preço
 * espremia-as num canto).
 */
import {
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Vela } from '../comum/velas'
import { calcularRocketNova, type InputsRocketNova, type ResultadoRocketNova } from './motor'

const COR_RAPIDA = '#E05A4F'
const COR_LENTA = '#2962FF'
const COR_LONGA = '#E8923D'
const COR_ROCKET = '#F2E23B'
const COR_ESTRELA_BAIXA = '#7DD87D'
const COR_ESTRELA_ALTA = '#E05A4F'
const COR_ENTRADA = '#D2A63C'
const COR_SL = '#D6401F'
const COR_TP = '#12B886'

export interface RocketNovaLW {
  update: (velas: Vela[]) => ResultadoRocketNova
  remove: () => void
}

export function anexarRocketNova(
  chart: IChartApi,
  serie: ISeriesApi<SeriesType>,
  inputs: Partial<InputsRocketNova> & { simbolo: string; etiquetasEixo?: boolean },
): RocketNovaLW {
  const etiquetas = inputs.etiquetasEixo !== false
  const comum = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: etiquetas, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }
  const rapida = chart.addSeries(LineSeries, { ...comum, color: COR_RAPIDA, title: etiquetas ? 'EMA20' : '' })
  const lenta = chart.addSeries(LineSeries, { ...comum, color: COR_LENTA, title: etiquetas ? 'EMA50' : '' })
  const longa = chart.addSeries(LineSeries, { ...comum, lineWidth: 3, color: COR_LONGA, title: etiquetas ? 'EMA238' : '' })
  const marcas: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(serie, [])
  let linhas: IPriceLine[] = []

  const linha = (v: number[], velas: Vela[]) =>
    velas.flatMap((x, i) => (Number.isNaN(v[i]) ? [] : [{ time: x.t as UTCTimestamp, value: v[i] }]))

  return {
    update(velas) {
      const r = calcularRocketNova(velas, inputs)
      rapida.setData(linha(r.emaRapida, velas))
      lenta.setData(linha(r.emaLenta, velas))
      longa.setData(linha(r.emaLonga, velas))
      const m: SeriesMarker<Time>[] = [
        ...r.estrelas.map((e) => ({
          time: e.t as UTCTimestamp,
          position: e.alto ? ('aboveBar' as const) : ('belowBar' as const),
          color: e.alto ? COR_ESTRELA_ALTA : COR_ESTRELA_BAIXA,
          shape: 'circle' as const,
          text: '✦',
        })),
        ...r.rockets.map((i) => ({ time: velas[i].t as UTCTimestamp, position: 'inBar' as const, color: COR_ROCKET, shape: 'square' as const, size: 0.6 })),
        ...r.sinais.map((s) => ({
          time: s.t as UTCTimestamp,
          position: s.direcao === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: s.direcao === 'buy' ? COR_LENTA : COR_RAPIDA,
          shape: s.direcao === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: s.direcao === 'buy' ? 'RN Buy' : 'RN Sell',
        })),
      ].sort((a, b) => (a.time as number) - (b.time as number))
      marcas.setMarkers(m)
      for (const l of linhas) serie.removePriceLine(l)
      linhas = []
      const u = r.ultima
      if (u && !u.slTocado && !u.tpTocado[3]) {
        const s = u.sinal, seta = s.direcao === 'buy' ? '▲' : '▼'
        const nova = (price: number, color: string, title: string) =>
          linhas.push(serie.createPriceLine({ price, color, title: `RN ${seta} ${title}`, lineWidth: 1, lineStyle: 2, axisLabelVisible: etiquetas }))
        nova(s.entrada, COR_ENTRADA, 'Entry')
        nova(s.sl, COR_SL, 'SL')
        s.tps.forEach((tp, k) => { if (!u.tpTocado[k]) nova(tp, COR_TP, `TP${k + 1}`) })
      }
      return r
    },
    remove() {
      try { for (const l of linhas) serie.removePriceLine(l) } catch { /* série já removida */ }
      try { marcas.detach() } catch { /* idem */ }
      chart.removeSeries(rapida)
      chart.removeSeries(lenta)
      chart.removeSeries(longa)
    },
  }
}
