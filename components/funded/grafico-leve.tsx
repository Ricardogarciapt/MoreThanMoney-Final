"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import ChecklistSensei from "@/lib/estudos/sensei/checklist"
import LegendaGoldKiller from "@/lib/estudos/goldkiller/legenda"
import type { InputsGoldKiller, ResultadoGoldKiller } from "@/lib/estudos/goldkiller/tipos"
import LegendaMTMScanner from "@/lib/estudos/mtmscanner/legenda"
import type { InputsMTMScanner, ResultadoMTMScanner } from "@/lib/estudos/mtmscanner/tipos"
import type { InputsSensei, ResultadoSensei, Vela } from "@/lib/estudos/sensei/tipos"
import { type Direcao, lucroUsd, spreadEmPreco } from "@/lib/mtmfunded/simulado/matematica"
import { px, usd } from "./api"
import { type GraficoProps, type Tf, TV, tfPorChave } from "./grafico-tipos"
import PainelFerramenta from "./painel-ferramenta"
import { carregarExtrasSensei, useCalculadoraSensei } from "./sensei-estudo"
import { useCalculadoraGoldKiller } from "./goldkiller-estudo"
import { useCalculadoraMTMScanner } from "./mtmscanner-estudo"
import { useRascunho } from "./rascunho-ordem"
import { pedirVelas, VELAS_PRIMEIRA_JANELA, type VelaApi } from "./pre-carga"
import { AccaoCancelada, useUmClique } from "./um-clique"

/**
 * O GRÁFICO DOS WEB TRADERS — Lightweight Charts v5 (o motor open-source do TradingView, pacote
 * npm `lightweight-charts`) vestido com a paleta e a mecânica do paper trading do TradingView:
 * linha da posição com quantidade e lucro ao vivo, SL/TP arrastáveis com «×» para remover,
 * pendentes arrastáveis com «×» para cancelar, a ferramenta Long/Short com as zonas de risco e
 * alvo, as setas dos sinais dos estudos, e um painel de volume por baixo.
 *
 * É O gráfico dos web traders, num modo só (WebTrader e faixa do dock do scanner). A biblioteca
 * licenciada (grafico-tradingview.tsx) fica adormecida: só entra se estiver instalada com as
 * primitivas de trading (edição Trading Platform).
 *
 * Como está feito, peça a peça (API v5, https://tradingview.github.io/lightweight-charts/):
 *  · a biblioteca importa-se DINAMICAMENTE no cliente (não entra no bundle do servidor nem no SSR);
 *  · velas com `addSeries(CandlestickSeries)`, volume com `addSeries(HistogramSeries, …, 1)` (pane 1);
 *  · setas com `createSeriesMarkers`, marca de água com `createTextWatermark`;
 *  · as linhas são `createPriceLine` (a linha e a etiqueta no eixo); a etiqueta à TradingView
 *    (corpo | quantidade | ×) é HTML por cima, na mesma coordenada, e o arrasto é nosso (pointer
 *    events na fase de captura — o gráfico não sabe arrastar price lines);
 *  · as zonas vermelha/verde da ferramenta são uma primitiva de série (`attachPrimitive`), como nos
 *    exemplos oficiais de plugins: desenham-se no canvas do gráfico e acompanham pan e zoom;
 *  · tempo real incremental: `series.update()` a cada preço, nunca `setData` por tick;
 *  · atribuição obrigatória da licença: `layout.attributionLogo: true` («Charts by TradingView»).
 *
 * MTM SENSEI (prop `sensei`): o estudo completo, portado do Pine (lib/estudos/sensei) — DEMAs,
 * cloud/bandas, estrutura (CHoCH/BOS/IDM), order blocks, etiquetas «CON +N/20 SL:xxxp», a trade
 * ativa com ENTRY/SL/EXIT, velas pintadas (barcolor) e os painéis CHECKLIST/CONFIRMAÇÕES/TRADE.
 * Com o Sensei ligado pedem-se 3000 velas (e H4/M1 à parte); o cálculo corre num Web Worker e só
 * se repete quando FECHA uma vela (ou mudam velas/inputs) — nunca a cada tick.
 *
 * MTM GOLDKILLER (prop `goldkiller`): o estudo completo, portado do Pine (lib/estudos/goldkiller) —
 * níveis Gain/Drawdown em degrau com as faixas até à Center Line, etiquetas dos níveis na escala,
 * BUY/SELL nas viragens e a linha de estado. Mesmo caminho do Sensei: 3000 velas, Web Worker,
 * recalcula só com vela fechada. Os dois estudos podem estar ligados ao mesmo tempo.
 *
 * MTM SCANNER (prop `mtmscanner`): o estudo oficial «MoreThanMoney - Scanner V3.5», portado do Pine
 * (lib/estudos/mtmscanner) — DEMA 15/50/238, POC (fecho da vela de maior volume de ticks), B/S nos
 * cruzamentos com o POC, caixa Entry/Stop/TP1-3 da última barra, estrutura CHoCH/BOS/IDM/x e swings.
 * Mesmo caminho: 3000 velas, Web Worker, recalcula só com vela fechada.
 *
 * Mover/fechar/cancelar passa pela negociação num clique (um-clique.tsx): desligada, pede
 * confirmação; cancelada ou falhada, a linha volta ao sítio.
 */

type LW = typeof import("lightweight-charts")
let lwPromessa: Promise<LW> | null = null
function carregarLW(): Promise<LW> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"))
  if (!lwPromessa) lwPromessa = import("lightweight-charts").catch((e) => { lwPromessa = null; throw e })
  return lwPromessa
}

/**
 * As zonas da ferramenta de posição (risco a vermelho, alvo a verde) como primitiva de série.
 * Os preços convertem-se em píxeis no momento de desenhar, por isso acompanham pan, zoom e escala.
 */
class ZonasFerramenta {
  private serie: any = null
  private pedirDesenho: (() => void) | null = null
  private zonas: Array<{ de: number; ate: number; cor: string }> = []
  attached(p: { series: any; requestUpdate: () => void }) { this.serie = p.series; this.pedirDesenho = p.requestUpdate }
  detached() { this.serie = null; this.pedirDesenho = null }
  definir(zonas: Array<{ de: number; ate: number; cor: string }>) {
    if (JSON.stringify(zonas) === JSON.stringify(this.zonas)) return
    this.zonas = zonas
    this.pedirDesenho?.()
  }
  updateAllViews() { /* as coordenadas calculam-se no draw */ }
  paneViews() {
    return [{
      zOrder: () => "bottom" as const,
      renderer: () => ({
        draw: (alvo: any) => {
          const serie = this.serie
          if (!serie || !this.zonas.length) return
          alvo.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, verticalPixelRatio: vr }: any) => {
            // Como a ferramenta do TradingView: a caixa começa a meio do gráfico e vai até ao eixo.
            const x0 = Math.round(bitmapSize.width * 0.45)
            for (const z of this.zonas) {
              const y1 = serie.priceToCoordinate(z.de)
              const y2 = serie.priceToCoordinate(z.ate)
              if (y1 == null || y2 == null) continue
              ctx.fillStyle = z.cor
              ctx.fillRect(x0, Math.round(Math.min(y1, y2) * vr), bitmapSize.width - x0, Math.round(Math.abs(y2 - y1) * vr))
            }
          })
        },
      }),
    }]
  }
}

type Dono =
  | { tipo: "pos"; id: string; campo: "sl" | "tp" | "entrada" }
  | { tipo: "ord"; id: string; campo: "sl" | "tp" | "preco" }
  | { tipo: "tool"; campo: "sl" | "tp" | "entrada" }
  | { tipo: "sinal"; id: string; campo: "sl" | "tp" | "entrada" }

interface Linha {
  chave: string
  preco: number
  cor: string
  /** Corpo da etiqueta (lado esquerdo), p. ex. «+12,40 $» ou «SL −23,10 $». */
  corpo: string
  /** Caixa colorida do meio: quantidade (posição/ordem). */
  qtd?: string
  arrastavel: boolean
  tracejada?: boolean
  /** O «×»: fechar posição, remover SL/TP, cancelar ordem. A ferramenta não tem. */
  fecho?: "fechar" | "remover" | "cancelar"
  dono: Dono
}

export default function GraficoLeve(props: GraficoProps & {
  tf: Tf
  modo: Direcao | null
  setModo: (m: Direcao | null) => void
  /** Faixa compacta (dock do scanner): sem barra da ferramenta e sem painel de volume. */
  compacto?: boolean
  /** MTM Sensei desenhado no gráfico (null/undefined = desligado). */
  sensei?: {
    inputs: InputsSensei
    /** Painéis CHECKLIST/CONFIRMAÇÕES/TRADE por cima do gráfico (a faixa compacta não os leva). */
    paineis?: boolean
    /** Cada resultado novo (null ao desligar) — alimenta o «Usar este sinal». */
    aoCalcular?: (r: ResultadoSensei | null) => void
  } | null
  /** MTM GoldKiller desenhado no gráfico (null/undefined = desligado). */
  goldkiller?: {
    inputs: InputsGoldKiller
    /** Cada resultado novo (null ao desligar) — alimenta o «Usar este sinal». */
    aoCalcular?: (r: ResultadoGoldKiller | null) => void
  } | null
  /** MTM Scanner desenhado no gráfico (null/undefined = desligado). */
  mtmscanner?: {
    inputs: InputsMTMScanner
    /** Cada resultado novo (null ao desligar) — alimenta o «Usar este sinal». */
    aoCalcular?: (r: ResultadoMTMScanner | null) => void
  } | null
}) {
  const { simbolo, preco, precos, volume, posicoes, ordens, podeNegociar, tf, modo, setModo } = props
  const [estadoVelas, setEstadoVelas] = useState<"a_carregar" | "historico" | "ao_vivo" | "erro">("a_carregar")
  const [erroLib, setErroLib] = useState<string | null>(null)
  // A ordem em preparação é do rascunho partilhado com o ticket (rascunho-ordem.tsx).
  const k = useRascunho()
  const umClique = useUmClique()
  const accao = (descricao: string, fn: () => Promise<unknown>) =>
    umClique.executar(descricao, fn, { confirmar: true, digitos: simbolo.digits })
  const [rascunho, setRascunho] = useState<Record<string, number>>({})
  const [ys, setYs] = useState<Record<string, number>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; dono: Dono } | null>(null)
  const [pronto, setPronto] = useState(false)

  const caixaRef = useRef<HTMLDivElement>(null)
  const graficoRef = useRef<any>(null)
  const serieRef = useRef<any>(null)
  const volumeRef = useRef<any>(null)
  const marcasRef = useRef<any>(null)
  const marcaAguaRef = useRef<any>(null)
  const zonasRef = useRef<ZonasFerramenta | null>(null)
  const etiquetasEixoRef = useRef<Map<string, { pl: any; assinatura: string }>>(new Map())
  const ultimaVelaRef = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null)
  const linhasRef = useRef<Linha[]>([])
  const dragRef = useRef<{ chave: string; dono: Dono; y0: number; moveu: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null)
  const toqueRef = useRef<{ x: number; y: number } | null>(null)
  const larguraEscalaRef = useRef(56)
  // As velas carregadas + a viva, espelho exato da série (o Sensei precisa dos MESMOS tempos).
  const velasRef = useRef<Vela[]>([])
  /** Sobe quando o conjunto de velas FECHADAS muda (histórico novo ou abriu uma vela) → recalcular o Sensei. */
  const [versaoVelas, setVersaoVelas] = useState(0)
  const senseiLigado = Boolean(props.sensei)
  // Só cresce: ligar o Sensei pede 3000 velas; desligá-lo não volta a pedir 300 (as a mais não fazem mal).
  const goldkillerLigado = Boolean(props.goldkiller)
  // O GoldKiller também: os níveis são percentis das pernas passadas — mais velas, mais pernas.
  // O MTM Scanner: DEMA 238 aquece em 474 velas e a estrutura (swings 50) precisa de história.
  const mtmscannerLigado = Boolean(props.mtmscanner)
  const [limiteHistorico, setLimiteHistorico] = useState(() => (props.sensei || props.goldkiller || props.mtmscanner ? 3000 : 300))
  useEffect(() => { if (senseiLigado || goldkillerLigado || mtmscannerLigado) setLimiteHistorico(3000) }, [senseiLigado, goldkillerLigado, mtmscannerLigado])
  const senseiRef = useRef<import("@/lib/estudos/sensei/lightweight").SenseiLW | null>(null)
  const [senseiPronto, setSenseiPronto] = useState(false)
  const [senseiR, setSenseiR] = useState<ResultadoSensei | null>(null)
  const [senseiMs, setSenseiMs] = useState<{ ms: number; onde: string; velas: number } | null>(null)
  const coresRef = useRef<Map<number, string>>(new Map())
  const [paineisAbertos, setPaineisAbertos] = useState(true)
  const calcular = useCalculadoraSensei()
  const aoCalcularRef = useRef(props.sensei?.aoCalcular)
  aoCalcularRef.current = props.sensei?.aoCalcular
  const gkRef = useRef<import("@/lib/estudos/goldkiller/lightweight").GoldKillerLW | null>(null)
  const [gkPronto, setGkPronto] = useState(false)
  const [gkR, setGkR] = useState<ResultadoGoldKiller | null>(null)
  const [gkMs, setGkMs] = useState<{ ms: number; onde: string; velas: number } | null>(null)
  const calcularGK = useCalculadoraGoldKiller()
  const aoCalcularGKRef = useRef(props.goldkiller?.aoCalcular)
  aoCalcularGKRef.current = props.goldkiller?.aoCalcular
  const msRef = useRef<import("@/lib/estudos/mtmscanner/lightweight").MTMScannerLW | null>(null)
  const [msPronto, setMsPronto] = useState(false)
  const [msR, setMsR] = useState<ResultadoMTMScanner | null>(null)
  const [msMs, setMsMs] = useState<{ ms: number; onde: string; velas: number } | null>(null)
  const calcularMS = useCalculadoraMTMScanner()
  const aoCalcularMSRef = useRef(props.mtmscanner?.aoCalcular)
  aoCalcularMSRef.current = props.mtmscanner?.aoCalcular
  // Telemóvel: os painéis começam fechados (tapavam o gráfico todo); abrem-se no botão.
  useEffect(() => { try { if (window.matchMedia("(max-width: 767px)").matches) setPaineisAbertos(false) } catch { /* ok */ } }, [])

  useEffect(() => { setRascunho({}); setMenu(null) }, [simbolo.symbol])

  const arred = useCallback((v: number) => Number(v.toFixed(simbolo.digits)), [simbolo.digits])

  // ── criar o gráfico ──
  useEffect(() => {
    let vivo = true
    carregarLW().then((LW) => {
      if (!vivo || !caixaRef.current) return
      const chart = LW.createChart(caixaRef.current, {
        autoSize: true,
        layout: {
          background: { type: LW.ColorType.Solid, color: TV.fundo }, textColor: TV.textoFraco, fontSize: 11,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          // Obrigatório pela licença (Apache-2.0 + NOTICE do TradingView): «Charts by TradingView».
          attributionLogo: true,
          panes: { separatorColor: TV.borda, separatorHoverColor: "rgba(41,98,255,0.3)", enableResize: true },
        },
        grid: { vertLines: { color: "rgba(42,46,57,0.6)" }, horzLines: { color: "rgba(42,46,57,0.6)" } },
        rightPriceScale: { borderColor: TV.borda, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: TV.borda, timeVisible: true, secondsVisible: false, rightOffset: 6 },
        crosshair: {
          mode: LW.CrosshairMode.Normal,
          vertLine: { color: TV.mira, style: 2, width: 1, labelBackgroundColor: "#363A45" },
          horzLine: { color: TV.mira, style: 2, width: 1, labelBackgroundColor: "#363A45" },
        },
        localization: { priceFormatter: (p: number) => p.toFixed(simbolo.digits) },
      })
      const serie = chart.addSeries(LW.CandlestickSeries, {
        upColor: TV.sobe, downColor: TV.desce, borderVisible: false, wickUpColor: TV.sobe, wickDownColor: TV.desce,
        priceFormat: { type: "price", precision: simbolo.digits, minMove: Math.pow(10, -simbolo.digits) },
        // A escala automática inclui as linhas (posições, ordens, rascunho): um SL escrito no ticket
        // fora do ecrã ficava invisível — e uma linha que não se vê não se arrasta. Durante um
        // arrasto a escala CONGELA: se acompanhasse a linha, o preço debaixo do dedo fugia.
        autoscaleInfoProvider: (original: () => any): any => {
          const base = original()
          const niveis = linhasRef.current.map((l) => l.preco).filter((p) => Number.isFinite(p) && p > 0)
          const r = !base || !niveis.length ? base : {
            ...base,
            priceRange: {
              minValue: Math.min(base.priceRange.minValue, ...niveis),
              maxValue: Math.max(base.priceRange.maxValue, ...niveis),
            },
          }
          return r
        },
      })
      marcaAguaRef.current = LW.createTextWatermark(chart.panes()[0], {
        horzAlign: "center", vertAlign: "center",
        lines: [{ text: simbolo.symbol, color: "rgba(120,123,134,0.10)", fontSize: props.compacto ? 28 : 44 }],
      })
      marcasRef.current = LW.createSeriesMarkers(serie, [])
      const zonas = new ZonasFerramenta()
      serie.attachPrimitive(zonas as any)
      zonasRef.current = zonas
      if (!props.compacto) {
        // Volume (ticks) num painel próprio por baixo, como no TradingView.
        const vol = chart.addSeries(LW.HistogramSeries, {
          priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false, color: "rgba(120,123,134,0.35)",
        }, 1)
        try { chart.panes()[1]?.setHeight(64) } catch { /* ok */ }
        volumeRef.current = vol
      }
      graficoRef.current = chart
      serieRef.current = serie
      etiquetasEixoRef.current = new Map()
      setErroLib(null)
      setPronto(true)
    }).catch((e) => vivo && setErroLib((e as Error).message))
    return () => {
      vivo = false
      setPronto(false)
      try { graficoRef.current?.remove() } catch { /* já removido */ }
      graficoRef.current = null
      serieRef.current = null
      volumeRef.current = null
      marcasRef.current = null
      marcaAguaRef.current = null
      zonasRef.current = null
      etiquetasEixoRef.current = new Map()
    }
  }, [simbolo.digits, props.compacto]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { marcaAguaRef.current?.applyOptions({ lines: [{ text: simbolo.symbol, color: "rgba(120,123,134,0.10)", fontSize: props.compacto ? 28 : 44 }] }) } catch { /* ok */ }
  }, [simbolo.symbol, pronto])

  // ── histórico ──
  // Em dois tempos (2026-09): primeiro a janela recente (300 velas — a frio ~1 s, e em cache na CDN
  // e na pré-carga do WebTrader), para o gráfico aparecer logo; depois, se os estudos precisam de
  // história (3000), a janela grande em segundo plano, colada por baixo sem mexer no que se está a
  // ver. Os estudos só calculam com a janela completa — não se gasta o Web Worker em 300 velas.
  const [historicoCompleto, setHistoricoCompleto] = useState(false)
  useEffect(() => {
    if (!pronto) return
    let vivo = true
    ultimaVelaRef.current = null
    velasRef.current = []
    coresRef.current = new Map()
    setEstadoVelas("a_carregar")
    setHistoricoCompleto(false)
    const paraSerie = (lista: VelaApi[]) => lista.map((v) => ({ time: v.t, open: v.o, high: v.h, low: v.l, close: v.c, volume: Number(v.v) || 0 }))
    const aplicar = (lista: VelaApi[], manterVista: boolean) => {
      const serie = serieRef.current
      if (!serie) return
      // A vela viva que já correu por cima do histórico (preços chegados entretanto) mantém-se.
      const viva = ultimaVelaRef.current
      const velas = paraSerie(lista)
      if (viva && velas.length && viva.time >= velas[velas.length - 1].time) {
        if (viva.time === velas[velas.length - 1].time) velas[velas.length - 1] = { ...velas[velas.length - 1], high: Math.max(velas[velas.length - 1].high, viva.high), low: Math.min(velas[velas.length - 1].low, viva.low), close: viva.close }
        else velas.push(viva)
      }
      const escala = graficoRef.current?.timeScale()
      const antes = manterVista ? escala?.getVisibleLogicalRange() : null
      const acrescentadas = velas.length - velasRef.current.length
      serie.setData(velas.map(({ volume: _v, ...c }) => c))
      volumeRef.current?.setData(velas.map((v) => ({ time: v.time, value: v.volume, color: v.close >= v.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)" })))
      ultimaVelaRef.current = velas.length ? velas[velas.length - 1] : null
      velasRef.current = velas.map((v) => ({ t: v.time, o: v.open, h: v.high, l: v.low, c: v.close, v: v.volume }))
      if (antes && acrescentadas > 0) {
        try { escala?.setVisibleLogicalRange({ from: antes.from + acrescentadas, to: antes.to + acrescentadas }) } catch { /* ok */ }
      } else if (!manterVista) escala?.scrollToRealTime()
    }
    ;(async () => {
      try {
        const primeira = await pedirVelas(simbolo.symbol, tf, VELAS_PRIMEIRA_JANELA)
        if (!vivo || !serieRef.current) return
        const recentes = primeira.velas ?? []
        aplicar(recentes, false)
        setEstadoVelas(recentes.length ? "historico" : "ao_vivo")
        if (limiteHistorico <= VELAS_PRIMEIRA_JANELA || !recentes.length) {
          setHistoricoCompleto(true)
          setVersaoVelas((x) => x + 1)
          return
        }
        // O MTM Sensei/GoldKiller/Scanner precisam de história (DEMA 238 aquece em 474 velas).
        const grande = await pedirVelas(simbolo.symbol, tf, limiteHistorico)
        if (!vivo || !serieRef.current) return
        const antigas = grande.velas ?? []
        if (antigas.length > recentes.length) {
          const primeiraRecente = recentes[0].t
          aplicar(antigas.filter((v) => v.t < primeiraRecente).concat(recentes), true)
        }
        setHistoricoCompleto(true)
        setVersaoVelas((x) => x + 1)
      } catch {
        if (vivo) {
          if (!velasRef.current.length) { serieRef.current?.setData([]); volumeRef.current?.setData([]); setEstadoVelas("ao_vivo") }
          setHistoricoCompleto(true)
        }
      }
    })()
    return () => { vivo = false }
  }, [pronto, simbolo.symbol, tf, limiteHistorico])

  // ── a vela viva ──
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !preco || estadoVelas === "a_carregar") return
    const passo = tfPorChave(tf).seg
    const t = Math.floor(new Date(preco.em).getTime() / 1000 / passo) * passo
    const v = preco.bid
    const u = ultimaVelaRef.current
    let nova
    // Incremental: só a última vela muda (`update`), nunca se reescreve a série inteira por tick.
    // O volume da vela viva conta os preços recebidos (ticks), como o volume de ticks da MetaApi.
    if (u && u.time === t) nova = { ...u, high: Math.max(u.high, v), low: Math.min(u.low, v), close: v, volume: u.volume + 1 }
    else if (!u || t > u.time) nova = { time: t, open: u?.close ?? v, high: Math.max(v, u?.close ?? v), low: Math.min(v, u?.close ?? v), close: v, volume: 1 }
    else return
    try {
      const { volume: vol, ...vela } = nova
      serie.update(vela)
      volumeRef.current?.update({ time: t, value: vol, color: vela.close >= vela.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)" })
      const abriuVela = !u || t > u.time
      ultimaVelaRef.current = nova
      const vv = { t, o: nova.open, h: nova.high, l: nova.low, c: nova.close, v: nova.volume }
      const arr = velasRef.current
      if (arr.length && arr[arr.length - 1].t === t) arr[arr.length - 1] = vv
      else arr.push(vv)
      // Abriu uma vela = a anterior FECHOU: é o único momento em que o Sensei pode dar sinal novo.
      if (abriuVela) setVersaoVelas((x) => x + 1)
    } catch { /* tempo fora de ordem */ }
  }, [preco, tf, estadoVelas])

  // ── as linhas ──
  const valorDe = (chave: string, base: number) => (rascunho[chave] ?? base)
  const dolares = (v: number | null) => (v == null ? "— $" : `${v >= 0 ? "+" : ""}${usd(v)} $`)

  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = []
    for (const p of posicoes) {
      const cor = p.direcao === "buy" ? TV.compra : TV.venda
      // Lucro ao vivo pelo preço de fecho (bid para compras, ask para vendas), como o TradingView.
      const saida = preco ? (p.direcao === "buy" ? preco.bid : preco.ask) : null
      const lucro = saida == null ? null : lucroUsd(simbolo, p.direcao, p.volume, p.preco_entrada, saida, precos)
      out.push({ chave: `pos:${p.id}:entrada`, preco: p.preco_entrada, cor, corpo: `${p.direcao === "buy" ? "Long" : "Short"} ${dolares(lucro)}`, qtd: String(p.volume), arrastavel: false, fecho: podeNegociar ? "fechar" : undefined, dono: { tipo: "pos", id: p.id, campo: "entrada" } })
      for (const campo of ["sl", "tp"] as const) {
        const chave = `pos:${p.id}:${campo}`
        const base = p[campo]
        if (base == null && rascunho[chave] == null) continue
        const nivel = valorDe(chave, base ?? 0)
        const valor = lucroUsd(simbolo, p.direcao, p.volume, p.preco_entrada, nivel, precos)
        out.push({ chave, preco: nivel, cor: campo === "sl" ? TV.sl : TV.tp, corpo: `${campo.toUpperCase()} ${dolares(valor)}`, qtd: String(p.volume), arrastavel: podeNegociar, tracejada: true, fecho: podeNegociar ? "remover" : undefined, dono: { tipo: "pos", id: p.id, campo } })
      }
    }
    for (const o of ordens) {
      const cor = o.direcao === "buy" ? TV.compra : TV.venda
      out.push({ chave: `ord:${o.id}:preco`, preco: valorDe(`ord:${o.id}:preco`, o.preco), cor, corpo: `${o.direcao === "buy" ? "Buy" : "Sell"} ${o.tipo === "limit" ? "Limit" : "Stop"}`, qtd: String(o.volume), arrastavel: podeNegociar, tracejada: true, fecho: podeNegociar ? "cancelar" : undefined, dono: { tipo: "ord", id: o.id, campo: "preco" } })
      if (o.sl != null) out.push({ chave: `ord:${o.id}:sl`, preco: valorDe(`ord:${o.id}:sl`, o.sl), cor: TV.sl, corpo: "SL (ordem)", arrastavel: podeNegociar, tracejada: true, fecho: podeNegociar ? "remover" : undefined, dono: { tipo: "ord", id: o.id, campo: "sl" } })
      if (o.tp != null) out.push({ chave: `ord:${o.id}:tp`, preco: valorDe(`ord:${o.id}:tp`, o.tp), cor: TV.tp, corpo: "TP (ordem)", arrastavel: podeNegociar, tracejada: true, fecho: podeNegociar ? "remover" : undefined, dono: { tipo: "ord", id: o.id, campo: "tp" } })
    }
    // TPs parciais da gestão automática e alertas de preço: referência, não arrastam nem fecham.
    for (const p of posicoes) {
      for (const [i, t] of (p.tps ?? []).entries()) {
        if (t.atingido) continue
        out.push({ chave: `pos:${p.id}:tp${i + 1}`, preco: t.preco, cor: `${TV.tp}aa`, corpo: `TP${i + 1} · ${t.pct}%`, arrastavel: false, tracejada: true, dono: { tipo: "sinal", id: `tp:${p.id}:${i}`, campo: "tp" } })
      }
    }
    for (const a of props.alertas ?? []) {
      out.push({ chave: `alerta:${a.id}`, preco: a.preco, cor: "#F5B301", corpo: `🔔 ${a.nota ? a.nota.slice(0, 24) : "alerta"}`, arrastavel: false, tracejada: true, dono: { tipo: "sinal", id: `alerta:${a.id}`, campo: "entrada" } })
    }
    // O sinal activo do estudo: só referência visual (ténue, não arrasta, não fecha).
    const sa = props.sinalAtivo
    if (sa) {
      const niveis: Array<["entrada" | "sl" | "tp", number | null, string]> = [["entrada", sa.entrada, "entrada"], ["sl", sa.sl, "SL"], ["tp", sa.tp, "TP"]]
      for (const [campo, nivel, nome] of niveis) {
        if (nivel == null) continue
        out.push({ chave: `sinal:${sa.id}:${campo}`, preco: nivel, cor: `${sa.estudo.cor}99`, corpo: `${sa.estudo.curto} ${sa.direcao === "buy" ? "▲" : "▼"} ${nome}`, arrastavel: false, tracejada: true, dono: { tipo: "sinal", id: sa.id, campo } })
      }
    }
    // O rascunho da ordem (ticket ⇄ gráfico). Níveis inválidos ficam vermelhos com «⚠».
    if (k.mostrar && k.entrada != null) {
      const { r, resumo, erros } = k
      const invalido = "#FF1744"
      const corEntrada = erros.entrada || erros.margem || erros.volume ? invalido : "#B2B5BE"
      const nomeTipo = r.tipo === "mercado" ? "a mercado" : `${r.lado} ${r.tipo}`
      out.push({ chave: "tool:entrada", preco: k.entrada, cor: corEntrada, corpo: `${erros.entrada || erros.margem ? "⚠ " : ""}${r.lado === "buy" ? "Long" : "Short"} · ${nomeTipo}`, qtd: String(volume), arrastavel: true, dono: { tipo: "tool", campo: "entrada" } })
      if (k.sl != null) out.push({ chave: "tool:sl", preco: k.sl, cor: erros.sl ? invalido : TV.sl, corpo: `${erros.sl ? "⚠ " : ""}Stop ${resumo.pipsSl ?? "—"} pips · ${usd(resumo.risco)} $${resumo.riscoPct != null ? ` (${resumo.riscoPct}%)` : ""}`, arrastavel: true, tracejada: Boolean(erros.sl), dono: { tipo: "tool", campo: "sl" } })
      if (k.tp != null) out.push({ chave: "tool:tp", preco: k.tp, cor: erros.tp ? invalido : TV.tp, corpo: `${erros.tp ? "⚠ " : ""}Alvo ${resumo.pipsTp ?? "—"} pips · ${resumo.ganho != null && resumo.ganho >= 0 ? "+" : ""}${usd(resumo.ganho)} $${resumo.ganhoPct != null ? ` (${resumo.ganhoPct}%)` : ""}${resumo.rr ? ` · R:R ${resumo.rr}` : ""}`, arrastavel: true, tracejada: Boolean(erros.tp), dono: { tipo: "tool", campo: "tp" } })
    }
    return out
  }, [posicoes, ordens, k.mostrar, k.entrada, k.sl, k.tp, k.r, k.erros, k.resumo, rascunho, podeNegociar, simbolo, volume, precos, preco, props.sinalAtivo, props.alertas]) // eslint-disable-line react-hooks/exhaustive-deps
  linhasRef.current = linhas

  // Setas dos sinais dos estudos, na vela em que chegaram (arredondada ao timeframe).
  useEffect(() => {
    const m = marcasRef.current
    if (!m || !pronto || estadoVelas === "a_carregar") return
    const passo = tfPorChave(tf).seg
    const marcas = (props.sinais ?? []).map((s) => ({
      time: Math.floor(s.em / passo) * passo,
      position: s.direcao === "buy" ? "belowBar" : "aboveBar",
      color: s.estudo.cor,
      shape: s.direcao === "buy" ? "arrowUp" : "arrowDown",
      text: s.estudo.curto,
    })).sort((a, b) => a.time - b.time)
    try { m.setMarkers(marcas) } catch { /* tempo fora das velas carregadas */ }
  }, [props.sinais, pronto, estadoVelas, tf])

  // ── MTM Sensei ──
  // Anexar/retirar o adaptador (séries das DEMAs, primitivo de desenho, marcadores) com o estudo.
  useEffect(() => {
    if (!pronto || !senseiLigado) return
    let vivo = true
    import("@/lib/estudos/sensei/lightweight").then((mod) => {
      if (!vivo || !graficoRef.current || !serieRef.current) return
      senseiRef.current = mod.anexarSensei(graficoRef.current, serieRef.current, {
        aoCalcular: (r) => { setSenseiR(r); aoCalcularRef.current?.(r) },
      })
      setSenseiPronto(true)
    }).catch(() => { /* sem estudo — o gráfico continua */ })
    return () => {
      vivo = false
      try { senseiRef.current?.remove() } catch { /* o gráfico já foi removido */ }
      senseiRef.current = null
      setSenseiPronto(false)
      setSenseiR(null)
      aoCalcularRef.current?.(null)
      // Tirar a cor às velas (barcolor) ao desligar.
      if (coresRef.current.size) {
        coresRef.current = new Map()
        try { serieRef.current?.setData(velasRef.current.map((v) => ({ time: v.t, open: v.o, high: v.h, low: v.l, close: v.c }))) } catch { /* ok */ }
      }
    }
  }, [pronto, senseiLigado])

  // Recalcular: com velas novas (histórico ou vela FECHADA) e quando mudam os inputs — nunca por tick.
  const inputsSensei = props.sensei?.inputs
  const chaveInputsSensei = inputsSensei ? JSON.stringify(inputsSensei) : ""
  useEffect(() => {
    if (!senseiPronto || !inputsSensei || estadoVelas === "a_carregar" || !historicoCompleto) return
    const snapshot = velasRef.current.slice()
    if (snapshot.length < 50) return
    let vivo = true
    const tfSeg = tfPorChave(tf).seg
    const inputs: Partial<InputsSensei> = { ...inputsSensei, simbolo: simbolo.symbol, tfSegundos: tfSeg, mintick: Math.pow(10, -simbolo.digits) }
    ;(async () => {
      const extra = await carregarExtrasSensei(simbolo.symbol, tfSeg, { ...inputsSensei, ...inputs } as InputsSensei, snapshot)
      if (!vivo) return
      const c = await calcular(snapshot, inputs, extra)
      if (!vivo || !c || !senseiRef.current) return
      senseiRef.current.aplicar(snapshot, c.r)
      setSenseiMs({ ms: Math.round(c.ms), onde: c.onde, velas: snapshot.length })
      // barcolor(): as velas de sinal pintadas na própria série (uma vez por vela fechada, não por tick).
      const cores = new Map<number, string>()
      c.r.series.corVela.forEach((cor, i) => { if (cor && snapshot[i]) cores.set(snapshot[i].t, cor) })
      const mudou = cores.size !== coresRef.current.size || [...cores].some(([t, cor]) => coresRef.current.get(t) !== cor)
      if (mudou && serieRef.current) {
        coresRef.current = cores
        try {
          serieRef.current.setData(velasRef.current.map((v) => {
            const cor = cores.get(v.t)
            return cor ? { time: v.t, open: v.o, high: v.h, low: v.l, close: v.c, color: cor, wickColor: cor, borderColor: cor } : { time: v.t, open: v.o, high: v.h, low: v.l, close: v.c }
          }))
        } catch { /* série a ser recriada */ }
      }
    })()
    return () => { vivo = false }
  }, [senseiPronto, versaoVelas, historicoCompleto, chaveInputsSensei, simbolo.symbol, simbolo.digits, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── MTM GoldKiller ──
  useEffect(() => {
    if (!pronto || !goldkillerLigado) return
    let vivo = true
    import("@/lib/estudos/goldkiller/lightweight").then((mod) => {
      if (!vivo || !graficoRef.current || !serieRef.current) return
      gkRef.current = mod.anexarGoldKiller(graficoRef.current, serieRef.current, {
        // Na faixa compacta (240 px) as dez etiquetas no eixo tapavam a escala toda.
        etiquetasEixo: !props.compacto,
        aoCalcular: (r) => { setGkR(r); aoCalcularGKRef.current?.(r) },
      })
      setGkPronto(true)
    }).catch(() => { /* sem estudo — o gráfico continua */ })
    return () => {
      vivo = false
      try { gkRef.current?.remove() } catch { /* o gráfico já foi removido */ }
      gkRef.current = null
      setGkPronto(false)
      setGkR(null)
      aoCalcularGKRef.current?.(null)
    }
  }, [pronto, goldkillerLigado]) // eslint-disable-line react-hooks/exhaustive-deps

  const inputsGK = props.goldkiller?.inputs
  const chaveInputsGK = inputsGK ? JSON.stringify(inputsGK) : ""
  useEffect(() => {
    if (!gkPronto || !inputsGK || estadoVelas === "a_carregar" || !historicoCompleto) return
    const snapshot = velasRef.current.slice()
    if (snapshot.length < 50) return
    let vivo = true
    const tfSeg = tfPorChave(tf).seg
    const inputs: Partial<InputsGoldKiller> = { ...inputsGK, simbolo: simbolo.symbol, tfSegundos: tfSeg, mintick: Math.pow(10, -simbolo.digits) }
    ;(async () => {
      const c = await calcularGK(snapshot, inputs)
      if (!vivo || !c || !gkRef.current) return
      gkRef.current.aplicar(snapshot, c.r)
      setGkMs({ ms: Math.round(c.ms), onde: c.onde, velas: snapshot.length })
    })()
    return () => { vivo = false }
  }, [gkPronto, versaoVelas, historicoCompleto, chaveInputsGK, simbolo.symbol, simbolo.digits, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── MTM Scanner ──
  useEffect(() => {
    if (!pronto || !mtmscannerLigado) return
    let vivo = true
    import("@/lib/estudos/mtmscanner/lightweight").then((mod) => {
      if (!vivo || !graficoRef.current || !serieRef.current) return
      msRef.current = mod.anexarMTMScanner(graficoRef.current, serieRef.current, {
        etiquetasEixo: !props.compacto,
        aoCalcular: (r) => { setMsR(r); aoCalcularMSRef.current?.(r) },
      })
      setMsPronto(true)
    }).catch(() => { /* sem estudo — o gráfico continua */ })
    return () => {
      vivo = false
      try { msRef.current?.remove() } catch { /* o gráfico já foi removido */ }
      msRef.current = null
      setMsPronto(false)
      setMsR(null)
      aoCalcularMSRef.current?.(null)
    }
  }, [pronto, mtmscannerLigado]) // eslint-disable-line react-hooks/exhaustive-deps

  const inputsMS = props.mtmscanner?.inputs
  const chaveInputsMS = inputsMS ? JSON.stringify(inputsMS) : ""
  useEffect(() => {
    if (!msPronto || !inputsMS || estadoVelas === "a_carregar" || !historicoCompleto) return
    const snapshot = velasRef.current.slice()
    if (snapshot.length < 50) return
    let vivo = true
    const tfSeg = tfPorChave(tf).seg
    // mintick = o tick do símbolo no funded_symbols (digits); o volume é o de ticks da rota das velas.
    const inputs: Partial<InputsMTMScanner> = { ...inputsMS, simbolo: simbolo.symbol, tfSegundos: tfSeg, mintick: Math.pow(10, -simbolo.digits) }
    ;(async () => {
      const c = await calcularMS(snapshot, inputs)
      if (!vivo || !c || !msRef.current) return
      msRef.current.aplicar(snapshot, c.r)
      setMsMs({ ms: Math.round(c.ms), onde: c.onde, velas: snapshot.length })
    })()
    return () => { vivo = false }
  }, [msPronto, versaoVelas, historicoCompleto, chaveInputsMS, simbolo.symbol, simbolo.digits, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  // As zonas da ferramenta (primitiva no canvas).
  useEffect(() => {
    const z = zonasRef.current
    if (!z || !pronto) return
    const zonas: Array<{ de: number; ate: number; cor: string }> = []
    if (k.mostrar && k.entrada != null) {
      if (k.sl != null) zonas.push({ de: k.entrada, ate: k.sl, cor: "rgba(242,54,69,0.18)" })
      if (k.tp != null) zonas.push({ de: k.entrada, ate: k.tp, cor: "rgba(8,153,129,0.18)" })
    }
    z.definir(zonas)
  }, [pronto, k.mostrar, k.entrada, k.sl, k.tp])

  // As linhas são price lines do gráfico (linha + caixa com o preço no eixo, como o TradingView as
  // põe). Só se tocam as que mudaram: a cada tick muda o lucro das etiquetas, não o preço das linhas.
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !pronto) return
    const mapa = etiquetasEixoRef.current
    const vistas = new Set<string>()
    for (const l of linhas) {
      vistas.add(l.chave)
      const opcoes = { price: l.preco, color: l.cor, lineWidth: 1 as const, lineStyle: l.tracejada ? 2 : 0, lineVisible: true, axisLabelVisible: true, title: "" }
      const assinatura = `${l.preco}|${l.cor}|${l.tracejada ? 1 : 0}`
      const existente = mapa.get(l.chave)
      try {
        if (existente) {
          if (existente.assinatura !== assinatura) { existente.pl.applyOptions(opcoes); existente.assinatura = assinatura }
        } else mapa.set(l.chave, { pl: serie.createPriceLine(opcoes), assinatura })
      } catch { /* série a ser recriada */ }
    }
    for (const [chave, e] of mapa) {
      if (vistas.has(chave)) continue
      try { serie.removePriceLine(e.pl) } catch { /* ok */ }
      mapa.delete(chave)
    }
  }, [linhas, pronto])

  // Coordenadas: o gráfico mexe-se (pan, zoom, escala automática) sem avisar o React, por isso lê-se
  // a posição de cada linha a cada frame e só se re-desenha quando algo andou meio píxel.
  useEffect(() => {
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
  }, [])

  // ── interacção ──
  const precoNoY = (y: number): number | null => {
    const p = serieRef.current?.coordinateToPrice(y)
    return p == null || !Number.isFinite(p) ? null : arred(p)
  }
  const linhaPerto = (y: number, raio: number) => {
    let melhor: Linha | null = null
    let dist = raio
    for (const l of linhasRef.current) {
      if (l.dono.tipo === "sinal") continue
      const ly = ys[l.chave]
      if (ly == null) continue
      const d = Math.abs(ly - y)
      if (d <= dist) { dist = d; melhor = l }
    }
    return melhor
  }
  const bloquearPan = (sim: boolean) => {
    try { graficoRef.current?.applyOptions({ handleScroll: !sim, handleScale: !sim }) } catch { /* ok */ }
    // Escala parada durante o arrasto (ver autoscaleInfoProvider); volta a automática ao largar.
    try { graficoRef.current?.priceScale("right").applyOptions({ autoScale: !sim }) } catch { /* ok */ }
  }

  const colocarFerramenta = (direcao: Direcao, entrada: number) => {
    // SL a uma distância que se vê no ecrã (10% da escala visível ou 5× o spread), TP a 2R.
    const serie = serieRef.current
    const alto = serie?.coordinateToPrice(0)
    const baixo = serie?.coordinateToPrice((caixaRef.current?.clientHeight ?? 300) - 30)
    const faixa = alto != null && baixo != null ? Math.abs(alto - baixo) : entrada * 0.005
    const d = Math.max(faixa * 0.1, spreadEmPreco(simbolo) * 5, simbolo.pip_size * 5)
    k.colocar(direcao, entrada, d)
    setModo(null)
  }

  // O «×» das etiquetas: fechar / remover SL-TP / cancelar (com confirmação se o num clique estiver desligado).
  const accaoFecho = (l: Linha) => {
    const dono = l.dono
    const nada = () => {}
    if (dono.tipo === "pos") {
      const p = posicoes.find((q) => q.id === dono.id)
      if (!p) return
      if (dono.campo === "entrada") return void accao(`Fechar ${simbolo.symbol} ${p.volume}`, () => props.onFecharPosicao(p.id)).catch(nada)
      void accao(`Remover ${dono.campo.toUpperCase()} de ${simbolo.symbol}`, () => props.onModificarPosicao(p.id, dono.campo === "sl" ? null : p.sl, dono.campo === "tp" ? null : p.tp)).catch(nada)
    } else if (dono.tipo === "ord") {
      const o = ordens.find((q) => q.id === dono.id)
      if (!o) return
      if (dono.campo === "preco") return void accao(`Cancelar ${o.direcao} ${o.tipo} ${simbolo.symbol} @ ${px(o.preco, simbolo.digits)}`, () => props.onCancelarPendente(o.id)).catch(nada)
      void accao(`Remover ${dono.campo.toUpperCase()} da ordem`, () => props.onModificarPendente(o.id, o.preco, dono.campo === "sl" ? null : o.sl, dono.campo === "tp" ? null : o.tp)).catch(nada)
    }
  }

  const aoPressionar = (e: React.PointerEvent<HTMLDivElement>) => {
    // Os botões das etiquetas («×», menu) tratam-se sozinhos — não começam arrasto.
    if ((e.target as HTMLElement).closest("[data-linha-botao]")) return
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
      // Arrastar o rascunho escreve no ticket, ao vivo (e a entrada troca Mercado/Limit/Stop).
      k.definirNivel(d.dono.campo, p)
    } else {
      setRascunho((x) => ({ ...x, [d.chave]: p }))
    }
  }

  const aoLargar = async (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-linha-botao]") && !dragRef.current) return
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
      // A linha fica onde se largou enquanto a confirmação está aberta; cancelar ou falhar repõe-na.
      if (dono.tipo === "pos") {
        const p = posicoes.find((q) => q.id === dono.id)
        if (!p) return limpar()
        await accao(`Mover ${dono.campo === "entrada" ? "entrada" : dono.campo.toUpperCase()} de ${simbolo.symbol} para ${px(novo, simbolo.digits)}`,
          () => props.onModificarPosicao(p.id, dono.campo === "sl" ? novo : p.sl, dono.campo === "tp" ? novo : p.tp))
      } else if (dono.tipo === "ord") {
        const o = ordens.find((q) => q.id === dono.id)
        if (!o) return limpar()
        await accao(`Mover ${dono.campo === "preco" ? `${o.direcao} ${o.tipo}` : `${dono.campo.toUpperCase()} da ordem`} para ${px(novo, simbolo.digits)}`,
          () => props.onModificarPendente(o.id, dono.campo === "preco" ? novo : o.preco, dono.campo === "sl" ? novo : o.sl, dono.campo === "tp" ? novo : o.tp))
      }
    } catch (e) {
      /* cancelado, ou o erro já aparece no aviso */ void (e instanceof AccaoCancelada)
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

  const larguraEscala = larguraEscalaRef.current

  return (
    <div className={props.preencher ? "flex min-h-0 flex-1 flex-col" : undefined} style={{ background: TV.fundo }}>
      <div
        className={`relative touch-pan-y select-none ${props.preencher ? "min-h-0 flex-1" : props.alturaClasse ?? (props.compacto ? "h-[200px] md:h-[240px]" : "h-[400px] md:h-[500px]")} ${modo ? "cursor-crosshair" : ""}`}
        onPointerDownCapture={aoPressionar}
        onPointerMoveCapture={aoMover}
        onPointerUpCapture={aoLargar}
        onContextMenu={aoMenuContexto}
      >
        <div ref={caixaRef} className="absolute inset-0" />
        {/* Sobreposição: só as etiquetas (as linhas e as zonas estão no canvas do gráfico). Não
            apanha toques — quem os apanha é a caixa por cima, na fase de captura. Só os botões das
            etiquetas («×») são clicáveis. */}
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {linhas.map((l) => {
            const y = ys[l.chave]
            if (y == null) return null
            const ferr = l.dono.tipo === "tool"
            return (
              <div key={l.chave} className="absolute left-0" style={{ top: y, right: larguraEscala }}>
                {/* Etiqueta à TradingView: corpo | quantidade | ×. Ferramenta à esquerda, posições e ordens à direita. */}
                <div
                  className={`absolute flex -translate-y-1/2 items-stretch overflow-hidden whitespace-nowrap rounded-sm text-[10.5px] font-semibold leading-none ${ferr ? "left-[46%]" : "right-10"}`}
                  style={{ border: `1px solid ${l.cor}`, background: TV.fundo, cursor: l.arrastavel ? "ns-resize" : "default" }}
                >
                  <span className="px-1.5 py-[3px]" style={{ color: l.cor }}>
                    {l.corpo}{ferr ? ` · ${px(l.preco, simbolo.digits)}` : ""}
                  </span>
                  {l.qtd && <span className="px-1.5 py-[3px] text-white" style={{ background: l.cor }}>{l.qtd}</span>}
                  {l.fecho && (
                    <button
                      type="button"
                      data-linha-botao
                      aria-label={l.fecho === "fechar" ? "fechar posição" : l.fecho === "cancelar" ? "cancelar ordem" : `remover ${l.dono.campo}`}
                      onClick={(e) => { e.stopPropagation(); accaoFecho(l) }}
                      className="pointer-events-auto px-1.5 py-[3px]"
                      style={{ color: l.cor, borderLeft: `1px solid ${l.cor}` }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {senseiLigado && props.sensei?.paineis !== false && !props.compacto && senseiR && (
          <>
            {paineisAbertos && <ChecklistSensei resultado={senseiR} />}
            <button
              type="button"
              data-linha-botao
              onClick={() => setPaineisAbertos((a) => !a)}
              title={senseiMs ? `Sensei: ${senseiMs.velas} velas calculadas em ${senseiMs.ms} ms (${senseiMs.onde === "worker" ? "Web Worker" : "thread principal"})` : "Sensei"}
              data-sensei-ms={senseiMs?.ms}
              className="absolute left-2 top-2 z-[7] flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: "rgba(19,23,34,0.85)", border: "1px solid rgba(244,114,182,0.5)", color: "#F472B6" }}
            >
              Sensei {paineisAbertos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </>
        )}
        {goldkillerLigado && gkR && (
          <div
            data-goldkiller-ms={gkMs?.ms}
            title={gkMs ? `GoldKiller: ${gkMs.velas} velas calculadas em ${gkMs.ms} ms (${gkMs.onde === "worker" ? "Web Worker" : "thread principal"})` : undefined}
          >
            <LegendaGoldKiller
              resultado={gkR}
              compacto={props.compacto}
              topo={senseiLigado && props.sensei?.paineis !== false && !props.compacto && senseiR ? 30 : 6}
            />
          </div>
        )}
        {mtmscannerLigado && msR && (
          <div
            data-mtmscanner-ms={msMs?.ms}
            title={msMs ? `MTM Scanner: ${msMs.velas} velas calculadas em ${msMs.ms} ms (${msMs.onde === "worker" ? "Web Worker" : "thread principal"})` : undefined}
          >
            <LegendaMTMScanner
              resultado={msR}
              compacto={props.compacto}
              topo={(senseiLigado && props.sensei?.paineis !== false && !props.compacto && senseiR ? 30 : 6) + (goldkillerLigado && gkR ? (props.compacto ? 18 : 34) : 0)}
            />
          </div>
        )}
        {modo && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-[6] -translate-x-1/2 rounded px-3 py-1 text-[11px]" style={{ background: TV.painel, color: TV.texto, border: `1px solid ${TV.borda}` }}>
            Toca no gráfico onde queres a entrada ({modo === "buy" ? "Long" : "Short"})
          </div>
        )}
        {estadoVelas === "ao_vivo" && !ultimaVelaRef.current && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-[12px]" style={{ color: TV.textoFraco }}>
            Sem histórico para {simbolo.symbol} — as velas vão-se formando com os preços ao vivo desde que abriste.
          </div>
        )}
        {(estadoVelas === "a_carregar" && !erroLib) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: TV.azul }} /></div>
        )}
        {erroLib && <div className="absolute inset-0 grid place-items-center text-[12px] text-rose-300">{erroLib}</div>}
        {menu && (
          <div data-linha-botao className="absolute z-20 min-w-[160px] rounded-md p-1 text-[12px] shadow-xl" style={{ left: Math.min(menu.x, 200), top: menu.y + 8, background: TV.painel, border: `1px solid ${TV.borda}`, color: TV.texto }}>
            {menu.dono.tipo === "pos" && (() => {
              const dono = menu.dono as Extract<Dono, { tipo: "pos" }>
              const p = posicoes.find((q) => q.id === dono.id)
              if (!p) return null
              const d = Math.max(spreadEmPreco(simbolo) * 5, simbolo.pip_size * 20)
              const s = p.direcao === "buy" ? 1 : -1
              return (
                <>
                  <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(null); accao(`Fechar ${simbolo.symbol} ${p.volume}`, () => props.onFecharPosicao(p.id)).catch(() => {}) }}>Fechar posição</button>
                  {p.sl == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); accao(`Pôr SL em ${simbolo.symbol}`, () => props.onModificarPosicao(p.id, arred(p.preco_entrada - s * d), p.tp)).catch(() => {}) }}>Pôr SL (arrasta depois)</button>}
                  {p.tp == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); accao(`Pôr TP em ${simbolo.symbol}`, () => props.onModificarPosicao(p.id, p.sl, arred(p.preco_entrada + s * 2 * d))).catch(() => {}) }}>Pôr TP (arrasta depois)</button>}
                  {(dono.campo === "sl" || dono.campo === "tp") && (
                    <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); accao(`Remover ${dono.campo.toUpperCase()} de ${simbolo.symbol}`, () => props.onModificarPosicao(p.id, dono.campo === "sl" ? null : p.sl, dono.campo === "tp" ? null : p.tp)).catch(() => {}) }}>Remover {dono.campo.toUpperCase()}</button>
                  )}
                </>
              )
            })()}
            {menu.dono.tipo === "ord" && (
              <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { const id = (menu.dono as { id: string }).id; setMenu(null); accao(`Cancelar ordem ${simbolo.symbol}`, () => props.onCancelarPendente(id)).catch(() => {}) }}>Cancelar ordem</button>
            )}
            <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" style={{ color: TV.textoFraco }} onClick={() => setMenu(null)}>Fechar menu</button>
          </div>
        )}
      </div>

      {k.mostrar && k.entrada != null && !props.compacto && <PainelFerramenta />}
    </div>
  )
}
