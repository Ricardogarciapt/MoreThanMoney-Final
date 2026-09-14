/**
 * MTM Sensei — adaptador para Lightweight Charts v5 (5.2.1).
 *
 * Desenha o resultado de `calcularSensei` com o mesmo aspeto do script do TradingView:
 *  - plot()        → LineSeries (DEMA 15/50/238, POC em círculos, Banda U1/L1 com cor por barra, Cloud F/S)
 *  - fill()        → primitivo de fundo (banda 92 % transp., cloud 45 %)
 *  - plotshape()   → marcadores (createSeriesMarkers): ▲/▼ do sinal, triângulos de Momentum,
 *                    quadrados de Exaustão (o LW não tem losango) e círculos de swing
 *  - label.new()   → primitivo de frente: badge «CON  +12/20  SL:450p», CHoCH/BOS/IDM/x, eventos E1-E4
 *  - line.new()    → segmentos de estrutura (tracejado/pontilhado como no Pine)
 *  - box.new()     → order blocks (último bull e último bear, até bar_index + 25)
 *  - trade ativa   → linhas ENTRY/SL/EXIT 1-4 com linefill e etiquetas à direita (Mostrar Ativo)
 *
 * barcolor() não é aplicado aqui (mexeria nos dados da série de velas, que são do gráfico):
 * `coresDasVelas(resultado)` devolve { t → cor } para quem gere as velas as pintar.
 *
 * Uso (em grafico-leve, depois de criar `chart` e a série de velas):
 *   const sensei = anexarSensei(chart, serieVelas, { inputs: { simbolo: 'XAUUSD' } })
 *   sensei.update(velas, { velasHTF, velasLTF })   // a cada vela nova (ou com throttle)
 *   sensei.remove()                                // ao desmontar / desligar o estudo
 * `velas` têm de ser as MESMAS velas (mesmos tempos) que estão na série de velas.
 */
import {
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ISeriesPrimitive,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type LineData,
  type Logical,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts'
import { calcularSensei } from './motor'
import { corPine, paletaSensei, PINE } from './inputs'
import type { DadosExtra, EstiloLinha, InputsSensei, ResultadoSensei, Vela } from './tipos'

type Alvo = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Ctx = CanvasRenderingContext2D

export interface OpcoesSenseiLW {
  inputs?: Partial<InputsSensei>
  /** Tamanho de letra base (px) — size.small do Pine ≈ 11, tiny ≈ 9, normal ≈ 12. */
  fonte?: string
  /** Callback depois de cada cálculo (ex.: alimentar o <ChecklistSensei/>). */
  aoCalcular?: (r: ResultadoSensei) => void
}

export interface SenseiLW {
  /** Recalcula e redesenha. Devolve o resultado (sinais, estado da última barra…). */
  update: (velas: Vela[], extra?: DadosExtra) => ResultadoSensei
  /** Muda inputs e recalcula com as últimas velas. */
  setInputs: (inputs: Partial<InputsSensei>) => ResultadoSensei | null
  resultado: () => ResultadoSensei | null
  remove: () => void
}

const TXT = { tiny: 9, small: 11, normal: 12 }

/** barcolor(): mapa tempo → cor para quem pinta as velas. */
export function coresDasVelas(r: ResultadoSensei, velas: Vela[]): Map<number, string> {
  const m = new Map<number, string>()
  r.series.corVela.forEach((cor, i) => { if (cor && velas[i]) m.set(velas[i].t, cor) })
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitivo de desenho
// ─────────────────────────────────────────────────────────────────────────────

class VistaSensei implements IPrimitivePaneView {
  constructor(private dono: PrimitivoSensei, private camada: 'fundo' | 'frente') {}
  zOrder(): PrimitivePaneViewZOrder { return this.camada === 'fundo' ? 'bottom' : 'top' }
  renderer(): IPrimitivePaneRenderer {
    return { draw: (alvo: Alvo) => (this.camada === 'fundo' ? this.dono.desenharFundo(alvo) : this.dono.desenharFrente(alvo)) }
  }
}

class PrimitivoSensei implements ISeriesPrimitive<Time> {
  r: ResultadoSensei | null = null
  velas: Vela[] = []
  fonte = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  private chart: IChartApi | null = null
  private serie: ISeriesApi<SeriesType, Time> | null = null
  private pedir: (() => void) | null = null
  private vistas = [new VistaSensei(this, 'fundo'), new VistaSensei(this, 'frente')]
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

  /** bar_index → índice lógico da escala de tempo (a 1.ª vela pode não ser o índice 0 do gráfico). */
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
    if (!this.serie || Number.isNaN(preco)) return null
    const c = this.serie.priceToCoordinate(preco)
    return c == null ? null : c
  }
  private visivel(): { de: number; ate: number } {
    const lr = this.chart?.timeScale().getVisibleLogicalRange()
    if (!lr) return { de: 0, ate: this.velas.length - 1 }
    return { de: Math.max(0, Math.floor(lr.from - this.base) - 1), ate: Math.min(this.velas.length - 1, Math.ceil(lr.to - this.base) + 1) }
  }

  // ── fundo: fill(banda) e fill(cloud) ──
  desenharFundo(alvo: Alvo) {
    const r = this.r
    if (!r) return
    const inp = r.inputs
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const { de, ate } = this.visivel()
      const faixa = (a: number[], b: number[], cor: (i: number) => string) => {
        for (let i = Math.max(1, de); i <= ate; i++) {
          const x0 = this.x(i - 1), x1 = this.x(i)
          const a0 = this.y(a[i - 1]), a1 = this.y(a[i]), b0 = this.y(b[i - 1]), b1 = this.y(b[i])
          if (x0 == null || x1 == null || a0 == null || a1 == null || b0 == null || b1 == null) continue
          ctx.beginPath()
          ctx.moveTo(x0, a0); ctx.lineTo(x1, a1); ctx.lineTo(x1, b1); ctx.lineTo(x0, b0); ctx.closePath()
          ctx.fillStyle = cor(i)
          ctx.fill()
        }
      }
      const s = r.series
      if (inp.showBands) faixa(s.bandaU1, s.bandaL1, (i) => corPine(s.cloudBull[i] ? inp.senseiBullCol : inp.senseiBearCol, 92))
      if (inp.showCloud) faixa(s.cloudRapida, s.cloudLenta, (i) => corPine(s.cloudBull[i] ? inp.senseiBullCol : inp.senseiBearCol, 45))
    })
  }

  // ── frente: estrutura, OB, badges, trade ativa ──
  desenharFrente(alvo: Alvo) {
    const r = this.r
    if (!r) return
    const th = paletaSensei(r.inputs.themeMode)
    alvo.useMediaCoordinateSpace(({ context: ctx }) => {
      const { de, ate } = this.visivel()
      ctx.save()
      ctx.textBaseline = 'middle'

      // order blocks (box.new)
      for (const ob of r.orderBlocks) {
        const x0 = this.x(ob.barraInicio), x1 = this.x(ob.barraFim), y0 = this.y(ob.topo), y1 = this.y(ob.fundo)
        if (x0 == null || x1 == null || y0 == null || y1 == null) continue
        ctx.fillStyle = corPine(ob.cor, 88)
        ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0))
        ctx.strokeStyle = corPine(ob.cor, 20)
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.strokeRect(x0 + 0.5, Math.min(y0, y1) + 0.5, x1 - x0, Math.abs(y1 - y0))
        this.texto(ctx, ob.texto, (x0 + x1) / 2, (y0 + y1) / 2, ob.cor, TXT.tiny, 'center')
      }

      // estrutura (line.new + label.new sem fundo)
      for (const e of r.estrutura) {
        if (e.barraFim < de - 5 || e.barraInicio > ate + 20) continue
        const x0 = this.x(e.barraInicio), x1 = this.x(e.barraFim), y = this.y(e.preco)
        if (x0 == null || x1 == null || y == null) continue
        ctx.strokeStyle = e.cor
        ctx.lineWidth = 1
        this.estilo(ctx, e.estilo)
        ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); ctx.stroke()
        // as linhas de histórico levam a etiqueta a meio; as extensões ativas levam-na no fim
        const xl = e.extensao ? x1 : this.x(Math.trunc((e.barraInicio + e.barra) / 2))
        if (xl == null) continue
        const tam = e.tipo === 'SWEEP' ? TXT.small : TXT.tiny
        this.texto(ctx, e.texto, xl, e.etiqueta === 'acima' ? y - tam * 0.9 : y + tam * 0.9, e.cor, tam, 'center')
      }
      ctx.setLineDash([])

      // badges de sinal (label.new style_label_up / _down)
      for (const s of r.sinais) {
        if (s.barra < de || s.barra > ate) continue
        const x = this.x(s.barra), y = this.y(s.precoEtiqueta)
        if (x == null || y == null) continue
        this.badge(ctx, s.texto, x, y, s.cor, PINE.white, TXT.small, s.lado === 'BUY' ? 'cima' : 'baixo')
      }

      // eventos E1-E4 / SL / BE (Mostrar Tudo)
      for (const m of r.marcas) {
        if (m.tipo !== 'evento' || m.barra < de || m.barra > ate || m.preco == null) continue
        const x = this.x(m.barra), y = this.y(m.preco)
        if (x == null || y == null) continue
        this.badge(ctx, m.texto ?? '', x, y, m.cor, PINE.white, TXT.tiny, 'esquerda')
      }

      // trade ativa (barstate.islast)
      const u = r.ultima
      if (u && u.tradeAtiva && u.niveis && u.curPos) {
        const n = u.barra
        const xIni = this.x(n - 1)      // et_ = time[1]
        const xFim = this.x(n + 8)      // trange_ = time + (time - time[4]) * 2
        const xLbl = this.x(n + 16)     // tlb_ = time + (time - time[4]) * 4
        const casas = Math.max(0, Math.round(-Math.log10(r.mintick)))
        const f = (p: number) => String(Number(p.toFixed(casas)))
        const yE = this.y(u.entry)
        if (xIni != null && xFim != null && xLbl != null && yE != null) {
          const linha = (preco: number, cor: string, largura: number, fillTransp: number | null, estilo: EstiloLinha, rotulo: string) => {
            const y = this.y(preco)
            if (y == null) return
            if (fillTransp != null) {
              ctx.fillStyle = corPine(cor, fillTransp)
              ctx.fillRect(xIni, Math.min(y, yE), xFim - xIni, Math.abs(y - yE))
            }
            ctx.strokeStyle = cor
            ctx.lineWidth = largura
            this.estilo(ctx, estilo)
            ctx.beginPath(); ctx.moveTo(xIni, y); ctx.lineTo(xFim, y); ctx.stroke()
            ctx.setLineDash([])
            this.badge(ctx, rotulo, xLbl, y, corPine(cor, 8), PINE.white, TXT.normal, 'esquerda')
          }
          const inp = r.inputs
          const emoji = u.actScore >= 18 ? '👑' : u.actScore >= 15 ? '💎' : u.actScore >= 12 ? '⚡' : u.actScore >= 9 ? '⚠️' : '🔴'
          const beC = u.beTrig ? th.hex.beLine : th.hex.slLine
          const beTx = u.beTrig ? 'BE ⭕  ' : u.trailAtivo ? 'TRAIL ❌  ' : 'SL ❌  '
          const lv = u.niveis
          const tps: [number, string, number, EstiloLinha][] = [
            [lv.tp1, th.hex.tp1Line, 92, 'solid'], [lv.tp2, th.hex.tp2Line, 94, 'solid'],
            [lv.tp3, th.hex.tp3Line, 95, 'solid'], [lv.tp4, th.hex.tp4Line, 96, 'dashed'],
          ]
          const mostrar = [inp.showTP1, inp.showTP2, inp.showTP3, inp.showTP4]
          tps.forEach(([p, cor, tr, est], k) => {
            if (!mostrar[k] || Number.isNaN(p) || u.tpHit[k]) return
            linha(p, cor, 1, tr, est, `EXIT ${k + 1}  1:${u.rr[k].toFixed(1).replace(/\.0$/, '')}  ${u.pct[k]}%   ${f(p)}`)
          })
          linha(u.effSl, beC, 2, 91, 'solid', `${beTx}${f(u.effSl)}  [${lv.slPips}p]`)
          linha(u.entry, th.hex.entryLine, 2, null, 'solid', `ENTRY  ${f(u.entry)}   ${u.curPos === 'BUY' ? '▲ BUY' : '▼ SELL'}   ${u.actScore}/20 ${emoji}`)
        }
      }
      ctx.restore()
    })
  }

  private estilo(ctx: Ctx, e: EstiloLinha) {
    ctx.setLineDash(e === 'dashed' ? [6, 4] : e === 'dotted' ? [2, 3] : [])
  }
  private texto(ctx: Ctx, t: string, x: number, y: number, cor: string, tam: number, alinhar: CanvasTextAlign) {
    ctx.font = `${tam}px ${this.fonte}`
    ctx.fillStyle = cor
    ctx.textAlign = alinhar
    ctx.fillText(t, x, y)
  }
  /** Etiqueta com fundo e bico, como label.style_label_up / _down / _left. */
  private badge(ctx: Ctx, t: string, x: number, y: number, fundo: string, cor: string, tam: number, bico: 'cima' | 'baixo' | 'esquerda') {
    ctx.font = `${tam}px ${this.fonte}`
    const w = ctx.measureText(t).width + tam * 1.2
    const hgt = tam * 1.9
    const b = 5
    let bx = x - w / 2
    let by = y + b
    if (bico === 'baixo') by = y - b - hgt
    if (bico === 'esquerda') { bx = x + b; by = y - hgt / 2 }
    ctx.fillStyle = fundo
    ctx.beginPath()
    const raio = 3
    ctx.moveTo(bx + raio, by)
    ctx.arcTo(bx + w, by, bx + w, by + hgt, raio)
    ctx.arcTo(bx + w, by + hgt, bx, by + hgt, raio)
    ctx.arcTo(bx, by + hgt, bx, by, raio)
    ctx.arcTo(bx, by, bx + w, by, raio)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    if (bico === 'cima') { ctx.moveTo(x, y); ctx.lineTo(x - b, y + b); ctx.lineTo(x + b, y + b) }
    else if (bico === 'baixo') { ctx.moveTo(x, y); ctx.lineTo(x - b, y - b); ctx.lineTo(x + b, y - b) }
    else { ctx.moveTo(x, y); ctx.lineTo(x + b, y - b); ctx.lineTo(x + b, y + b) }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = cor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, bx + w / 2, by + hgt / 2 + 0.5)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

export function anexarSensei(chart: IChartApi, serieVelas: ISeriesApi<SeriesType, Time>, opcoes: OpcoesSenseiLW = {}): SenseiLW {
  let inputs: Partial<InputsSensei> = { ...(opcoes.inputs ?? {}) }
  let ultimo: ResultadoSensei | null = null
  let velasAtuais: Vela[] = []
  let extraAtual: DadosExtra = {}

  const linha = (cor: string, largura: 1 | 2, extra: Record<string, unknown> = {}) =>
    chart.addSeries(LineSeries, {
      color: cor, lineWidth: largura, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false, ...extra,
    })
  const s = {
    dema15: linha('#3B82F6', 1),
    dema50: linha('#10B981', 1),
    dema238: linha('#F59E0B', 2),
    poc: linha(PINE.orange, 1, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 }),
    u1: linha('#7C3AED', 1),
    l1: linha('#7C3AED', 1),
    cf: linha('#7C3AED', 1),
    cs: linha('#374151', 1),
  }
  const primitivo = new PrimitivoSensei()
  if (opcoes.fonte) primitivo.fonte = opcoes.fonte
  serieVelas.attachPrimitive(primitivo)
  const marcadores: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(serieVelas, [], { autoScale: false })

  const dados = (velas: Vela[], serie: number[], mostrar: boolean, cor?: (i: number) => string): (LineData<Time> | WhitespaceData<Time>)[] =>
    velas.map((v, i) => {
      const t = v.t as UTCTimestamp
      const x = serie[i]
      if (!mostrar || Number.isNaN(x)) return { time: t }
      return cor ? { time: t, value: x, color: cor(i) } : { time: t, value: x }
    })

  const desenhar = (r: ResultadoSensei, velas: Vela[]) => {
    const inp = r.inputs
    const se = r.series
    const th = paletaSensei(inp.themeMode)
    s.dema15.setData(dados(velas, se.dema15, inp.showDEMA))
    s.dema50.setData(dados(velas, se.dema50, inp.showDEMA))
    s.dema238.setData(dados(velas, se.dema238, inp.showDEMA))
    s.poc.setData(dados(velas, se.poc, inp.showPOC))
    const corBanda = (i: number) => corPine(se.cloudBull[i] ? inp.senseiBullCol : inp.senseiBearCol, 10)
    s.u1.setData(dados(velas, se.bandaU1, inp.showBands, corBanda))
    s.l1.setData(dados(velas, se.bandaL1, inp.showBands, corBanda))
    s.cf.applyOptions({ color: corPine(inp.senseiBullCol, 20) })
    s.cs.applyOptions({ color: corPine(inp.senseiBearCol, 20) })
    s.cf.setData(dados(velas, se.cloudRapida, inp.showCloud))
    s.cs.setData(dados(velas, se.cloudLenta, inp.showCloud))

    const mk: SeriesMarker<Time>[] = []
    for (const sinal of r.sinais) {
      mk.push({ time: sinal.t as UTCTimestamp, position: sinal.lado === 'BUY' ? 'belowBar' : 'aboveBar', shape: sinal.lado === 'BUY' ? 'arrowUp' : 'arrowDown', color: corPine(sinal.lado === 'BUY' ? th.hex.bull : th.hex.bear, 10), size: 1.2 })
    }
    for (const m of r.marcas) {
      const time = m.t as UTCTimestamp
      if (m.tipo === 'momBuy') mk.push({ time, position: 'belowBar', shape: 'arrowUp', color: m.cor, size: 0.6 })
      else if (m.tipo === 'momSell') mk.push({ time, position: 'aboveBar', shape: 'arrowDown', color: m.cor, size: 0.6 })
      else if (m.tipo === 'exhBuy') mk.push({ time, position: 'belowBar', shape: 'square', color: m.cor, size: 0.6 })
      else if (m.tipo === 'exhSell') mk.push({ time, position: 'aboveBar', shape: 'square', color: m.cor, size: 0.6 })
      else if ((m.tipo === 'swingHigh' || m.tipo === 'swingLow') && m.preco != null) mk.push({ time, position: 'atPriceMiddle', price: m.preco, shape: 'circle', color: m.cor, size: 1 })
    }
    mk.sort((a, b) => Number(a.time) - Number(b.time))
    marcadores.setMarkers(mk)

    primitivo.r = r
    primitivo.velas = velas
    primitivo.redesenhar()
  }

  const correr = () => {
    const r = calcularSensei(velasAtuais, inputs, extraAtual)
    ultimo = r
    desenhar(r, velasAtuais)
    opcoes.aoCalcular?.(r)
    return r
  }

  return {
    update(velas, extra) {
      velasAtuais = velas
      if (extra) extraAtual = extra
      return correr()
    },
    setInputs(novos) {
      inputs = { ...inputs, ...novos }
      return velasAtuais.length ? correr() : null
    },
    resultado: () => ultimo,
    remove() {
      marcadores.detach()
      serieVelas.detachPrimitive(primitivo)
      for (const x of Object.values(s)) chart.removeSeries(x)
      ultimo = null
    },
  }
}
