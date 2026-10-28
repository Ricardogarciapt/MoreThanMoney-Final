"use client"

/**
 * O GRÁFICO AO VIVO DO AGENTE CRIPTO (/admin/cripto) — o agente a negociar em cima das velas.
 *
 *  · Velas ao vivo do ativo escolhido (Bybit nos perps, GeckoTerminal nas memecoins), refrescadas
 *    a cada 15 s com a vela em curso.
 *  · Cada posição do agente: seta na entrada (▲ long / ▼ short), círculo na saída com o PnL, e nas
 *    abertas as linhas de Entrada, SL e TP.
 *  · Os nossos estudos por cima (perps): MTM Scanner (DEMA 15/50/238, POC, B/S) e TrendShot, com
 *    os mesmos adaptadores do WebTrader (lib/estudos/*\/lightweight.ts).
 *
 * Lightweight Charts v5, importado só no cliente. A atribuição «Charts by TradingView» fica ligada
 * (licença da biblioteca).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

type Linha = Record<string, any>
type Vela = { t: number; o: number; h: number; l: number; c: number; v?: number }
type Ativo = { chave: string; ativo: string; mercado: "perp" | "spot"; id: string; aberta: boolean }

const OURO = "#D2A63C"
const VERDE = "#34d399"
const VERMELHO = "#f87171"
const TFS = [1, 5, 15] as const
const usd = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}$`

export default function CriptoGraficoAoVivo({ d, vista }: { d: Linha; vista: "papel" | "real" }) {
  const caixa = useRef<HTMLDivElement>(null)
  const grafico = useRef<any>(null)
  const serie = useRef<any>(null)
  const marcas = useRef<any>(null)
  const linhas = useRef<any[]>([])
  const estudo = useRef<{ update: (v: Vela[]) => void; remove: () => void } | null>(null)
  const [velas, setVelas] = useState<Vela[]>([])
  const [fonte, setFonte] = useState("")
  const [aCarregar, setACarregar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tf, setTf] = useState<(typeof TFS)[number]>(5)
  const [estudoSel, setEstudoSel] = useState<"nenhum" | "mtmscanner" | "trendshot">("mtmscanner")

  const posicoes = useMemo(() => {
    const vistos = new Set<string>()
    const out: Linha[] = []
    for (const p of [...(d.abertas ?? []), ...(d.fechadas ?? []), ...(d.historico ?? [])] as Linha[]) {
      if (p.modo !== vista || !p.id_ativo) continue
      const k = p.id ?? `${p.id_ativo}|${p.aberta_em}`
      if (vistos.has(k)) continue
      vistos.add(k)
      out.push(p)
    }
    return out
  }, [d.abertas, d.fechadas, d.historico, vista])

  const ativos = useMemo<Ativo[]>(() => {
    const m = new Map<string, Ativo>()
    for (const p of posicoes) {
      const chave = `${p.mercado}|${p.id_ativo}`
      const aberta = p.estado === "aberta" || p.estado === "pendente"
      const ja = m.get(chave)
      if (ja) ja.aberta ||= aberta
      else m.set(chave, { chave, ativo: p.ativo, mercado: p.mercado, id: p.id_ativo, aberta })
    }
    for (const s of (d.config?.perps ?? []) as string[]) {
      const chave = `perp|${s}`
      if (!m.has(chave)) m.set(chave, { chave, ativo: s, mercado: "perp", id: s, aberta: false })
    }
    return [...m.values()].sort((a, b) => Number(b.aberta) - Number(a.aberta))
  }, [posicoes, d.config?.perps])

  const [sel, setSel] = useState<string | null>(null)
  const atual = ativos.find((a) => a.chave === sel) ?? ativos[0]

  // Criar o gráfico uma vez.
  useEffect(() => {
    let vivo = true
    let ro: ResizeObserver | null = null
    void import("lightweight-charts").then((LW) => {
      if (!vivo || !caixa.current) return
      const chart = LW.createChart(caixa.current, {
        height: 380,
        layout: { background: { color: "transparent" }, textColor: "#9ca3af", attributionLogo: true },
        grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
        rightPriceScale: { borderColor: "#374151" },
        timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
      })
      const s = chart.addSeries(LW.CandlestickSeries, {
        upColor: VERDE, downColor: VERMELHO, borderUpColor: VERDE, borderDownColor: VERMELHO, wickUpColor: VERDE, wickDownColor: VERMELHO,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      })
      grafico.current = chart
      serie.current = s
      marcas.current = LW.createSeriesMarkers(s, [])
      ro = new ResizeObserver(() => caixa.current && chart.applyOptions({ width: caixa.current.clientWidth }))
      ro.observe(caixa.current)
    })
    return () => {
      vivo = false
      ro?.disconnect()
      estudo.current?.remove()
      estudo.current = null
      grafico.current?.remove()
      grafico.current = null
    }
  }, [])

  // Velas do ativo escolhido, de 15 em 15 s.
  useEffect(() => {
    if (!atual) return
    let vivo = true
    const ler = async (primeira: boolean) => {
      if (primeira) setACarregar(true)
      try {
        const r = await fetch(`/api/admin/cripto/velas?mercado=${atual.mercado}&id=${encodeURIComponent(atual.id)}&tf=${tf}`).then((x) => x.json())
        if (!vivo) return
        if (r.ok) { setVelas(r.velas); setFonte(r.fonte); setErro(null) } else setErro(r.error ?? "Sem velas agora.")
      } catch { if (vivo) setErro("Sem ligação às velas.") } finally { if (vivo && primeira) setACarregar(false) }
    }
    setVelas([])
    void ler(true)
    const t = setInterval(() => void ler(false), 15_000)
    return () => { vivo = false; clearInterval(t) }
  }, [atual?.chave, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desenhar velas, posições e estudo.
  useEffect(() => {
    const s = serie.current
    const chart = grafico.current
    if (!s || !chart || !atual) return
    const primeiraVez = s.data().length === 0
    s.setData(velas.map((v) => ({ time: v.t, open: v.o, high: v.h, low: v.l, close: v.c })))
    const ultimo = velas[velas.length - 1]?.c
    if (ultimo) {
      const casas = ultimo >= 100 ? 2 : ultimo >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(ultimo)) + 3)
      s.applyOptions({ priceFormat: { type: "price", precision: casas, minMove: 10 ** -casas } })
    }

    // Marcas das posições (alinhadas ao início da vela, que é o que o gráfico conhece).
    const passo = tf * 60
    const t0 = velas[0]?.t ?? 0
    const naVela = (iso: string) => Math.floor(new Date(iso).getTime() / 1000 / passo) * passo
    const doAtivo = posicoes.filter((p) => p.id_ativo === atual.id && p.mercado === atual.mercado)
    const mk: any[] = []
    for (const p of doAtivo) {
      const te = naVela(p.aberta_em)
      if (te >= t0) mk.push({ time: te, position: p.lado === "long" ? "belowBar" : "aboveBar", color: OURO, shape: p.lado === "long" ? "arrowUp" : "arrowDown", text: `${p.lado === "long" ? "LONG" : "SHORT"}${p.exploracao ? " · expl." : ""}` })
      if (p.fechada_em && p.estado !== "falhada") {
        const ts = naVela(p.fechada_em)
        const pnl = Number(p.pnl_usd) || 0
        if (ts >= t0) mk.push({ time: ts, position: p.lado === "long" ? "aboveBar" : "belowBar", color: pnl >= 0 ? VERDE : VERMELHO, shape: "circle", text: `${(p.motivo_fecho ?? "saída").toUpperCase()} ${usd(pnl)}` })
      }
    }
    marcas.current?.setMarkers(mk.sort((a, b) => a.time - b.time))

    for (const l of linhas.current) s.removePriceLine(l)
    linhas.current = []
    for (const p of doAtivo.filter((x) => x.estado === "aberta" || x.estado === "pendente")) {
      const add = (price: number, color: string, title: string, lineStyle: number) =>
        Number.isFinite(price) && price > 0 && linhas.current.push(s.createPriceLine({ price, color, title, lineWidth: 1, lineStyle, axisLabelVisible: true }))
      add(Number(p.entrada), OURO, `${p.lado.toUpperCase()} ${Number(p.nocional_usd).toFixed(0)}$`, 0)
      add(Number(p.sl), VERMELHO, "SL", 2)
      add(Number(p.tp), VERDE, "TP", 2)
    }

    if (primeiraVez && velas.length) chart.timeScale().scrollToRealTime()
  }, [velas, posicoes, atual?.chave, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  // Estudo por cima (só perps: os estudos deduzem o mintick até 5 casas, não servem a memecoins).
  useEffect(() => {
    const chart = grafico.current
    const s = serie.current
    if (!chart || !s || !atual) return
    let vivo = true
    estudo.current?.remove()
    estudo.current = null
    if (estudoSel === "nenhum" || atual.mercado !== "perp") return
    const montar = estudoSel === "mtmscanner"
      ? import("@/lib/estudos/mtmscanner/lightweight").then((m) => m.anexarMTMScanner(chart, s, { inputs: { simbolo: atual.id } as any, etiquetasEixo: false } as any))
      : import("@/lib/estudos/trendshot/lightweight").then((m) => m.anexarTrendShot(chart, s, { simbolo: atual.id, etiquetasEixo: false }))
    void montar.then((e) => { if (vivo) estudo.current = e as any; else (e as any).remove() })
    return () => { vivo = false }
  }, [estudoSel, atual?.chave, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (velas.length > 50) { try { estudo.current?.update(velas) } catch { /* estudo não desenha esta série */ } }
  }, [velas, estudoSel])

  const abertasAqui = posicoes.filter((p) => atual && p.id_ativo === atual.id && (p.estado === "aberta" || p.estado === "pendente"))

  return (
    <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
          Gráfico ao vivo
          {atual && <span className="text-[11px] font-normal text-gray-500">{atual.ativo} · {atual.mercado} · {fonte}</span>}
          {aCarregar && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-gray-800 p-0.5">
            {TFS.map((x) => <button key={x} onClick={() => setTf(x)} className={`rounded px-2 py-0.5 text-[11px] ${tf === x ? "bg-[#D2A63C] text-black" : "text-gray-400"}`}>{x}m</button>)}
          </div>
          <div className="flex rounded-md border border-gray-800 p-0.5">
            {([["mtmscanner", "MTM Scanner"], ["trendshot", "TrendShot"], ["nenhum", "Sem estudo"]] as const).map(([k, n]) => (
              <button key={k} onClick={() => setEstudoSel(k)} disabled={atual?.mercado !== "perp" && k !== "nenhum"} className={`rounded px-2 py-0.5 text-[11px] disabled:opacity-40 ${estudoSel === k ? "bg-[#D2A63C] text-black" : "text-gray-400"}`}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ativos.map((a) => (
          <button key={a.chave} onClick={() => setSel(a.chave)} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${atual?.chave === a.chave ? "border-[#D2A63C] text-[#E9C46A]" : "border-gray-700 text-gray-400"}`}>
            {a.aberta && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}{a.ativo}<span className="ml-1 text-gray-600">{a.mercado}</span>
          </button>
        ))}
      </div>

      <div ref={caixa} className="relative w-full">
        {erro && !velas.length && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">{erro}</div>}
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        {abertasAqui.length ? `${abertasAqui.length} aberta(s) aqui: linhas de Entrada, SL e TP no gráfico.` : "Sem posição aberta neste ativo."} ▲▼ entradas do agente · ● saídas com o PnL · velas a cada 15 s.
      </p>
    </div>
  )
}
