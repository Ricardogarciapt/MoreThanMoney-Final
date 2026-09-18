"use client"

import { useEffect, useRef, useState } from "react"
import { arredAosDigitos } from "@/lib/webtrader/formato"
import { semCripto, ehSimboloCripto } from "@/lib/ios-sem-cripto"
import { Loader2 } from "lucide-react"
import { type Direcao, lucroUsd, spreadEmPreco } from "@/lib/mtmfunded/simulado/matematica"
import { usd } from "./api"
import type { SimboloFicha, PrecoVivo } from "./api"
import { type GraficoProps, TIMEFRAMES, TV, tfPorResolucaoTv } from "./grafico-tipos"
import { TV_LIB_PASTA, carregarBibliotecaTv, marcarBibliotecaTvFalhada } from "./biblioteca-tv"
import PainelFerramenta from "./painel-ferramenta"
import { fichaDe } from "./pre-carga"
import { useRascunho, type CampoNivel } from "./rascunho-ordem"
import { useUmClique } from "./um-clique"

/**
 * O GRÁFICO DO TRADINGVIEW A SÉRIO — Advanced Charts / Trading Platform (`charting_library`).
 *
 * ADORMECIDO: o gráfico dos web traders é o Lightweight Charts (grafico-leve.tsx). Este só corre,
 * sem interruptor nenhum, quando a biblioteca licenciada está em public/charting_library/ (o
 * funded-grafico.tsx verifica) e tem as primitivas de trading. Com ela ganha-se exactamente o paper trading do TradingView:
 *  · posições com `createPositionLine()` — quantidade, lucro ao vivo, «×» fecha;
 *  · SL/TP e pendentes com `createOrderLine()` — arrastáveis (onMove grava), «×» remove/cancela;
 *  · a ordem em preparação (ticket ⇄ gráfico, rascunho-ordem.tsx) como três `createOrderLine()`
 *    — entrada, SL e TP — ligadas nos dois sentidos: escrever no ticket move-as, arrastá-las
 *    escreve no ticket. Não se usa a forma nativa 'long_position': ela guarda os níveis dentro da
 *    própria biblioteca e teríamos DOIS estados da mesma ordem a discordar.
 *
 * O datafeed é JS (a interface do UDF, sem servidor UDF): histórico em /api/mtmfunded/simulado/velas,
 * tempo real com os preços que o trader já está a receber (/precos), ficha do símbolo do catálogo
 * `funded_symbols` (pricescale pelos dígitos, sessão pelas `sessoes` da corretora).
 *
 * ATENÇÃO À EDIÇÃO DA BIBLIOTECA: desde a v29 `createOrderLine`/`createPositionLine`/
 * `createExecutionShape` só existem na «Trading Platform» — no «Advanced Charts» simples não há.
 * Por isso pergunta-se ao gráfico (`typeof chart.createOrderLine === 'function'`): sem elas o
 * TradingView fica para análise e as posições/ordens passam para o nosso gráfico leve, por baixo,
 * com o aviso «Linhas de ordens exigem a biblioteca Trading Platform» (`onSemLinhas`).
 *
 * Mover/fechar/cancelar passa pela negociação num clique (um-clique.tsx): desligada, pede
 * confirmação; cancelada ou falhada, a linha volta ao sítio.
 *
 * ESCRITO CONTRA A DOCUMENTAÇÃO, NÃO CONTRA A BIBLIOTECA: não está no repositório e não se pode
 * testar sem ela. Por isso tudo o que é da biblioteca é `any`, cada chamada está protegida, e se
 * o widget não arrancar em 20 s o WebTrader volta ao gráfico leve sozinho (`onFalhou`).
 * Referência: https://www.tradingview.com/charting-library-docs/
 */

const TIPO_TV: Record<string, string> = {
  forex: "forex", metal: "commodity", energia: "commodity", commodity: "commodity",
  indice: "index", cripto: "crypto", acao: "stock", etf: "fund", obrigacao: "bond",
}
const RESOLUCOES = TIMEFRAMES.map((t) => t.tv)
const DIAS_TV: Record<string, number> = { SUNDAY: 1, MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6, SATURDAY: 7 }

/**
 * A sessão para o TradingView. As `sessoes` da corretora vêm na hora do SERVIDOR dela (não UTC),
 * e o desvio só o motor o conhece. Uma sessão apertada demais faz a biblioteca DEITAR FORA velas
 * «fora de horas»; larga demais só deixa espaços vazios — por isso: dias com sessão entram inteiros
 * (00:00–24:00 UTC), mais o dia anterior ao primeiro (o domingo à noite do forex em UTC).
 */
function sessaoTv(f: SimboloFicha): string {
  if (f.classe === "cripto" || f.horario === "cripto" || f.horario === "24x7") return "24x7"
  const s = f.sessoes
  if (!s || typeof s !== "object") return "24x7"
  const dias = Object.entries(s).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([d]) => DIAS_TV[d]).filter(Boolean)
  if (!dias.length || dias.length === 7) return "24x7"
  const set = new Set(dias)
  for (const d of dias) set.add(d === 1 ? 7 : d - 1)
  if (set.size === 7) return "24x7"
  return `0000-0000:${[...set].sort().join("")}`
}

// A ficha vem do mesmo sítio que o resto do WebTrader (pre-carga.ts: cache de 60 s e candidatos) —
// antes havia aqui uma cópia sem cache.

/** O datafeed (IBasicDataFeed). `precoRef` = o preço ao vivo que o trader já pede de 1,5 em 1,5 s. */
function criarDatafeed(precoRef: React.MutableRefObject<PrecoVivo | undefined>) {
  const assinaturas = new Map<string, ReturnType<typeof setInterval>>()
  const ultimaVela = new Map<string, { time: number; open: number; high: number; low: number; close: number }>()
  const maisAntigo = new Map<string, number>()

  return {
    onReady(cb: (c: any) => void) {
      setTimeout(() => cb({
        supported_resolutions: RESOLUCOES,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
        exchanges: [{ value: "MTM Funded", name: "MTM Funded", desc: "Conta simulada MTM Funded" }],
      }), 0)
    },

    async searchSymbols(texto: string, _bolsa: string, _tipo: string, onResult: (r: any[]) => void) {
      try {
        const d = await fetch(`/api/mtmfunded/simulado/precos?q=${encodeURIComponent(texto)}&porPagina=30`).then((r) => r.json())
        // App iOS: a pesquisa do gráfico não devolve cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
        const semCriptoIos = semCripto()
        onResult((d.simbolos ?? []).filter((s: SimboloFicha) => !semCriptoIos || (s.classe !== "cripto" && !ehSimboloCripto(s.symbol))).map((s: SimboloFicha) => ({
          symbol: s.symbol, full_name: s.symbol, description: s.nome ?? s.symbol,
          exchange: "MTM Funded", ticker: s.symbol, type: TIPO_TV[s.classe] ?? "cfd",
        })))
      } catch {
        onResult([])
      }
    },

    async resolveSymbol(nome: string, onResolve: (s: any) => void, onError: (e: string) => void) {
      const symbol = String(nome).split(":").pop()!.toUpperCase()
      const f = await fichaDe(symbol)
      if (!f) return onError("símbolo desconhecido")
      setTimeout(() => onResolve({
        name: f.symbol, ticker: f.symbol, full_name: f.symbol,
        description: f.nome ?? f.symbol,
        type: TIPO_TV[f.classe] ?? "cfd",
        session: sessaoTv(f),
        timezone: "Etc/UTC",
        exchange: "MTM Funded",
        listed_exchange: "MTM Funded",
        format: "price",
        pricescale: Math.pow(10, f.digits),
        minmov: 1,
        has_intraday: true,
        intraday_multipliers: ["1", "5", "15", "60", "240"],
        has_daily: true,
        daily_multipliers: ["1"],
        has_weekly_and_monthly: false,
        supported_resolutions: RESOLUCOES,
        volume_precision: 2,
        data_status: "streaming",
        visible_plots_set: "ohlc",
      }), 0)
    },

    async getBars(info: any, resolucao: string, periodo: any, onResult: (bars: any[], meta: { noData: boolean }) => void, onError: (e: string) => void) {
      const tf = tfPorResolucaoTv(resolucao)
      if (!tf) return onResult([], { noData: true })
      const chave = `${info.ticker}:${tf.chave}`
      const limite = Math.min(1000, Math.max(300, Number(periodo?.countBack) || 300))
      const ate = periodo?.firstDataRequest ? null : Number(periodo?.to)
      try {
        const url = `/api/mtmfunded/simulado/velas?symbol=${encodeURIComponent(info.ticker)}&tf=${tf.chave}&limit=${limite}${ate ? `&ate=${ate}` : ""}`
        const d = await fetch(url).then((r) => r.json())
        const velas = (d.velas ?? []) as Array<{ t: number; o: number; h: number; l: number; c: number }>
        const bars = velas
          .filter((v) => (ate ? v.t < ate : true))
          .map((v) => ({ time: v.t * 1000, open: v.o, high: v.h, low: v.l, close: v.c }))
        // A MetaApi não tem histórico infinito: se o lote não trouxe nada mais antigo, acabou.
        const antigo = bars[0]?.time
        if (!bars.length || (!periodo?.firstDataRequest && antigo != null && antigo >= (maisAntigo.get(chave) ?? Infinity))) {
          return onResult([], { noData: true })
        }
        maisAntigo.set(chave, Math.min(antigo, maisAntigo.get(chave) ?? Infinity))
        if (periodo?.firstDataRequest) ultimaVela.set(chave, bars[bars.length - 1])
        onResult(bars, { noData: false })
      } catch (e) {
        onError((e as Error).message || "histórico indisponível")
      }
    },

    subscribeBars(info: any, resolucao: string, onTick: (bar: any) => void, guid: string) {
      const tf = tfPorResolucaoTv(resolucao)
      if (!tf) return
      const chave = `${info.ticker}:${tf.chave}`
      let ultimoEm = ""
      const passo = async () => {
        let p = precoRef.current
        // O preço do trader é o do símbolo seleccionado; noutro símbolo (comparação) pede-se à parte.
        if (!p || p.symbol !== info.ticker) {
          // Com a app em segundo plano não se pede nada (Safari iOS recarrega páginas gulosas).
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return
          const d = await fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(info.ticker)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)
          p = d?.precos?.[0]
        }
        if (!p || p.em === ultimoEm) return
        ultimoEm = p.em
        const t = Math.floor(new Date(p.em).getTime() / 1000 / tf.seg) * tf.seg * 1000
        const v = p.bid
        const u = ultimaVela.get(chave)
        let nova
        if (u && u.time === t) nova = { ...u, high: Math.max(u.high, v), low: Math.min(u.low, v), close: v }
        else if (!u || t > u.time) nova = { time: t, open: u?.close ?? v, high: Math.max(v, u?.close ?? v), low: Math.min(v, u?.close ?? v), close: v }
        else return
        ultimaVela.set(chave, nova)
        onTick(nova)
      }
      assinaturas.set(guid, setInterval(() => { void passo() }, 1000))
    },

    unsubscribeBars(guid: string) {
      const iv = assinaturas.get(guid)
      if (iv) clearInterval(iv)
      assinaturas.delete(guid)
    },
  }
}

/** Criar linhas: em versões novas devolve Promise, nas antigas o adaptador directamente. */
const resolver = async <T,>(v: T | Promise<T>): Promise<T> => await v

type Grupo = { principal: any; sl: any; tp: any; assinatura: string }

export default function GraficoTradingView(props: GraficoProps & {
  modo: Direcao | null
  setModo: (m: Direcao | null) => void
  onFalhou: (motivo: string) => void
  /** A biblioteca é «Advanced Charts» sem primitivas de trading: quem chama mostra as linhas noutro gráfico. */
  onSemLinhas?: () => void
}) {
  const { simbolo, preco, precos, volume, posicoes, ordens, podeNegociar, modo, setModo } = props
  const caixaRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const k = useRascunho()
  const umClique = useUmClique()
  const umCliqueRef = useRef(umClique)
  umCliqueRef.current = umClique
  const accao = (descricao: string, fn: () => Promise<unknown>) =>
    umCliqueRef.current.executar(descricao, fn, { confirmar: true, digitos: simbolo.digits })
  const [semLinhas, setSemLinhas] = useState(false)
  const kRef = useRef(k)
  kRef.current = k
  const precoRef = useRef<PrecoVivo | undefined>(preco)
  precoRef.current = preco
  const propsRef = useRef(props)
  propsRef.current = props
  const linhasPos = useRef<Map<string, Grupo>>(new Map())
  const linhasOrd = useRef<Map<string, Grupo>>(new Map())
  const linhasRascunho = useRef<Partial<Record<CampoNivel, any>>>({})
  const sinaisDesenhados = useRef<any[]>([])

  const grafico = () => {
    try { return widgetRef.current?.activeChart?.() ?? widgetRef.current?.chart?.() } catch { return null }
  }
  const arred = (v: number) => arredAosDigitos(v, simbolo.digits)

  // ── o widget ──
  useEffect(() => {
    let vivo = true
    let vigia: ReturnType<typeof setTimeout> | null = null
    carregarBibliotecaTv().then((TVLib) => {
      if (!vivo || !caixaRef.current) return
      try {
        const widget = new TVLib.widget({
          symbol: simbolo.symbol,
          interval: "5",
          container: caixaRef.current,
          datafeed: criarDatafeed(precoRef),
          library_path: TV_LIB_PASTA,
          locale: "pt",
          timezone: "Europe/Lisbon",
          theme: "dark",
          autosize: true,
          custom_font_family: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          disabled_features: [
            "use_localstorage_for_settings", "header_compare", "header_saveload", "popup_hints",
            "study_templates", "timeframes_toolbar", "go_to_date",
          ],
          enabled_features: ["side_toolbar_in_fullscreen_mode", "hide_left_toolbar_by_default"],
          overrides: {
            "paneProperties.background": TV.fundo,
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": TV.grelha,
            "paneProperties.horzGridProperties.color": TV.grelha,
            "mainSeriesProperties.candleStyle.upColor": TV.sobe,
            "mainSeriesProperties.candleStyle.downColor": TV.desce,
            "mainSeriesProperties.candleStyle.wickUpColor": TV.sobe,
            "mainSeriesProperties.candleStyle.wickDownColor": TV.desce,
            "mainSeriesProperties.candleStyle.borderVisible": false,
          },
          loading_screen: { backgroundColor: TV.fundo, foregroundColor: TV.azul },
        })
        widgetRef.current = widget
        vigia = setTimeout(() => {
          if (!vivo || pronto) return
          marcarBibliotecaTvFalhada()
          props.onFalhou("o gráfico do TradingView não arrancou")
        }, 20_000)
        widget.onChartReady(() => {
          if (!vivo) return
          if (vigia) clearTimeout(vigia)
          setPronto(true)
          // Advanced Charts sem Trading Platform: não há linhas de ordens nesta edição.
          const c0 = grafico()
          if (c0 && (typeof c0.createOrderLine !== "function" || typeof c0.createPositionLine !== "function")) {
            setSemLinhas(true)
            propsRef.current.onSemLinhas?.()
          }
          // Pesquisa de símbolos da biblioteca → o trader muda de símbolo (lista, ticket, posições).
          try {
            grafico()?.onSymbolChanged().subscribe(null, () => {
              const s = String(grafico()?.symbol() ?? "").split(":").pop()?.toUpperCase()
              if (s && s !== propsRef.current.simbolo.symbol) propsRef.current.onMudarSimbolo?.(s)
            })
          } catch { /* versão sem o evento */ }
        })
      } catch (e) {
        marcarBibliotecaTvFalhada()
        props.onFalhou((e as Error).message)
      }
    }).catch((e) => {
      if (!vivo) return
      setErro((e as Error).message)
      marcarBibliotecaTvFalhada()
      props.onFalhou((e as Error).message)
    })
    return () => {
      vivo = false
      if (vigia) clearTimeout(vigia)
      try { widgetRef.current?.remove() } catch { /* ok */ }
      widgetRef.current = null
      linhasPos.current = new Map()
      linhasOrd.current = new Map()
      linhasRascunho.current = {}
      sinaisDesenhados.current = []
      setPronto(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // O símbolo muda pelo trader (lista, alerta) → o gráfico segue.
  useEffect(() => {
    const c = grafico()
    if (!pronto || !c) return
    try {
      if (String(c.symbol()).split(":").pop()?.toUpperCase() !== simbolo.symbol) c.setSymbol(simbolo.symbol)
    } catch { /* ok */ }
  }, [simbolo.symbol, pronto]) // eslint-disable-line react-hooks/exhaustive-deps

  const texto = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${usd(v)} USD`)

  // ── posições: linha de posição + SL/TP arrastáveis ──
  useEffect(() => {
    const c = grafico()
    if (!pronto || !c || semLinhas) return
    const vistos = new Set<string>()
    for (const p of posicoes) {
      vistos.add(p.id)
      const cor = p.direcao === "buy" ? TV.compra : TV.venda
      const saida = preco ? (p.direcao === "buy" ? preco.bid : preco.ask) : null
      const lucro = saida == null ? null : lucroUsd(simbolo, p.direcao, p.volume, p.preco_entrada, saida, precos)
      const assinatura = `${p.preco_entrada}|${p.sl}|${p.tp}|${p.volume}|${podeNegociar}`
      const g = linhasPos.current.get(p.id)
      if (g && g.assinatura === assinatura) {
        try { g.principal?.setText(texto(lucro)) } catch { /* ok */ }
        continue
      }
      if (g) apagarGrupo(g)
      const novo: Grupo = { principal: null, sl: null, tp: null, assinatura }
      linhasPos.current.set(p.id, novo)
      void (async () => {
        try {
          const l = await resolver(c.createPositionLine())
          l.setPrice(p.preco_entrada).setText(texto(lucro)).setQuantity(String(p.volume))
            .setLineColor(cor).setBodyBorderColor(cor).setBodyTextColor(cor)
            .setQuantityBackgroundColor(cor).setQuantityBorderColor(cor)
            .setCloseButtonBorderColor(cor).setCloseButtonIconColor(cor)
            .setExtendLeft(false).setLineLength(25)
            .setTooltip(`${p.direcao === "buy" ? "Long" : "Short"} ${p.volume} @ ${p.preco_entrada}`)
          if (podeNegociar) {
            l.onClose("fechar", () => { accao(`Fechar ${simbolo.symbol} ${p.volume}`, () => propsRef.current.onFecharPosicao(p.id)).catch(() => {}) })
            // «Modificar» numa posição sem SL/TP põe-nos a uma distância visível, para arrastar.
            l.onModify("modificar", () => {
              const d = Math.max(spreadEmPreco(simbolo) * 5, simbolo.pip_size * 20)
              const s = p.direcao === "buy" ? 1 : -1
              if (p.sl == null || p.tp == null) {
                accao(`Pôr SL/TP em ${simbolo.symbol}`, () => propsRef.current.onModificarPosicao(p.id, p.sl ?? arred(p.preco_entrada - s * d), p.tp ?? arred(p.preco_entrada + s * 2 * d))).catch(() => {})
              }
            })
          }
          novo.principal = l
          for (const campo of ["sl", "tp"] as const) {
            const nivel = p[campo]
            if (nivel == null) continue
            const corNivel = campo === "sl" ? TV.sl : TV.tp
            const o = await resolver(c.createOrderLine())
            o.setPrice(nivel).setText(`${campo.toUpperCase()} ${texto(lucroUsd(simbolo, p.direcao, p.volume, p.preco_entrada, nivel, precos))}`)
              .setQuantity(String(p.volume)).setLineStyle(2)
              .setLineColor(corNivel).setBodyBorderColor(corNivel).setBodyTextColor(corNivel)
              .setQuantityBackgroundColor(corNivel).setQuantityBorderColor(corNivel)
              .setCancelButtonBorderColor(corNivel).setCancelButtonIconColor(corNivel)
              .setExtendLeft(false).setLineLength(25)
              .setEditable(podeNegociar).setCancellable(podeNegociar)
            if (podeNegociar) {
              o.onMove(() => {
                const novoNivel = arred(Number(o.getPrice()))
                const atual = propsRef.current.posicoes.find((q) => q.id === p.id)
                if (!atual) return
                accao(`Mover ${campo.toUpperCase()} de ${simbolo.symbol} para ${novoNivel.toFixed(simbolo.digits)}`, () => propsRef.current.onModificarPosicao(p.id, campo === "sl" ? novoNivel : atual.sl, campo === "tp" ? novoNivel : atual.tp))
                  .catch(() => { try { o.setPrice(nivel) } catch { /* ok */ } })
              })
              o.onCancel("remover", () => {
                const atual = propsRef.current.posicoes.find((q) => q.id === p.id)
                if (!atual) return
                accao(`Remover ${campo.toUpperCase()} de ${simbolo.symbol}`, () => propsRef.current.onModificarPosicao(p.id, campo === "sl" ? null : atual.sl, campo === "tp" ? null : atual.tp)).catch(() => {})
              })
            }
            novo[campo] = o
          }
        } catch { /* versão da biblioteca sem Trading Terminal: fica só o gráfico */ }
      })()
    }
    for (const [id, g] of linhasPos.current) {
      if (vistos.has(id)) continue
      apagarGrupo(g)
      linhasPos.current.delete(id)
    }
  }, [pronto, semLinhas, posicoes, preco, podeNegociar, simbolo.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── pendentes: linha de ordem arrastável (preço) + SL/TP ──
  useEffect(() => {
    const c = grafico()
    if (!pronto || !c || semLinhas) return
    const vistos = new Set<string>()
    for (const ord of ordens) {
      vistos.add(ord.id)
      const assinatura = `${ord.preco}|${ord.sl}|${ord.tp}|${ord.volume}|${podeNegociar}`
      const g = linhasOrd.current.get(ord.id)
      if (g && g.assinatura === assinatura) continue
      if (g) apagarGrupo(g)
      const novo: Grupo = { principal: null, sl: null, tp: null, assinatura }
      linhasOrd.current.set(ord.id, novo)
      void (async () => {
        try {
          const cor = ord.direcao === "buy" ? TV.compra : TV.venda
          const principal = await resolver(c.createOrderLine())
          principal.setPrice(ord.preco).setText(`${ord.direcao === "buy" ? "Buy" : "Sell"} ${ord.tipo === "limit" ? "Limit" : "Stop"}`)
            .setQuantity(String(ord.volume)).setLineStyle(2)
            .setLineColor(cor).setBodyBorderColor(cor).setBodyTextColor(cor)
            .setQuantityBackgroundColor(cor).setQuantityBorderColor(cor)
            .setCancelButtonBorderColor(cor).setCancelButtonIconColor(cor)
            .setExtendLeft(false).setLineLength(25)
            .setEditable(podeNegociar).setCancellable(podeNegociar)
          if (podeNegociar) {
            principal.onMove(() => {
              const atual = propsRef.current.ordens.find((q) => q.id === ord.id)
              if (!atual) return
              const n = arred(Number(principal.getPrice()))
              accao(`Mover ${ord.direcao} ${ord.tipo} para ${n.toFixed(simbolo.digits)}`, () => propsRef.current.onModificarPendente(ord.id, n, atual.sl, atual.tp))
                .catch(() => { try { principal.setPrice(ord.preco) } catch { /* ok */ } })
            })
            principal.onCancel("cancelar", () => { accao(`Cancelar ${ord.direcao} ${ord.tipo} ${simbolo.symbol}`, () => propsRef.current.onCancelarPendente(ord.id)).catch(() => {}) })
          }
          novo.principal = principal
          for (const campo of ["sl", "tp"] as const) {
            const nivel = ord[campo]
            if (nivel == null) continue
            const corNivel = campo === "sl" ? TV.sl : TV.tp
            const o = await resolver(c.createOrderLine())
            o.setPrice(nivel).setText(`${campo.toUpperCase()} (ordem)`).setQuantity("").setLineStyle(2)
              .setLineColor(corNivel).setBodyBorderColor(corNivel).setBodyTextColor(corNivel)
              .setCancelButtonBorderColor(corNivel).setCancelButtonIconColor(corNivel)
              .setExtendLeft(false).setLineLength(25)
              .setEditable(podeNegociar).setCancellable(podeNegociar)
            if (podeNegociar) {
              o.onMove(() => {
                const atual = propsRef.current.ordens.find((q) => q.id === ord.id)
                if (!atual) return
                const n = arred(Number(o.getPrice()))
                accao(`Mover ${campo.toUpperCase()} da ordem para ${n.toFixed(simbolo.digits)}`, () => propsRef.current.onModificarPendente(ord.id, atual.preco, campo === "sl" ? n : atual.sl, campo === "tp" ? n : atual.tp))
                  .catch(() => { try { o.setPrice(nivel) } catch { /* ok */ } })
              })
              o.onCancel("remover", () => {
                const atual = propsRef.current.ordens.find((q) => q.id === ord.id)
                if (!atual) return
                accao(`Remover ${campo.toUpperCase()} da ordem`, () => propsRef.current.onModificarPendente(ord.id, atual.preco, campo === "sl" ? null : atual.sl, campo === "tp" ? null : atual.tp)).catch(() => {})
              })
            }
            novo[campo] = o
          }
        } catch { /* ok */ }
      })()
    }
    for (const [id, g] of linhasOrd.current) {
      if (vistos.has(id)) continue
      apagarGrupo(g)
      linhasOrd.current.delete(id)
    }
  }, [pronto, semLinhas, ordens, podeNegociar, simbolo.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  function apagarGrupo(g: Grupo) {
    for (const l of [g.principal, g.sl, g.tp]) { try { l?.remove() } catch { /* ok */ } }
  }

  // ── sinais dos estudos: setas + linhas ténues do sinal activo (a biblioteca não corre Pine) ──
  useEffect(() => {
    const c = grafico()
    if (!pronto || !c) return
    for (const id of sinaisDesenhados.current) { try { c.removeEntity(id) } catch { /* ok */ } }
    sinaisDesenhados.current = []
    void (async () => {
      for (const s of props.sinais ?? []) {
        try {
          const id = await resolver(c.createShape(
            { time: s.em, price: s.entrada ?? undefined },
            { shape: s.direcao === "buy" ? "arrow_up" : "arrow_down", text: s.estudo.curto, lock: true, disableSelection: true, disableSave: true, overrides: { color: s.estudo.cor } },
          ))
          if (id) sinaisDesenhados.current.push(id)
        } catch { /* ok */ }
      }
      const sa = props.sinalAtivo
      if (sa) {
        for (const nivel of [sa.entrada, sa.sl, sa.tp]) {
          if (nivel == null) continue
          try {
            const id = await resolver(c.createShape(
              { price: nivel },
              { shape: "horizontal_line", lock: true, disableSelection: true, disableSave: true, overrides: { linecolor: sa.estudo.cor, linestyle: 2, linewidth: 1, transparency: 50, showLabel: false } },
            ))
            if (id) sinaisDesenhados.current.push(id)
          } catch { /* ok */ }
        }
      }
    })()
  }, [pronto, props.sinais, props.sinalAtivo, simbolo.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── o rascunho da ordem: três linhas ligadas ao ticket ──
  useEffect(() => {
    const c = grafico()
    if (!pronto || !c || semLinhas) return
    const niveis: Record<CampoNivel, number | null> = {
      entrada: k.mostrar ? k.entrada : null,
      sl: k.mostrar && k.entrada != null ? k.sl : null,
      tp: k.mostrar && k.entrada != null ? k.tp : null,
    }
    const { r, resumo, erros } = k
    const invalido = "#FF1744"
    const estilo: Record<CampoNivel, { cor: string; texto: string; qtd: string }> = {
      entrada: {
        cor: erros.entrada || erros.margem || erros.volume ? invalido : "#B2B5BE",
        texto: `${erros.entrada || erros.margem ? "⚠ " : ""}${r.lado === "buy" ? "Long" : "Short"} ${r.tipo === "mercado" ? "a mercado" : r.tipo}`,
        qtd: String(volume),
      },
      sl: { cor: erros.sl ? invalido : TV.sl, texto: `${erros.sl ? "⚠ " : ""}Stop ${resumo.pipsSl ?? "—"} pips · ${usd(resumo.risco)} $${resumo.riscoPct != null ? ` (${resumo.riscoPct}%)` : ""}`, qtd: "" },
      tp: { cor: erros.tp ? invalido : TV.tp, texto: `${erros.tp ? "⚠ " : ""}Alvo ${resumo.pipsTp ?? "—"} pips · ${resumo.ganho != null && resumo.ganho >= 0 ? "+" : ""}${usd(resumo.ganho)} $${resumo.ganhoPct != null ? ` (${resumo.ganhoPct}%)` : ""}${resumo.rr ? ` R:R ${resumo.rr}` : ""}`, qtd: "" },
    }
    for (const campo of ["entrada", "sl", "tp"] as CampoNivel[]) {
      const nivel = niveis[campo]
      const atual = linhasRascunho.current[campo]
      if (nivel == null) {
        if (atual && atual !== "a_criar") { try { atual.remove() } catch { /* ok */ } }
        delete linhasRascunho.current[campo]
        continue
      }
      const e = estilo[campo]
      const pintar = (o: any) => {
        // Não se reescreve o preço de uma linha que o trader está a arrastar (mesmo nível = ele).
        try { if (Math.abs(Number(o.getPrice()) - nivel) > Math.pow(10, -simbolo.digits) / 2) o.setPrice(nivel) } catch { /* ok */ }
        try {
          o.setText(e.texto).setQuantity(e.qtd).setLineColor(e.cor).setBodyBorderColor(e.cor).setBodyTextColor(e.cor)
            .setQuantityBackgroundColor(e.cor).setQuantityBorderColor(e.cor)
        } catch { /* ok */ }
      }
      if (atual === "a_criar") continue
      if (atual) { pintar(atual); continue }
      linhasRascunho.current[campo] = "a_criar"
      void (async () => {
        try {
          const o = await resolver(c.createOrderLine())
          o.setPrice(nivel).setLineStyle(campo === "entrada" ? 0 : 2).setExtendLeft(true).setEditable(true).setCancellable(true)
          pintar(o)
          const ler = () => kRef.current.definirNivel(campo, Number(o.getPrice()))
          o.onMove(ler)
          try { o.onMoving(ler) } catch { /* versões antigas só têm onMove */ }
          // «×» na entrada apaga o rascunho; no SL/TP remove só esse nível.
          o.onCancel("remover", () => (campo === "entrada" ? kRef.current.limpar() : kRef.current.definirNivel(campo, null)))
          if (linhasRascunho.current[campo] === "a_criar") linhasRascunho.current[campo] = o
          else { try { o.remove() } catch { /* ok */ } }
        } catch {
          delete linhasRascunho.current[campo]
        }
      })()
    }
  }, [pronto, semLinhas, k.mostrar, k.entrada, k.sl, k.tp, k.r, k.erros, k.resumo, volume, simbolo.digits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Botões Long/Short da barra: põem o rascunho no preço actual (a mercado), pronto a arrastar.
  useEffect(() => {
    if (!modo || !pronto) return
    const direcao = modo
    setModo(null)
    const entrada = preco ? (direcao === "buy" ? preco.ask : preco.bid) : null
    const d = entrada != null ? Math.max(spreadEmPreco(simbolo) * 10, simbolo.pip_size * 20, entrada * 0.002) : undefined
    k.colocar(direcao, entrada, d)
  }, [modo, pronto]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: TV.fundo }}>
      <div className={`relative ${props.alturaClasse ?? "h-[380px] md:h-[480px]"}`}>
        <div ref={caixaRef} className="absolute inset-0" />
        {!pronto && !erro && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: TV.azul }} /></div>
        )}
        {erro && <div className="absolute inset-0 grid place-items-center text-[12px] text-rose-300">{erro}</div>}
      </div>
      {semLinhas && (
        <p className="border-t px-2 py-1.5 text-center text-[10.5px] text-amber-200/90" style={{ borderColor: TV.borda }}>
          Linhas de ordens exigem a biblioteca Trading Platform — as posições e ordens aparecem no gráfico abaixo.
        </p>
      )}
      {k.mostrar && k.entrada != null && !semLinhas && <PainelFerramenta />}
    </div>
  )
}
