"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels"
import { CalendarDays, Columns2, Loader2, Rows2, Square, Grid2x2, Receipt } from "lucide-react"
import FundedTicket from "./funded-ticket"
import FundedWatchlist from "./funded-watchlist"
import MultiGrafico from "./multi-grafico"
import PainelInferior from "./painel-inferior"
import Atalhos, { type Layout } from "./atalhos"
import { EstadoMercado, Sentimento } from "./estado-mercado"
import { AplicarPrefill, AvisosConta, FaixaPrefill, GraficoConta, ProvedorRascunho, type Trader } from "./trader-contexto"
const CalendarioEconomico = dynamic(() => import("./calendario-economico"), { ssr: false })

/**
 * O MODO PRO — a plataforma de secretária.
 *
 *   ┌ barra: conta · métricas ao vivo · estado do mercado · sentimento · 1/2/2/4 gráficos · atalhos ┐
 *   │ lista  │  gráficos (1/2/4)                                 │ ticket | calendário │
 *   │ (24 h, │───────────────────────────────────────────────────│                     │
 *   │ mini-  │  Posições | Ordens | Histórico | Estatísticas |   │                     │
 *   │ gráf.) │  Diário | Alertas | Conta                         │                     │
 *   └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Painéis redimensionáveis com `react-resizable-panels` (já instalado; `autoSaveId` guarda os
 * tamanhos no browser). A lista e o ticket recolhem-se arrastando até ao fim. Abaixo de 768 px o
 * PRO empilha na vertical (gráficos · ticket · painel) — quem escolhe PRO no telemóvel quer tudo,
 * mesmo apertado; o SIMPLE é que é pensado para o dedo.
 */

const CHAVE_LAYOUT = "mtmfunded_pro_layout"

function useEstreito() {
  const [e, setE] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const f = () => setE(mq.matches)
    f()
    mq.addEventListener("change", f)
    return () => mq.removeEventListener("change", f)
  }, [])
  return e
}

export default function LayoutPro({ t }: { t: Trader }) {
  const [layout, setLayoutEstado] = useState<Layout>("1")
  const [lateral, setLateral] = useState<"ticket" | "calendario">("ticket")
  const ticketRef = useRef<ImperativePanelHandle>(null)
  const estreito = useEstreito()
  useEffect(() => { try { const v = localStorage.getItem(CHAVE_LAYOUT) as Layout | null; if (v && ["1", "2h", "2v", "4"].includes(v)) setLayoutEstado(v) } catch { /* ok */ } }, [])
  const setLayout = (l: Layout) => { setLayoutEstado(l); try { localStorage.setItem(CHAVE_LAYOUT, l) } catch { /* ok */ } }

  if (!t.simbolo) return <div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
  const simbolo = t.simbolo

  const abrirTicket = () => {
    setLateral("ticket")
    ticketRef.current?.expand()
    setTimeout(() => (document.querySelector<HTMLInputElement>('[data-ticket] input[aria-label="volume em lotes"], [data-ticket] input')?.focus()), 60)
  }

  const lateralConteudo = (
    <div className="flex h-full min-h-0 flex-col bg-[#131722]" data-ticket>
      <div role="tablist" className="flex shrink-0 border-b border-[#2A2E39] text-[12px]">
        {([["ticket", "Ticket", Receipt], ["calendario", "Calendário", CalendarDays]] as const).map(([v, nome, Icone]) => (
          <button key={v} role="tab" aria-selected={lateral === v} onClick={() => setLateral(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-1.5 ${lateral === v ? "border-[#D2A63C] text-white" : "border-transparent text-zinc-400"}`}>
            <Icone className="h-3.5 w-3.5" /> {nome}{v === "ticket" && <kbd className="ml-1 rounded border border-white/10 px-1 text-[9px] text-zinc-500">F9</kbd>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin] [scrollbar-color:#363A45_transparent]">
        {lateral === "calendario" ? <CalendarioEconomico altura="100%" /> : t.podeNegociar ? <FundedTicket margemLivre={t.vivo.margemLivre} /> : (
          <p className="p-4 text-center text-[12px] text-zinc-500">{t.dados.modo === "investor" ? "Sessão investor — só leitura." : "Conta sem negociação."}</p>
        )}
      </div>
    </div>
  )

  const puxador = (vertical = false) => (
    <PanelResizeHandle className={`group relative shrink-0 bg-[#2A2E39] transition-colors hover:bg-[#D2A63C]/60 data-[resize-handle-state=drag]:bg-[#D2A63C] ${vertical ? "h-1" : "w-1"}`} />
  )

  return (
    <ProvedorRascunho t={t} ficha={simbolo} volume={t.volume} setVolume={t.setVolume}>
      <AplicarPrefill prefill={t.prefill} simboloInicial={t.simboloInicial} />
      <BarraPro t={t} layout={layout} setLayout={setLayout} onF9={abrirTicket} />
      <AvisosConta t={t} />
      <FaixaPrefill t={t} />
      <div className="min-h-0 flex-1">
        {estreito ? (
          <PanelGroup direction="vertical" autoSaveId="mtmfunded-pro-estreito">
            <Panel id="graficos" order={1} defaultSize={50} minSize={20}>
              <MultiGrafico t={t} layout={layout === "4" ? "2v" : layout} principal={<GraficoConta t={t} ficha={simbolo} preencher />} />
            </Panel>
            {puxador(true)}
            <Panel id="ticket" order={2} defaultSize={25} minSize={8} collapsible ref={ticketRef}>{lateralConteudo}</Panel>
            {puxador(true)}
            <Panel id="baixo" order={3} defaultSize={25} minSize={8}><PainelInferior t={t} denso={false} /></Panel>
          </PanelGroup>
        ) : (
          <PanelGroup direction="horizontal" autoSaveId="mtmfunded-pro-h">
            <Panel id="lista" order={1} defaultSize={18} minSize={12} maxSize={30} collapsible collapsedSize={0}>
              <div className="h-full p-1"><FundedWatchlist precos={t.vivos} selecionado={simbolo.symbol} onSelecionar={t.selecionar} onVisiveis={t.setVisiveis} detalhe preencher /></div>
            </Panel>
            {puxador()}
            <Panel id="centro" order={2} defaultSize={60} minSize={30}>
              <PanelGroup direction="vertical" autoSaveId="mtmfunded-pro-v">
                <Panel id="graficos" order={1} defaultSize={62} minSize={20}>
                  <MultiGrafico t={t} layout={layout} principal={<GraficoConta t={t} ficha={simbolo} preencher />} />
                </Panel>
                {puxador(true)}
                <Panel id="baixo" order={2} defaultSize={38} minSize={10} collapsible collapsedSize={4}>
                  <PainelInferior t={t} />
                </Panel>
              </PanelGroup>
            </Panel>
            {puxador()}
            <Panel id="ticket" order={3} defaultSize={22} minSize={16} maxSize={36} collapsible collapsedSize={0} ref={ticketRef}>
              {lateralConteudo}
            </Panel>
          </PanelGroup>
        )}
      </div>
    </ProvedorRascunho>
  )
}

function BarraPro({ t, layout, setLayout, onF9 }: { t: Trader; layout: Layout; setLayout: (l: Layout) => void; onF9: () => void }) {
  const escolhidas = t.metricas.filter(([k]) => ["Saldo", "Equity", "Flutuante", "Margem livre", "Nível margem", "Perda diária restante", "Perda máx. restante", "Objetivo"].includes(k))
  const layouts: Array<[Layout, string, typeof Square]> = [["1", "1 gráfico (Alt+1)", Square], ["2h", "2 lado a lado (Alt+2)", Columns2], ["2v", "2 em pilha (Alt+3)", Rows2], ["4", "4 gráficos (Alt+4)", Grid2x2]]
  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-[#2A2E39] bg-[#1E222D] px-2.5 py-1 text-[11.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex shrink-0 items-center gap-3">
        {escolhidas.map(([k, v, cor]) => (
          <span key={k} className="flex shrink-0 flex-col leading-tight">
            <span className="text-[9.5px] uppercase tracking-wide text-zinc-500">{k}</span>
            <span className={`font-mono ${cor ?? "text-white"}`}>{v}</span>
          </span>
        ))}
      </div>
      {t.simbolo && (
        <span className="flex shrink-0 items-center gap-2 border-l border-white/10 pl-3">
          <b className="text-white">{t.simbolo.symbol}</b>
          <EstadoMercado simbolo={t.simbolo} />
          <Sentimento symbol={t.simbolo.symbol} />
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {layouts.map(([l, nome, Icone]) => (
          <button key={l} onClick={() => setLayout(l)} title={nome} aria-label={nome} aria-pressed={layout === l}
            className={`grid h-7 w-7 place-items-center rounded-md ${layout === l ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-zinc-400 hover:bg-white/10 hover:text-white"}`}>
            <Icone className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Atalhos podeNegociar={t.podeNegociar} onF9={onF9} onLayout={setLayout} />
      </div>
    </div>
  )
}
