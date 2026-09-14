"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { type Direcao, lucroUsd, spreadEmPreco } from "@/lib/mtmfunded/simulado/matematica"
import { px, usd } from "./api"
import { type GraficoProps, type Tf, TV, tfPorChave } from "./grafico-tipos"
import PainelFerramenta from "./painel-ferramenta"
import { useRascunho } from "./rascunho-ordem"

/**
 * O GRÁFICO LEVE DO WEBTRADER — lightweight-charts (o motor open-source do TradingView) vestido
 * com a paleta e a mecânica do paper trading do TradingView: linha da posição com quantidade e
 * lucro ao vivo, SL/TP arrastáveis com «×» para remover, pendentes arrastáveis com «×» para
 * cancelar, e a ferramenta Long/Short.
 *
 * É o gráfico por defeito ENQUANTO a biblioteca licenciada do TradingView não estiver em
 * public/charting_library/ (ver docs/webtrader-tradingview-library.md). Quando estiver, o
 * funded-grafico.tsx passa sozinho para grafico-tradingview.tsx.
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
}) {
  const { simbolo, preco, precos, volume, posicoes, ordens, podeNegociar, tf, modo, setModo } = props
  const [estadoVelas, setEstadoVelas] = useState<"a_carregar" | "historico" | "ao_vivo" | "erro">("a_carregar")
  const [erroLib, setErroLib] = useState<string | null>(null)
  // A ordem em preparação é do rascunho partilhado com o ticket (rascunho-ordem.tsx).
  const k = useRascunho()
  const [rascunho, setRascunho] = useState<Record<string, number>>({})
  const [ys, setYs] = useState<Record<string, number>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; dono: Dono } | null>(null)
  // Fechar uma posição é o único «×» sem volta: pede um segundo toque, como uma confirmação curta.
  const [aConfirmarFecho, setAConfirmarFecho] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const caixaRef = useRef<HTMLDivElement>(null)
  const graficoRef = useRef<any>(null)
  const serieRef = useRef<any>(null)
  const etiquetasEixoRef = useRef<Map<string, any>>(new Map())
  const ultimaVelaRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null)
  const linhasRef = useRef<Linha[]>([])
  const dragRef = useRef<{ chave: string; dono: Dono; y0: number; moveu: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null)
  const toqueRef = useRef<{ x: number; y: number } | null>(null)
  const larguraEscalaRef = useRef(56)

  useEffect(() => { setRascunho({}); setMenu(null) }, [simbolo.symbol])
  useEffect(() => { if (!aConfirmarFecho) return; const t = setTimeout(() => setAConfirmarFecho(null), 3000); return () => clearTimeout(t) }, [aConfirmarFecho])

  const arred = useCallback((v: number) => Number(v.toFixed(simbolo.digits)), [simbolo.digits])

  // ── criar o gráfico ──
  useEffect(() => {
    let vivo = true
    carregarLW().then((LW) => {
      if (!vivo || !caixaRef.current) return
      const chart = LW.createChart(caixaRef.current, {
        autoSize: true,
        layout: { background: { type: "solid", color: TV.fundo }, textColor: TV.textoFraco, fontSize: 11, fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" },
        grid: { vertLines: { color: "rgba(42,46,57,0.6)" }, horzLines: { color: "rgba(42,46,57,0.6)" } },
        rightPriceScale: { borderColor: TV.borda, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: TV.borda, timeVisible: true, secondsVisible: false, rightOffset: 6 },
        crosshair: {
          mode: 0,
          vertLine: { color: TV.mira, style: 2, width: 1, labelBackgroundColor: "#363A45" },
          horzLine: { color: TV.mira, style: 2, width: 1, labelBackgroundColor: "#363A45" },
        },
        watermark: { visible: true, text: simbolo.symbol, color: "rgba(120,123,134,0.10)", fontSize: 44, horzAlign: "center", vertAlign: "center" },
        localization: { priceFormatter: (p: number) => p.toFixed(simbolo.digits) },
      })
      const serie = chart.addCandlestickSeries({
        upColor: TV.sobe, downColor: TV.desce, borderVisible: false, wickUpColor: TV.sobe, wickDownColor: TV.desce,
        priceFormat: { type: "price", precision: simbolo.digits, minMove: Math.pow(10, -simbolo.digits) },
      })
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
      etiquetasEixoRef.current = new Map()
    }
  }, [simbolo.digits]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { graficoRef.current?.applyOptions({ watermark: { text: simbolo.symbol } }) } catch { /* ok */ }
  }, [simbolo.symbol, pronto])

  // ── histórico ──
  useEffect(() => {
    if (!pronto) return
    let vivo = true
    ultimaVelaRef.current = null
    setEstadoVelas("a_carregar")
    ;(async () => {
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
    })()
    return () => { vivo = false }
  }, [pronto, simbolo.symbol, tf])

  // ── a vela viva ──
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !preco || estadoVelas === "a_carregar") return
    const passo = tfPorChave(tf).seg
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
      if (k.sl != null) out.push({ chave: "tool:sl", preco: k.sl, cor: erros.sl ? invalido : TV.sl, corpo: `${erros.sl ? "⚠ " : ""}Stop ${resumo.pipsSl ?? "—"} pips · ${usd(resumo.risco)} $`, arrastavel: true, tracejada: Boolean(erros.sl), dono: { tipo: "tool", campo: "sl" } })
      if (k.tp != null) out.push({ chave: "tool:tp", preco: k.tp, cor: erros.tp ? invalido : TV.tp, corpo: `${erros.tp ? "⚠ " : ""}Alvo ${resumo.pipsTp ?? "—"} pips · +${usd(resumo.ganho)} $${resumo.rr ? ` · R:R ${resumo.rr}` : ""}`, arrastavel: true, tracejada: Boolean(erros.tp), dono: { tipo: "tool", campo: "tp" } })
    }
    return out
  }, [posicoes, ordens, k.mostrar, k.entrada, k.sl, k.tp, k.r, k.erros, k.resumo, rascunho, podeNegociar, simbolo, volume, precos, preco, props.sinalAtivo]) // eslint-disable-line react-hooks/exhaustive-deps
  linhasRef.current = linhas

  // Setas dos sinais dos estudos, na vela em que chegaram (arredondada ao timeframe).
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !pronto || estadoVelas === "a_carregar") return
    const passo = tfPorChave(tf).seg
    const marcas = (props.sinais ?? []).map((s) => ({
      time: Math.floor(s.em / passo) * passo,
      position: s.direcao === "buy" ? "belowBar" : "aboveBar",
      color: s.estudo.cor,
      shape: s.direcao === "buy" ? "arrowUp" : "arrowDown",
      text: s.estudo.curto,
    }))
    try { serie.setMarkers(marcas) } catch { /* tempo fora das velas carregadas */ }
  }, [props.sinais, pronto, estadoVelas, tf])

  // Etiquetas no eixo de preço (a caixa colorida com o preço, à direita), como o TradingView as põe.
  useEffect(() => {
    const serie = serieRef.current
    if (!serie || !pronto) return
    const mapa = etiquetasEixoRef.current
    const vistas = new Set<string>()
    for (const l of linhas) {
      vistas.add(l.chave)
      const opcoes = { price: l.preco, color: l.cor, lineVisible: false, axisLabelVisible: true, title: "" }
      const existente = mapa.get(l.chave)
      try {
        if (existente) existente.applyOptions(opcoes)
        else mapa.set(l.chave, serie.createPriceLine(opcoes))
      } catch { /* série a ser recriada */ }
    }
    for (const [chave, pl] of mapa) {
      if (vistas.has(chave)) continue
      try { serie.removePriceLine(pl) } catch { /* ok */ }
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

  // O «×» das etiquetas: fechar / remover SL-TP / cancelar.
  const accaoFecho = (l: Linha) => {
    const dono = l.dono
    if (dono.tipo === "pos") {
      const p = posicoes.find((q) => q.id === dono.id)
      if (!p) return
      if (dono.campo === "entrada") {
        if (aConfirmarFecho !== l.chave) return setAConfirmarFecho(l.chave)
        setAConfirmarFecho(null)
        return props.onFecharPosicao(p.id)
      }
      props.onModificarPosicao(p.id, dono.campo === "sl" ? null : p.sl, dono.campo === "tp" ? null : p.tp).catch(() => {})
    } else if (dono.tipo === "ord") {
      const o = ordens.find((q) => q.id === dono.id)
      if (!o) return
      if (dono.campo === "preco") return props.onCancelarPendente(o.id)
      props.onModificarPendente(o.id, o.preco, dono.campo === "sl" ? null : o.sl, dono.campo === "tp" ? null : o.tp).catch(() => {})
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
      if (dono.tipo === "pos") {
        const p = posicoes.find((q) => q.id === dono.id)
        if (!p) return limpar()
        await props.onModificarPosicao(p.id, dono.campo === "sl" ? novo : p.sl, dono.campo === "tp" ? novo : p.tp)
      } else if (dono.tipo === "ord") {
        const o = ordens.find((q) => q.id === dono.id)
        if (!o) return limpar()
        await props.onModificarPendente(o.id, dono.campo === "preco" ? novo : o.preco, dono.campo === "sl" ? novo : o.sl, dono.campo === "tp" ? novo : o.tp)
      }
    } catch {
      /* o aviso de erro já aparece no trader */
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
  const zona = (a: number | undefined, b: number | undefined, cor: string) =>
    a == null || b == null ? null : (
      <div className="absolute left-[45%]" style={{ top: Math.min(a, b), height: Math.abs(a - b), right: larguraEscala, background: cor }} />
    )

  return (
    <div style={{ background: TV.fundo }}>
      <div
        className={`relative touch-pan-y select-none ${props.alturaClasse ?? "h-[340px] md:h-[440px]"} ${modo ? "cursor-crosshair" : ""}`}
        onPointerDownCapture={aoPressionar}
        onPointerMoveCapture={aoMover}
        onPointerUpCapture={aoLargar}
        onContextMenu={aoMenuContexto}
      >
        <div ref={caixaRef} className="absolute inset-0" />
        {/* Sobreposição: zonas e linhas. Não apanha toques — quem os apanha é a caixa por cima, na
            fase de captura. Só os botões das etiquetas («×») são clicáveis. */}
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {k.mostrar && zona(ys["tool:entrada"], ys["tool:sl"], "rgba(242,54,69,0.18)")}
          {k.mostrar && zona(ys["tool:entrada"], ys["tool:tp"], "rgba(8,153,129,0.18)")}
          {linhas.map((l) => {
            const y = ys[l.chave]
            if (y == null) return null
            const ferr = l.dono.tipo === "tool"
            const confirmar = aConfirmarFecho === l.chave
            return (
              <div key={l.chave} className="absolute left-0" style={{ top: y, right: larguraEscala }}>
                <div style={{ borderTop: `1px ${l.tracejada ? "dashed" : "solid"} ${l.cor}` }} />
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
                      style={{ color: confirmar ? "#fff" : l.cor, background: confirmar ? TV.sl : "transparent", borderLeft: `1px solid ${l.cor}` }}
                    >
                      {confirmar ? "Fechar?" : "×"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
                  <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(null); props.onFecharPosicao(p.id) }}>Fechar posição</button>
                  {p.sl == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, arred(p.preco_entrada - s * d), p.tp).catch(() => {}) }}>Pôr SL (arrasta depois)</button>}
                  {p.tp == null && <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, p.sl, arred(p.preco_entrada + s * 2 * d)).catch(() => {}) }}>Pôr TP (arrasta depois)</button>}
                  {(dono.campo === "sl" || dono.campo === "tp") && (
                    <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => { setMenu(null); props.onModificarPosicao(p.id, dono.campo === "sl" ? null : p.sl, dono.campo === "tp" ? null : p.tp).catch(() => {}) }}>Remover {dono.campo.toUpperCase()}</button>
                  )}
                </>
              )
            })()}
            {menu.dono.tipo === "ord" && (
              <button className="block w-full rounded px-2 py-1.5 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(null); props.onCancelarPendente((menu.dono as { id: string }).id) }}>Cancelar ordem</button>
            )}
            <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" style={{ color: TV.textoFraco }} onClick={() => setMenu(null)}>Fechar menu</button>
          </div>
        )}
      </div>

      {k.mostrar && k.entrada != null && <PainelFerramenta />}
    </div>
  )
}
