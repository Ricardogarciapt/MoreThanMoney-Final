"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, CandlestickChart, ChevronDown, ChevronUp, Eye, Info, Loader2, LogIn, ShieldAlert, Sparkles, X } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { scannersPermitidos } from "@/lib/mtmfunded/acesso"
import { type MapaPrecos, estadoDaConta } from "@/lib/mtmfunded/simulado/matematica"
import { candidatosDeTicker, limitesDaConta, posicaoDaLinha, simbolosParaMedir } from "@/lib/mtmfunded/simulado/ordens"
import { linkWebtrader, estaNaAppMobile } from "@/lib/mtmfunded/link-webtrader"
import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import {
  type ContaResumo, type PrecoVivo, type SessaoConta, type SimboloFicha,
  COR_ESTADO, SERVIDOR_FUNDED, apagarSessao, entrarComCredenciais, guardarSessao, lerSessoes, ordem, pedir, px, usd,
} from "./api"
import { usePrecos } from "./use-precos"
import { useSinaisEstudos } from "./use-sinais-estudos"
import FundedTicket from "./funded-ticket"
import FundedPosicoes from "./funded-posicoes"
import { RascunhoProvider, useRascunho, type PedidoOrdem } from "./rascunho-ordem"

/**
 * PAINEL «NEGOCIAR» AO LADO DE QUALQUER GRÁFICO DE SCANNER.
 *
 * O scanner mostra o gráfico do TradingView com os nossos estudos (Sensei, GoldKiller…); este
 * painel põe ao lado dele o essencial do WebTrader do MTM Funded — as MESMAS contas e sessões, o
 * MESMO ticket (rascunho partilhado, validação do servidor) e as posições do símbolo que se está a
 * ver. Nada é reimplementado: é o miolo do WebTrader num formato compacto.
 *
 * Duas formas:
 *  · `dock` — por baixo do gráfico (telemóvel / app-mobile), recolhível;
 *  · `lateral` — coluna à direita do gráfico no scanner-access em ecrãs largos.
 *
 * Desempenho: o scanner não pode ficar mais lento por causa disto. Recolhido, o painel não faz
 * NENHUM pedido. Aberto, só pede contas/preços enquanto está visível no ecrã (IntersectionObserver
 * — um painel com `display:none` ou fora da vista não conta) e o separador do browser está activo.
 *
 * Limite honesto: o widget gratuito do TradingView não deixa desenhar as nossas linhas arrastáveis
 * de entrada/SL/TP. Aqui os valores aparecem escritos; as linhas vivem no gráfico do Web trader
 * (e passam a aparecer no gráfico do TradingView quando a biblioteca licenciada estiver instalada).
 */

const CHAVE_ULTIMA = "mtmfunded_ultima_conta"
const CHAVE_ABERTO = "mtm_scanner_dock_aberto"

type Estado = Awaited<ReturnType<typeof import("@/lib/mtmfunded/simulado/execucao")["estadoCompleto"]>>
type ContaLista = { id: string; login: string | null; etiqueta: string; estadoCurto: string; modo: "master" | "investor"; propria: boolean }

export default function PainelNegociacaoScanner({ tvSymbol, variante = "dock" }: {
  /** O símbolo do gráfico do scanner, como o TradingView o escreve (OANDA:XAUUSD, BINANCE:BTCUSDT…). */
  tvSymbol: string
  variante?: "dock" | "lateral"
}) {
  const pathname = usePathname()
  const raiz = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(variante === "lateral")
  const [visivel, setVisivel] = useState(false)
  const nomeCurto = String(tvSymbol || "").split(":").pop() || "—"

  // O dock lembra-se de ter ficado aberto; a coluna lateral começa sempre aberta.
  useEffect(() => {
    if (variante === "lateral") return
    try { if (localStorage.getItem(CHAVE_ABERTO) === "1") setAberto(true) } catch { /* ok */ }
  }, [variante])
  const alternar = () => {
    setAberto((v) => {
      try { localStorage.setItem(CHAVE_ABERTO, v ? "0" : "1") } catch { /* ok */ }
      return !v
    })
  }

  useEffect(() => {
    const el = raiz.current
    if (!el || typeof IntersectionObserver === "undefined") { setVisivel(true); return }
    const io = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { rootMargin: "120px" })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const ativo = aberto && visivel

  return (
    <div ref={raiz} className={`rounded-xl border border-[#2962FF]/40 bg-[#0b0e14] text-white ${variante === "lateral" ? "flex max-h-[calc(100dvh-24px)] flex-col" : ""}`}>
      <button type="button" onClick={alternar} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <CandlestickChart className="h-4 w-4 shrink-0 text-[#8FA8FF]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">Negociar {nomeCurto}</span>
          <span className="block text-[10.5px] text-amber-200/80">Conta simulada educativa · MTM Funded · não é negociação real</span>
        </span>
        {aberto ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
      </button>
      {aberto && (
        <div className={`space-y-2 border-t border-white/10 p-2.5 ${variante === "lateral" ? "min-h-0 overflow-y-auto" : ""}`}>
          <Corpo tvSymbol={tvSymbol} ativo={ativo} dentroDaApp={estaNaAppMobile(pathname)} caminho={pathname || "/scanner-access"} />
        </div>
      )}
    </div>
  )
}

/** Contas + sessões (as mesmas do WebTrader) e a resolução do símbolo do scanner para o catálogo. */
function Corpo({ tvSymbol, ativo, dentroDaApp, caminho }: { tvSymbol: string; ativo: boolean; dentroDaApp: boolean; caminho: string }) {
  const [contas, setContas] = useState<ContaResumo[] | null>(null)
  const [semSessaoMtm, setSemSessaoMtm] = useState(false)
  const [sessoes, setSessoes] = useState<Record<string, SessaoConta>>({})
  const [ativa, setAtiva] = useState<string | null>(null)
  const [mostrarEntrada, setMostrarEntrada] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const ss = lerSessoes()
    setSessoes(ss)
    let lista: ContaResumo[] = []
    try {
      const d = await pedir<{ contas: ContaResumo[] }>("/api/mtmfunded/simulado/contas")
      lista = d.contas ?? []
      setSemSessaoMtm(false)
    } catch (e) {
      if ((e as { status?: number }).status === 401) setSemSessaoMtm(true)
      else setErro((e as Error).message)
    }
    setContas(lista)
    let ultima: string | null = null
    try { ultima = localStorage.getItem(CHAVE_ULTIMA) } catch { /* ok */ }
    const ids = [...lista.map((c) => c.id), ...Object.keys(ss)]
    setAtiva((a) => a && ids.includes(a) ? a : ultima && ids.includes(ultima) ? ultima : ids[0] ?? null)
  }, [])

  // As contas só se lêem quando o painel está aberto e à vista (e uma vez chega).
  useEffect(() => { if (ativo && contas == null) carregar() }, [ativo, contas, carregar])

  // Símbolo do scanner → catálogo do MTM Funded, com o MESMO mapeamento do webhook e dos links.
  const candidatos = useMemo(() => candidatosDeTicker(tvSymbol), [tvSymbol])
  const chaveSimbolo = candidatos.join(",")
  const [resolvido, setResolvido] = useState<{ chave: string; ficha: SimboloFicha | "sem" } | null>(null)
  useEffect(() => {
    if (!ativo || !chaveSimbolo || resolvido?.chave === chaveSimbolo) return
    let vivo = true
    fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(chaveSimbolo)}&specs=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        const lista = (d?.simbolos ?? []) as SimboloFicha[]
        // Vários candidatos (OANDA:XAUUSD → XAUUSD, GOLD…): vale o primeiro que existe no catálogo.
        const escolhido = chaveSimbolo.split(",").map((c) => lista.find((s) => s.symbol === c)).find(Boolean)
        setResolvido({ chave: chaveSimbolo, ficha: escolhido ?? "sem" })
      })
      .catch(() => { if (vivo) setResolvido({ chave: chaveSimbolo, ficha: "sem" }) })
    return () => { vivo = false }
  }, [ativo, chaveSimbolo, resolvido?.chave])
  const ficha = resolvido?.chave === chaveSimbolo ? resolvido.ficha : null

  const escolher = (id: string) => {
    setAtiva(id)
    setMostrarEntrada(false)
    try { localStorage.setItem(CHAVE_ULTIMA, id) } catch { /* ok */ }
  }

  const todas = useMemo<ContaLista[]>(() => {
    const out: ContaLista[] = []
    for (const c of contas ?? []) out.push({ id: c.id, login: c.mt5_login, etiqueta: c.etiqueta, estadoCurto: c.estadoCurto, modo: "master", propria: true })
    for (const s of Object.values(sessoes)) if (!out.some((o) => o.id === s.accountId)) {
      out.push({ id: s.accountId, login: s.login, etiqueta: s.etiqueta ?? "—", estadoCurto: s.estadoCurto ?? "—", modo: s.modo, propria: false })
    }
    return out
  }, [contas, sessoes])

  const linkGrafico = linkWebtrader({ symbol: tvSymbol, origem: "scanner" }, dentroDaApp)

  if (contas == null) return <div className="grid place-items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>

  return (
    <>
      {todas.length > 0 && !mostrarEntrada && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {todas.map((t) => (
            <span key={t.id} className={`flex shrink-0 items-center rounded-full border text-[11px] ${t.id === ativa ? "border-[#D2A63C] bg-[#D2A63C]/15 text-white" : "border-white/10 bg-[#0d0d0d] text-zinc-400"}`}>
              <button type="button" onClick={() => escolher(t.id)} className="flex items-center gap-1.5 py-1 pl-2.5 pr-2">
                <span className="font-bold text-[#D2A63C]">{t.etiqueta}</span>
                <span className="font-mono">{t.login ?? "—"}</span>
                {t.modo === "investor" && <span className="text-sky-300">investor</span>}
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_ESTADO[t.estadoCurto] ?? "#a1a1aa" }} />
              </button>
              {!t.propria && (
                <button type="button" aria-label="sair desta conta" onClick={() => { apagarSessao(t.id); carregar() }} className="pr-2 text-zinc-500"><X className="h-3 w-3" /></button>
              )}
            </span>
          ))}
          <button type="button" onClick={() => setMostrarEntrada(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-[#D2A63C]">
            <LogIn className="h-3.5 w-3.5" /> Entrar com credenciais
          </button>
        </div>
      )}

      {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}

      {(mostrarEntrada || todas.length === 0) ? (
        <EntradaCompacta
          semContas={todas.length === 0}
          linkLoginMtm={semSessaoMtm ? `/login?redirect=${encodeURIComponent(caminho)}` : undefined}
          onEntrar={(s) => { guardarSessao(s); setSessoes(lerSessoes()); escolher(s.accountId) }}
          onFechar={todas.length ? () => setMostrarEntrada(false) : undefined}
        />
      ) : ficha === "sem" ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[12px] text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {String(tvSymbol).split(":").pop()}: símbolo sem cotação no MTM Funded.
        </p>
      ) : ficha == null || !ativa ? (
        <div className="grid place-items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
      ) : (
        <ContaNoScanner key={`${ativa}:${ficha.symbol}`} accountId={ativa} ficha={ficha} ativo={ativo} tvSymbol={tvSymbol} dentroDaApp={dentroDaApp} />
      )}

      <Link href={linkGrafico} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2962FF]/50 bg-[#2962FF]/10 py-2 text-[12.5px] font-semibold text-[#8FA8FF] hover:bg-[#2962FF]/20">
        <CandlestickChart className="h-4 w-4" /> Abrir gráfico com linhas arrastáveis
      </Link>
    </>
  )
}

/** Uma conta a negociar o símbolo do scanner: métricas, ticket, sinal dos estudos e posições desse símbolo. */
function ContaNoScanner({ accountId, ficha, ativo, tvSymbol, dentroDaApp }: {
  accountId: string; ficha: SimboloFicha; ativo: boolean; tvSymbol: string; dentroDaApp: boolean
}) {
  const [dados, setDados] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [volume, setVolume] = useState(ficha.volume_min)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const d = await pedir<Estado>(`/api/mtmfunded/simulado/ordens?accountId=${accountId}`, {}, accountId)
      setDados(d)
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [accountId])

  // Relê a conta a cada 4 s (o motor fecha por SL/TP sem o ecrã saber) — só com o painel à vista.
  useEffect(() => {
    if (!ativo) return
    recarregar()
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") recarregar() }, 4000)
    return () => clearInterval(iv)
  }, [ativo, recarregar])

  const fichas = useMemo<Record<string, SimboloFicha>>(
    () => ({ ...((dados?.simbolos ?? {}) as Record<string, SimboloFicha>), [ficha.symbol]: ficha }),
    [dados?.simbolos, ficha],
  )

  // Preços: o símbolo do scanner + os das posições (a equity mexe com todas) + conversões.
  const precisos = useMemo(() => {
    if (!ativo) return []
    const base = new Set<string>([ficha.symbol])
    for (const p of dados?.posicoes ?? []) base.add(String(p.symbol))
    const medir = simbolosParaMedir(Object.values(fichas).filter((f) => base.has(f.symbol)))
    return [...new Set([...medir, ...base])].slice(0, 60)
  }, [ativo, ficha.symbol, dados?.posicoes, fichas])
  const { precos: vivos } = usePrecos(precisos)

  const mapa: MapaPrecos = useMemo(() => {
    const m: MapaPrecos = {}
    for (const [s, p] of Object.entries(dados?.precos ?? {})) m[s] = { symbol: s, bid: Number((p as PrecoVivo).bid), ask: Number((p as PrecoVivo).ask) }
    for (const [s, p] of Object.entries(vivos)) m[s] = { symbol: s, bid: p.bid, ask: p.ask }
    return m
  }, [dados?.precos, vivos])

  const vivo = useMemo(() => {
    if (!dados) return null
    const e = estadoDaConta(dados.estado.saldo, dados.conta.alavancagem, dados.posicoes.map((p) => posicaoDaLinha(p)), fichas, mapa)
    const l = limitesDaConta(dados.regras, dados.conta.saldoInicial, e.equity, dados.conta.ancoraDia, dados.conta.fase)
    return { ...e, limites: l }
  }, [dados, fichas, mapa])

  const executar = async (accao: string, corpo: Record<string, unknown>, sucesso: string) => {
    try {
      await ordem(accao, corpo, accountId)
      setAviso({ tipo: "ok", texto: sucesso })
      await recarregar()
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message })
      throw e
    } finally {
      setTimeout(() => setAviso(null), 4000)
    }
  }

  if (erro && !dados) return <p className="p-3 text-center text-[12px] text-rose-300">{erro}</p>
  if (!dados || !vivo) return <div className="grid place-items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>

  const c = dados.conta
  const podeNegociar = dados.modo === "master" && c.estado === "ativa"
  const preco = vivos[ficha.symbol]
  const posicoes = dados.posicoes.filter((p) => p.symbol === ficha.symbol)
  const ordens = dados.ordens.filter((o) => o.symbol === ficha.symbol)

  const onEnviar = (p: PedidoOrdem) => {
    const base = { accountId, symbol: ficha.symbol, direcao: p.direcao, volume: p.volume, sl: p.sl, tp: p.tp, origem: p.origem, ideiaRef: p.ideiaRef }
    return p.accao === "abrir"
      ? executar("abrir", base, `${p.direcao === "buy" ? "Compra" : "Venda"} executada`)
      : executar("pendente", { ...base, tipo: p.tipo, preco: p.preco }, `${p.direcao} ${p.tipo} criada`)
  }

  const metricas: Array<[string, string, string?]> = [
    ["Saldo", usd(dados.estado.saldo)],
    ["Equity", usd(vivo.equity), vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Margem livre", usd(vivo.margemLivre)],
    ["Perda diária restante", usd(vivo.limites.perdaDiariaRestante)],
  ]

  return (
    <RascunhoProvider
      simbolo={ficha} preco={preco} precos={mapa} volume={volume} setVolume={setVolume}
      alavancagem={c.alavancagem} margemLivre={vivo.margemLivre} onEnviar={onEnviar}
    >
      <div className="space-y-2">
        {/* Conta + preço vivo */}
        <div className="rounded-lg border border-white/10 bg-[#0d0d0d] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{c.etiqueta}</span>
            <span className="text-[10.5px] font-semibold" style={{ color: COR_ESTADO[c.estadoCurto] ?? "#a1a1aa" }}>{c.estadoCurto}</span>
            <span className="font-mono">{String(c.login ?? "—")}</span>
            <span className="text-zinc-500">{SERVIDOR_FUNDED}</span>
            <span className="ml-auto font-mono text-[12px]">
              <span className="text-[#EF5350]">{px(preco?.bid, ficha.digits)}</span>
              <span className="px-1 text-zinc-600">/</span>
              <span className="text-[#26A69A]">{px(preco?.ask, ficha.digits)}</span>
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {metricas.map(([k, v, cor]) => (
              <div key={k} className="flex justify-between gap-2 text-[11px]">
                <span className="text-zinc-500">{k}</span>
                <span className={`font-mono ${cor ?? "text-white"}`}>{v}</span>
              </div>
            ))}
          </div>
          {dados.modo === "investor" && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-sky-300"><Eye className="h-3 w-3" /> Só leitura (password investor).</p>}
          {c.estado !== "ativa" && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-300"><AlertTriangle className="h-3.5 w-3.5" /> Conta {c.estadoCurto} — só leitura.</p>
          )}
        </div>

        {aviso && (
          <div className={`rounded-lg px-2.5 py-1.5 text-[12px] ${aviso.tipo === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{aviso.texto}</div>
        )}

        {podeNegociar && <SinalDoEstudo symbol={ativo ? ficha.symbol : null} />}
        {podeNegociar && <FundedTicket margemLivre={vivo.margemLivre} />}
        {podeNegociar && <NiveisEDica tvSymbol={tvSymbol} dentroDaApp={dentroDaApp} />}

        <FundedPosicoes
          vista="posicoes" posicoes={posicoes} ordens={ordens} historico={[]}
          simbolos={fichas} precos={mapa} podeNegociar={podeNegociar}
          onFechar={(id, vol) => executar("fechar", { positionId: id, volume: vol }, vol ? "Fecho parcial feito" : "Posição fechada")}
          onModificar={(id, sl, tp) => executar("modificar", { positionId: id, sl, tp }, "SL/TP actualizados")}
          onCancelar={(id) => executar("cancelar", { orderId: id }, "Ordem cancelada")}
          onSelecionarSimbolo={() => {}}
        />
        {dados.posicoes.length > posicoes.length && (
          <p className="text-center text-[10.5px] text-zinc-500">+{dados.posicoes.length - posicoes.length} posição(ões) noutros símbolos — vê-as no Web trader.</p>
        )}
      </div>
    </RascunhoProvider>
  )
}

/**
 * O último sinal ACTIVO dos estudos MTM para este símbolo, oferecido como pré-preenchimento.
 * Nunca envia: põe lado/entrada/SL/TP no rascunho e o trader confirma no ticket.
 * Os estudos seguem a regra de acesso (o participante de torneio só tem o GoldKiller).
 */
function SinalDoEstudo({ symbol }: { symbol: string | null }) {
  const { user } = useAuth()
  const k = useRascunho()
  const ativos = useMemo(() => {
    const lista = scannersPermitidos(user ?? null)
    return ESTUDOS_WEBTRADER.filter((e) => lista === null || lista.some((p) => p.toLowerCase() === e.acesso.toLowerCase())).map((e) => e.chave)
  }, [user])
  const { ultimoAtivo: s } = useSinaisEstudos(symbol, ativos)
  if (!s) return null
  const d = k.simbolo.digits
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]" style={{ borderColor: `${s.estudo.cor}66`, background: `${s.estudo.cor}12` }}>
      <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: s.estudo.cor }} />
      <span className="min-w-0 flex-1">
        <b style={{ color: s.estudo.cor }}>{s.estudo.rotulo}</b>{" "}
        <span className={s.direcao === "buy" ? "text-emerald-300" : "text-rose-300"}>{s.direcao === "buy" ? "BUY" : "SELL"}</span>
        <span className="font-mono text-zinc-300"> {px(s.entrada, d)}{s.sl != null ? ` · SL ${px(s.sl, d)}` : ""}{s.tp != null ? ` · TP ${px(s.tp, d)}` : ""}</span>
      </span>
      <button
        type="button"
        onClick={() => k.aplicar({ lado: s.direcao, entrada: s.entrada, sl: s.sl, tp: s.tp, origem: "scanner", ideiaRef: s.id, escolhido: false })}
        className="shrink-0 rounded-md bg-white/10 px-2 py-1 font-semibold text-white hover:bg-white/15"
      >
        Usar este sinal
      </button>
    </div>
  )
}

/**
 * Os níveis do rascunho escritos (o gráfico do scanner não os pode desenhar) e o link para o Web
 * trader com eles já preenchidos — lá ficam as linhas arrastáveis.
 */
function NiveisEDica({ tvSymbol, dentroDaApp }: { tvSymbol: string; dentroDaApp: boolean }) {
  const k = useRascunho()
  const d = k.simbolo.digits
  const temNiveis = k.mostrar && (k.entrada != null || k.sl != null || k.tp != null)
  const link = linkWebtrader({ symbol: tvSymbol, dir: k.r.lado, sl: k.sl, tp: k.tp, origem: k.r.origem === "manual" ? "scanner" : k.r.origem, ref: k.r.ideiaRef }, dentroDaApp)
  return (
    <div className="space-y-1.5">
      {temNiveis && (
        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className="rounded-md bg-white/5 py-1"><p className="text-zinc-500">Entrada</p><p className="font-mono text-white">{px(k.entrada, d)}</p></div>
          <div className="rounded-md bg-rose-500/10 py-1"><p className="text-zinc-500">SL</p><p className="font-mono text-rose-200">{px(k.sl, d)}</p></div>
          <div className="rounded-md bg-emerald-500/10 py-1"><p className="text-zinc-500">TP</p><p className="font-mono text-emerald-200">{px(k.tp, d)}</p></div>
        </div>
      )}
      <p className="flex gap-1.5 text-[10.5px] leading-snug text-zinc-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          O gráfico do scanner (TradingView) não desenha as nossas linhas arrastáveis — os valores ficam aqui escritos.
          As linhas aparecem no gráfico do{" "}
          <Link href={temNiveis ? link : linkWebtrader({ symbol: tvSymbol, origem: "scanner" }, dentroDaApp)} className="text-[#8FA8FF] underline">Web trader</Link>
          {" "}(e no TradingView quando a biblioteca licenciada estiver instalada).
        </span>
      </p>
    </div>
  )
}

/** Login MT5-like compacto: cabe numa coluna estreita. */
function EntradaCompacta({ semContas, linkLoginMtm, onEntrar, onFechar }: {
  semContas: boolean
  linkLoginMtm?: string
  onEntrar: (s: SessaoConta) => void
  onFechar?: () => void
}) {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [aEntrar, setAEntrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setAEntrar(true); setErro(null)
    try {
      onEntrar(await entrarComCredenciais(login, password))
      setPassword("")
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setAEntrar(false)
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-2 rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5 text-[12px]">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" /> Entrar com credenciais</p>
        {onFechar && <button type="button" aria-label="fechar" onClick={onFechar} className="text-zinc-500"><X className="h-4 w-4" /></button>}
      </div>
      {semContas && (
        <p className="text-[11px] text-zinc-500">
          {linkLoginMtm
            ? "Entra com a conta MTM para veres as tuas contas simuladas, ou usa o login e a password de uma conta MTM Funded."
            : "Ainda não tens contas simuladas. Quando comprares um desafio ou entrares num torneio, a conta aparece aqui."}
        </p>
      )}
      {linkLoginMtm && (
        <a href={linkLoginMtm} className="inline-block text-[12px] font-semibold text-[#D2A63C]">Entrar com a conta MTM →</a>
      )}
      <p className="text-[10.5px] text-zinc-500">Password master negoceia; password investor só vê.</p>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="login" placeholder="Login" inputMode="numeric" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-black px-2 font-mono text-white" />
        <input aria-label="password" placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-black px-2 text-white" />
      </div>
      <p className="text-[10.5px] text-zinc-500">Servidor: {SERVIDOR_FUNDED}</p>
      {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
      <button disabled={aEntrar || !login || !password} className="flex h-9 w-full items-center justify-center rounded-lg bg-[#D2A63C] font-bold text-black disabled:opacity-40">
        {aEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
      </button>
    </form>
  )
}
