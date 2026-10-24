"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, EyeOff, Minus, MousePointer2, Trash2, TrendingUp, Type } from "lucide-react"
import {
  CLIQUES, criarDesenho, guardarDesenhos, lerDesenhos, niveisFibo,
  type Desenho, type FerramentaDesenho, type PontoDesenho,
} from "@/lib/webtrader/desenhos"

/**
 * OS DESENHOS NO GRÁFICO (lib/webtrader/desenhos.ts) — a barra de ferramentas à esquerda do gráfico,
 * como no MT5 e no TradeLocker, e o desenho no canvas como primitiva da série (acompanha pan, zoom e
 * escala, como as zonas da ferramenta Long/Short).
 *
 * Com uma ferramenta escolhida, uma camada por cima do gráfico apanha os cliques (e só então: fora
 * disso o gráfico arrasta-se e as linhas de SL/TP mexem-se como sempre). Esc cancela; depois de cada
 * desenho volta-se ao cursor.
 */

const COR = "#E9C46A"
const COR_FIBO = ["#787B86", "#F23645", "#FF9800", "#4CAF50", "#089981", "#2962FF", "#787B86"]

/** x de um tempo: a vela mais próxima (o desenho fica no sítio ao mudar de timeframe). */
function xDoTempo(chart: any, t: number): number | null {
  const ts = chart.timeScale()
  const direto = ts.timeToCoordinate(t)
  if (direto != null) return direto
  try {
    const i = ts.timeToIndex?.(t, true)
    return i == null ? null : ts.logicalToCoordinate(i)
  } catch { return null }
}

class PrimitivaDesenhos {
  private serie: any = null
  private pedir: (() => void) | null = null
  desenhos: Desenho[] = []
  provisorio: Desenho | null = null
  visiveis = true
  constructor(private chart: any) {}
  attached(p: { series: any; requestUpdate: () => void }) { this.serie = p.series; this.pedir = p.requestUpdate }
  detached() { this.serie = null; this.pedir = null }
  definir(desenhos: Desenho[], provisorio: Desenho | null, visiveis: boolean) {
    this.desenhos = desenhos; this.provisorio = provisorio; this.visiveis = visiveis
    this.pedir?.()
  }
  updateAllViews() { /* as coordenadas calculam-se no draw */ }
  paneViews() {
    return [{
      zOrder: () => "top" as const,
      renderer: () => ({
        draw: (alvo: any) => {
          const serie = this.serie
          if (!serie || !this.visiveis) return
          const todos = this.provisorio ? [...this.desenhos, this.provisorio] : this.desenhos
          if (!todos.length) return
          alvo.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
            const y = (p: number) => serie.priceToCoordinate(p) as number | null
            ctx.lineWidth = 1.5
            ctx.font = "11px ui-sans-serif, system-ui"
            for (const d of todos) {
              ctx.setLineDash(d === this.provisorio ? [4, 4] : [])
              if (d.tipo === "horizontal") {
                const yy = y(d.p); if (yy == null) continue
                ctx.strokeStyle = COR
                ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(mediaSize.width, yy); ctx.stroke()
              } else if (d.tipo === "tendencia") {
                const x1 = xDoTempo(this.chart, d.a.t), x2 = xDoTempo(this.chart, d.b.t), y1 = y(d.a.p), y2 = y(d.b.p)
                if (x1 == null || x2 == null || y1 == null || y2 == null) continue
                ctx.strokeStyle = COR
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
              } else if (d.tipo === "fibo") {
                const x1 = xDoTempo(this.chart, d.a.t)
                if (x1 == null) continue
                niveisFibo(d.a.p, d.b.p).forEach(({ nivel, preco }, k) => {
                  const yy = y(preco); if (yy == null) return
                  ctx.strokeStyle = COR_FIBO[k]; ctx.fillStyle = COR_FIBO[k]
                  ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(mediaSize.width, yy); ctx.stroke()
                  ctx.fillText(`${nivel} (${preco.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")})`, x1 + 4, yy - 3)
                })
              } else if (d.tipo === "texto") {
                const x = xDoTempo(this.chart, d.a.t), yy = y(d.a.p)
                if (x == null || yy == null) continue
                ctx.fillStyle = COR; ctx.font = "600 12px ui-sans-serif, system-ui"
                ctx.fillText(d.texto, x, yy)
                ctx.font = "11px ui-sans-serif, system-ui"
              }
            }
            ctx.setLineDash([])
          })
        },
      }),
    }]
  }
}

const FERRAMENTAS: Array<[FerramentaDesenho, string, typeof Minus]> = [
  ["horizontal", "Linha horizontal", Minus],
  ["tendencia", "Linha de tendência", TrendingUp],
  ["fibo", "Retração de Fibonacci", FiboIcone as unknown as typeof Minus],
  ["texto", "Texto", Type],
]

function FiboIcone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12" />
    </svg>
  )
}

export default function DesenhosGrafico({ chart, serie, symbol }: { chart: any; serie: any; symbol: string }) {
  const [desenhos, setDesenhos] = useState<Desenho[]>([])
  const [ferramenta, setFerramenta] = useState<FerramentaDesenho | null>(null)
  const [pontos, setPontos] = useState<PontoDesenho[]>([])
  const [rato, setRato] = useState<PontoDesenho | null>(null)
  const [visiveis, setVisiveis] = useState(true)
  const prim = useRef<PrimitivaDesenhos | null>(null)

  useEffect(() => { setDesenhos(lerDesenhos(symbol)); setFerramenta(null); setPontos([]) }, [symbol])

  useEffect(() => {
    if (!chart || !serie) return
    const p = new PrimitivaDesenhos(chart)
    serie.attachPrimitive(p as any)
    prim.current = p
    return () => { try { serie.detachPrimitive(p as any) } catch { /* série já removida */ } prim.current = null }
  }, [chart, serie])

  // O desenho a meio (do primeiro clique até ao rato) vê-se tracejado.
  const provisorio = ferramenta && pontos.length && rato ? criarDesenho(ferramenta, [...pontos, rato], "…") : null
  useEffect(() => { prim.current?.definir(desenhos, provisorio, visiveis) })

  useEffect(() => {
    if (!ferramenta) return
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setFerramenta(null); setPontos([]) } }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [ferramenta])

  const mudar = (novos: Desenho[]) => { setDesenhos(novos); guardarDesenhos(symbol, novos) }

  const pontoDe = (e: React.PointerEvent<HTMLDivElement>): PontoDesenho | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    const p = serie?.coordinateToPrice(y)
    const ts = chart?.timeScale()
    let t = ts?.coordinateToTime(x)
    // À direita da última vela não há tempo: fica na última visível.
    if (t == null) t = ts?.getVisibleRange?.()?.to
    return p == null || t == null ? null : { t: Number(t), p: Number(p) }
  }

  const clicar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ferramenta) return
    e.preventDefault(); e.stopPropagation()
    const pt = pontoDe(e); if (!pt) return
    const juntos = [...pontos, pt]
    if (juntos.length < CLIQUES[ferramenta]) { setPontos(juntos); return }
    const texto = ferramenta === "texto" ? window.prompt("Texto no gráfico") ?? "" : ""
    const d = criarDesenho(ferramenta, juntos, texto)
    if (d) mudar([...desenhos, d])
    setPontos([]); setFerramenta(null)
  }

  const botao = "grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
  return (
    <>
      {ferramenta && (
        <div
          data-desenhos
          className="absolute inset-0 z-[8] cursor-crosshair"
          onPointerDown={clicar}
          onPointerMove={(e) => { if (pontos.length) setRato(pontoDe(e)) }}
          aria-label="Clica no gráfico para desenhar"
        />
      )}
      <div role="toolbar" aria-label="Desenhos" data-desenhos className="absolute left-1 top-10 z-[9] flex flex-col gap-0.5 rounded-lg border border-white/10 bg-[#131722]/90 p-0.5 backdrop-blur">
        <button type="button" title="Cursor (Esc)" aria-pressed={!ferramenta} onClick={() => { setFerramenta(null); setPontos([]) }} className={`${botao} ${!ferramenta ? "text-[#D2A63C]" : ""}`}><MousePointer2 className="h-4 w-4" /></button>
        {FERRAMENTAS.map(([f, nome, Icone]) => (
          <button key={f} type="button" title={nome} aria-label={nome} aria-pressed={ferramenta === f}
            onClick={() => { setFerramenta(ferramenta === f ? null : f); setPontos([]) }}
            className={`${botao} ${ferramenta === f ? "bg-[#D2A63C]/20 text-[#D2A63C]" : ""}`}>
            <Icone className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 my-0.5 h-px bg-white/10" />
        <button type="button" title={visiveis ? "Ocultar desenhos" : "Mostrar desenhos"} aria-pressed={!visiveis} onClick={() => setVisiveis(!visiveis)} className={botao}>
          {visiveis ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button type="button" title="Apagar o último desenho" aria-label="Apagar o último desenho" disabled={!desenhos.length}
          onClick={() => mudar(desenhos.slice(0, -1))} className={`${botao} disabled:opacity-30`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </>
  )
}
