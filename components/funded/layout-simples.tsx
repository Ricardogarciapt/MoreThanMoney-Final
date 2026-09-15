"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type ReactNode } from "react"
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
import { AplicarPrefill, AvisosConta, FaixaPrefill, GraficoConta, ProvedorRascunho, type Trader } from "./trader-contexto"
const CalendarioEconomico = dynamic(() => import("./calendario-economico"), { ssr: false })
const FundedEstatisticas = dynamic(() => import("./funded-estatisticas"), { ssr: false })

/**
 * O MODO SIMPLE — telemóvel primeiro, sem ruído.
 *
 *  · o GRÁFICO ocupa o ecrã; por cima, só o símbolo (toque → lista) e a equity (toque → conta);
 *  · em baixo, SELL | volume | BUY grandes. Tocar abre o TICKET numa folha que sobe (com a
 *    negociação num clique ligada, tocar ENVIA — como no MT5/TradeLocker);
 *  · a GAVETA de baixo tem Posições · Ordens · Histórico · Mais, que se deslizam para o lado; puxar
 *    a pega para cima abre-a, para baixo fecha-a.
 * As folhas fecham-se a arrastar para baixo, com Esc, ou a tocar fora.
 */

type FolhaAberta = null | "ticket" | "mercado" | "conta"
const SEPARADORES = ["Posições", "Ordens", "Histórico", "Mais"] as const

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
  const [gaveta, setGaveta] = useState(false)
  const [sep, setSep] = useState(0)
  const [mais, setMais] = useState<"estatisticas" | "alertas" | "diario" | "calendario" | "conta">("estatisticas")
  const [foco, setFoco] = useState<string | null>(null)
  const [envio, setEnvio] = useState<"buy" | "sell" | null>(null)
  const faixa = useRef<HTMLDivElement>(null)
  const toque = useRef<number | null>(null)

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

      {/* O gráfico, em ecrã inteiro */}
      <div className="min-h-0 flex-1">
        <GraficoConta t={t} ficha={s} preencher />
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

      {/* A gaveta: pega + separadores; o conteúdo desliza para o lado */}
      <div className="shrink-0 border-t border-[#2A2E39] bg-[#1E222D]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div
          className="flex cursor-grab touch-none justify-center pt-1"
          onPointerDown={(e) => { toque.current = e.clientY }}
          onPointerUp={(e) => { const y0 = toque.current; toque.current = null; if (y0 == null) return; const dy = e.clientY - y0; if (dy < -25) setGaveta(true); else if (dy > 25) setGaveta(false); else setGaveta((g) => !g) }}
          role="button" aria-label={gaveta ? "fechar painel" : "abrir painel"} aria-expanded={gaveta}
        >
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div role="tablist" className="flex">
          {SEPARADORES.map((nome, i) => {
            const n = i === 0 ? d.posicoes.length : i === 1 ? d.ordens.length : 0
            return (
              <button key={nome} role="tab" aria-selected={gaveta && sep === i} onClick={() => (gaveta && sep === i ? setGaveta(false) : irPara(i))}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-[12.5px] ${gaveta && sep === i ? "border-[#D2A63C] text-white" : "border-transparent text-zinc-400"}`}>
                {nome}{n > 0 && <span className="rounded bg-[#D2A63C] px-1 text-[10px] font-bold text-black">{n}</span>}
              </button>
            )
          })}
        </div>
        <div className={`overflow-hidden transition-[height] duration-200 ${gaveta ? "h-[min(44dvh,400px)]" : "h-0"}`}>
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
              {sep === 3 && gaveta && (
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
