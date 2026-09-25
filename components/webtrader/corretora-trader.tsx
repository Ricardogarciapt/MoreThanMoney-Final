"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, History, Info, ListOrdered, Loader2, Search, User, Wallet, X } from "lucide-react"
import { semCripto, ehSimboloCripto } from "@/lib/ios-sem-cripto"
import type { PlataformaWT, CapacidadesWT, ContaWT, NegocioWT, OrdemWT, PosicaoWT, SimboloWT } from "@/lib/webtrader/corretoras/tipos"
import type { MapaPrecos } from "@/lib/mtmfunded/simulado/matematica"
import type { SimboloFicha } from "@/components/funded/api"
import { usd } from "@/components/funded/api"
import { usePrecos } from "@/components/funded/use-precos"
import { fichaDe } from "@/components/funded/pre-carga"
import { AccaoCancelada, InterruptorUmClique, UmCliqueProvider, useUmClique } from "@/components/funded/um-clique"
import { useRascunhoOpcional } from "@/components/funded/rascunho-ordem"
import { useModoWebtrader } from "@/components/funded/modo-webtrader"
import LayoutSimples from "@/components/funded/layout-simples"
import type { PainelTrader, TraderBase } from "@/components/funded/trader-contexto"
import { validarTicketReal } from "@/lib/webtrader/ticket"
import { ordemParaCorretora } from "@/lib/webtrader/pedido-real"
import type { Prefill } from "@/components/funded/funded-ticket"
import { COR_PLATAFORMA, ErroWT, NOME_PLATAFORMA, pedirWT } from "./api-corretoras"
import { GestaoAutoCorretora } from "@/components/funded/gestao-auto"
const LayoutPro = dynamic(() => import("@/components/funded/layout-pro"), { ssr: false })

/**
 * O WEBTRADER DE UMA CONTA REAL (TradeLocker ou MT5) — só fala com /api/webtrader/{plataforma}/….
 *
 * Desenha-se com os MESMOS layouts das contas MTM Funded (SIMPLE e PRO): monta um `TraderBase`
 * (components/funded/trader-contexto.tsx) a partir de ContaWT/PosicaoWT/OrdemWT e entrega-o ao
 * layout. Ganha de graça a lista de símbolos, o multi-gráfico, os painéis arrumáveis e os atalhos —
 * sem herdar nada do motor simulado. O que esta conta não tem (regras de prop firm, diário,
 * alertas, bracket TP1-3, trailing, OCO) simplesmente NÃO entra na lista de painéis, em vez de
 * aparecer vazio.
 *
 * Custo e limites (o servidor limita por conta; o ecrã não gasta mais do que precisa):
 *  · posições+pendentes: MT5 de 5 em 5 s, TradeLocker de 3 em 3 s — SÓ com o separador visível;
 *  · saldo/equity de 10 em 10 s; histórico só quando se abre o painel;
 *  · preço do gráfico e do ticket: o feed MTM (grátis, indicativo). A ordem executa na corretora.
 *
 * Segurança da negociação real (nada disto mudou): aviso fixo «Conta REAL», confirmação obrigatória
 * na PRIMEIRA ordem de cada conta e negociação num clique desligada por defeito — cada ordem,
 * fecho ou arrasto pede confirmação. Toda a saída de ordens passa por `accao`, e a tradução do
 * rascunho para o corpo da ordem é pura e testada (lib/webtrader/pedido-real.ts): o que a corretora
 * não sabe fazer é recusado em voz alta, nunca reduzido a uma ordem mais simples.
 */

const CHAVE_ACEITE_REAL = (ref: string) => `webtrader_real_aceite:${ref}`

export default function CorretoraTrader(props: { contaRef: string; plataforma: PlataformaWT; altura?: string; prefill: Prefill | null; simboloInicial: string | null; compraPermitida: boolean }) {
  return (
    <UmCliqueProvider accountId={`wt:${props.contaRef}`} investor={false} real>
      <Trader {...props} />
    </UmCliqueProvider>
  )
}

function Trader({ contaRef, plataforma, altura, prefill, simboloInicial, compraPermitida }: { contaRef: string; plataforma: PlataformaWT; altura?: string; prefill: Prefill | null; simboloInicial: string | null; compraPermitida: boolean }) {
  const u = useUmClique()
  const { modo } = useModoWebtrader()
  const [info, setInfo] = useState<{ conta: ContaWT; podeNegociar: boolean; capacidades: CapacidadesWT } | null>(null)
  const [erro, setErro] = useState<{ texto: string; status: number; codigo?: string } | null>(null)
  const [aLigar, setALigar] = useState(false)
  const [posicoes, setPosicoes] = useState<PosicaoWT[]>([])
  const [ordens, setOrdens] = useState<OrdemWT[]>([])
  const [historico, setHistorico] = useState<NegocioWT[] | null>(null)
  const [fichas, setFichas] = useState<Record<string, SimboloFicha>>({})
  const [visiveis, setVisiveis] = useState<string[]>([])
  const [extras, setExtras] = useState<string[]>([])
  const [volume, setVolume] = useState(0.01)
  // App iOS: nunca abre num símbolo cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
  const [symbol, setSymbol] = useState<string>(() => {
    const s = simboloInicial?.split(",")[0]
    return (s && !(semCripto() && ehSimboloCripto(s)) ? s : "") || "XAUUSD"
  })
  const [pedeAceite, setPedeAceite] = useState<null | { ok: () => void; nao: () => void }>(null)
  const intervalo = plataforma === "mt5" ? 5000 : 3000

  const lerConta = useCallback(async () => {
    try {
      setInfo(await pedirWT(plataforma, "conta", { conta: contaRef }))
      setErro(null)
    } catch (e) {
      setErro({ texto: (e as Error).message, status: (e as ErroWT).status ?? 0, codigo: String((e as ErroWT).dados?.code ?? "") })
    }
  }, [plataforma, contaRef])
  const lerPosicoes = useCallback(async () => {
    try {
      const d = await pedirWT<{ posicoes: PosicaoWT[]; ordens: OrdemWT[] }>(plataforma, "posicoes", { conta: contaRef })
      setPosicoes(d.posicoes); setOrdens(d.ordens)
    } catch { /* o erro da conta já aparece em cima */ }
  }, [plataforma, contaRef])
  const lerHistorico = useCallback(async () => {
    try { setHistorico((await pedirWT<{ historico: NegocioWT[] }>(plataforma, "historico", { conta: contaRef, query: { dias: 30 } })).historico) } catch (e) { setHistorico([]); setErro({ texto: (e as Error).message, status: 0 }) }
  }, [plataforma, contaRef])

  // Leituras só com o separador visível; pára escondido e retoma ao voltar.
  useEffect(() => {
    let iv1: ReturnType<typeof setInterval> | null = null
    let iv2: ReturnType<typeof setInterval> | null = null
    const ligar = () => {
      if (iv1) return
      void lerConta(); void lerPosicoes()
      iv1 = setInterval(() => void lerPosicoes(), intervalo)
      iv2 = setInterval(() => void lerConta(), 10_000)
    }
    const desligar = () => { if (iv1) clearInterval(iv1); if (iv2) clearInterval(iv2); iv1 = iv2 = null }
    const mudou = () => (document.visibilityState === "hidden" ? desligar() : ligar())
    // Aberto num separador escondido (pré-carga, app em segundo plano): só lê quando se vê.
    if (document.visibilityState !== "hidden") ligar()
    document.addEventListener("visibilitychange", mudou)
    return () => { desligar(); document.removeEventListener("visibilitychange", mudou) }
  }, [lerConta, lerPosicoes, intervalo])

  /** A ficha do catálogo MTM (gráfico, casas decimais, lote mínimo) — a mesma promessa da pré-carga. */
  const obterFicha = useCallback(async (nome: string): Promise<SimboloFicha | null> => {
    const s = await fichaDe(nome)
    if (s) setFichas((f) => (f[s.symbol] ? f : { ...f, [s.symbol]: s }))
    return s
  }, [])
  useEffect(() => { void obterFicha(symbol) }, [symbol, obterFicha])
  const ficha = fichas[symbol] ?? null
  useEffect(() => { if (ficha) setVolume((v) => Math.max(ficha.volume_min, Math.min(v, ficha.volume_max))) }, [ficha?.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const selecionar = useCallback((s: SimboloFicha) => { setFichas((f) => ({ ...f, [s.symbol]: s })); setSymbol(s.symbol) }, [])
  const selecionarPorNome = useCallback(async (nome: string) => { const s = await obterFicha(nome); if (s) selecionar(s) }, [obterFicha, selecionar])

  const precisos = useMemo(
    () => [...new Set([symbol, ...visiveis, ...extras, ...posicoes.map((p) => p.symbol), ...ordens.map((o) => o.symbol)])].slice(0, 40),
    [symbol, visiveis, extras, posicoes, ordens],
  )
  const { precos: vivos } = usePrecos(precisos, 2000)
  const mapa: MapaPrecos = useMemo(() => Object.fromEntries(Object.entries(vivos).map(([s, p]) => [s, { symbol: s, bid: p.bid, ask: p.ask }])), [vivos])

  /** A primeira ordem de cada conta real exige aceitar o aviso, sempre, com ou sem um clique. */
  const garantirAceite = useCallback(() => new Promise<void>((ok, falha) => {
    let aceite = false
    try { aceite = localStorage.getItem(CHAVE_ACEITE_REAL(contaRef)) != null } catch { aceite = false }
    if (aceite) return ok()
    setPedeAceite({
      ok: () => { try { localStorage.setItem(CHAVE_ACEITE_REAL(contaRef), new Date().toISOString()) } catch { /* só nesta página */ } setPedeAceite(null); ok() },
      nao: () => { setPedeAceite(null); falha(new AccaoCancelada()) },
    })
  }), [contaRef])

  const accao = useCallback(async (descricao: string, acao: string, corpo: Record<string, unknown>, confirmar = true) => {
    await garantirAceite()
    const r = await u.executar(descricao, () => pedirWT(plataforma, acao, { conta: contaRef, metodo: "POST", corpo }), { confirmar })
    void lerPosicoes(); void lerConta()
    return r
  }, [u, plataforma, contaRef, garantirAceite, lerPosicoes, lerConta])
  /**
   * O pedido sem passar pela negociação num clique — para o GRÁFICO, que já passa as acções dele por
   * `executar` (grafico-leve: confirmação, protecção contra repetidos, aviso). Com `accao` havia dois
   * `executar` encaixados: dois avisos «feito» e a contagem de «a enviar» a dobrar.
   */
  const chamar = useCallback(async (acao: string, corpo: Record<string, unknown>) => {
    await garantirAceite()
    const r = await pedirWT(plataforma, acao, { conta: contaRef, metodo: "POST", corpo })
    void lerPosicoes(); void lerConta()
    return r
  }, [plataforma, contaRef, garantirAceite, lerPosicoes, lerConta])

  /** As acções do gráfico falam a língua do trader das contas MTM Funded; aqui traduzem-se. */
  const executar = useCallback((acao: string, corpo: Record<string, unknown>) => {
    if (acao === "modificar") return chamar("modificar", { alvo: "posicao", id: corpo.positionId, sl: corpo.sl, tp: corpo.tp })
    if (acao === "modificar_pendente") return chamar("modificar", { alvo: "ordem", id: corpo.orderId, preco: corpo.preco, sl: corpo.sl, tp: corpo.tp })
    return chamar(acao, corpo)
  }, [chamar])

  /** Deploy de uma conta MT5 desligada — só por clique, com confirmação (pode demorar ~1 min). */
  const ligarConta = async () => {
    if (!window.confirm("Ligar esta conta MT5 à corretora? Pode demorar cerca de 1 minuto. Depois de algum tempo parada, a MetaApi volta a desligá-la.")) return
    setALigar(true)
    try {
      await pedirWT(plataforma, "ligar", { conta: contaRef, metodo: "POST", corpo: {} })
      setErro({ texto: "A ligar à corretora… a página volta a tentar sozinha.", status: 0 })
      setTimeout(() => { void lerConta(); void lerPosicoes() }, 30_000)
    } catch (e) {
      setErro({ texto: (e as Error).message, status: (e as ErroWT).status ?? 0 })
    } finally {
      setALigar(false)
    }
  }
  const botaoLigar = erro?.codigo === "mt5_desligada" && (
    <button disabled={aLigar} onClick={() => void ligarConta()} className="rounded-lg bg-violet-400 px-3 py-1.5 text-[12px] font-bold text-black disabled:opacity-40">
      {aLigar ? "A ligar…" : "Ligar conta"}
    </button>
  )
  const semCancelar = (p: Promise<unknown>) => p.catch((e) => { if (!(e instanceof AccaoCancelada)) throw e })

  if (erro && !info) {
    return (
      <div className="space-y-2 p-6 text-center text-[13px]">
        <p className="text-rose-300">{erro.texto}</p>
        {botaoLigar}
        {erro.status === 402 && compraPermitida && <a href="/upgrade" className="inline-block font-semibold text-[#D2A63C] underline">Ver planos</a>}
        {erro.status === 401 && <p className="text-zinc-500">Volta a entrar com as credenciais desta conta.</p>}
      </div>
    )
  }
  if (!info) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: COR_PLATAFORMA[plataforma] }} /></div>

  const podeNegociar = info.podeNegociar
  const capacidades = info.capacidades
  const digitos = ficha?.digits ?? 5
  const c = info.conta
  const moeda = c.moeda ? ` ${c.moeda}` : ""
  const metricas: Array<[string, string, string?]> = [
    ["Saldo", `${usd(c.saldo)}${moeda}`], ["Equity", `${usd(c.equity)}${moeda}`],
    ["Flutuante", `${usd(c.flutuante)}${moeda}`, (c.flutuante ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Margem", `${usd(c.margem)}${moeda}`], ["Margem livre", `${usd(c.margemLivre)}${moeda}`],
    // Mesma linha, mesma ordem que no trader das contas MTM Funded (funded-trader.tsx).
    ["Nível margem", c.nivelMargem == null ? "—" : `${c.nivelMargem.toFixed(0)}%`],
  ]

  /**
   * A ordem vinda do rascunho partilhado (os botões grandes do SIMPLE, a ferramenta do gráfico):
   * traduz-se com a função pura e testada, e sai pelo MESMO `accao` do ticket — aceite da conta
   * real primeiro, confirmação depois.
   */
  const enviarPedido = async (p: Parameters<TraderBase["enviarPedido"]>[0], sym: string) => {
    const r = ordemParaCorretora(p as never, sym, capacidades)
    if (!r.ok) throw new Error(r.erro)
    return accao(r.descricao, "ordem", { ...r.corpo })
  }

  const paineis: PainelTrader[] = [
    {
      chave: "posicoes", nome: "Posições", icone: Wallet, contagem: posicoes.length, principal: true,
      conteudo: () => (
        <div className="overflow-x-auto">
          <TabelaPosicoes posicoes={posicoes} digitos={digitos} podeNegociar={podeNegociar} contaRef={contaRef} mapa={mapa}
            onFechar={(p, v) => semCancelar(accao(`Fechar ${v ? `${v} de ` : ""}${p.volume} ${p.simboloCorretora}`, "fechar", { positionId: p.id, volume: v }))}
            onModificar={(p, sl, tp) => semCancelar(accao(`Mudar SL/TP de ${p.simboloCorretora}`, "modificar", { alvo: "posicao", id: p.id, sl, tp }))} />
        </div>
      ),
    },
    {
      chave: "ordens", nome: "Pendentes", icone: ListOrdered, contagem: ordens.length, principal: true,
      conteudo: () => (
        <div className="overflow-x-auto">
          <TabelaOrdens ordens={ordens} digitos={digitos} podeNegociar={podeNegociar}
            onCancelar={(o) => semCancelar(accao(`Cancelar ${o.tipo} ${o.simboloCorretora}`, "cancelar", { orderId: o.id }))}
            onModificar={(o, preco, sl, tp) => semCancelar(accao(`Mover ${o.tipo} ${o.simboloCorretora}`, "modificar", { alvo: "ordem", id: o.id, preco, sl, tp }))} />
        </div>
      ),
    },
    {
      chave: "historico", nome: "Histórico", icone: History, principal: true,
      conteudo: () => <PainelHistorico linhas={historico} ler={lerHistorico} />,
    },
    {
      chave: "simbolos", nome: "Símbolos da corretora", icone: Search,
      conteudo: () => <div className="p-2"><PesquisaSimbolo plataforma={plataforma} contaRef={contaRef} atual={symbol} onEscolher={(s) => void selecionarPorNome(s)} /></div>,
    },
    {
      chave: "conta", nome: "A minha conta", icone: User,
      conteudo: () => (
        <div className="space-y-2 p-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: COR_PLATAFORMA[plataforma] }}>{NOME_PLATAFORMA[plataforma]}</span>
            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-300">CONTA REAL</span>
            {botaoLigar}
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/10 bg-[#0d0f15] p-2">
            {metricas.map(([k, v, cor]) => (
              <span key={k} className="flex flex-col leading-tight">
                <span className="text-[9.5px] uppercase tracking-wide text-zinc-500">{k}</span>
                <span className={`font-mono ${cor ?? "text-white"}`}>{v}</span>
              </span>
            ))}
          </div>
          {podeNegociar && <div className="rounded-lg border border-white/10 bg-[#0d0f15] p-2"><InterruptorUmClique variante="cartao" /></div>}
          <p className="flex items-start gap-1.5 rounded-lg border border-white/10 bg-[#0d0f15] p-2 text-[11px] leading-snug text-zinc-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Nesta conta {NOME_PLATAFORMA[plataforma]}: ordens a mercado, limit e stop com SL/TP nativos, fecho parcial e mover pendentes.
            TP1-3 em bracket, trailing, OCO, regras, diário e alertas só existem nas contas MTM Funded. Preço no ecrã é indicativo (feed MTM); a execução é ao preço da corretora.
          </p>
        </div>
      ),
    },
  ]

  const t: TraderBase = {
    accountId: `wt:${contaRef}`,
    posicoes: posicoes.map((p) => ({ id: p.id, symbol: p.symbol, direcao: p.direcao, volume: p.volume, preco_entrada: p.precoEntrada, sl: p.sl, tp: p.tp })),
    ordens: ordens.map((o) => ({ id: o.id, symbol: o.symbol, direcao: o.direcao, tipo: o.tipo, volume: o.volume, preco: o.preco, sl: o.sl, tp: o.tp })),
    mapa, vivos, fichas, simbolo: ficha, volume, setVolume, podeNegociar,
    selecionar, selecionarPorNome, obterFicha, executar, enviarPedido, setVisiveis, setExtras,
    prefill, simboloInicial, metricas,
    carteira: {
      nome: `${NOME_PLATAFORMA[plataforma]} · conta real`,
      alavancagem: ficha?.alavancagem_max || 100, margemLivre: c.margemLivre, saldo: c.saldo,
      equity: c.equity, flutuante: c.flutuante,
    },
    // Regras de prop firm, diário e alertas não existem nesta conta: nada a desenhar no gráfico.
    alertasGrafico: () => [],
    avisos: (
      <>
        <div className="flex flex-wrap items-center gap-2 bg-rose-500/10 px-3 py-1 text-[11px]">
          <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: COR_PLATAFORMA[plataforma] }}>{NOME_PLATAFORMA[plataforma]}</span>
          <span className="font-bold text-rose-300">CONTA REAL</span>
          <span className="min-w-0 truncate text-rose-200/80">as ordens são executadas na tua corretora</span>
        </div>
        {erro && <p className="flex items-center gap-2 px-3 py-1 text-[11.5px] text-amber-300">{erro.texto} {botaoLigar}</p>}
      </>
    ),
    paineis, chavePaineis: "webtrader_real_separador",
    ticket: <TicketReal
      symbol={symbol} digitos={digitos} volumeMin={ficha?.volume_min ?? 0.01} passo={ficha?.volume_step ?? 0.01}
      bid={vivos[symbol]?.bid} ask={vivos[symbol]?.ask} podeNegociar={podeNegociar} capacidades={capacidades} prefill={prefill}
      onEnviar={(p) => semCancelar(accao(
        `${p.direcao === "buy" ? "Comprar" : "Vender"} ${p.volume} ${symbol}${p.tipo !== "mercado" ? ` ${p.tipo} @ ${p.preco}` : " a mercado"}`,
        "ordem", { symbol, ...p },
      ))}
    />,
    ferramentaGrafico: true,
  }

  return (
    <div className="relative flex flex-col overflow-hidden bg-[#131722] text-white" style={{ height: altura ?? "calc(100dvh - 120px)", minHeight: "min(420px, 100dvh)" }}>
      {modo === "pro" ? <LayoutPro t={t} /> : <LayoutSimples t={t} />}
      {pedeAceite && (
        <div className="fixed inset-0 z-[1002] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Conta real">
          <div className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-[#131722] p-4 text-[12.5px] shadow-2xl">
            <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-rose-300"><AlertTriangle className="h-4 w-4" /> Conta real</p>
            <AceiteReal onOk={pedeAceite.ok} onNao={pedeAceite.nao} plataforma={plataforma} />
          </div>
        </div>
      )}
    </div>
  )
}

function AceiteReal({ onOk, onNao, plataforma }: { onOk: () => void; onNao: () => void; plataforma: PlataformaWT }) {
  const [marcado, setMarcado] = useState(false)
  return (
    <>
      <p className="leading-relaxed text-zinc-200">Conta real — as ordens são executadas na tua corretora ({NOME_PLATAFORMA[plataforma]}), com dinheiro real. Ganhos e perdas são reais e a MTM não os pode reverter.</p>
      <label className="mt-3 flex items-start gap-2 text-zinc-300">
        <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-500" />
        Percebi que esta é uma conta real.
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onNao} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
        <button type="button" disabled={!marcado} onClick={onOk} className="flex-[2] rounded-lg bg-rose-500 py-2 font-bold text-white disabled:opacity-40">Continuar</button>
      </div>
    </>
  )
}

/** O histórico é caro: só se lê quando o painel aparece pela primeira vez. */
function PainelHistorico({ linhas, ler }: { linhas: NegocioWT[] | null; ler: () => Promise<void> }) {
  useEffect(() => { if (linhas == null) void ler() }, [linhas, ler])
  if (linhas == null) return <Loader2 className="m-4 h-4 w-4 animate-spin" />
  return <div className="overflow-x-auto"><TabelaHistorico linhas={linhas} /></div>
}

function PesquisaSimbolo({ plataforma, contaRef, atual, onEscolher }: { plataforma: PlataformaWT; contaRef: string; atual: string; onEscolher: (s: string) => void }) {
  const [q, setQ] = useState("")
  const [lista, setLista] = useState<SimboloWT[]>([])
  const [aberta, setAberta] = useState(true)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!aberta) return
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      try {
        const r = (await pedirWT<{ simbolos: SimboloWT[] }>(plataforma, "simbolos", { conta: contaRef, query: { q } })).simbolos
        // App iOS: a pesquisa na corretora não lista cripto (Apple 3.1.5(iii)).
        setLista(semCripto() ? r.filter((x) => !ehSimboloCripto(x.symbol) && !ehSimboloCripto(x.simboloCorretora)) : r)
      } catch { setLista([]) }
    }, 350)
  }, [q, aberta, plataforma, contaRef])
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2">
        <Search className="h-3.5 w-3.5 text-zinc-500" />
        <input value={q} onFocus={() => setAberta(true)} onChange={(e) => setQ(e.target.value)} placeholder={`${atual} — procurar símbolo da corretora`} className="h-9 flex-1 bg-transparent text-[12.5px] text-white outline-none" />
        {q && <button onClick={() => setQ("")} aria-label="limpar"><X className="h-3.5 w-3.5 text-zinc-500" /></button>}
      </div>
      <div className="max-h-[50dvh] overflow-y-auto rounded-lg border border-white/10">
        {lista.length === 0 ? <p className="p-3 text-[12px] text-zinc-500">Escreve para procurar nos símbolos desta corretora.</p> : lista.map((s) => (
          <button key={s.simboloCorretora} onClick={() => onEscolher(s.symbol)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-white/5">
            <span className="font-semibold">{s.symbol}</span><span className="font-mono text-zinc-500">{s.simboloCorretora}</span>
            {s.nome && <span className="ml-auto truncate text-zinc-500">{s.nome}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * O TICKET DA CONTA REAL — campos escritos à mão, validados em lib/webtrader/ticket.ts.
 * Lê o LADO do rascunho partilhado (quando existe): tocar em SELL no SIMPLE abre o ticket já no
 * lado certo, como nas contas MTM Funded. Quem envia continua a ser este formulário.
 */
function TicketReal({ symbol, digitos, volumeMin, passo, bid, ask, podeNegociar, capacidades, prefill, onEnviar }: {
  symbol: string; digitos: number; volumeMin: number; passo: number; bid?: number; ask?: number; podeNegociar: boolean; capacidades: CapacidadesWT
  prefill: Prefill | null
  onEnviar: (p: { direcao: "buy" | "sell"; tipo: "mercado" | "limit" | "stop"; volume: number; preco: number | null; sl: number | null; tp: number | null }) => Promise<unknown>
}) {
  const [tipo, setTipo] = useState<"mercado" | "limit" | "stop">("mercado")
  const [volume, setVolume] = useState(String(volumeMin))
  const [preco, setPreco] = useState("")
  const [sl, setSl] = useState(prefill?.sl ? String(prefill.sl) : "")
  const [tp, setTp] = useState(prefill?.tp ? String(prefill.tp) : "")
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { setVolume(String(volumeMin)) }, [symbol, volumeMin])
  const u = useUmClique()
  const k = useRascunhoOpcional()
  const lado = k?.r.lado ?? null
  const enviar = async (direcao: "buy" | "sell") => {
    setErro(null)
    // Números com vírgula ou ponto; lixo («abc», «1,2,3») dá erro aqui em vez de seguir como null
    // (um SL mal escrito saía SEM SL para a corretora). Lote no passo e acima do mínimo.
    const v = validarTicketReal({ tipo, volume, preco, sl, tp, volumeMin, passo })
    if (!v.ok) return setErro(v.erro)
    setAEnviar(true)
    try { await onEnviar({ direcao, tipo, volume: v.volume, preco: v.preco, sl: v.sl, tp: v.tp }) } catch (e) { setErro((e as Error).message) } finally { setAEnviar(false) }
  }
  const input = "h-9 w-full rounded-md border border-white/10 bg-black px-2 font-mono text-[12.5px] text-white"
  const realce = (l: "buy" | "sell") => (lado === l ? " ring-2 ring-white/70" : "")
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-[#0d0f15] p-2.5 text-[12px]">
      <div className="flex items-center justify-between"><span className="font-semibold">{symbol}</span><span className="text-[10.5px] text-rose-300">ordem real</span></div>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-black/40 p-0.5">
        {(["mercado", "limit", "stop"] as const).filter((x) => (x === "mercado" ? capacidades.mercado : capacidades[x])).map((x) => (
          <button key={x} onClick={() => setTipo(x)} className={`rounded py-1 ${tipo === x ? "bg-white/10 text-white" : "text-zinc-500"}`}>{x === "mercado" ? "Mercado" : x === "limit" ? "Limit" : "Stop"}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-zinc-400">Volume (lotes)<input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} aria-label="volume em lotes" className={input} /></label>
        {tipo !== "mercado" && <label className="text-zinc-400">Preço<input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} className={input} /></label>}
        <label className="text-zinc-400">SL<input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="opcional" className={input} /></label>
        <label className="text-zinc-400">TP<input inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="opcional" className={input} /></label>
      </div>
      {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
      {podeNegociar ? (
        <div className="grid grid-cols-2 gap-1.5">
          <button disabled={aEnviar || u.ocupado} onClick={() => void enviar("sell")} aria-label={`Vender ${volume} ${symbol}${u.ligado ? " (num clique)" : ""}`} className={`min-h-[48px] rounded-md bg-[#F7525F] py-2 font-bold text-white disabled:opacity-40${realce("sell")}`}>SELL<br /><span className="font-mono text-[11px] font-normal">{bid != null ? bid.toFixed(digitos) : "—"}</span></button>
          <button disabled={aEnviar || u.ocupado} onClick={() => void enviar("buy")} aria-label={`Comprar ${volume} ${symbol}${u.ligado ? " (num clique)" : ""}`} className={`min-h-[48px] rounded-md bg-[#2962FF] py-2 font-bold text-white disabled:opacity-40${realce("buy")}`}>BUY<br /><span className="font-mono text-[11px] font-normal">{ask != null ? ask.toFixed(digitos) : "—"}</span></button>
        </div>
      ) : <p className="text-zinc-500">Conta só em leitura.</p>}
    </div>
  )
}

function CelulaNivel({ valor, digitos, onMudar, podeNegociar, rotulo }: { valor: number | null; digitos: number; onMudar: (v: number | null) => void; podeNegociar: boolean; rotulo: string }) {
  const [txt, setTxt] = useState(valor == null ? "" : String(valor))
  useEffect(() => { setTxt(valor == null ? "" : valor.toFixed(digitos)) }, [valor, digitos])
  if (!podeNegociar) return <span className="font-mono">{valor == null ? "—" : valor.toFixed(digitos)}</span>
  return <input aria-label={rotulo} inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => { const v = txt.trim() === "" ? null : Number(txt.replace(",", ".")); if (v !== valor && (v == null || Number.isFinite(v))) onMudar(v); else if (v != null && !Number.isFinite(v)) setTxt(valor == null ? "" : valor.toFixed(digitos)) }} className="h-8 w-24 rounded border border-white/10 bg-black px-1 font-mono text-[11.5px]" />
}

function TabelaPosicoes({ posicoes, digitos, podeNegociar, contaRef, mapa, onFechar, onModificar }: {
  posicoes: PosicaoWT[]; digitos: number; podeNegociar: boolean; contaRef: string; mapa: MapaPrecos
  onFechar: (p: PosicaoWT, volume: number | null) => Promise<unknown>
  onModificar: (p: PosicaoWT, sl: number | null, tp: number | null) => Promise<unknown>
}) {
  const [parcial, setParcial] = useState<Record<string, string>>({})
  if (!posicoes.length) return <p className="p-3 text-[12px] text-zinc-500">Sem posições abertas.</p>
  return (
    <table className="w-full min-w-[640px] text-[11.5px]">
      <thead className="text-zinc-500"><tr className="text-left"><th className="px-2 py-1">Símbolo</th><th>Lado</th><th>Vol.</th><th>Entrada</th><th>SL</th><th>TP</th><th>Lucro</th><th /></tr></thead>
      <tbody>
        {posicoes.map((p) => (
          <tr key={p.id} className="border-t border-white/5">
            <td className="px-2 py-1"><b>{p.symbol}</b> <span className="font-mono text-zinc-500">{p.simboloCorretora}</span></td>
            <td className={p.direcao === "buy" ? "text-sky-300" : "text-rose-300"}>{p.direcao.toUpperCase()}</td>
            <td className="font-mono">{p.volume}</td>
            <td className="font-mono">{p.precoEntrada.toFixed(digitos)}</td>
            <td><CelulaNivel rotulo={`SL de ${p.symbol}`} valor={p.sl} digitos={digitos} podeNegociar={podeNegociar} onMudar={(v) => void onModificar(p, v, p.tp).catch(() => {})} /></td>
            <td><CelulaNivel rotulo={`TP de ${p.symbol}`} valor={p.tp} digitos={digitos} podeNegociar={podeNegociar} onMudar={(v) => void onModificar(p, p.sl, v).catch(() => {})} /></td>
            <td className={`font-mono ${(p.lucro ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(p.lucro)}</td>
            <td className="whitespace-nowrap pr-2 text-right">
              {podeNegociar && (
                <span className="inline-flex items-center gap-1">
                  {/* Gestão automática: aqui só guarda a preferência (não há gestor no servidor para contas da corretora). */}
                  <GestaoAutoCorretora contaRef={contaRef} symbol={p.symbol} digits={digitos} preco={mapa[p.symbol] ? (p.direcao === "buy" ? mapa[p.symbol].bid : mapa[p.symbol].ask) : null} />
                  <input aria-label="volume a fechar" placeholder="parcial" inputMode="decimal" value={parcial[p.id] ?? ""} onChange={(e) => setParcial((x) => ({ ...x, [p.id]: e.target.value }))} className="h-7 w-16 rounded border border-white/10 bg-black px-1 font-mono" />
                  <button onClick={() => { const v = Number((parcial[p.id] ?? "").replace(",", ".")); void onFechar(p, v > 0 ? v : null).catch(() => {}) }} className="rounded bg-white/10 px-2 py-1">Fechar</button>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TabelaOrdens({ ordens, digitos, podeNegociar, onCancelar, onModificar }: {
  ordens: OrdemWT[]; digitos: number; podeNegociar: boolean
  onCancelar: (o: OrdemWT) => Promise<unknown>
  onModificar: (o: OrdemWT, preco: number | null, sl: number | null, tp: number | null) => Promise<unknown>
}) {
  if (!ordens.length) return <p className="p-3 text-[12px] text-zinc-500">Sem ordens pendentes.</p>
  return (
    <table className="w-full min-w-[600px] text-[11.5px]">
      <thead className="text-zinc-500"><tr className="text-left"><th className="px-2 py-1">Símbolo</th><th>Tipo</th><th>Vol.</th><th>Preço</th><th>SL</th><th>TP</th><th /></tr></thead>
      <tbody>
        {ordens.map((o) => (
          <tr key={o.id} className="border-t border-white/5">
            <td className="px-2 py-1"><b>{o.symbol}</b> <span className="font-mono text-zinc-500">{o.simboloCorretora}</span></td>
            <td>{o.direcao.toUpperCase()} {o.tipo}</td>
            <td className="font-mono">{o.volume}</td>
            <td><CelulaNivel rotulo={`Preço da ordem ${o.symbol}`} valor={o.preco} digitos={digitos} podeNegociar={podeNegociar} onMudar={(v) => void onModificar(o, v, o.sl, o.tp).catch(() => {})} /></td>
            <td><CelulaNivel rotulo={`SL da ordem ${o.symbol}`} valor={o.sl} digitos={digitos} podeNegociar={podeNegociar} onMudar={(v) => void onModificar(o, o.preco, v, o.tp).catch(() => {})} /></td>
            <td><CelulaNivel rotulo={`TP da ordem ${o.symbol}`} valor={o.tp} digitos={digitos} podeNegociar={podeNegociar} onMudar={(v) => void onModificar(o, o.preco, o.sl, v).catch(() => {})} /></td>
            <td className="pr-2 text-right">{podeNegociar && <button onClick={() => void onCancelar(o).catch(() => {})} className="rounded bg-white/10 px-2 py-1">Cancelar</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TabelaHistorico({ linhas }: { linhas: NegocioWT[] }) {
  if (!linhas.length) return <p className="p-3 text-[12px] text-zinc-500">Sem negócios nos últimos 30 dias.</p>
  return (
    <table className="w-full min-w-[560px] text-[11.5px]">
      <thead className="text-zinc-500"><tr className="text-left"><th className="px-2 py-1">Quando</th><th>Símbolo</th><th>Lado</th><th>Vol.</th><th>Preço</th><th>Lucro</th><th>Estado</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id} className="border-t border-white/5">
            <td className="px-2 py-1 font-mono text-zinc-400">{l.em ? new Date(l.em).toLocaleString("pt-PT") : "—"}</td>
            <td><b>{l.symbol}</b></td>
            <td>{l.direcao?.toUpperCase() ?? "—"}</td>
            <td className="font-mono">{l.volume ?? "—"}</td>
            <td className="font-mono">{l.preco ?? "—"}</td>
            <td className={`font-mono ${(l.lucro ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{l.lucro == null ? "—" : usd(l.lucro)}</td>
            <td className="text-zinc-400">{l.estado}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
