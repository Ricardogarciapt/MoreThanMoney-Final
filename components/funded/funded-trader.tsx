"use client"

import dynamic from "next/dynamic"
import { semCripto, ehSimboloCripto } from "@/lib/ios-sem-cripto"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BarChart3, Bell, BookOpen, History, ListOrdered, Loader2, User, Wallet } from "lucide-react"
import { type MapaPrecos, estadoDaConta } from "@/lib/mtmfunded/simulado/matematica"
import { limitesDaConta, posicaoDaLinha, simbolosParaMedir } from "@/lib/mtmfunded/simulado/ordens"
import { type SimboloFicha, type PrecoVivo, pedir, ordem, usd } from "./api"
import { usePrecos } from "./use-precos"
import { fichaDe } from "./pre-carga"
import { assinaturaEstado, intervaloDeSondagem, juntarLeve, precisaDeEstadoCheio } from "./estado-leve"
import type { Prefill } from "./funded-ticket"
import type { PedidoOrdem } from "./rascunho-ordem"
import { corpoDoPedido } from "./pedido"
import { UmCliqueProvider } from "./um-clique"
import { useModoWebtrader } from "./modo-webtrader"
import { useAlertas } from "./funded-alertas"
import { useDiario } from "./funded-diario"
import { AvisosConta, ordensSimuladas, posicoesSimuladas, type Estado, type PainelTrader, type Trader } from "./trader-contexto"
import FundedTicket from "./funded-ticket"
import ListaPosicoes from "./lista-posicoes"
import FundedDiario from "./funded-diario"
import FundedAlertas from "./funded-alertas"
import PainelConta from "./painel-conta"
import LayoutSimples from "./layout-simples"
const LayoutPro = dynamic(() => import("./layout-pro"), { ssr: false })
const FundedEstatisticas = dynamic(() => import("./funded-estatisticas"), { ssr: false })

/**
 * O WEBTRADER DE UMA CONTA — os dados, num só sítio; a apresentação, em dois modos.
 *
 * Aqui vive tudo o que é da conta: a releitura (4 s, leve — estado-leve.ts) (o motor fecha por SL/TP, executa
 * pendentes, move trailings e fecha TPs parciais sem o ecrã saber), os preços ao vivo só dos
 * símbolos à vista, a equity/margem recalculadas a cada preço com a matemática do servidor, os
 * alertas e o diário. O modo (modo-webtrader.tsx) só escolhe COMO se mostra:
 *   · SIMPLE → layout-simples.tsx (telemóvel primeiro)
 *   · PRO    → layout-pro.tsx (painéis, multi-gráfico, atalhos)
 * Trocar de modo não relê nada e não desliga os preços.
 */

export default function FundedTrader({ accountId, prefill, simboloInicial, altura, onSimbolo }: {
  accountId: string
  prefill: Prefill | null
  simboloInicial: string | null
  /** Altura disponível para o trader (CSS), p. ex. `calc(100dvh - 52px)`. */
  altura?: string
  /** O símbolo seleccionado — o sub-separador Scanner usa-o para abrir o mesmo par. */
  onSimbolo?: (symbol: string) => void
}) {
  const [dados, setDados] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [simbolo, setSimbolo] = useState<SimboloFicha | null>(null)
  const [fichas, setFichas] = useState<Record<string, SimboloFicha>>({})
  const [visiveis, setVisiveis] = useState<string[]>([])
  const [extras, setExtras] = useState<string[]>([])
  const [volume, setVolume] = useState(0.01)
  // A ficha do símbolo inicial não veio (rede/servidor): diz-se, com «tentar outra vez» — antes
  // ficava o círculo a girar para sempre.
  const [erroSimbolo, setErroSimbolo] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [avisoSimbolo, setAvisoSimbolo] = useState<string | null>(null)
  const { modo } = useModoWebtrader()
  const alertas = useAlertas(accountId)
  const diario = useDiario(accountId)
  /** A trade cuja nota o Diário abre quando se vem do histórico (📖). */
  const [focoDiario, setFocoDiario] = useState<string | null>(null)

  /** Última resposta INTEIRA (com histórico e desempenho) — a régua da releitura leve. */
  const ultimoCheio = useRef<{ em: number; assinatura: string } | null>(null)
  const dadosRef = useRef<Estado | null>(null)

  /**
   * `cheio=false` é a sondagem: pede a versão leve e só volta a pedir a inteira quando o saldo, as
   * posições ou as pendentes mudaram (ver estado-leve.ts). Depois de uma ordem pede-se sempre inteira.
   */
  const recarregar = useCallback(async (cheio = true) => {
    try {
      const base = `/api/mtmfunded/simulado/ordens?accountId=${accountId}`
      let d = await pedir<Estado>(cheio ? base : `${base}&leve=1`, {}, accountId)
      if (d.parcial) {
        if (!dadosRef.current || precisaDeEstadoCheio(ultimoCheio.current, assinaturaEstado(d), Date.now())) {
          d = await pedir<Estado>(base, {}, accountId)
        } else {
          d = juntarLeve(dadosRef.current, d)
        }
      }
      if (!d.parcial) ultimoCheio.current = { em: Date.now(), assinatura: assinaturaEstado(d) }
      dadosRef.current = d
      setDados(d)
      setFichas((f) => {
        const novo = { ...f }
        for (const [k, v] of Object.entries(d.simbolos as Record<string, SimboloFicha>)) novo[k] = { ...v, ...f[k] }
        return novo
      })
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [accountId])

  useEffect(() => {
    setDados(null)
    dadosRef.current = null
    ultimoCheio.current = null
    void recarregar()
    // 4 s com posições/pendentes, 10 s com a conta parada; com o separador escondido não se pede nada.
    let vivo = true
    let t: ReturnType<typeof setTimeout>
    const agendar = () => {
      t = setTimeout(async () => {
        if (!vivo) return
        if (document.visibilityState !== "hidden") await recarregar(false)
        if (vivo) agendar()
      }, intervaloDeSondagem(dadosRef.current))
    }
    agendar()
    return () => { vivo = false; clearTimeout(t) }
  }, [recarregar])

  /** A ficha COM especificações (sessões incluídas) — pede-se ao catálogo se ainda não houver. */
  const obterFicha = useCallback(async (symbol: string): Promise<SimboloFicha | null> => {
    if (fichas[symbol] && fichas[symbol].sessoes !== undefined) return fichas[symbol]
    const s = await fichaDe(symbol)
    if (s) setFichas((f) => ({ ...f, [s.symbol]: s }))
    return s ?? fichas[symbol] ?? null
  }, [fichas])

  // Símbolo inicial: o do link (scanner/ideia) ou o ouro. A ficha já foi pedida pela pré-carga do
  // WebTrader (pre-carga.ts) enquanto as contas carregavam — aqui apanha-se a mesma promessa.
  useEffect(() => {
    let vivo = true
    // App iOS: nunca abre num símbolo cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
    const iosSemCripto = semCripto()
    const alvo = (iosSemCripto && simboloInicial?.split(",").some((c) => ehSimboloCripto(c)) ? null : simboloInicial) || "XAUUSD"
    // O link pode trazer vários candidatos (OANDA:XAUUSD → XAUUSD, …): vale o primeiro que existe.
    fichaDe(alvo).then(async (achado) => {
      if (!vivo) return
      let escolhido = achado
      if (escolhido && iosSemCripto && (escolhido.classe === "cripto" || ehSimboloCripto(escolhido.symbol))) {
        escolhido = await fichaDe("XAUUSD")
        if (!vivo) return
      }
      // O símbolo do link não existe no catálogo: abre no ouro e diz porquê (antes o erro ficava
      // escondido atrás dos dados da conta e o ecrã girava para sempre).
      let aviso: string | null = null
      if (!escolhido && alvo !== "XAUUSD") {
        aviso = `O símbolo ${alvo.split(",")[0]} não existe no MTM Funded — abriu o XAUUSD.`
        escolhido = await fichaDe("XAUUSD")
        if (!vivo) return
      }
      if (escolhido) { setSimbolo(escolhido); setVolume(escolhido.volume_min); setFichas((f) => ({ ...f, [escolhido.symbol]: escolhido })); setErroSimbolo(null); setAvisoSimbolo(aviso) }
      else setErroSimbolo("Não foi possível carregar o símbolo — verifica a ligação.")
    }).catch(() => { if (vivo) setErroSimbolo("Não foi possível carregar o símbolo — verifica a ligação.") })
    return () => { vivo = false }
  }, [simboloInicial, tentativa])

  useEffect(() => { if (simbolo) onSimbolo?.(simbolo.symbol) }, [simbolo?.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const selecionar = useCallback((s: SimboloFicha) => {
    setSimbolo(s)
    setFichas((f) => ({ ...f, [s.symbol]: { ...f[s.symbol], ...s } }))
    setVolume((v) => Math.max(s.volume_min, Math.min(v, s.volume_max)))
  }, [])
  const selecionarPorNome = useCallback(async (symbol: string) => {
    const s = await obterFicha(symbol)
    if (s) selecionar(s)
  }, [obterFicha, selecionar])

  // ── preços: visíveis + gráficos + posições + conversões ──
  const precisos = useMemo(() => {
    const base = new Set<string>([...visiveis, ...extras])
    if (simbolo) base.add(simbolo.symbol)
    for (const p of dados?.posicoes ?? []) base.add(String(p.symbol))
    for (const o of dados?.ordens ?? []) base.add(String(o.symbol))
    const medir = simbolosParaMedir(Object.values(fichas).filter((f) => base.has(f.symbol)))
    // As conversões primeiro: sem elas o lucro de um EURJPY fica em branco.
    return [...new Set([...medir.filter((m) => !base.has(m)), ...base])].slice(0, 60)
  }, [visiveis, extras, simbolo, dados?.posicoes, dados?.ordens, fichas])
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

  // O «feito @ preço» e os erros aparecem no aviso da negociação num clique (um-clique.tsx); aqui relê-se a conta.
  const executar = useCallback(async (accao: string, corpo: Record<string, unknown>) => {
    const r = await ordem(accao, corpo, accountId)
    void recarregar()
    return r
  }, [accountId, recarregar])
  const enviarPedido = useCallback((p: PedidoOrdem, symbol: string) => {
    const { accao, corpo } = corpoDoPedido(p, accountId, symbol)
    return executar(accao, corpo)
  }, [accountId, executar])

  if (erro && !dados) {
    return (
      <div className="space-y-2 p-6 text-center text-[13px]">
        <p className="text-rose-300">{erro}</p>
        <button type="button" onClick={() => void recarregar()} className="min-h-[44px] rounded-lg border border-white/15 px-4 text-zinc-200">Tentar outra vez</button>
      </div>
    )
  }
  if (erroSimbolo && !simbolo) {
    return (
      <div className="space-y-2 p-6 text-center text-[13px]">
        <p className="text-amber-300">{erroSimbolo}</p>
        <button type="button" onClick={() => { setErroSimbolo(null); setTentativa((n) => n + 1) }} className="min-h-[44px] rounded-lg border border-white/15 px-4 text-zinc-200">Tentar outra vez</button>
      </div>
    )
  }
  if (!dados || !vivo) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>

  const metricas: Array<[string, string, string?]> = [
    ["Saldo", usd(dados.estado.saldo)],
    ["Equity", usd(vivo.equity), vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Flutuante", usd(vivo.flutuante), vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Margem", usd(vivo.margem)],
    ["Margem livre", usd(vivo.margemLivre)],
    ["Nível margem", vivo.nivelMargemPct == null ? "—" : `${vivo.nivelMargemPct.toFixed(0)}%`],
    ["Perda diária restante", usd(vivo.limites.perdaDiariaRestante)],
    ["Perda máx. restante", usd(vivo.limites.perdaMaximaRestante)],
    ...(vivo.limites.objetivoValor ? [["Objetivo", `${vivo.limites.progressoObjetivoPct ?? 0}% de ${vivo.limites.objetivoPct}%`] as [string, string]] : []),
  ]

  const podeNegociar = dados.modo === "master" && dados.conta.estado === "ativa"

  /**
   * OS PAINÉIS DESTA CONTA — é aqui que se diz o que uma conta MTM Funded tem; o layout só arruma.
   * Sete: os três da gaveta (posições, ordens, histórico) e os quatro que só existem no simulado
   * (estatísticas com as regras da prop firm, diário, alertas e o resumo da conta).
   */
  const lista = (vista: "posicoes" | "ordens" | "historico", denso: boolean, irPara: (c: string) => void, fechar: () => void) => (
    <ListaPosicoes
      vista={vista} posicoes={dados.posicoes} ordens={dados.ordens} historico={dados.historico} simbolos={fichas} precos={mapa}
      podeNegociar={podeNegociar} denso={denso} accountId={accountId} simboloAtual={simbolo?.symbol}
      executar={executar} onSelecionarSimbolo={(x) => { void selecionarPorNome(x); fechar() }}
      onNota={(id) => { setFocoDiario(id); irPara("diario") }} notas={diario.comTrade}
    />
  )
  const paineis: PainelTrader[] = [
    { chave: "posicoes", nome: "Posições", icone: Wallet, contagem: dados.posicoes.length, principal: true, conteudo: ({ denso, irPara, fechar }) => lista("posicoes", denso, irPara, fechar) },
    { chave: "ordens", nome: "Ordens", icone: ListOrdered, contagem: dados.ordens.length, principal: true, conteudo: ({ denso, irPara, fechar }) => lista("ordens", denso, irPara, fechar) },
    { chave: "historico", nome: "Histórico", icone: History, principal: true, conteudo: ({ denso, irPara, fechar }) => lista("historico", denso, irPara, fechar) },
    {
      chave: "estatisticas", nome: "Estatísticas", icone: BarChart3,
      conteudo: () => <FundedEstatisticas accountId={accountId} equity={vivo.equity} regras={{ limites: vivo.limites, regras: dados.regras, saldoInicial: dados.conta.saldoInicial, equity: vivo.equity, diasNegociados: dados.conta.diasNegociados }} />,
    },
    {
      chave: "diario", nome: "Diário", icone: BookOpen,
      conteudo: () => <FundedDiario accountId={accountId} historico={dados.historico} podeEscrever={dados.modo === "master"} diario={diario} focoTrade={focoDiario} onFoco={setFocoDiario} />,
    },
    {
      chave: "alertas", nome: "Alertas", icone: Bell, contagem: (alertas.alertas ?? []).filter((a) => a.ativo).length,
      conteudo: () => <FundedAlertas accountId={accountId} simbolo={simbolo} preco={simbolo ? vivos[simbolo.symbol] : undefined} podeCriar={dados.modo === "master"} estado={alertas} onSelecionarSimbolo={(x) => void selecionarPorNome(x)} />,
    },
    { chave: "conta", nome: "A minha conta", icone: User, conteudo: () => <PainelConta t={t} /> },
  ]

  const t: Trader = {
    accountId, dados, vivo, mapa, vivos, fichas, simbolo, volume, setVolume, podeNegociar,
    posicoes: posicoesSimuladas(dados), ordens: ordensSimuladas(dados),
    selecionar, selecionarPorNome, obterFicha, executar, enviarPedido, setVisiveis, setExtras,
    prefill, simboloInicial, alertas, diario, metricas,
    carteira: {
      nome: dados.conta?.login ? `Conta ${String(dados.conta.login)}` : null,
      alavancagem: dados.conta.alavancagem, margemLivre: vivo.margemLivre, saldo: dados.estado.saldo,
      equity: vivo.equity, flutuante: vivo.flutuante,
    },
    alertasGrafico: (symbol) => (alertas.alertas ?? []).filter((a) => a.ativo && a.symbol === symbol).map((a) => ({ id: a.id, preco: a.preco, nota: a.nota })),
    avisos: <AvisosConta dados={dados} vivo={vivo} />,
    paineis, chavePaineis: "mtmfunded_pro_separador",
    ticket: podeNegociar ? <FundedTicket margemLivre={vivo.margemLivre} /> : (
      <p className="p-4 text-center text-[12px] text-zinc-500">{dados.modo === "investor" ? "Sessão investor — só leitura." : "Conta sem negociação."}</p>
    ),
    ferramentaGrafico: true,
  }

  return (
    <UmCliqueProvider accountId={accountId} investor={dados.modo !== "master"}>
      {/* minHeight com min(): num telemóvel deitado (~375 px de altura) 420 px obrigava a página a fazer scroll. */}
      <div className="relative flex flex-col overflow-hidden bg-[#131722] text-white" style={{ height: altura ?? "calc(100dvh - 120px)", minHeight: "min(420px, 100dvh)" }}>
        {(avisoSimbolo || erro) && (
          <p role="status" className="flex shrink-0 items-center gap-2 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
            <span className="min-w-0 flex-1 truncate">{erro ? `Sem ligação ao servidor (${erro}) — a tentar outra vez…` : avisoSimbolo}</span>
            {!erro && <button type="button" onClick={() => setAvisoSimbolo(null)} aria-label="fechar aviso" className="grid h-8 w-8 place-items-center text-amber-200/70">×</button>}
          </p>
        )}
        {modo === "pro" ? <LayoutPro t={t} /> : <LayoutSimples t={t} />}
      </div>
    </UmCliqueProvider>
  )
}
