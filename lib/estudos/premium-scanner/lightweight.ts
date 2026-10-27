/**
 * MTM Premium Scanner — adaptador para Lightweight Charts v5, com as cores do Pine:
 *  - setas BUY/SELL em cada sinal (verde/vermelho), com a sessão;
 *  - do último sinal: zona (dourado), entrada, SL (vermelho) e TP1–TP4 (verde) como linhas de preço.
 */
import {
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
import { calcularPremium, type ResultadoPremium } from './motor'

const COR_ENTRADA = '#D2A63C'
const COR_ZONA = '#E9C46A'
const COR_SL = '#D6401F'
const COR_TP = '#12B886'
const COR_COMPRA = '#12B886'
const COR_VENDA = '#D6401F'
const PCT = ['50% → SL na entrada', '25%', '25%', 'a correr']

export interface PremiumLW {
  update: (velas: Vela[]) => ResultadoPremium
  remove: () => void
}

export function anexarPremium(
  _chart: IChartApi,
  serie: ISeriesApi<SeriesType>,
  inputs: { simbolo: string; etiquetasEixo?: boolean },
): PremiumLW {
  const etiquetas = inputs.etiquetasEixo !== false
  const marcas: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(serie, [])
  let linhas: IPriceLine[] = []
  return {
    update(velas) {
      const r = calcularPremium(velas, inputs.simbolo)
      const m: SeriesMarker<Time>[] = r.sinais.map((s) => ({
        time: s.t as UTCTimestamp,
        position: s.direcao === 'buy' ? 'belowBar' : 'aboveBar',
        color: s.direcao === 'buy' ? COR_COMPRA : COR_VENDA,
        shape: s.direcao === 'buy' ? 'arrowUp' : 'arrowDown',
        text: `PS ${s.direcao === 'buy' ? 'BUY' : 'SELL'}`,
      }))
      marcas.setMarkers(m)
      for (const l of linhas) serie.removePriceLine(l)
      linhas = []
      const u = r.sinais[r.sinais.length - 1]
      if (u) {
        const seta = u.direcao === 'buy' ? '▲' : '▼'
        const nova = (price: number, color: string, title: string, estilo = 2) =>
          linhas.push(serie.createPriceLine({ price, color, title: `PS ${seta} ${title}`, lineWidth: 1, lineStyle: estilo, axisLabelVisible: etiquetas }))
        nova(u.zona[1], COR_ZONA, 'Zona', 0)
        nova(u.entrada, COR_ENTRADA, 'Entrada')
        nova(u.zona[0], COR_ZONA, 'Zona', 0)
        nova(u.sl, COR_SL, 'SL')
        u.tps.forEach((tp, k) => nova(tp, COR_TP, `TP${k + 1} ${PCT[k]}`))
      }
      return r
    },
    remove() {
      try { for (const l of linhas) serie.removePriceLine(l) } catch { /* série já removida */ }
      try { marcas.detach() } catch { /* idem */ }
    },
  }
}
