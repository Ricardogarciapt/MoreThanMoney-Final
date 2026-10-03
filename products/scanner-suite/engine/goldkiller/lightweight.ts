/**
 * MTM GoldKiller — adaptador para Lightweight Charts v5 (5.2.1).
 *
 * Desenha o resultado de `calcularGoldKiller` com o aspeto do script no TradingView:
 *  - plot(style_steplinebr) → LineSeries em degraus (LineType.WithSteps); whitespace = quebra (o «br»)
 *                             Gain 100/90/75/50/25 a verde e Drawdown a vermelho com a transparência
 *                             do Pine (70/60/50/40/30); Average/STDEV a azul e roxo quando ligados
 *  - plot(Center Line)      → LineSeries cinzenta, linha simples
 *  - etiquetas no eixo      → price line invisível por nível com a etiqueta do último valor (o TradingView
 *                             põe o valor de cada plot na escala de preços)
 *  - fill(nível, centro)    → primitivo de fundo: faixas 98 % transparentes; como os quatro/cinco níveis
 *                             enchem todos até à Center Line, sobrepõem-se e ficam mais fortes perto do
 *                             centro — as «zonas empilhadas» verdes por cima e vermelhas por baixo
 *  - plotshape BUY/SELL     → primitivo de frente: etiqueta verde «BUY» por baixo da vela / vermelha
 *                             «SELL» por cima (shape.labelup / labeldown, size.tiny)
 *
 * A ordem de criação das séries é a ordem dos plot() no Pine (explicit_plot_zorder = true): o que vem
 * depois fica por cima.
 *
 * Uso (em grafico-leve, depois de criar `chart` e a série de velas):
 *   const gk = anexarGoldKiller(chart, serieVelas, { inputs: { simbolo: 'XAUUSD' } })
 *   gk.update(velas)          // calcula aqui e desenha
 *   gk.aplicar(velas, r)      // desenha um resultado calculado fora (Web Worker)
 *   gk.remove()
 * `velas` têm de ser as MESMAS velas (mesmos tempos) que estão na série de velas.
 */
import {
  LineSeries,
  LineType,
  type IChartApi,
  type IPriceLine,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type LineData,
  type Logical,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts'
import { corPine } from '../comum/velas'
import { calcularGoldKiller } from './motor'
import { PINE5, TRANSP_NIVEL } from './inputs'
import { PERCENTIS_GK, type InputsGoldKiller, type ResultadoGoldKiller, type Vela } from './tipos'

type Alvo = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Ctx = CanvasRenderingContext2D

export interface OpcoesGoldKillerLW {
  inputs?: Partial<InputsGoldKiller>
  fonte?: string
  /** Etiquetas dos níveis na escala de preços (por defeito sim, como no TradingView). */
  etiquetasEixo?: boolean
  aoCalcular?: (r: ResultadoGoldKiller) => void
}

export interface GoldKillerLW {
  update: (velas: Vela[]) => ResultadoGoldKiller
  aplicar: (velas: Vela[], r: ResultadoGoldKiller) => void
  setInputs: (inputs: Partial<InputsGoldKiller>) => ResultadoGoldKiller | null
  resultado: () => ResultadoGoldKiller | null
  remove: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitivo: fills (fundo) e etiquetas BUY/SELL (frente)
// ─────────────────────────────────────────────────────────────────────────────

class VistaGK implements IPrimitivePaneView {
  constructor(private dono: PrimitivoGK, private camada: 'fundo' | 'frente') {}
  zOrder(): PrimitivePaneViewZOrder { return this.camada === 'fundo' ? 'bottom' : 'top' }
  renderer(): IPrimitivePaneRenderer {
    return { draw: (alvo: Alvo) => (this.camada === 'fundo' ? this.dono.desenharFundo(alvo) : this.dono.desenharFrente(alvo)) }
  }
}

class PrimitivoGK implements ISeriesPrimitive<Time> {
  r: ResultadoGoldKiller | null = null
  velas: Vela[] = []
  fonte = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
  private chart: IChartApi | null = null
  private serie: ISeriesApi<SeriesType, Time> | null = null
  private pedir: (() => void) | null = null
  private vistas = [new VistaGK(this, 'fundo'), new VistaGK(this, 'frente')]
  private base = 0

  attached(p: SeriesAttachedParameter<Time, SeriesType>) {
    this.chart = p.chart as IChartApi
    this.serie = p.series
    this.pedir = p.requestUpdate
  }
  detached() { this.chart = null; this.serie = null; this.pedir = null }
  paneViews() { return this.vistas }
  updateAllViews() { this.calcularBase() }
  redesenhar() { this.calcularBase(); this.pedir?.() }

  private calcularBase() {
    if (!this.chart || this.velas.length === 0) return
    const i = this.chart.timeScale().timeToIndex(this.velas[0].t as UTCTimestamp, true)
    this.base = i == null ? 0 : Number(i)
  }
  private x(barra: number): number | null {
    const c = this.chart?.timeScale().logicalToCoordinate((this.base + barra) as Logical)
    return c == null ? null : c
  }
  private y(preco: number): number | null {
    if (!this.serie || !Number.isFinite(preco)) return null
    const c = this.serie.priceToCoordinate(preco)
    return c == null ? null : c
  }
  private visivel(): { de: number; ate: number } {
    const lr = this.chart?.timeScale().getVisibleLogicalRange()
    if (!lr) return { de: 0, ate: this.velas.length - 1 }
    return { de: Math.max(0, Math.floor(lr.from - this.base) - 1), ate: Math.min(this.velas.length - 1, Math.ceil(lr.to - this.base) + 1) }
  }

  // ── fill(plot, center_line, cor): faixas em degrau, juntando barras seguidas com os mesmos valores ──
  desenharFundo(alvo: Alvo) {
    const r = this.r
    if (!r) return
    const s = r.series
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const { de, ate } = this.visivel()
      const meia = (() => { const a = this.x(1), b = this.x(0); return a != null && b != null ? (a - b) / 2 : 3 })()
      const faixa = (a: number[], b: number[], cor: string) => {
        ctx.fillStyle = cor
        let i = de
        while (i <= ate) {
          if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) { i++; continue }
          let j = i
          while (j + 1 <= ate && a[j + 1] === a[i] && b[j + 1] === b[i]) j++
          const x0 = this.x(i), x1 = this.x(j), ya = this.y(a[i]), yb = this.y(b[i])
          if (x0 != null && x1 != null && ya != null && yb != null) {
            // degrau: o valor da barra i vale de x(i) até x(i+1); a última barra leva meia vela
            const fim = j + 1 < this.velas.length ? (this.x(j + 1) ?? x1 + meia) : x1 + meia
            ctx.fillRect(x0, Math.min(ya, yb), fim - x0, Math.abs(ya - yb))
          }
          i = j + 1
        }
      }
      const verde = corPine(PINE5.green, 98)
      const vermelho = corPine(PINE5.red, 98)
      // Pine: fill(target_100_gain … target_25_gain, center_line) e o mesmo para os drawdowns.
      for (const p of [100, 90, 75, 50, 25] as const) if (r.visiveis[`p${p}`]) faixa(s.ganho[`p${p}`], s.entrada, verde)
      for (const p of [100, 90, 75, 50, 25] as const) if (r.visiveis[`p${p}`]) faixa(s.perda[`p${p}`], s.entrada, vermelho)
      if (r.inputs.average !== 'Disabled') {
        faixa(s.ganhoCustom, s.entrada, corPine(PINE5.blue, 90))
        faixa(s.perdaCustom, s.entrada, corPine(PINE5.purple, 90))
        if (r.inputs.average === 'Average + STDEV') {
          faixa(s.ganhoStdev, s.ganhoCustom, corPine(PINE5.blue, 95))
          faixa(s.perdaStdev, s.perdaCustom, corPine(PINE5.purple, 95))
        }
      }
    })
  }

  // ── plotshape(bull_flip, shape.labelup, location.belowbar) / (bear_flip, labeldown, abovebar) ──
  desenharFrente(alvo: Alvo) {
    const r = this.r
    if (!r) return
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const { de, ate } = this.visivel()
      ctx.save()
      for (const s of r.sinais) {
        if (s.barra < de || s.barra > ate) continue
        const v = this.velas[s.barra]
        if (!v) continue
        const compra = s.lado === 'BUY'
        const x = this.x(s.barra)
        const y = this.y(compra ? v.l : v.h)
        if (x == null || y == null) continue
        this.etiqueta(ctx, compra ? 'BUY' : 'SELL', x, compra ? y + 3 : y - 3, compra ? PINE5.green : PINE5.red, compra)
      }
      ctx.restore()
    })
  }

  private etiqueta(ctx: Ctx, t: string, x: number, y: number, fundo: string, paraCima: boolean) {
    const tam = 9.5
    ctx.font = `600 ${tam}px ${this.fonte}`
    const w = ctx.measureText(t).width + 8
    const hgt = tam + 7
    const bico = 4
    const bx = x - w / 2
    const by = paraCima ? y + bico : y - bico - hgt
    ctx.fillStyle = fundo
    ctx.beginPath()
    const raio = 2
    ctx.moveTo(bx + raio, by)
    ctx.arcTo(bx + w, by, bx + w, by + hgt, raio)
    ctx.arcTo(bx + w, by + hgt, bx, by + hgt, raio)
    ctx.arcTo(bx, by + hgt, bx, by, raio)
    ctx.arcTo(bx, by, bx + w, by, raio)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    if (paraCima) { ctx.moveTo(x, y); ctx.lineTo(x - bico, y + bico); ctx.lineTo(x + bico, y + bico) }
    else { ctx.moveTo(x, y); ctx.lineTo(x - bico, y - bico); ctx.lineTo(x + bico, y - bico) }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = PINE5.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, x, by + hgt / 2 + 0.5)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

export function anexarGoldKiller(chart: IChartApi, serieVelas: ISeriesApi<SeriesType, Time>, opcoes: OpcoesGoldKillerLW = {}): GoldKillerLW {
  let inputs: Partial<InputsGoldKiller> = { ...(opcoes.inputs ?? {}) }
  let ultimo: ResultadoGoldKiller | null = null
  let velasAtuais: Vela[] = []
  const comEtiquetas = opcoes.etiquetasEixo !== false

  const linha = (cor: string, largura: 1 | 2 | 3, degraus: boolean) =>
    chart.addSeries(LineSeries, {
      color: cor, lineWidth: largura, lineType: degraus ? LineType.WithSteps : LineType.Simple,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    })

  // Ordem = ordem dos plot() no Pine.
  const mediaGanho = linha(corPine(PINE5.blue, 25), 3, true)
  const stdevGanho = linha(corPine(PINE5.blue, 70), 2, true)
  const mediaPerda = linha(corPine(PINE5.purple, 25), 3, true)
  const stdevPerda = linha(corPine(PINE5.purple, 70), 2, true)
  const ganho = {} as Record<(typeof PERCENTIS_GK)[number], ISeriesApi<'Line', Time>>
  const perda = {} as Record<(typeof PERCENTIS_GK)[number], ISeriesApi<'Line', Time>>
  // Pine: 100 (gain, drawdown), 90 (gain, drawdown), 75 (drawdown, gain), 50 (gain, drawdown), 25 (drawdown, gain)
  for (const p of [100, 90, 75, 50, 25] as const) {
    const g = () => { ganho[p] = linha(corPine(PINE5.green, TRANSP_NIVEL[p]), 2, true) }
    const d = () => { perda[p] = linha(corPine(PINE5.red, TRANSP_NIVEL[p]), 2, true) }
    if (p === 75 || p === 25) { d(); g() } else { g(); d() }
  }
  const centro = linha(PINE5.gray, 1, false)

  const primitivo = new PrimitivoGK()
  if (opcoes.fonte) primitivo.fonte = opcoes.fonte
  serieVelas.attachPrimitive(primitivo)

  /** etiqueta do último valor na escala de preços (price line sem linha) */
  const etiquetas = new Map<ISeriesApi<'Line', Time>, IPriceLine>()
  const etiquetar = (serie: ISeriesApi<'Line', Time>, valores: number[], mostrar: boolean, cor: string) => {
    if (!comEtiquetas) return
    const ultimoValor = valores.length ? valores[valores.length - 1] : NaN
    const pl = etiquetas.get(serie)
    if (!mostrar || !Number.isFinite(ultimoValor)) {
      if (pl) { serie.removePriceLine(pl); etiquetas.delete(serie) }
      return
    }
    const opc = { price: ultimoValor, color: cor, lineVisible: false, axisLabelVisible: true, axisLabelColor: cor, axisLabelTextColor: '#FFFFFF', title: '' }
    if (pl) pl.applyOptions(opc)
    else etiquetas.set(serie, serie.createPriceLine(opc))
  }

  const dados = (velas: Vela[], serie: number[], mostrar: boolean): (LineData<Time> | WhitespaceData<Time>)[] =>
    velas.map((v, i) => {
      const t = v.t as UTCTimestamp
      const x = serie[i]
      return !mostrar || !Number.isFinite(x) ? { time: t } : { time: t, value: x }
    })

  const desenhar = (r: ResultadoGoldKiller, velas: Vela[]) => {
    const s = r.series
    const media = r.inputs.average !== 'Disabled'
    const comStdev = r.inputs.average === 'Average + STDEV'
    mediaGanho.setData(dados(velas, s.ganhoCustom, media))
    mediaPerda.setData(dados(velas, s.perdaCustom, media))
    stdevGanho.setData(dados(velas, s.ganhoStdev, comStdev))
    stdevPerda.setData(dados(velas, s.perdaStdev, comStdev))
    etiquetar(mediaGanho, s.ganhoCustom, media, corPine(PINE5.blue, 10))
    etiquetar(mediaPerda, s.perdaCustom, media, corPine(PINE5.purple, 10))
    for (const p of PERCENTIS_GK) {
      const ver = r.visiveis[`p${p}`]
      ganho[p].setData(dados(velas, s.ganho[`p${p}`], ver))
      perda[p].setData(dados(velas, s.perda[`p${p}`], ver))
      // etiquetas quase opacas (as linhas a 30-70 % de transparência ficavam ilegíveis na escala)
      etiquetar(ganho[p], s.ganho[`p${p}`], ver, corPine(PINE5.green, 15))
      etiquetar(perda[p], s.perda[`p${p}`], ver, corPine(PINE5.red, 15))
    }
    centro.setData(dados(velas, s.entrada, true))
    etiquetar(centro, s.entrada, true, PINE5.gray)
    primitivo.r = r
    primitivo.velas = velas
    primitivo.redesenhar()
  }

  const correr = () => {
    const r = calcularGoldKiller(velasAtuais, inputs)
    ultimo = r
    desenhar(r, velasAtuais)
    opcoes.aoCalcular?.(r)
    return r
  }

  return {
    update(velas) {
      velasAtuais = velas
      return correr()
    },
    aplicar(velas, r) {
      velasAtuais = velas
      inputs = { ...inputs, ...r.inputs }
      ultimo = r
      desenhar(r, velas)
      opcoes.aoCalcular?.(r)
    },
    setInputs(novos) {
      inputs = { ...inputs, ...novos }
      return velasAtuais.length ? correr() : null
    },
    resultado: () => ultimo,
    remove() {
      serieVelas.detachPrimitive(primitivo)
      for (const x of [mediaGanho, stdevGanho, mediaPerda, stdevPerda, ...Object.values(ganho), ...Object.values(perda), centro]) chart.removeSeries(x)
      etiquetas.clear()
      ultimo = null
    },
  }
}
