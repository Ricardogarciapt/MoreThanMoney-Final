/**
 * TrendShot — adaptador para Lightweight Charts v5 (5.2.1).
 *
 * Com as cores do Pine «Trendshot by MTM»:
 *  - plot(emaF/emaS/emaL)   → LineSeries vermelha (EMA20), azul (EMA50) e laranja grossa (EMA238)
 *  - plotshape(sigUp/sigDn) → triângulos por cima da vela, azul (BUY) e vermelho (SELL)
 *  - Entry/SL/TP do último  → linhas de preço Entry (roxo), SL (vermelho), TP1–TP4 (verde); só leitura
 *    sinal                    (o Pine desenha-as numa caixa de 20 velas; aqui vão de ponta a ponta)
 *
 * Uso (em grafico-leve):
 *   const ts = anexarTrendShot(chart, serieVelas, { simbolo: 'XAUUSD' })
 *   ts.update(velas)
 *   ts.remove()
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
import { calcularTrendShot, type InputsTrendShot, type ResultadoTrendShot } from './motor'

// Cores do Pine: upCol, dnCol, laranja da EMA longa, C_ENTRY, C_SL, C_TP.
const COR_SUBIDA = '#2962FF'
const COR_DESCIDA = '#FF5252'
const COR_LONGA = '#FF9800'
const COR_ENTRADA = '#8B5CF6'
const COR_SL = '#D6401F'
const COR_TP = '#12B886'

export interface TrendShotLW {
  update: (velas: Vela[]) => ResultadoTrendShot
  remove: () => void
}

export function anexarTrendShot(
  chart: IChartApi,
  serie: ISeriesApi<SeriesType>,
  inputs: Partial<InputsTrendShot> & { simbolo: string; etiquetasEixo?: boolean },
): TrendShotLW {
  const etiquetas = inputs.etiquetasEixo !== false
  const comum = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: etiquetas, crosshairMarkerVisible: false }
  const rapida = chart.addSeries(LineSeries, { ...comum, color: COR_DESCIDA, title: etiquetas ? 'EMA20' : '' })
  const lenta = chart.addSeries(LineSeries, { ...comum, color: COR_SUBIDA, title: etiquetas ? 'EMA50' : '' })
  const longa = chart.addSeries(LineSeries, { ...comum, lineWidth: 3, color: COR_LONGA, title: etiquetas ? 'EMA238' : '' })
  const marcas: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(serie, [])
  let linhas: IPriceLine[] = []

  const linha = (v: number[], velas: Vela[]) =>
    velas.flatMap((x, i) => (Number.isNaN(v[i]) ? [] : [{ time: x.t as UTCTimestamp, value: v[i] }]))

  return {
    update(velas) {
      const r = calcularTrendShot(velas, inputs)
      rapida.setData(linha(r.emaRapida, velas))
      lenta.setData(linha(r.emaLenta, velas))
      longa.setData(linha(r.emaLonga, velas))
      const m: SeriesMarker<Time>[] = r.sinais.map((s) => ({
        time: s.t as UTCTimestamp,
        position: 'aboveBar',
        color: s.direcao === 'buy' ? COR_SUBIDA : COR_DESCIDA,
        shape: s.direcao === 'buy' ? 'arrowUp' : 'arrowDown',
        text: s.direcao === 'buy' ? 'TS BUY' : 'TS SELL',
      }))
      marcas.setMarkers(m)
      for (const l of linhas) serie.removePriceLine(l)
      linhas = []
      const ultimo = r.sinais[r.sinais.length - 1]
      if (ultimo) {
        const seta = ultimo.direcao === 'buy' ? '▲' : '▼'
        const nova = (price: number, color: string, title: string) =>
          linhas.push(serie.createPriceLine({ price, color, title: `TS ${seta} ${title}`, lineWidth: 1, lineStyle: 2, axisLabelVisible: etiquetas }))
        nova(ultimo.entrada, COR_ENTRADA, 'Entry')
        nova(ultimo.sl, COR_SL, 'SL')
        ultimo.tps.forEach((tp, k) => nova(tp, COR_TP, `TP${k + 1}`))
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
