"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Eye, AlertTriangle } from "lucide-react"
import { type MapaPrecos, estadoDaConta } from "@/lib/mtmfunded/simulado/matematica"
import { limitesDaConta, posicaoDaLinha, simbolosParaMedir } from "@/lib/mtmfunded/simulado/ordens"
import { type SimboloFicha, type PrecoVivo, pedir, ordem, usd, COR_ESTADO } from "./api"
import { usePrecos } from "./use-precos"
import FundedWatchlist from "./funded-watchlist"
import FundedGrafico from "./funded-grafico"
import FundedTicket, { type Prefill } from "./funded-ticket"
import { RascunhoProvider, useRascunho, type PedidoOrdem } from "./rascunho-ordem"
import FundedPosicoes from "./funded-posicoes"
import FundedWebhook from "./funded-webhook"

/**
 * O WEBTRADER DE UMA CONTA — cabeçalho de métricas, lista, gráfico, ticket e posições.
 *
 * A conta relê-se do servidor a cada 4 s (o motor fecha por SL/TP e executa pendentes sem o ecrã
 * saber); entre releituras, equity, margem e lucro mexem com os preços ao vivo, calculados com a
 * mesma matemática do servidor.
 */

type Estado = Awaited<ReturnType<typeof import("@/lib/mtmfunded/simulado/execucao")["estadoCompleto"]>>
type Vista = "negociar" | "mercado" | "posicoes" | "historico" | "conta"

export default function FundedTrader({ accountId, prefill, simboloInicial, alturaGrafico, onSimbolo }: {
  accountId: string
  prefill: Prefill | null
  simboloInicial: string | null
  /** Classe Tailwind da altura do gráfico (a app /webtrader usa mais ecrã). */
  alturaGrafico?: string
  /** O símbolo seleccionado — o sub-separador Scanner usa-o para abrir o mesmo par. */
  onSimbolo?: (symbol: string) => void
}) {
  const [dados, setDados] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>("negociar")
  const [simbolo, setSimbolo] = useState<SimboloFicha | null>(null)
  const [fichas, setFichas] = useState<Record<string, SimboloFicha>>({})
  const [visiveis, setVisiveis] = useState<string[]>([])
  const [volume, setVolume] = useState(0.01)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  // Um só layout montado de cada vez: duas listas escondidas pediam o catálogo e os preços em dobro.
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const f = () => setDesktop(mq.matches)
    f()
    mq.addEventListener("change", f)
    return () => mq.removeEventListener("change", f)
  }, [])
  useEffect(() => { if (!desktop && vista !== "mercado") setVisiveis([]) }, [desktop, vista])

  const recarregar = useCallback(async () => {
    try {
      const d = await pedir<Estado>(`/api/mtmfunded/simulado/ordens?accountId=${accountId}`, {}, accountId)
      setDados(d)
      setFichas((f) => ({ ...f, ...(d.simbolos as Record<string, SimboloFicha>) }))
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [accountId])

  useEffect(() => {
    setDados(null)
    recarregar()
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") recarregar() }, 4000)
    return () => clearInterval(iv)
  }, [recarregar])

  // Símbolo inicial: o do link (scanner/ideia) ou o primeiro favorito.
  useEffect(() => {
    const alvo = simboloInicial || "XAUUSD"
    fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(alvo)}&specs=1`)
      .then((r) => r.json())
      .then((d) => {
        const lista = (d.simbolos ?? []) as SimboloFicha[]
        // O link pode trazer vários candidatos (OANDA:XAUUSD → XAUUSD, …): vale o primeiro que existe.
        const escolhido = alvo.split(",").map((c) => lista.find((s) => s.symbol === c)).find(Boolean)
        if (escolhido) { setSimbolo(escolhido); setVolume(escolhido.volume_min) }
        else if (simboloInicial) setAviso({ tipo: "erro", texto: `O símbolo ${simboloInicial.split(",")[0]} não existe no MTM Funded.` })
      })
      .catch(() => {})
  }, [simboloInicial])

  useEffect(() => { if (simbolo) onSimbolo?.(simbolo.symbol) }, [simbolo?.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const selecionar = (s: SimboloFicha) => {
    setSimbolo(s)
    setFichas((f) => ({ ...f, [s.symbol]: s }))
    setVolume((v) => Math.max(s.volume_min, Math.min(v, s.volume_max)))
    setVista("negociar")
  }
  const selecionarPorNome = async (symbol: string) => {
    if (fichas[symbol]) return selecionar(fichas[symbol])
    const d = await fetch(`/api/mtmfunded/simulado/precos?symbols=${symbol}&specs=1`).then((r) => r.json()).catch(() => null)
    const s = d?.simbolos?.[0]
    if (s) selecionar(s)
  }

  // ── preços: visíveis + gráfico + posições + conversões ──
  const precisos = useMemo(() => {
    const base = new Set<string>(visiveis)
    const comClasse = Object.values(fichas)
    if (simbolo) base.add(simbolo.symbol)
    for (const p of dados?.posicoes ?? []) base.add(String(p.symbol))
    for (const o of dados?.ordens ?? []) base.add(String(o.symbol))
    const medir = simbolosParaMedir(comClasse.filter((f) => base.has(f.symbol)))
    // As conversões primeiro: sem elas o lucro de um EURJPY fica em branco.
    return [...new Set([...medir.filter((m) => !base.has(m)), ...base])].slice(0, 60)
  }, [visiveis, simbolo, dados?.posicoes, dados?.ordens, fichas])
  const { precos: vivos } = usePrecos(precisos)

  const mapa: MapaPrecos = useMemo(() => {
    const m: MapaPrecos = {}
    for (const [s, p] of Object.entries(dados?.precos ?? {})) m[s] = { symbol: s, bid: Number((p as PrecoVivo).bid), ask: Number((p as PrecoVivo).ask) }
    for (const [s, p] of Object.entries(vivos)) m[s] = { symbol: s, bid: p.bid, ask: p.ask }
    return m
  }, [dados?.precos, vivos])

  const vivo = useMemo(() => {
    if (!dados) return null
    const posicoes = dados.posicoes.map((p) => posicaoDaLinha(p))
    const e = estadoDaConta(dados.estado.saldo, dados.conta.alavancagem, posicoes, fichas, mapa)
    const l = limitesDaConta(dados.regras, dados.conta.saldoInicial, e.equity, dados.conta.ancoraDia, dados.conta.fase)
    return { ...e, limites: l }
  }, [dados, fichas, mapa])

  const podeNegociar = dados?.modo === "master" && dados?.conta.estado === "ativa"

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
  const silencioso = (p: Promise<unknown>) => p.catch(() => {})

  if (erro && !dados) return <div className="p-6 text-center text-[13px] text-rose-300">{erro}</div>
  if (!dados || !vivo) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>

  const c = dados.conta
  const precoSel = simbolo ? vivos[simbolo.symbol] : undefined
  const posSel = simbolo ? dados.posicoes.filter((p) => p.symbol === simbolo.symbol).map((p) => ({ ...posicaoDaLinha(p) })) : []
  const ordSel = simbolo ? dados.ordens.filter((o) => o.symbol === simbolo.symbol).map((o) => ({
    id: String(o.id), direcao: o.direcao, tipo: o.tipo, volume: Number(o.volume), preco: Number(o.preco),
    sl: o.sl == null ? null : Number(o.sl), tp: o.tp == null ? null : Number(o.tp),
  })) : []

  const metricas: Array<[string, string, string?]> = [
    ["Saldo", usd(vivo ? dados.estado.saldo : null)],
    ["Equity", usd(vivo.equity), vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Margem", usd(vivo.margem)],
    ["Margem livre", usd(vivo.margemLivre)],
    ["Nível margem", vivo.nivelMargemPct == null ? "—" : `${vivo.nivelMargemPct.toFixed(0)}%`],
    ["Perda diária restante", usd(vivo.limites.perdaDiariaRestante)],
    ["Perda máx. restante", usd(vivo.limites.perdaMaximaRestante)],
    ...(vivo.limites.objetivoValor ? [["Objetivo", `${vivo.limites.progressoObjetivoPct ?? 0}% de ${vivo.limites.objetivoPct}%`] as [string, string]] : []),
  ]

  // Ticket e ferramenta do gráfico enviam pelo MESMO caminho: o rascunho partilhado.
  const onEnviar = (p: PedidoOrdem) => {
    const base = { accountId, symbol: simbolo!.symbol, direcao: p.direcao, volume: p.volume, sl: p.sl, tp: p.tp, origem: p.origem, ideiaRef: p.ideiaRef }
    return p.accao === "abrir"
      ? executar("abrir", base, `${p.direcao === "buy" ? "Compra" : "Venda"} executada`)
      : executar("pendente", { ...base, tipo: p.tipo, preco: p.preco }, `${p.direcao} ${p.tipo} criada`)
  }

  const painelNegociar = simbolo && (
    <RascunhoProvider
      simbolo={simbolo} preco={precoSel} precos={mapa} volume={volume} setVolume={setVolume}
      alavancagem={c.alavancagem} margemLivre={vivo.margemLivre} onEnviar={onEnviar}
    >
      <AplicarPrefill prefill={prefill} simboloInicial={simboloInicial} />
      <div className="space-y-2">
        <FundedGrafico
          simbolo={simbolo} preco={precoSel} precos={mapa} volume={volume}
          posicoes={posSel} ordens={ordSel as any} podeNegociar={podeNegociar}
          alturaClasse={alturaGrafico}
          onModificarPosicao={(id, sl, tp) => executar("modificar", { positionId: id, sl, tp }, "SL/TP actualizados")}
          onModificarPendente={(id, preco, sl, tp) => executar("modificar_pendente", { orderId: id, preco, sl, tp }, "Ordem actualizada")}
          onFecharPosicao={(id) => silencioso(executar("fechar", { positionId: id }, "Posição fechada"))}
          onCancelarPendente={(id) => silencioso(executar("cancelar", { orderId: id }, "Ordem cancelada"))}
          onMudarSimbolo={selecionarPorNome}
        />
        {podeNegociar && <FundedTicket margemLivre={vivo.margemLivre} />}
      </div>
    </RascunhoProvider>
  )

  const posicoesPainel = (v: "posicoes" | "historico") => (
    <FundedPosicoes
      vista={v} posicoes={dados.posicoes} ordens={dados.ordens} historico={dados.historico}
      simbolos={fichas} precos={mapa} podeNegociar={podeNegociar}
      onFechar={(id, vol) => executar("fechar", { positionId: id, volume: vol }, vol ? "Fecho parcial feito" : "Posição fechada")}
      onModificar={(id, sl, tp) => executar("modificar", { positionId: id, sl, tp }, "SL/TP actualizados")}
      onCancelar={(id) => executar("cancelar", { orderId: id }, "Ordem cancelada")}
      onSelecionarSimbolo={selecionarPorNome}
    />
  )

  return (
    <div className="space-y-2 pb-4">
      {/* Cabeçalho da conta */}
      <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[11px] font-bold text-black">{c.etiqueta}</span>
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: COR_ESTADO[c.estadoCurto], background: `${COR_ESTADO[c.estadoCurto]}22` }}>{c.estadoCurto}</span>
          <span className="font-mono text-white">{String(c.login ?? "—")}</span>
          <span className="text-zinc-500">{String(c.servidor ?? "")}</span>
          {dados.modo === "investor" && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300"><Eye className="h-3 w-3" /> Só leitura (investor)</span>
          )}
        </div>
        {c.estado !== "ativa" && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2 py-1.5 text-[12px] text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Conta {c.estadoCurto} — só leitura{c.motivo ? `: ${String(c.motivo)}` : ""}.
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          {metricas.map(([k, v, cor]) => (
            <div key={k} className="flex justify-between gap-2 text-[11.5px]">
              <span className="text-zinc-500">{k}</span>
              <span className={`font-mono ${cor ?? "text-white"}`}>{v}</span>
            </div>
          ))}
        </div>
        {vivo.semPreco.length > 0 && <p className="mt-1 text-[10.5px] text-amber-300">Sem preço para {vivo.semPreco.join(", ")} — o flutuante dessas posições conta 0.</p>}
      </div>

      {prefill && (prefill.direcao || prefill.sl || prefill.tp) && (
        <div className="rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/5 px-3 py-2 text-[12px] text-zinc-200">
          {prefill.origem === "ideia_mtm" ? "Ideia MTM" : "Alerta do scanner"}: <b>{simbolo?.symbol}</b> {prefill.direcao?.toUpperCase()}
          {prefill.sl ? ` · SL ${prefill.sl}` : ""}{prefill.tp ? ` · TP ${prefill.tp}` : ""} — confirma a conta acima e o volume no ticket.
        </div>
      )}

      {aviso && (
        <div className={`rounded-lg px-3 py-2 text-[12px] ${aviso.tipo === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{aviso.texto}</div>
      )}

      {/* Separadores (telemóvel) */}
      {!desktop && <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 text-[12px]">
        {([["negociar", "Negociar"], ["mercado", "Mercado"], ["posicoes", `Posições ${dados.posicoes.length || ""}`], ["historico", "Histórico"], ["conta", "Conta"]] as [Vista, string][]).map(([v, n]) => (
          <button key={v} onClick={() => setVista(v)} className={`shrink-0 flex-1 rounded-lg px-2 py-1.5 ${vista === v ? "bg-[#D2A63C] font-semibold text-black" : "text-zinc-300"}`}>{n}</button>
        ))}
      </div>}

      {/* Telemóvel: um painel de cada vez */}
      {!desktop && <div>
        {vista === "negociar" && painelNegociar}
        {vista === "mercado" && (
          <FundedWatchlist precos={vivos} selecionado={simbolo?.symbol ?? null} onSelecionar={selecionar} onVisiveis={setVisiveis} />
        )}
        {vista === "posicoes" && posicoesPainel("posicoes")}
        {vista === "historico" && posicoesPainel("historico")}
        {vista === "conta" && <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3"><FundedWebhook accountId={accountId} podeGerir={dados.modo === "master"} /></div>}
      </div>}

      {/* Desktop: lista | gráfico+ticket, posições por baixo */}
      {desktop && <div className="grid grid-cols-[260px_1fr] gap-2">
        <div className="space-y-2">
          <FundedWatchlist precos={vivos} selecionado={simbolo?.symbol ?? null} onSelecionar={selecionar} onVisiveis={setVisiveis} />
          <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3"><FundedWebhook accountId={accountId} podeGerir={dados.modo === "master"} /></div>
        </div>
        <div className="space-y-2">
          {painelNegociar}
          {posicoesPainel("posicoes")}
          {posicoesPainel("historico")}
        </div>
      </div>}
    </div>
  )
}

/**
 * Pré-preenchimento vindo de um alerta, ideia ou «Usar este sinal» noutro ecrã: vai para o rascunho
 * (e portanto para o ticket E para o gráfico). Só no símbolo do link — trocar de símbolo depois não
 * arrasta o SL de ouro para o EURUSD.
 */
function AplicarPrefill({ prefill, simboloInicial }: { prefill: Prefill | null; simboloInicial: string | null }) {
  const k = useRascunho()
  const symbol = k.simbolo.symbol
  useEffect(() => {
    if (!prefill || !(prefill.direcao || prefill.sl || prefill.tp)) return
    if (simboloInicial && !simboloInicial.split(",").includes(symbol)) return
    k.aplicar({
      lado: prefill.direcao, sl: prefill.sl ?? null, tp: prefill.tp ?? null,
      origem: prefill.origem === "scanner" || prefill.origem === "ideia_mtm" ? prefill.origem : "manual",
      ideiaRef: prefill.ideiaRef ?? null, escolhido: Boolean(prefill.direcao),
    })
  }, [prefill, symbol]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
