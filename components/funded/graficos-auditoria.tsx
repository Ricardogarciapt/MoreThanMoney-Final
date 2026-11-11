"use client"

import { useEffect, useMemo, useRef, useState } from "react"

/**
 * Gráficos interactivos da página pública de auditoria (/mtmfunded/auditoria/<token>).
 *
 * Arrastar para os lados, roda do rato / pinça para zoom, cruz com o valor exacto em cada ponto.
 * Separadores: Crescimento (índice ponderado no tempo), Resultado em R, Saldo, Drawdown, Pips e
 * R por dia (barras). Períodos: 1S, 1M, 3M, Tudo. Usa o lightweight-charts que o site já tem.
 *
 * O resumo em texto (para leitores de ecrã) fica no servidor, ao lado; aqui só o desenho.
 */

export interface PontoCurva { t: number; r: number; indice: number; saldo: number; pips: number; dd: number }
interface DiaR { dia: string; r: number }

export type Aba = "crescimento" | "r" | "saldo" | "dd" | "pips" | "dia"
const ABAS: Array<{ id: Aba; nome: string; unidade: string }> = [
  { id: "crescimento", nome: "Crescimento", unidade: "%" },
  { id: "r", nome: "Resultado (R)", unidade: "R" },
  { id: "saldo", nome: "Saldo", unidade: "USD" },
  { id: "dd", nome: "Drawdown", unidade: "%" },
  { id: "pips", nome: "Pips", unidade: "pips" },
  { id: "dia", nome: "R por dia", unidade: "R" },
]
const PERIODOS: Array<{ id: string; nome: string; dias: number | null }> = [
  { id: "1s", nome: "1S", dias: 7 },
  { id: "1m", nome: "1M", dias: 30 },
  { id: "3m", nome: "3M", dias: 90 },
  { id: "tudo", nome: "Tudo", dias: null },
]
const OURO = "#E9C46A", VERDE = "#34d399", VERMELHO = "#f87171"

/** Tempo em segundos, estritamente crescente (o gráfico recusa dois pontos no mesmo segundo). */
function tempos(pts: PontoCurva[]): number[] {
  const out: number[] = []
  for (const p of pts) {
    let s = Math.floor(p.t / 1000)
    if (out.length && s <= out[out.length - 1]) s = out[out.length - 1] + 1
    out.push(s)
  }
  return out
}

/** `abas`: as que fazem sentido nesta conta (sem R numa conta real; só pips na TradeLocker). */
export function GraficosAuditoria({ curva, saldoInicial, abas }: { curva: PontoCurva[]; saldoInicial: number; abas?: Aba[] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const visiveis = abas?.length ? ABAS.filter((a) => abas.includes(a.id)) : ABAS
  const [aba, setAba] = useState<Aba>(visiveis[0].id)
  const [periodo, setPeriodo] = useState("tudo")
  const [falhou, setFalhou] = useState(false)

  const ts = useMemo(() => tempos(curva), [curva])
  const porDia = useMemo<DiaR[]>(() => {
    const m = new Map<string, number>()
    let anterior = 0
    for (const p of curva) {
      const d = new Date(p.t).toISOString().slice(0, 10)
      m.set(d, (m.get(d) ?? 0) + (p.r - anterior))
      anterior = p.r
    }
    return [...m.entries()].map(([dia, r]) => ({ dia, r: Math.round(r * 100) / 100 }))
  }, [curva])

  useEffect(() => {
    if (!caixa.current || curva.length < 2) return
    let vivo = true
    let ro: ResizeObserver | null = null
    let remover: (() => void) | null = null
    import("lightweight-charts").then((LW) => {
      if (!vivo || !caixa.current) return
      const el = caixa.current
      const def = ABAS.find((a) => a.id === aba)!
      const chart = LW.createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: { background: { color: "transparent" }, textColor: "#a1a1aa", attributionLogo: false, fontSize: 11 },
        grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
        timeScale: { borderColor: "rgba(255,255,255,0.12)", timeVisible: aba !== "dia", secondsVisible: false, rightOffset: 2 },
        crosshair: { mode: LW.CrosshairMode.Normal },
        localization: { locale: "pt-PT", priceFormatter: (v: number) => `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${def.unidade}` },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      })

      if (aba === "dia") {
        const s = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false })
        s.setData(porDia.map((d) => ({ time: d.dia, value: d.r, color: d.r >= 0 ? VERDE : VERMELHO })))
      } else {
        const valor = (p: PontoCurva) =>
          aba === "crescimento" ? Math.round((p.indice - 1) * 10000) / 100
          : aba === "r" ? p.r
          : aba === "saldo" ? p.saldo
          : aba === "dd" ? p.dd
          : p.pips
        const cor = aba === "dd" ? VERMELHO : OURO
        const s = chart.addSeries(LW.AreaSeries, {
          lineColor: cor, lineWidth: 2,
          topColor: aba === "dd" ? "rgba(248,113,113,0.05)" : "rgba(210,166,60,0.35)",
          bottomColor: aba === "dd" ? "rgba(248,113,113,0.35)" : "rgba(210,166,60,0)",
          invertFilledArea: aba === "dd",
          priceLineVisible: false,
          baseLineVisible: true,
        })
        // Ponto de partida no instante da primeira trade menos um segundo: a curva nasce em zero (ou no saldo inicial).
        const zero = aba === "saldo" ? saldoInicial : 0
        s.setData([{ time: (ts[0] - 1) as never, value: zero }, ...curva.map((p, i) => ({ time: ts[i] as never, value: valor(p) }))])
      }

      const p = PERIODOS.find((x) => x.id === periodo)
      if (p?.dias) {
        const fim = aba === "dia" ? Math.floor(Date.parse(porDia.at(-1)!.dia) / 1000) : ts.at(-1)!
        chart.timeScale().setVisibleRange({ from: (fim - p.dias * 86400) as never, to: fim as never })
      } else chart.timeScale().fitContent()

      ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }))
      ro.observe(el)
      remover = () => chart.remove()
    }).catch(() => vivo && setFalhou(true))
    return () => { vivo = false; ro?.disconnect(); remover?.() }
  }, [aba, periodo, curva, ts, porDia, saldoInicial])

  if (curva.length < 2) return null
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Gráfico" className="flex flex-wrap gap-1">
          {visiveis.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C] ${aba === a.id ? "bg-[#D2A63C] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
              {a.nome}
            </button>
          ))}
        </div>
        <div aria-label="Período" className="flex gap-1">
          {PERIODOS.map((p) => (
            <button key={p.id} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}
              className={`min-h-9 min-w-10 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C] ${periodo === p.id ? "border border-[#D2A63C] text-[#E9C46A]" : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}>
              {p.nome}
            </button>
          ))}
        </div>
      </div>
      <div ref={caixa} className="w-full touch-pan-y" style={{ height: 300 }} />
      <p className="mt-2 text-[11px] text-zinc-500">
        {falhou ? "Não foi possível carregar o gráfico interactivo." : "Arrasta para os lados para percorrer o histórico; roda do rato ou pinça para zoom."}
      </p>
    </div>
  )
}
