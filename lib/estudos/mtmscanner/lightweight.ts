/**
 * MTM Scanner — adaptador para Lightweight Charts v5 (5.2.1).
 *
 * Desenha o resultado de `calcularMTMScanner` com o aspeto do script no TradingView:
 *  - plot(dema15/50/238)      → LineSeries azul / verde / #ffce2b
 *  - plot(POC)                → LineSeries laranja, linha simples (os saltos ficam na vertical, como no TV)
 *  - plotshape B / S          → primitivo de frente: etiqueta verde «B» por baixo / vermelha «S» por cima
 *  - plotshape das fases      → dígitos ₀…₉ por cima da vela (verde bSC em «Detalhado», vermelho sSC em
 *                               «Completo» — é o que o Pine faz), nada em «Nenhum» (o default)
 *  - plotshape(S.bSC/S.sSC)   → círculos pequenos «Reversão Possivel»: verde por baixo com bSC ≠ 0,
 *                               vermelho por cima com sSC ≠ 0 (o int vira bool no Pine v5)
 *  - line.new/label.new       → estrutura CHoCH (tracejado), BOS (cheio), IDM e «x» (pontilhado),
 *                               extensões da última barra
 *  - plot(top/btm, circles, offset=-len) → círculos a 50 % na vela do swing
 *  - caixa da posição         → linhas Entry (roxo) / Stop (vermelho) / TP1-3 (verde) de time[1] até
 *                               time + dt·2, linefill 85/90/95 e etiquetas «style_label_left» em time + dt·4
 *
 * Uso (em grafico-leve):
 *   const ms = anexarMTMScanner(chart, serieVelas, { inputs: { simbolo: 'XAUUSD' } })
 *   ms.update(velas)          // calcula aqui e desenha
 *   ms.aplicar(velas, r)      // desenha um resultado calculado fora (Web Worker)
 *   ms.remove()
 */
import {
  LineSeries,
  type IChartApi,
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
import { calcularMTMScanner, fmt } from './motor'
import { PINE5_MS } from './inputs'
import type { EstiloLinhaMS, InputsMTMScanner, ResultadoMTMScanner, Vela } from './tipos'

type Alvo = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Ctx = CanvasRenderingContext2D

export interface OpcoesMTMScannerLW {
  inputs?: Partial<InputsMTMScanner>
  fonte?: string
  /** Etiquetas DEMA/POC na escala de preços (por defeito sim). */
  etiquetasEixo?: boolean
  aoCalcular?: (r: ResultadoMTMScanner) => void
}

export interface MTMScannerLW {
  update: (velas: Vela[]) => ResultadoMTMScanner
  aplicar: (velas: Vela[], r: ResultadoMTMScanner) => void
  setInputs: (inputs: Partial<InputsMTMScanner>) => ResultadoMTMScanner | null
  resultado: () => ResultadoMTMScanner | null
  remove: () => void
}

const TXT = { tiny: 9, small: 11, normal: 12 }
const DIGITOS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']

class VistaMS implements IPrimitivePaneView {
  constructor(private dono: PrimitivoMS, private camada: 'fundo' | 'frente') {}
  zOrder(): PrimitivePaneViewZOrder { return this.camada === 'fundo' ? 'bottom' : 'top' }
  renderer(): IPrimitivePaneRenderer {
    return { draw: (alvo: Alvo) => (this.camada === 'fundo' ? this.dono.desenharFundo(alvo) : this.dono.desenharFrente(alvo)) }
  }
}

class PrimitivoMS implements ISeriesPrimitive<Time> {
  r: ResultadoMTMScanner | null = null
  velas: Vela[] = []
  fonte = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
  private chart: IChartApi | null = null
  private serie: ISeriesApi<SeriesType, Time> | null = null
  private pedir: (() => void) | null = null
  private vistas = [new VistaMS(this, 'fundo'), new VistaMS(this, 'frente')]
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
    if (!Number.isFinite(barra)) return null
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
  private larguraBarra(): number {
    const a = this.x(1), b = this.x(0)
    return a != null && b != null ? Math.abs(a - b) : 6
  }

  // ── linefill da caixa da posição ──
  desenharFundo(alvo: Alvo) {
    const cx = this.r?.caixa
    if (!cx) return
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const x0 = this.x(cx.barraInicio), x1 = this.x(cx.barraFim), yE = this.y(cx.entry)
      if (x0 == null || x1 == null || yE == null) return
      const faixa = (preco: number, cor: string) => {
        const y = this.y(preco)
        if (y == null) return
        ctx.fillStyle = cor
        ctx.fillRect(x0, Math.min(y, yE), x1 - x0, Math.abs(y - yE))
      }
      for (const tp of cx.tps) if (tp.fill != null) faixa(tp.preco, corPine(PINE5_MS.green, tp.fill))
      faixa(cx.sl, corPine(PINE5_MS.red, 85))
    })
  }

  desenharFrente(alvo: Alvo) {
    const r = this.r
    if (!r) return
    const inp = r.inputs
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const { de, ate } = this.visivel()
      const lb = this.larguraBarra()
      ctx.save()
      ctx.textBaseline = 'middle'

      // plotshape(S.bSC / S.sSC, shape.circle, size.tiny)
      if (inp.mostrarReversao && lb >= 3) {
        const raio = Math.max(1.2, Math.min(2.5, lb * 0.22))
        for (let i = de; i <= ate; i++) {
          const v = this.velas[i]
          const x = this.x(i)
          if (!v || x == null) continue
          const b = r.series.bSC[i], s = r.series.sSC[i]
          if (Number.isFinite(b) && b !== 0) {
            const y = this.y(v.l)
            if (y != null) this.circulo(ctx, x, y + 3 + raio, raio, PINE5_MS.green)
          }
          if (Number.isFinite(s) && s !== 0) {
            const y = this.y(v.h)
            if (y != null) this.circulo(ctx, x, y - 3 - raio, raio, PINE5_MS.red)
          }
        }
      }

      // Fases: plotshape(text='₁'…) por cima da vela
      if (inp.bSh !== 'Nenhum' && lb >= 5) {
        const serie = inp.bSh === 'Detalhado' ? r.series.bSC : r.series.sSC
        const cor = inp.bSh === 'Detalhado' ? PINE5_MS.gnC : PINE5_MS.rdC
        for (let i = de; i <= ate; i++) {
          const k = serie[i]
          const v = this.velas[i]
          const x = this.x(i)
          if (!v || x == null || !Number.isInteger(k) || k < 0 || k > 9) continue
          const y = this.y(v.h)
          if (y != null) this.texto(ctx, DIGITOS[k], x, y - (inp.mostrarReversao ? 16 : 9), cor, TXT.small, 'center')
        }
      }

      // swings: plot(top/btm, style_circles, linewidth 5, offset = -len)
      for (const s of r.swings) {
        if (s.barra < de || s.barra > ate) continue
        const x = this.x(s.barra), y = this.y(s.preco)
        if (x == null || y == null) continue
        this.circulo(ctx, x, y, 2.5, corPine(s.alto ? inp.bearCss : inp.bullCss, 50))
      }

      // estrutura
      for (const e of r.estrutura) {
        if (e.barraFim < de - 5 || e.barraInicio > ate + 20) continue
        const x0 = this.x(e.barraInicio), x1 = this.x(e.barraFim), y = this.y(e.preco)
        if (x0 == null || x1 == null || y == null) continue
        ctx.strokeStyle = e.cor
        ctx.lineWidth = 1
        this.estilo(ctx, e.estilo)
        ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke()
        ctx.setLineDash([])
        const xl = this.x(e.barraEtiqueta)
        if (xl == null) continue
        const tam = e.tipo === 'SWEEP' ? TXT.normal : TXT.tiny
        this.texto(ctx, e.texto, xl, e.etiqueta === 'acima' ? y - tam * 0.9 : y + tam * 0.9, e.cor, tam, 'center')
      }

      // B / S
      for (const s of r.sinais) {
        if (s.barra < de || s.barra > ate) continue
        const v = this.velas[s.barra]
        const x = this.x(s.barra)
        if (!v || x == null) continue
        const compra = s.lado === 'BUY'
        const y = this.y(compra ? v.l : v.h)
        if (y == null) continue
        const folga = inp.mostrarReversao ? 9 : 3
        this.etiquetaSinal(ctx, compra ? 'B' : 'S', x, compra ? y + folga : y - folga, compra ? PINE5_MS.green : PINE5_MS.red, compra)
      }

      // caixa da posição (barstate.islast)
      const cx = r.caixa
      if (cx) {
        const x0 = this.x(cx.barraInicio), x1 = this.x(cx.barraFim), xl = this.x(cx.barraEtiqueta)
        if (x0 != null && x1 != null && xl != null) {
          const linha = (preco: number, cor: string, rotulo: string, fundo: string) => {
            const y = this.y(preco)
            if (y == null) return
            ctx.strokeStyle = cor
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke()
            this.etiquetaEsquerda(ctx, rotulo, xl, y, fundo)
          }
          for (const tp of cx.tps) linha(tp.preco, PINE5_MS.green, tp.texto, PINE5_MS.green)
          linha(cx.sl, PINE5_MS.red, `Stop:${fmt(cx.sl, r.mintick)}`, PINE5_MS.red)
          linha(cx.entry, PINE5_MS.purple, `Entry:${fmt(cx.entry, r.mintick)}`, PINE5_MS.blue)
        }
      }
      ctx.restore()
    })
  }

  private estilo(ctx: Ctx, e: EstiloLinhaMS) {
    ctx.setLineDash(e === 'dashed' ? [6, 4] : e === 'dotted' ? [2, 3] : [])
  }
  private circulo(ctx: Ctx, x: number, y: number, raio: number, cor: string) {
    ctx.fillStyle = cor
    ctx.beginPath()
    ctx.arc(x, y, raio, 0, Math.PI * 2)
    ctx.fill()
  }
  private texto(ctx: Ctx, t: string, x: number, y: number, cor: string, tam: number, alinhar: CanvasTextAlign) {
    ctx.font = `${tam}px ${this.fonte}`
    ctx.fillStyle = cor
    ctx.textAlign = alinhar
    ctx.textBaseline = 'middle'
    ctx.fillText(t, x, y)
  }
  private caixaArredondada(ctx: Ctx, bx: number, by: number, w: number, hgt: number, raio: number) {
    ctx.beginPath()
    ctx.moveTo(bx + raio, by)
    ctx.arcTo(bx + w, by, bx + w, by + hgt, raio)
    ctx.arcTo(bx + w, by + hgt, bx, by + hgt, raio)
    ctx.arcTo(bx, by + hgt, bx, by, raio)
    ctx.arcTo(bx, by, bx + w, by, raio)
    ctx.closePath()
  }
  /** shape.labelup / labeldown, size.tiny */
  private etiquetaSinal(ctx: Ctx, t: string, x: number, y: number, fundo: string, paraCima: boolean) {
    const tam = 9.5
    ctx.font = `600 ${tam}px ${this.fonte}`
    const w = Math.max(ctx.measureText(t).width + 8, 14)
    const hgt = tam + 6
    const bico = 4
    const bx = x - w / 2
    const by = paraCima ? y + bico : y - bico - hgt
    ctx.fillStyle = fundo
    this.caixaArredondada(ctx, bx, by, w, hgt, 2)
    ctx.fill()
    ctx.beginPath()
    if (paraCima) { ctx.moveTo(x, y); ctx.lineTo(x - bico, y + bico); ctx.lineTo(x + bico, y + bico) }
    else { ctx.moveTo(x, y); ctx.lineTo(x - bico, y - bico); ctx.lineTo(x + bico, y - bico) }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = PINE5_MS.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, x, by + hgt / 2 + 0.5)
  }
  /** label.style_label_left, size.normal: o bico aponta para o preço à esquerda. */
  private etiquetaEsquerda(ctx: Ctx, t: string, x: number, y: number, fundo: string) {
    const tam = TXT.normal
    ctx.font = `${tam}px ${this.fonte}`
    const w = ctx.measureText(t).width + 12
    const hgt = tam + 8
    const bico = 5
    const bx = x + bico
    const by = y - hgt / 2
    ctx.fillStyle = fundo
    this.caixaArredondada(ctx, bx, by, w, hgt, 3)
    ctx.fill()
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, y - bico); ctx.lineTo(bx, y + bico); ctx.closePath(); ctx.fill()
    ctx.fillStyle = PINE5_MS.white
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, bx + 6, y + 0.5)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

export function anexarMTMScanner(chart: IChartApi, serieVelas: ISeriesApi<SeriesType, Time>, opcoes: OpcoesMTMScannerLW = {}): MTMScannerLW {
  let inputs: Partial<InputsMTMScanner> = { ...(opcoes.inputs ?? {}) }
  let ultimo: ResultadoMTMScanner | null = null
  let velasAtuais: Vela[] = []
  const comEtiquetas = opcoes.etiquetasEixo !== false

  const linha = (cor: string) =>
    chart.addSeries(LineSeries, {
      color: cor, lineWidth: 1, priceLineVisible: false, lastValueVisible: comEtiquetas, crosshairMarkerVisible: false,
    })
  // Ordem = ordem dos plot() no Pine.
  const s = {
    dema15: linha(PINE5_MS.blue),
    dema50: linha(PINE5_MS.green),
    dema238: linha(PINE5_MS.dema238),
    poc: linha(PINE5_MS.orange),
  }
  const primitivo = new PrimitivoMS()
  if (opcoes.fonte) primitivo.fonte = opcoes.fonte
  serieVelas.attachPrimitive(primitivo)

  const dados = (velas: Vela[], serie: number[]): (LineData<Time> | WhitespaceData<Time>)[] =>
    velas.map((v, i) => {
      const t = v.t as UTCTimestamp
      const x = serie[i]
      return Number.isFinite(x) ? { time: t, value: x } : { time: t }
    })

  const desenharResultado = (r: ResultadoMTMScanner, velas: Vela[]) => {
    s.dema15.setData(dados(velas, r.series.dema15))
    s.dema50.setData(dados(velas, r.series.dema50))
    s.dema238.setData(dados(velas, r.series.dema238))
    s.poc.setData(dados(velas, r.series.poc))
    primitivo.r = r
    primitivo.velas = velas
    primitivo.redesenhar()
  }

  const correr = () => {
    const r = calcularMTMScanner(velasAtuais, inputs)
    ultimo = r
    desenharResultado(r, velasAtuais)
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
      desenharResultado(r, velas)
      opcoes.aoCalcular?.(r)
    },
    setInputs(novos) {
      inputs = { ...inputs, ...novos }
      return velasAtuais.length ? correr() : null
    },
    resultado: () => ultimo,
    remove() {
      serieVelas.detachPrimitive(primitivo)
      for (const x of Object.values(s)) chart.removeSeries(x)
      ultimo = null
    },
  }
}
