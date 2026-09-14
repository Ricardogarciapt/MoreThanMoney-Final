"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, TrendingUp, TrendingDown, X, LineChart, CandlestickChart } from "lucide-react"
import TvChartEmbed from "@/components/tv-chart-embed"
import {
  type Direcao, type MapaPrecos, lucroUsd, pips, spreadEmPreco, validarNiveis,
} from "@/lib/mtmfunded/simulado/matematica"
import { tipoDeEntrada } from "@/lib/mtmfunded/simulado/ordens"
import { type SimboloFicha, type PrecoVivo, px, usd, tvSymbolDe } from "./api"

/**
 * O GRÁFICO DO WEBTRADER — lightweight-charts (o motor open-source do TradingView) com a mecânica
 * do TradingView por cima: ferramenta Long/Short, linhas de posição e de ordens ARRASTÁVEIS.
 *
 * Porquê o nosso gráfico e não só o widget do TradingView: o widget grátis não tem API de ordens —
 * não se arrasta um SL nele e isso chega à conta. Aqui controlamos cada toque. O widget fica ao
 * lado, no separador «TradingView», para indicadores e desenho, e diz que é só visualização.
 *
 * A biblioteca carrega-se do CDN (versão fixa), como o tv.js do TradingView já se carrega no resto
 * da app: evita acrescentar um pacote ao build partilhado. As velas vêm do histórico (MetaApi)
 * quando há, e a última vela vai-se construindo com os preços ao vivo.
 */

const LW_URL = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"
let lwPromessa: Promise<any> | null = null
function carregarLW(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"))
  const w = window as any
  if (w.LightweightCharts) return Promise.resolve(w.LightweightCharts)
  if (lwPromessa) return lwPromessa
  lwPromessa = new Promise((ok, falha) => {
    const s = document.createElement("script")
    s.src = LW_URL
    s.async = true
    s.onload = () => (w.LightweightCharts ? ok(w.LightweightCharts) : falha(new Error("biblioteca do gráfico indisponível")))
    s.onerror = () => { lwPromessa = null; falha(new Error("não foi possível carregar o gráfico")) }
    document.head.appendChild(s)
  })
  return lwPromessa
}

const TFS = { M1: 60, M5: 300, M15: 900, H1: 3600 } as const
type Tf = keyof typeof TFS

export interface PosicaoGrafico { id: string; direcao: Direcao; volume: number; preco_entrada: number; sl: number | null; tp: number | null }
export interface OrdemGrafico { id: string; direcao: Direcao; tipo: "limit" | "stop"; volume: number; preco: number; sl: number | null; tp: number | null }
export interface Ferramenta { direcao: Direcao; entrada: number; sl: number; tp: number }

type Dono =
  | { tipo: "pos"; id: string; campo: "sl" | "tp" | "entrada" }
  | { tipo: "ord"; id: string; campo: "sl" | "tp" | "preco" }
  | { tipo: "tool"; campo: "sl" | "tp" | "entrada" }

interface Linha { chave: string; preco: number; cor: string; rotulo: string; arrastavel: boolean; tracejada?: boolean; dono: Dono }

export default function FundedGrafico(props: {
  simbolo: SimboloFicha
  preco?: PrecoVivo
  precos: MapaPrecos
  volume: number
  posicoes: PosicaoGrafico[]
  ordens: OrdemGrafico[]
  podeNegociar: boolean
  ferramentaInicial?: Ferramenta | null
  onModificarPosicao: (id: string, sl: number | null, tp: number | null) => Promise<void>
  onModificarPendente: (id: string, preco: number, sl: number | null, tp: number | null) => Promise<void>
  onFecharPosicao: (id: string) => void
  onCancelarPendente: (id: string) => void
  onConfirmarFerramenta: (f: Ferramenta & { tipo: "mercado" | "limit" | "stop" }) => Promise<void>
}) {
  const { simbolo, preco, precos, volume, posicoes, ordens, podeNegociar } = props
  const [vista, setVista] = useState<"mtm" | "tv">("mtm")
  const [tf, setTf] = useState<Tf>("M5")
  const [estadoVelas, setEstadoVelas] = useState<"a_carregar" | "historico" | "ao_vivo" | "erro">("a_carregar")
  const [erroLib, setErroLib] = useState<string | null>(null)
  const [modo, setModo] = useState<Direcao | null>(null)
  const [ferramenta, setFerramenta] = useState<Ferramenta | null>(props.ferramentaInicial ?? null)
  const [rascunho, setRascunho] = useState<Record<string, number>>({})
  const [ys, setYs] = useState<Record<string, number>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; dono: Dono } | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erroFerramenta, setErroFerramenta] = useState<string | null>(null)

  const caixaRef = useRef<HTMLDivElement>(null)
  const graficoRef = useRef<any>(null)
  const serieRef = useRef<any>(null)
  const ultimaVelaRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null)
  const linhasRef = useRef<Linha[]>([])
  const dragRef = useRef<{ chave: string; dono: Dono; y0: number; moveu: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null)
  const toqueRef = useRef<{ x: number; y: number } | null>(null)
  const larguraEscalaRef = useRef(56)

  useEffect(() => { if (props.ferramentaInicial) setFerramenta(props.ferramentaInicial) }, [props.ferramentaInicial])
  // Mudar de símbolo leva a ferramenta: uma entrada de ouro não serve ao EURUSD.
  useEffect(() => { setRascunho({}); setMenu(null); if (!props.ferramentaInicial) setFerramenta(null) }, [simbolo.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const arred = useCallback((v: number) => Number(v.toFixed(simbolo.digits)), [simbolo.digits])

  // ── criar o gráfico ──
  useEffect(() => {
    if (vista !== "mtm") return
    let vivo = true
    carregarLW().then((LW) => {
      if (!vivo || !caixaRef.current) return
      const chart = LW.createChart(caixaRef.current, {
        autoSize: true,
        layout: { background: { color: "#0a0a0a" }, textColor: "#a1a1aa", fontSize: 11 },
        grid: { vertLines: { color: "rgba(210,166,60,0.05)" }, horzLines: { color: "rgba(210,166,60,0.05)" } },
        rightPriceScale: { borderColor: "#27272a" },
        timeScale: { borderColor: "#27272a", timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
        localization: { priceFormatter: (p: number) => p.toFixed(simbolo.digits) },
      })
      const serie = chart.addCandlestickSeries({
        upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444",
        priceFormat: { type: "price", precision: simbolo.digits, minMove: Math.pow(10, -simbolo.digits) },
      })
      graficoRef.current = chart
      serieRef.current = serie
      setErroLib(null)
    }).catch((e) => vivo && setErroLib((e as Error).message))
    return () => {
      vivo = false
      try { graficoRef.current?.remove() } catch { /* já removido */ }
      graficoRef.current = null
      serieRef.current = null
    }
  }, [vista, simbolo.digits])

  // ── histórico ──
  useEffect(() => {
    if (vista !== "mtm") return
    let vivo = true
    ultimaVelaRef.current = null
    setEstadoVelas("a_carregar")
    const tentar = async (voltas = 0): Promise<void> => {
      if (!serieRef.current) {
        if (voltas < 40 && vivo) { await new Promise((r) => setTimeout(r, 100)); return tentar(voltas + 1) }
        return
      }
      try {
        const r = await fetch(`/api/mtmfunded/simulado/velas?symbol=${simbolo.symbol}&tf=${tf}&limit=300`)
        const d = await r.json()
        if (!vivo || !serieRef.current) return
        const velas = (d.velas ?? []).map((v: any) => ({ time: v.t, open: v.o, high: v.h, low: v.l, close: v.c }))
        serieRef.current.setData(velas)
        ultimaVelaRef.current = velas.length ? velas[velas.length - 1] : null
        setEstadoVelas(velas.length ? "historico" : "ao_vivo")
        graficoRef.current?.timeScale().scrollToRealTime()
      } catch {
        if (vivo) { serieRef.current?.setData([]); setEstadoVelas("ao_vivo") }
      }
    }
    tentar()
    return () => { vivo = false }
  }, [vista, simbolo.symbol, tf])

  // ── a vela viva ──
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !preco || estadoVelas === "a_carregar") return
    const passo = TFS[tf]
    const t = Math.floor(new Date(preco.em).getTime() / 1000 / passo) * passo
    const v = preco.bid
    const u = ultimaVelaRef.current
    let nova
    if (u && u.time === t) nova = { ...u, high: Math.max(u.high, v), low: Math.min(u.low, v), close: v }
    else if (!u || t > u.time) nova = { time: t, open: u?.close ?? v, high: Math.max(v, u?.close ?? v), low: Math.min(v, u?.close ?? v), close: v }
    else return
    try { serie.update(nova); ultimaVelaRef.current = nova } catch { /* tempo fora de ordem */ }
  }, [preco, tf, estadoVelas])

  // ── as linhas ──
  const tolerancia = Math.max(spreadEmPreco(simbolo), 2 * simbolo.pip_size)
  const valorDe = (chave: string, base: number) => (rascunho[chave] ?? base)

  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = []
    for (const p of posicoes) {
      const cor = p.direcao === "buy" ? "#3b82f6" : "#f97316"
      out.push({ chave: `pos:${p.id}:entrada`, preco: p.preco_entrada, cor, rotulo: `${p.direcao === "buy" ? "BUY" : "SELL"} ${p.volume}`, arrastavel: false, dono: { tipo: "pos", id: p.id, campo: "entrada" } })
      if (p.sl != null || rascunho[`pos:${p.id}:sl`] != null) out.push({ chave: `pos:${p.id}:sl`, preco: valorDe(`pos:${p.id}:sl`, p.sl ?? 0), cor: "#ef4444", rotulo: "SL", arrastavel: podeNegociar, tracejada: true, dono: { tipo: "pos", id: p.id, campo: "sl" } })
      if (p.tp != null || rascunho[`pos:${p.id}:tp`] != null) out.push({ chave: `pos:${p.id}:tp`, preco: valorDe(`pos:${p.id}:tp`, p.tp ?? 0), cor: "#22c55e", rotulo: "TP", arrastavel: podeNegociar, tracejada: true, dono: { tipo: "pos", id: p.id, campo: "tp" } })
    }
    for (const o of ordens) {
      out.push({ chave: `ord:${o.id}:preco`, preco: valorDe(`ord:${o.id}:preco`, o.preco), cor: "#a78bfa", rotulo: `${o.direcao.toUpperCase()} ${o.tipo.toUpperCase()} ${o.volume}`, arrastavel: podeNegociar, tracejada: true, dono: { tipo: "ord", id: o.id, campo: "preco" } })
      if (o.sl != null) out.push({ chave: `ord:${o.id}:sl`, preco: valorDe(`ord:${o.id}:sl`, o.sl), cor: "#ef4444", rotulo: "SL (ordem)", arrastavel: podeNegociar, tracejada: true, dono: { tipo: "ord", id: o.id, campo: "sl" } })
      if (o.tp != null) out.push({ chave: `ord:${o.id}:tp`, preco: valorDe(`ord:${o.id}:tp`, o.tp), cor: "#22c55e", rotulo: "TP (ordem)", arrastavel: podeNegociar, tracejada: true, dono: { tipo: "ord", id: o.id, campo: "tp" } })
    }
    if (ferramenta) {
      const risco = lucroUsd(simbolo, ferramenta.direcao, volume, ferramenta.entrada, ferramenta.sl, precos)
      const ganho = lucroUsd(simbolo, ferramenta.direcao, volume, ferramenta.entrada, ferramenta.tp, precos)
      const dSl = pips(simbolo, ferramenta.entrada, ferramenta.sl)
      const dTp = pips(simbolo, ferramenta.entrada, ferramenta.tp)
      const rr = dSl > 0 ? (dTp / dSl).toFixed(2) : "—"
      const tipo = preco ? tipoDeEntrada(ferramenta.direcao, ferramenta.entrada, preco, tolerancia) : "mercado"
      const nomeTipo = tipo === "mercado" ? "a mercado" : `${ferramenta.direcao} ${tipo}`
      out.push({ chave: "tool:entrada", preco: ferramenta.entrada, cor: "#D2A63C", rotulo: `${ferramenta.direcao === "buy" ? "LONG" : "SHORT"} ${volume} · ${nomeTipo}`, arrastavel: true, dono: { tipo: "tool", campo: "entrada" } })
      out.push({ chave: "tool:sl", preco: ferramenta.sl, cor: "#ef4444", rotulo: `SL ${dSl} pips · ${usd(risco)} $`, arrastavel: true, dono: { tipo: "tool", campo: "sl" } })
      out.push({ chave: "tool:tp", preco: ferramenta.tp, cor: "#22c55e", rotulo: `TP ${dTp} pips · +${usd(ganho)} $ · R:R ${rr}`, arrastavel: true, dono: { tipo: "tool", campo: "tp" } })
    }
    return out
  }, [posicoes, ordens, ferramenta, rascunho, podeNegociar, simbolo, volume, precos, preco, tolerancia]) // eslint-disable-line react-hooks/exhaustive-deps
  linhasRef.current = linhas

  // Coordenadas: o gráfico mexe-se (pan, zoom, escala automática) sem avisar o React, por isso lê-se
  // a posição de cada linha a cada frame e só se re-desenha quando algo andou meio píxel.
  useEffect(() => {
    if (vista !== "mtm") return
    let raf = 0
    let antes = ""
    const passo = () => {
      const serie = serieRef.current
      if (serie) {
        const novo: Record<string, number> = {}
        for (const l of linhasRef.current) {
          const y = serie.priceToCoordinate(l.preco)
          if (y != null) novo[l.chave] = Math.round(y * 2) / 2
        }
        try { larguraEscalaRef.current = graficoRef.current?.priceScale("right").width() ?? 56 } catch { /* ok */ }
        const s = JSON.stringify(novo)
        if (s !== antes) { antes = s; setYs(novo) }
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    // Rede de segurança: WebViews e separadores em segundo plano estrangulam o rAF, e as linhas
    // ficavam por desenhar até ao próximo toque.
    const iv = setInterval(() => { cancelAnimationFrame(raf); passo() }, 300)
    return () => { cancelAnimationFrame(raf); clearInterval(iv) }
  }, [vista])

  // ── interacção ──
  const precoNoY = (y: number): number | null => {
    const p = serieRef.current?.coordinateToPrice(y)
    return p == null || !Number.isFinite(p) ? null : arred(p)
  }
  const linhaPerto = (y: number, raio: number) => {
    let melhor: Linha | null = null
    let dist = raio
    for (const l of linhasRef.current) {
      const ly = ys[l.chave]
      if (ly == null) continue
      const d = Math.abs(ly - y)
      if (d <= dist) { dist = d; melhor = l }
    }
    return melhor
  }
  const bloquearPan = (sim: boolean) => {
    try { graficoRef.current?.applyOptions({ handleScroll: !sim, handleScale: !sim }) } catch { /* ok */ }
  }

  const colocarFerramenta = (direcao: Direcao, entrada: number) => {
    // SL a uma distância que se vê no ecrã (10% da escala visível ou 5× o spread), TP a 2R.
    const serie = serieRef.current
    const alto = serie?.coordinateToPrice(0)
    const baixo = serie?.coordinateToPrice((caixaRef.current?.clientHeight ?? 300) - 30)
    const faixa = alto != null && baixo != null ? Math.abs(alto - baixo) : entrada * 0.005
    const d = Math.max(faixa * 0.1, spreadEmPreco(simbolo) * 5, simbolo.pip_size * 5)
    const sinal = direcao === "buy" ? 1 : -1
    setFerramenta({ direcao, entrada, sl: arred(entrada - sinal * d), tp: arred(entrada + sinal * 2 * d) })
    setErroFerramenta(null)
    setModo(null)
  }

  const aoPressionar = (e: React.PointerEvent<HTMLDivElement>) => {
    setMenu(null)
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    toqueRef.current = { x: e.clientX - r.left, y }
    const l = linhaPerto(y, e.pointerType === "touch" ? 18 : 10)
    if (!l) return
    e.stopPropagation()
    bloquearPan(true)
    const dono = l.dono
    const timer = setTimeout(() => {
      // Pressão longa sem arrastar = menu (fechar/cancelar), como o botão direito no desktop.
      if (dragRef.current && !dragRef.current.moveu && dono.tipo !== "tool") {
        setMenu({ x: toqueRef.current?.x ?? 40, y, dono })
        dragRef.current = null
        bloquearPan(false)
      }
    }, 550)
    dragRef.current = { chave: l.chave, dono, y0: y, moveu: false, timer }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ }
  }

  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    if (Math.abs(y - d.y0) > 4) d.moveu = true
    if (!d.moveu) return
    const l = linhasRef.current.find((x) => x.chave === d.chave)
    if (!l?.arrastavel) return
    const p = precoNoY(y)
    if (p == null) return
    if (d.dono.tipo === "tool") {
      const campo = d.dono.campo
      setFerramenta((f) => (f ? { ...f, [campo]: p } : f))
    } else {
      setRascunho((x) => ({ ...x, [d.chave]: p }))
    }
  }

  const aoLargar = async (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    const x = e.clientX - r.left
    if (!d) {
      // Toque simples no gráfico com a ferramenta escolhida → coloca a entrada aí.
      const t = toqueRef.current
      if (modo && t && Math.hypot(t.x - x, t.y - y) < 8) {
        const p = precoNoY(y)
        if (p != null) colocarFerramenta(modo, p)
      }
      return
    }
    if (d.timer) clearTimeout(d.timer)
    dragRef.current = null
    bloquearPan(false)
    const dono = d.dono
    if (!d.moveu || dono.tipo === "tool") return
    const novo = rascunho[d.chave]
    if (novo == null) return
    const limpar = () => setRascunho((x) => { const c = { ...x }; delete c[d.chave]; return c })
    try {
      if (dono.tipo === "pos") {
        const p = posicoes.find((q) => q.id === dono.id)
        if (!p) return limpar()
        await props.onModificarPosicao(p.id, dono.campo === "sl" ? novo : p.sl, dono.campo === "tp" ? novo : p.tp)
      } else if (dono.tipo === "ord") {
        const o = ordens.find((q) => q.id === dono.id)
        if (!o) return limpar()
        await props.onModificarPendente(o.id, dono.campo === "preco" ? novo : o.preco, dono.campo === "sl" ? novo : o.sl, dono.campo === "tp" ? novo : o.tp)
      }
    } finally {
      // O valor verdadeiro volta no refresh; se falhou, a linha regressa ao sítio — honesto.
      limpar()
    }
  }

  const aoMenuContexto = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    const l = linhaPerto(y, 10)
    if (!l || l.dono.tipo === "tool") return
    e.preventDefault()
    setMenu({ x: e.clientX - r.left, y, dono: l.dono })
  }

  const confirmar = async () => {
    if (!ferramenta || !preco) return
    const tipo = tipoDeEntrada(ferramenta.direcao, ferramenta.entrada, preco, tolerancia)
    const erro = validarNiveis(ferramenta.direcao, tipo === "mercado" ? (ferramenta.direcao === "buy" ? preco.ask : preco.bid) : ferramenta.entrada, ferramenta.sl, ferramenta.tp)
    if (erro) return setErroFerramenta(erro)
    setAEnviar(true)
    setErroFerramenta(null)
    try {
      await props.onConfirmarFerramenta({ ...ferramenta, tipo })
      setFerramenta(null)
    } catch (e) {
      setErroFerramenta((e as Error).message)
    } finally {
      setAEnviar(false)
    }
  }

  const larguraEscala = larguraEscalaRef.current
  const zona = (a: number | undefined, b: number | undefined, cor: string) =>
    a == null || b == null ? null : (
      <div className="absolute left-[35%]" style={{ top: Math.min(a, b), height: Math.abs(a - b), right: larguraEscala, background: cor }} />
    )

  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5 text-[11px]">
        <button onClick={() => setVista("mtm")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${vista === "mtm" ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-zinc-400"}`}>
          <CandlestickChart className="h-3.5 w-3.5" /> Negociar
        </button>
        <button onClick={() => setVista("tv")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${vista === "tv" ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-zinc-400"}`}>
          <LineChart className="h-3.5 w-3.5" /> TradingView
        </button>
        <span className="mx-1 h-4 w-px bg-white/10" />
        {(Object.keys(TFS) as Tf[]).map((t) => (
          <button key={t} onClick={() => setTf(t)} className={`rounded px-1.5 py-1 ${tf === t ? "text-white" : "text-zinc-500"}`}>{t}</button>
        ))}
        {vista === "mtm" && podeNegociar && (
          <div className="ml-auto flex shrink-0 gap-1">
            <button onClick={() => setModo(modo === "buy" ? null : "buy")} className={`flex items-center gap-1 rounded-md border px-2 py-1 ${modo === "buy" ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-white/10 text-emerald-400"}`}>
              <TrendingUp className="h-3.5 w-3.5" /> Long
            </button>
            <button onClick={() => setModo(modo === "sell" ? null : "sell")} className={`flex items-center gap-1 rounded-md border px-2 py-1 ${modo === "sell" ? "border-rose-400 bg-rose-500/20 text-rose-300" : "border-white/10 text-rose-400"}`}>
              <TrendingDown className="h-3.5 w-3.5" /> Short
            </button>
          </div>
        )}
      </div>

      {vista === "tv" ? (
        <div className="p-2">
          <TvChartEmbed tvSymbol={tvSymbolDe(simbolo)} interval={String(TFS[tf] / 60)} height={380} />
          <p className="mt-1.5 text-center text-[10px] text-zinc-500">
            Gráfico TradingView só para análise (indicadores e desenho). As ordens fazem-se no separador «Negociar» — o widget gratuito não envia ordens.
          </p>
        </div>
      ) : (
        <div
          className="relative h-[340px] touch-pan-y select-none md:h-[440px]"
          onPointerDownCapture={aoPressionar}
          onPointerMoveCapture={aoMover}
          onPointerUpCapture={aoLargar}
          onContextMenu={aoMenuContexto}
        >
          <div ref={caixaRef} className="absolute inset-0" />
          {/* Sobreposição: zonas e linhas. Não apanha toques — quem os apanha é a caixa por cima, na fase de captura. */}
          <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
            {ferramenta && zona(ys["tool:entrada"], ys["tool:sl"], "rgba(239,68,68,0.14)")}
            {ferramenta && zona(ys["tool:entrada"], ys["tool:tp"], "rgba(34,197,94,0.14)")}
            {linhas.map((l) => {
              const y = ys[l.chave]
              if (y == null) return null
              return (
                <div key={l.chave} className="absolute left-0" style={{ top: y, right: larguraEscala }}>
                  <div style={{ borderTop: `1px ${l.tracejada ? "dashed" : "solid"} ${l.cor}` }} />
                  {/* Rótulos da ferramenta à esquerda, das posições/ordens à direita: não se tapam. */}
                  <span
                    className={`absolute -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-black ${l.dono.tipo === "tool" ? "left-[36%]" : "right-1"}`}
                    style={{ background: l.cor }}
                  >
                    {l.rotulo} {px(l.preco, simbolo.digits)}{l.arrastavel ? " ⇕" : ""}
                  </span>
                </div>
              )
            })}
          </div>
          {modo && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-[6] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-[11px] text-[#D2A63C]">
              Toca no gráfico onde queres a entrada ({modo === "buy" ? "Long" : "Short"})
            </div>
          )}
          {estadoVelas === "ao_vivo" && !ultimaVelaRef.current && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-[12px] text-zinc-500">
              Sem histórico para {simbolo.symbol} — as velas vão-se formando com os preços ao vivo desde que abriste.
            </div>
          )}
          {(estadoVelas === "a_carregar" && !erroLib) && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
          )}
          {erroLib && <div className="absolute inset-0 grid place-items-center text-[12px] text-rose-300">{erroLib}</div>}
          {menu && (
            <div className="absolute z-20 min-w-[150px] rounded-lg border border-white/10 bg-zinc-900 p-1 text-[12px] shadow-xl" style={{ left: Math.min(menu.x, 200), top: menu.y + 8 }}>
              {menu.dono.tipo === "pos" && (() => {
                const dono = menu.dono as Extract<Dono, { tipo: "pos" }>
                const p = posicoes.find((q) => q.id === dono.id)
                if (!p) return null
                const d = Math.max(spreadEmPreco(simbolo) * 5, simbolo.pip_size * 20)
                const s = p.direcao === "buy" ? 1 : -1
                return (
                  <>
                    <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(null); props.onFecharPosicao(p.id) }}>Fechar posição</button>
                    {p.sl == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, arred(p.preco_entrada - s * d), p.tp) }}>Pôr SL (arrasta depois)</button>}
                    {p.tp == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, p.sl, arred(p.preco_entrada + s * 2 * d)) }}>Pôr TP (arrasta depois)</button>}
                    {(dono.campo === "sl" || dono.campo === "tp") && (
                      <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, dono.campo === "sl" ? null : p.sl, dono.campo === "tp" ? null : p.tp) }}>Remover {dono.campo.toUpperCase()}</button>
                    )}
                  </>
                )
              })()}
              {menu.dono.tipo === "ord" && (
                <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(null); props.onCancelarPendente((menu.dono as { id: string }).id) }}>Cancelar ordem</button>
              )}
              <button className="block w-full rounded px-2 py-1.5 text-left text-zinc-500 hover:bg-white/5" onClick={() => setMenu(null)}>Fechar menu</button>
            </div>
          )}
        </div>
      )}

      {vista === "mtm" && ferramenta && (
        <div className="border-t border-white/10 p-2.5 text-[12px]">
          {(() => {
            const tipo = preco ? tipoDeEntrada(ferramenta.direcao, ferramenta.entrada, preco, tolerancia) : "mercado"
            const risco = lucroUsd(simbolo, ferramenta.direcao, volume, ferramenta.entrada, ferramenta.sl, precos)
            const nome = tipo === "mercado" ? `${ferramenta.direcao === "buy" ? "Comprar" : "Vender"} a mercado` : `${ferramenta.direcao === "buy" ? "Buy" : "Sell"} ${tipo === "limit" ? "Limit" : "Stop"} @ ${px(ferramenta.entrada, simbolo.digits)}`
            return (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 text-zinc-300">
                  <b className="text-white">{nome}</b> · {volume} lotes · risco {usd(risco)} $
                  <div className="text-[10.5px] text-zinc-500">Arrasta a entrada, o SL e o TP no gráfico. Entrada perto do preço executa a mercado; longe cria ordem pendente.</div>
                </div>
                <button onClick={() => setFerramenta(null)} className="rounded-lg border border-white/10 px-2.5 py-2 text-zinc-400"><X className="h-4 w-4" /></button>
                <button disabled={aEnviar || !preco?.fresco} onClick={confirmar} className={`rounded-lg px-3 py-2 font-bold text-black disabled:opacity-40 ${ferramenta.direcao === "buy" ? "bg-emerald-400" : "bg-rose-400"}`}>
                  {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                </button>
              </div>
            )
          })()}
          {!preco?.fresco && <p className="mt-1 text-[11px] text-amber-300">Sem preço ao vivo — mercado fechado ou motor parado.</p>}
          {erroFerramenta && <p className="mt-1 text-[11px] text-rose-300">{erroFerramenta}</p>}
        </div>
      )}
    </div>
  )
}
