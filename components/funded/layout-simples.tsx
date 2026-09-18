"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, Loader2, Minus, Plus, X } from "lucide-react"
import { normalizarVolume } from "@/lib/mtmfunded/simulado/matematica"
import { px, usd } from "./api"
import FundedTicket from "./funded-ticket"
import FundedWatchlist from "./funded-watchlist"
import ListaPosicoes from "./lista-posicoes"
import FundedAlertas from "./funded-alertas"
import FundedDiario from "./funded-diario"
import PainelConta from "./painel-conta"
import { EstadoMercado, Sentimento } from "./estado-mercado"
import { useRascunho } from "./rascunho-ordem"
import { useUmClique } from "./um-clique"
import { useGraficoVisivel } from "./grafico-visivel"
import { AplicarPrefill, AvisosConta, FaixaPrefill, GraficoConta, ProvedorRascunho, type Trader } from "./trader-contexto"
const CalendarioEconomico = dynamic(() => import("./calendario-economico"), { ssr: false })
const FundedEstatisticas = dynamic(() => import("./funded-estatisticas"), { ssr: false })

/**
 * O MODO SIMPLE — telemóvel primeiro, sem ruído.
 *
 *  · o GRÁFICO ocupa o ecrã; por cima, só o símbolo (toque → lista) e a equity (toque → conta);
 *  · em baixo, SELL | volume | BUY grandes. Tocar abre o TICKET numa folha que sobe (com a
 *    negociação num clique ligada, tocar ENVIA — como no MT5/TradeLocker);
 *  · a GAVETA de baixo tem Posições · Ordens · Histórico · Mais, que se deslizam para o lado. A pega
 *    ARRASTA-SE (rato e dedo): para cima aumenta, para baixo encolhe até ficar só a barra dos
 *    separadores; um toque na pega abre/fecha. O gráfico fica com o espaço que sobra. A altura
 *    escolhida fica guardada (useGaveta);
 *  · «Mostrar gráfico» desligado (barra do gráfico): a gaveta fica com o ecrã todo.
 * As folhas fecham-se a arrastar para baixo, com Esc, ou a tocar fora.
 */

type FolhaAberta = null | "ticket" | "mercado" | "conta"
const SEPARADORES = ["Posições", "Ordens", "Histórico", "Mais"] as const

const CHAVE_GAVETA = "mtmfunded_simples_gaveta"
/** Abaixo disto, largar a pega fecha a gaveta (fica só a barra dos separadores). */
const MIN_ABERTA = 72
const alturaPadrao = () => Math.min(Math.round((typeof window === "undefined" ? 800 : window.innerHeight) * 0.44), 400)
/** O máximo: o gráfico nunca desaparece por arrasto (fica pelo menos com ~140 px + o topo). */
const alturaMaxima = () => Math.max(160, Math.round((typeof window === "undefined" ? 800 : window.innerHeight) - 260))
const limitar = (h: number) => Math.max(0, Math.min(alturaMaxima(), Math.round(h)))

/**
 * A gaveta arrastável: `altura` é a altura do conteúdo quando aberta; `aoVivo` é a do arrasto em
 * curso (sem transição, para seguir o dedo). Guarda {aberta, altura} no dispositivo.
 */
function useGaveta() {
  const [aberta, setAbertaEstado] = useState(false)
  const [altura, setAlturaEstado] = useState<number>(400)
  const [aoVivo, setAoVivo] = useState<number | null>(null)
  // Os valores de agora, para as acções não dependerem de closures velhas.
  const atual = useRef({ aberta: false, altura: 400 })
  const aplicar = useCallback((a: boolean, h: number, guardar = true) => {
    atual.current = { aberta: a, altura: h }
    setAbertaEstado(a); setAlturaEstado(h)
    if (guardar) { try { localStorage.setItem(CHAVE_GAVETA, JSON.stringify({ aberta: a, altura: h })) } catch { /* ok */ } }
  }, [])
  useEffect(() => {
    let h = alturaPadrao()
    let a = false
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_GAVETA) || "null") as { aberta?: boolean; altura?: number } | null
      if (v && typeof v.altura === "number" && v.altura >= MIN_ABERTA) h = limitar(v.altura)
      if (v?.aberta === true) a = true
    } catch { /* sem armazenamento: valores por defeito */ }
    aplicar(a, h, false)
  }, [aplicar])
  const setAberta = useCallback((a: boolean | ((x: boolean) => boolean)) => {
    const n = typeof a === "function" ? a(atual.current.aberta) : a
    aplicar(n, atual.current.altura)
  }, [aplicar])
  /** Larga numa altura: abaixo do mínimo fecha (e guarda a altura boa anterior para reabrir). */
  const fixar = useCallback((h: number) => {
    const n = limitar(h)
    if (n < MIN_ABERTA) aplicar(false, atual.current.altura)
    else aplicar(true, n)
  }, [aplicar])
  return { aberta, setAberta, altura, aoVivo, setAoVivo, fixar }
}

export default function LayoutSimples({ t }: { t: Trader }) {
  if (!t.simbolo) return <div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
  return (
    <ProvedorRascunho t={t} ficha={t.simbolo} volume={t.volume} setVolume={t.setVolume}>
      <AplicarPrefill prefill={t.prefill} simboloInicial={t.simboloInicial} />
      <Conteudo t={t} />
    </ProvedorRascunho>
  )
}

function Conteudo({ t }: { t: Trader }) {
  const k = useRascunho()
  const umClique = useUmClique()
  const s = t.simbolo!
  const preco = t.vivos[s.symbol]
  const [folha, setFolha] = useState<FolhaAberta>(null)
  const gav = useGaveta()
  const gaveta = gav.aberta
  const setGaveta = gav.setAberta
  const [graficoVisivel] = useGraficoVisivel()
  const [sep, setSep] = useState(0)
  const [mais, setMais] = useState<"estatisticas" | "alertas" | "diario" | "calendario" | "conta">("estatisticas")
  const [foco, setFoco] = useState<string | null>(null)
  const [envio, setEnvio] = useState<"buy" | "sell" | null>(null)
  const faixa = useRef<HTMLDivElement>(null)
  // Gráfico escondido: a gaveta fica aberta e com o ecrã todo (sem pega — não há para onde arrastar).
  const cheia = !graficoVisivel

  // Um alerta/ideia com direção abre logo o ticket (o resumo já vem escolhido).
  useEffect(() => { if (k.r.escolhido) setFolha("ticket") }, [k.r.escolhido])

  const irPara = (i: number) => {
    setSep(i)
    setGaveta(true)
    faixa.current?.scrollTo({ left: i * (faixa.current.clientWidth || 1), behavior: "smooth" })
  }
  const aoDeslizar = () => {
    const el = faixa.current
    if (!el) return
    const i = Math.round(el.scrollLeft / (el.clientWidth || 1))
    if (i !== sep) setSep(i)
  }

  const passo = s.volume_step || 0.01
  const mudarVolume = (delta: number) => {
    const v = normalizarVolume(s, Math.max(s.volume_min, Math.round((t.volume + delta) / passo) * passo))
    if (v != null) t.setVolume(v)
  }
  const carregar = (lado: "buy" | "sell") => {
    if (umClique.ligado) {
      if (k.aEnviar || umClique.ocupado) return
      k.set({ lado, visivel: true })
      setEnvio(lado)
      return
    }
    k.set({ lado, visivel: true, escolhido: false })
    setFolha("ticket")
  }
  // Num clique: o lado muda primeiro, a ordem sai no render seguinte já com os níveis desse lado.
  useEffect(() => {
    if (!envio || k.r.lado !== envio) return
    setEnvio(null)
    if (k.temErros || k.entrada == null) { k.set({ escolhido: true }); setFolha("ticket") }
    else void k.enviar()
  }, [envio, k.r.lado]) // eslint-disable-line react-hooks/exhaustive-deps

  const d = t.dados
  const lista = (vista: "posicoes" | "ordens" | "historico") => (
    <ListaPosicoes
      vista={vista} posicoes={d.posicoes} ordens={d.ordens} historico={d.historico} simbolos={t.fichas} precos={t.mapa}
      podeNegociar={t.podeNegociar} denso={false} accountId={t.accountId} simboloAtual={s.symbol}
      executar={t.executar} onSelecionarSimbolo={(x) => { void t.selecionarPorNome(x); setGaveta(false) }}
      onNota={(id) => { setFoco(id); setMais("diario"); irPara(3) }} notas={t.diario.comTrade}
    />
  )
  const semPreco = !preco?.fresco

  return (
    <>
      {/* Topo: símbolo (→ lista) · preço · estado · equity (→ conta) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#2A2E39] bg-[#131722] px-2.5 py-1.5">
        <button onClick={() => setFolha("mercado")} className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left active:bg-white/5" aria-label="escolher símbolo">
          <span className="text-[16px] font-bold text-white">{s.symbol}</span>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </button>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-mono text-[12px] text-zinc-300">{px(preco?.bid, s.digits)}</span>
          <EstadoMercado simbolo={s} compacto />
        </div>
        <button onClick={() => setFolha("conta")} className="ml-auto flex flex-col items-end rounded-lg px-2 py-0.5 leading-tight active:bg-white/5" aria-label="ver conta">
          <span className="text-[9.5px] uppercase tracking-wide text-zinc-500">Equity</span>
          <span className={`font-mono text-[13px] font-semibold ${t.vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(t.vivo.equity)} $</span>
        </button>
      </div>
      <AvisosConta t={t} />
      <FaixaPrefill t={t} />

      {/* O gráfico, em ecrã inteiro (escondido: fica só a barra dele, e a gaveta ocupa o resto) */}
      <div className={graficoVisivel ? "min-h-0 flex-1" : "shrink-0"}>
        <GraficoConta t={t} ficha={s} preencher={graficoVisivel} />
      </div>

      {/* SELL | volume | BUY */}
      {t.podeNegociar && (
        <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 border-t border-[#2A2E39] bg-[#131722] px-2 py-1.5">
          <button disabled={semPreco} onClick={() => carregar("sell")} className="rounded-xl bg-[#F23645] py-2 text-white active:brightness-90 disabled:opacity-40">
            <span className="block text-[11px] font-bold tracking-wide">SELL</span>
            <span className="block font-mono text-[15px] font-semibold">{px(preco?.bid, s.digits)}</span>
          </button>
          <div className="flex items-center gap-0.5 rounded-xl bg-white/5 px-1">
            <button onClick={() => mudarVolume(-passo)} aria-label="menos volume" className="grid h-9 w-8 place-items-center text-zinc-300"><Minus className="h-4 w-4" /></button>
            <span className="min-w-[3.2rem] text-center font-mono text-[13px] text-white">{t.volume}</span>
            <button onClick={() => mudarVolume(passo)} aria-label="mais volume" className="grid h-9 w-8 place-items-center text-zinc-300"><Plus className="h-4 w-4" /></button>
          </div>
          <button disabled={semPreco} onClick={() => carregar("buy")} className="rounded-xl bg-[#089981] py-2 text-white active:brightness-90 disabled:opacity-40">
            <span className="block text-[11px] font-bold tracking-wide">BUY</span>
            <span className="block font-mono text-[15px] font-semibold">{px(preco?.ask, s.digits)}</span>
          </button>
        </div>
      )}

      {/* A gaveta: pega (arrasta-se) + separadores; o conteúdo desliza para o lado */}
      <div className={`${cheia ? "flex min-h-0 flex-1 flex-col" : "shrink-0"} border-t border-[#2A2E39] bg-[#1E222D]`} style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {!cheia && <PegaGaveta gav={gav} />}
        <div role="tablist" className="flex shrink-0">
          {SEPARADORES.map((nome, i) => {
            const n = i === 0 ? d.posicoes.length : i === 1 ? d.ordens.length : 0
            const ativo = (gaveta || cheia) && sep === i
            return (
              <button key={nome} role="tab" aria-selected={ativo} onClick={() => (ativo ? (cheia ? undefined : setGaveta(false)) : irPara(i))}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-[12.5px] ${ativo ? "border-[#D2A63C] text-white" : "border-transparent text-zinc-400"}`}>
                {nome}{n > 0 && <span className="rounded bg-[#D2A63C] px-1 text-[10px] font-bold text-black">{n}</span>}
              </button>
            )
          })}
        </div>
        <div
          className={`overflow-hidden ${cheia ? "min-h-0 flex-1" : gav.aoVivo == null ? "transition-[height] duration-200" : ""}`}
          style={cheia ? undefined : { height: gav.aoVivo ?? (gaveta ? Math.min(gav.altura, alturaMaxima()) : 0) }}
        >
          <div ref={faixa} onScroll={aoDeslizar} className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
            {[lista("posicoes"), lista("ordens"), lista("historico")].map((c, i) => (
              <div key={i} className="h-full w-full shrink-0 snap-start overflow-y-auto">{c}</div>
            ))}
            <div className="h-full w-full shrink-0 snap-start overflow-y-auto">
              <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto bg-[#1E222D] px-2 py-1.5">
                {([["estatisticas", "Estatísticas"], ["alertas", "Alertas"], ["diario", "Diário"], ["calendario", "Calendário"], ["conta", "Conta"]] as const).map(([v, nome]) => (
                  <button key={v} onClick={() => setMais(v)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] ${mais === v ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-white/10 text-zinc-400"}`}>{nome}</button>
                ))}
              </div>
              {sep === 3 && (gaveta || cheia) && (
                <>
                  {mais === "estatisticas" && <FundedEstatisticas accountId={t.accountId} equity={t.vivo.equity} regras={{ limites: t.vivo.limites, regras: d.regras, saldoInicial: d.conta.saldoInicial, equity: t.vivo.equity, diasNegociados: d.conta.diasNegociados }} />}
                  {mais === "alertas" && <FundedAlertas accountId={t.accountId} simbolo={s} preco={preco} podeCriar={d.modo === "master"} estado={t.alertas} onSelecionarSimbolo={(x) => void t.selecionarPorNome(x)} />}
                  {mais === "diario" && <FundedDiario accountId={t.accountId} historico={d.historico} podeEscrever={d.modo === "master"} diario={t.diario} focoTrade={foco} onFoco={setFoco} />}
                  {mais === "calendario" && <CalendarioEconomico altura="42dvh" />}
                  {mais === "conta" && <PainelConta t={t} />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {folha === "ticket" && (
        <Folha titulo="Nova ordem" onFechar={() => { setFolha(null); k.limpar(); k.setFerramenta(null) }}>
          <FundedTicket margemLivre={t.vivo.margemLivre} />
        </Folha>
      )}
      {folha === "mercado" && (
        <Folha titulo="Mercado" onFechar={() => setFolha(null)}>
          <FundedWatchlist precos={t.vivos} selecionado={s.symbol} onSelecionar={(x) => { t.selecionar(x); setFolha(null) }} onVisiveis={t.setVisiveis} />
        </Folha>
      )}
      {folha === "conta" && (
        <Folha titulo="A minha conta" onFechar={() => setFolha(null)}>
          <div className="mb-2 flex items-center gap-2 px-1 text-[11.5px]"><span className="text-zinc-500">Sentimento {s.symbol}</span><Sentimento symbol={s.symbol} /></div>
          <PainelConta t={t} />
        </Folha>
      )}
    </>
  )
}

/**
 * A pega da gaveta. Arrasto com Pointer Events + captura (rato, dedo, caneta):
 *  · `touch-action: none` e um `touchmove` não-passivo com preventDefault — senão, no Safari/iOS e
 *    nas webviews das apps, arrastar a pega fazia scroll/«bounce» da página ou trocava de separador
 *    nativo em vez de mexer na gaveta;
 *  · a altura segue o dedo sem transição e é aplicada uma vez por frame (o gráfico redimensiona-se);
 *  · largar abaixo de MIN_ABERTA fecha; um toque sem arrastar alterna; ↑/↓ no teclado mexem 40 px.
 */
function PegaGaveta({ gav }: { gav: ReturnType<typeof useGaveta> }) {
  const ref = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ y0: number; h0: number; moveu: boolean; ultima: number } | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const travar = (e: TouchEvent) => { if (e.cancelable) e.preventDefault() }
    el.addEventListener("touchmove", travar, { passive: false })
    el.addEventListener("touchstart", travar, { passive: false })
    return () => { el.removeEventListener("touchmove", travar); el.removeEventListener("touchstart", travar) }
  }, [])
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current) }, [])

  const alturaAgora = () => (gav.aberta ? gav.altura : 0)
  const terminar = (e: React.PointerEvent<HTMLDivElement>, cancelado: boolean) => {
    const a = arrasto.current
    arrasto.current = null
    if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ok */ }
    gav.setAoVivo(null)
    if (!a || cancelado) return
    if (!a.moveu) return gav.setAberta((x) => !x)
    gav.fixar(a.h0 - (e.clientY - a.y0))
  }

  return (
    <div
      ref={ref}
      role="separator" aria-orientation="horizontal" tabIndex={0}
      aria-label={gav.aberta ? "arrastar para redimensionar o painel, tocar para fechar" : "arrastar ou tocar para abrir o painel"}
      aria-expanded={gav.aberta} aria-valuenow={alturaAgora()} aria-valuemin={0}
      className="flex h-4 cursor-row-resize touch-none select-none items-center justify-center [overscroll-behavior:contain] focus:outline-none focus-visible:bg-white/5"
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return
        e.preventDefault()
        arrasto.current = { y0: e.clientY, h0: alturaAgora(), moveu: false, ultima: alturaAgora() }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ }
      }}
      onPointerMove={(e) => {
        const a = arrasto.current
        if (!a) return
        const dy = e.clientY - a.y0
        if (!a.moveu && Math.abs(dy) < 5) return
        a.moveu = true
        a.ultima = limitar(a.h0 - dy)
        if (frame.current == null) frame.current = requestAnimationFrame(() => { frame.current = null; if (arrasto.current) gav.setAoVivo(arrasto.current.ultima) })
      }}
      onPointerUp={(e) => terminar(e, false)}
      onPointerCancel={(e) => terminar(e, true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gav.setAberta((x) => !x) }
        else if (e.key === "ArrowUp") { e.preventDefault(); gav.fixar(gav.aberta ? gav.altura + 40 : gav.altura) }
        else if (e.key === "ArrowDown") { e.preventDefault(); gav.fixar(alturaAgora() - 40) }
      }}
    >
      <span className="h-1 w-10 rounded-full bg-white/25" />
    </div>
  )
}

/** Folha que sobe de baixo. Fecha a arrastar a pega para baixo, com Esc, ou a tocar fora. */
function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  const [dy, setDy] = useState(0)
  const y0 = useRef<number | null>(null)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar() }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [onFechar])
  return (
    <div className="fixed inset-0 z-[900] flex flex-col justify-end bg-black/50" onClick={onFechar} role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className="relative max-h-[90dvh] overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#131722] shadow-2xl"
        style={{ transform: `translateY(${Math.max(0, dy)}px)`, transition: y0.current == null ? "transform .18s" : "none", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex touch-none items-center gap-2 px-3 pb-1 pt-2"
          onPointerDown={(e) => { y0.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
          onPointerMove={(e) => { if (y0.current != null) setDy(e.clientY - y0.current) }}
          onPointerUp={() => { const fechar = dy > 80; y0.current = null; setDy(0); if (fechar) onFechar() }}
        >
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />
          <p className="mt-2 text-[13px] font-semibold text-white">{titulo}</p>
          <button onClick={onFechar} aria-label="fechar" className="ml-auto mt-2 text-zinc-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(90dvh-44px)] overflow-y-auto px-2 pb-3">{children}</div>
      </div>
    </div>
  )
}
