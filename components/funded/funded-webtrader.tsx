"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { semCripto, ehSimboloCripto, SIMBOLO_SEM_CRIPTO } from "@/lib/ios-sem-cripto"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, ChevronDown, ShieldAlert, X, Settings2, Pencil, Check, GripVertical, Star, Eye, EyeOff, ArrowUpDown } from "lucide-react"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { type ContaResumo, type SessaoConta, pedir, lerSessoes, guardarSessao, apagarSessao, gravarEtiqueta, lerOrdemContas, gravarOrdemContas, gravarContaFavorita, gravarFiltroContas, gravarContasOcultas, usd, COR_ESTADO, corDoEstado } from "./api"
import InstalarWebtrader from "./instalar-webtrader"
import PopoverAncorado from "./popover-contas"
import { preaquecerWebtrader } from "./pre-carga"
import { InterruptorModo, useModoWebtrader } from "./modo-webtrader"
import type { Prefill } from "./funded-ticket"
import {
  type ContaReal, COR_PLATAFORMA, apagarSessaoTL, ehRefReal, listarContasReais, lerSessoesTL, plataformaDaRef,
} from "@/components/webtrader/api-corretoras"
import { contaInicial, montarSeletor, type EntradaSeletor } from "@/lib/webtrader/seletor"
import { moverConta, ordenarEntradas } from "@/lib/webtrader/ordem-contas"
import {
  contarPorTipo, filtrarEntradas, juntarOrdemFiltrada, normalizarFiltro, temDoisTipos,
  FILTRO_POR_OMISSAO, type FiltroContas,
} from "@/lib/webtrader/filtro-contas"
import {
  alternarOculta as esconderOuRepor, aplicarOcultas, contarOcultas, estaOculta, normalizarOcultas,
} from "@/lib/webtrader/ocultar-contas"
import { useArrastoLista, type ArrastoLista } from "./use-arrasto-lista"
import { ETIQUETA_MAX, normalizarEtiqueta } from "@/lib/contas/etiqueta"
import { getAccessToken } from "@/lib/auth-token"
import type { PlataformaWT } from "@/lib/webtrader/corretoras/tipos"
import { useT } from "@/components/i18n-provider"
import { avisoReal, chaveDoAviso } from "@/lib/mtmfunded/aviso-conta"

/**
 * MTM FUNDED — WEBTRADER. Vive em dois sítios com o mesmo código:
 *  · sub-separador «Web trader» do Scanner na app-mobile (`?tab=scanner&sub=webtrader`, e o
 *    antigo `?tab=funded`) — `contexto="embutido"`;
 *  · a app própria `/webtrader`, instalável no ecrã principal — `contexto="app"`.
 *
 * Entrada à MetaTrader: as contas simuladas de quem tem sessão MTM aparecem logo; qualquer conta
 * (a própria ou a de outra pessoa, com a password investor) entra com Login + Password no servidor
 * «MTM Funded». O seletor no topo troca de conta sem sair do ecrã.
 *
 * Sem sessão MTM (e sem contas abertas neste separador) → ecrã «Entrar no WebTrader»
 * (components/webtrader/entrar-webtrader.tsx): conta MTM, Google, PrimeVerse, ou só credenciais.
 * Com sessão MTM, SINCRONIZA: MTM Funded (programas, torneios, contas que seguem estratégias) +
 * as contas reais do ligador (TradeLocker e MT5/MT4 via MetaApi) — lib/webtrader/seletor.ts.
 * Abre a última usada (localStorage) ou a primeira. Sem contas → «Ainda não tens contas ligadas».
 *
 * Contas REAIS (TradeLocker e MT5) entram no mesmo seletor, com o emblema da plataforma. Uma conta
 * real abre components/webtrader/corretora-trader.tsx, que só fala com /api/webtrader/{plataforma}/…
 * (MT5 respeita a quota MetaApi do plano). TradeLocker ligada aqui = linha do ligador de contas.
 *
 * Deep-link dos scanners e das ideias:
 *   ?tab=funded&symbol=OANDA:XAUUSD&dir=buy&sl=…&tp=…&origem=scanner|ideia_mtm&ref=<id>
 * pré-preenche o ticket — nunca envia sozinho: o trader escolhe a conta e confirma.
 */

/**
 * Código dividido (2026-09): o trader MTM Funded, o das contas reais e os ecrãs de entrada são
 * pedaços à parte — quem só vê o login não descarrega o gráfico, e quem negoceia não descarrega o
 * login. Os pedaços do trader começam a descarregar logo no primeiro render (ver `useEffect` abaixo),
 * em paralelo com as contas, por isso dividir não acrescenta espera.
 */
const carregarFundedTrader = () => import("./funded-trader")
const carregarCorretoraTrader = () => import("@/components/webtrader/corretora-trader")
const Girar = () => <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
const FundedTrader = dynamic(carregarFundedTrader, { ssr: false, loading: Girar })
const CorretoraTrader = dynamic(carregarCorretoraTrader, { ssr: false, loading: Girar })
const EntrarCredenciais = dynamic(() => import("@/components/webtrader/entrar-credenciais"), { ssr: false, loading: Girar })
const EntrarWebtrader = dynamic(() => import("@/components/webtrader/entrar-webtrader"), { ssr: false, loading: Girar })

const SERVIDOR = "MTM Funded"
const CHAVE_ULTIMA = "mtmfunded_ultima_conta"

export default function FundedWebtrader({ contexto = "embutido", onSimbolo }: {
  contexto?: "embutido" | "app"
  onSimbolo?: (symbol: string) => void
} = {}) {
  const sp = useSearchParams()
  const [contas, setContas] = useState<ContaResumo[] | null>(null)
  const [sessoes, setSessoes] = useState<Record<string, SessaoConta>>({})
  const [ativa, setAtiva] = useState<string | null>(null)
  const [mostrarEntrada, setMostrarEntrada] = useState(false)
  const [seletorAberto, setSeletorAberto] = useState(false)
  // O seletor abre num popover por portal (popover-contas.tsx): não fica por baixo nem por cima das métricas.
  const botaoSeletor = useRef<HTMLButtonElement>(null)
  // Fechar o seletor fecha também o campo da etiqueta (o campo grava o que tiver ao desmontar):
  // reabrir não volta a pôr o foco num campo que ficou pendurado.
  // Fechar o seletor sai também do MODO ORGANIZAR: ele é um modo de arrumar, não um estado em que
  // a pessoa fica — quem volta ao seletor quer trocar de conta, e vê a lista já arrumada.
  const fecharSeletor = useCallback(() => { setSeletorAberto(false); setEtiquetaEmEdicao(null); setOrganizar(false) }, [])
  const [erro, setErro] = useState<string | null>(null)
  // A etiqueta em edição no seletor (113): id da entrada, o que está escrito e o erro de gravação.
  const [etiquetaEmEdicao, setEtiquetaEmEdicao] = useState<string | null>(null)
  const [erroEtiqueta, setErroEtiqueta] = useState<string | null>(null)
  const [reais, setReais] = useState<ContaReal[]>([])
  // 122 — a ordem em que o dono arrumou as contas (arrastando) e qual delas abre primeiro.
  const [ordem, setOrdem] = useState<string[]>([])
  const [favorita, setFavorita] = useState<string | null>(null)
  // 24/09 — «As minhas» / «Mestres» / «Todas». As mestres do MTM Auto começam escondidas; só quem
  // tem contas dos dois tipos vê os botões (lib/webtrader/filtro-contas.ts).
  const [filtro, setFiltro] = useState<FiltroContas>(FILTRO_POR_OMISSAO)
  // 24/09 — as contas escondidas e o MODO ORGANIZAR (o botão do seletor). As escondidas ficam na
  // conta MTM, como a ordem; o modo é só desta abertura do seletor (lib/webtrader/ocultar-contas.ts).
  const [ocultas, setOcultas] = useState<string[]>([])
  const [organizar, setOrganizar] = useState(false)
  const [compraPermitida, setCompraPermitida] = useState(true)
  const [temSessaoMtm, setTemSessaoMtm] = useState(false)
  const [ligarPlataforma, setLigarPlataforma] = useState<PlataformaWT | null>(null)
  const { modo } = useModoWebtrader()
  const t = useT()

  const carregar = useCallback(async () => {
    const ss = lerSessoes()
    setSessoes(ss)
    let lista: ContaResumo[] = []
    // Sem token no cliente não há sessão MTM — nem se pergunta ao servidor (e uma base em baixo não
    // transforma «sem sessão» em «sem contas»).
    let sessaoMtm = Boolean(await getAccessToken().catch(() => null))
    if (sessaoMtm || Object.keys(ss).length) {
      // Há onde negociar: o código do trader e o que é público do símbolo arrancam JÁ, ao lado das contas.
      void carregarFundedTrader()
      // Com deep link, a pré-carga já saiu com o símbolo do link (efeito abaixo) — não se pede o ouro à toa.
      let temSimbolo = false
      try { temSimbolo = Boolean(new URLSearchParams(window.location.search).get("symbol")) } catch { /* ok */ }
      if (!temSimbolo) preaquecerWebtrader(null)
    }
    // Contas reais: as do ligador + as abertas no WebTrader (MT5) + sessões TradeLocker deste separador.
    let listaReais: ContaReal[] = []
    if (sessaoMtm) {
      setErro(null)
      // As duas listas em PARALELO (antes era uma depois da outra). `leve=1`: só as contas — a rota
      // deixava de ler o catálogo inteiro e a tabela de preços, que o seletor nunca usou.
      const [funded, reaisR] = await Promise.allSettled([
        pedir<{ contas: ContaResumo[] }>("/api/mtmfunded/simulado/contas?leve=1"),
        listarContasReais(),
      ])
      if (funded.status === "fulfilled") lista = funded.value.contas ?? []
      else if ((funded.reason as { status?: number }).status === 401) sessaoMtm = false
      else setErro((funded.reason as Error).message)
      // Sem contas reais não se perde o MTM Funded.
      if (sessaoMtm && reaisR.status === "fulfilled") {
        listaReais = reaisR.value.contas
        setCompraPermitida(reaisR.value.compraPermitida)
      }
    }
    // Sessões TradeLocker antigas deste separador (o WebTrader passou a ligar pelo ligador de contas).
    // Só com sessão MTM: o servidor exige o dono também nestas.
    if (sessaoMtm) listaReais = montarSeletor({ funded: [], reais: listaReais, sessoesTL: lerSessoesTL() }).map((e) => e.real!).filter(Boolean)
    setTemSessaoMtm(sessaoMtm)
    setReais(listaReais)
    setContas(lista)
    let ultima: string | null = null
    try { ultima = localStorage.getItem(CHAVE_ULTIMA) } catch { /* ok */ }
    const entradas = montarSeletor({ funded: lista, sessoesFunded: ss, reais: listaReais })
    const inicial = contaInicial(entradas, null, ultima)
    if (inicial && ehRefReal(inicial)) void carregarCorretoraTrader()
    setAtiva((a) => contaInicial(entradas, a, ultima))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // A ordem e a favorita vivem na conta MTM (seguem para o telemóvel). Sem sessão, a lista fica
  // pela ordem natural — não é erro nenhum, e não se avisa ninguém disso.
  useEffect(() => {
    let vivo = true
    void lerOrdemContas().then((r) => {
      if (!vivo) return
      setOrdem(r.ordem ?? [])
      setFavorita(r.favorita ?? null)
      setFiltro(normalizarFiltro(r.filtroContas))
      setOcultas(normalizarOcultas(r.ocultas))
    }).catch(() => undefined)
    return () => { vivo = false }
  }, [])

  /**
   * Grava a etiqueta e ACTUALIZA A LISTA no sítio, sem recarregar: o seletor fica aberto e a conta
   * escolhida não muda. `ref` das MTM Funded é `mtmfunded:<id>`; as reais já são a própria ref.
   */
  const guardarEtiqueta = async (entrada: EntradaSeletor, texto: string) => {
    const ref = entrada.real ? entrada.id : `mtmfunded:${entrada.id}`
    const antes = entrada.etiquetaDoDono ?? null
    const nova = normalizarEtiqueta(texto)
    setErroEtiqueta(null)
    setEtiquetaEmEdicao(null)
    if (nova === antes) return
    try {
      const r = await gravarEtiqueta(ref, texto)
      const gravada = r?.etiqueta ?? null
      if (entrada.real) setReais((rs) => rs.map((x) => (x.ref === ref ? { ...x, etiquetaDoDono: gravada } : x)))
      else setContas((cs) => (cs ?? []).map((c) => (c.id === entrada.id ? { ...c, etiquetaDoDono: gravada } : c)))
    } catch (e) {
      setErroEtiqueta(e instanceof Error ? e.message : "não foi possível gravar a etiqueta")
    }
  }

  /** A estrela: esta conta passa a abrir primeiro. Tocar outra vez tira a marca. */
  const alternarFavorita = async (entrada: EntradaSeletor) => {
    const marcar = favorita !== entrada.id
    setFavorita(marcar ? entrada.id : null)
    try {
      await gravarContaFavorita(marcar ? (entrada.real ? entrada.id : `mtmfunded:${entrada.id}`) : null)
    } catch (e) {
      setFavorita(favorita)
      setErroEtiqueta(e instanceof Error ? e.message : "não foi possível marcar a favorita")
    }
  }

  const escolher = (id: string) => {
    setAtiva(id)
    setSeletorAberto(false)
    setMostrarEntrada(false)
    setLigarPlataforma(null)
    try { localStorage.setItem(CHAVE_ULTIMA, id) } catch { /* ok */ }
  }

  // ── pré-preenchimento vindo de um alerta ──
  const prefill: Prefill | null = useMemo(() => {
    const dir = sp.get("dir")?.toLowerCase()
    const n = (v: string | null) => { const x = Number(v); return v && Number.isFinite(x) && x > 0 ? x : null }
    if (!sp.get("symbol") && !dir) return null
    // App iOS: um «Negociar» num par cripto não traz direção/SL/TP (abre no ouro — Apple 3.1.5(iii)).
    if (semCripto() && ehSimboloCripto(sp.get("symbol"))) return null
    return {
      direcao: dir === "buy" || dir === "sell" ? dir : undefined,
      sl: n(sp.get("sl")), tp: n(sp.get("tp")),
      origem: sp.get("origem") === "ideia_mtm" ? "ideia_mtm" : sp.get("origem") === "scanner" ? "scanner" : "manual",
      ideiaRef: sp.get("ref"),
    }
  }, [sp])
  const simboloInicial = useMemo(() => {
    const s = sp.get("symbol")
    // App iOS: ?symbol= cripto cai para o ouro (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
    if (s && semCripto() && ehSimboloCripto(s)) return SIMBOLO_SEM_CRIPTO
    return s ? candidatosDeTicker(s).join(",") : null
  }, [sp])
  // Deep link (scanner/ideia): a ficha, o primeiro preço e as velas do símbolo do link pedem-se no
  // PRIMEIRO render, antes de se saber quem é a pessoa — são públicos e é o que o ecrã vai mostrar.
  useEffect(() => {
    if (!simboloInicial) return
    preaquecerWebtrader(simboloInicial)
    void carregarFundedTrader()
  }, [simboloInicial])

  const todas = useMemo(() => {
    const entradas = montarSeletor({ funded: contas, sessoesFunded: sessoes, reais: reais as ContaReal[] })
    return ordenarEntradas(entradas.map((e) => ({ ...e, favorita: e.id === favorita })), ordem)
  }, [contas, sessoes, reais, ordem, favorita])
  /**
   * O filtro só existe para quem tem contas dos dois tipos (o dono e os educadores). A conta
   * ABERTA fica sempre na lista, mesmo que o filtro a escondesse: ninguém pode ficar a negociar
   * numa conta que não vê no seletor.
   */
  /**
   * Primeiro tiram-se as ESCONDIDAS, só depois se filtra — uma conta escondida à mão continua
   * escondida com o filtro em «Todas». No modo organizar não se esconde nada (aparecem todas,
   * esbatidas, para se poderem repor), e por isso os números do filtro também passam a contar
   * tudo: o que os botões dizem é sempre o que a lista tem.
   */
  const aVista = useMemo(() => aplicarOcultas(todas, ocultas, ativa, organizar), [todas, ocultas, ativa, organizar])
  const comFiltro = useMemo(() => temDoisTipos(aVista), [aVista])
  const contagem = useMemo(() => contarPorTipo(aVista), [aVista])
  const visiveis = useMemo(() => filtrarEntradas(aVista, filtro, ativa), [aVista, filtro, ativa])
  const quantasOcultas = useMemo(() => contarOcultas(todas, ocultas), [todas, ocultas])
  /**
   * O olho de uma linha. Grava logo (é uma decisão, não um rascunho); falhar a gravação não
   * desfaz o que a pessoa fez no ecrã — só não segue para o telemóvel, e um aviso vermelho por
   * causa de um olho era pior do que isso. A conta ABERTA não se esconde (ocultar-contas.ts).
   */
  const alternarOcultaConta = useCallback((id: string) => {
    const nova = esconderOuRepor(ocultas, id, ativa)
    setOcultas(nova)
    void gravarContasOcultas(nova).catch(() => undefined)
  }, [ocultas, ativa])
  const trocarFiltro = useCallback((novo: FiltroContas) => {
    setFiltro(novo)
    // Falhar a gravação não desfaz a escolha: o filtro vale para esta sessão à mesma, e um aviso
    // vermelho por causa de um botão de vista era pior do que ele não seguir para o telemóvel.
    void gravarFiltroContas(novo).catch(() => undefined)
  }, [])
  /**
   * Arrastar arruma JÁ na lista (o dedo manda) e grava no fim; se a gravação falhar, a ordem que
   * se vê continua a ser a que a pessoa fez — só não sobrevive ao próximo carregamento, e dizê-lo
   * num aviso vermelho a meio de um arrasto era pior do que a própria falha.
   *
   * Com o filtro ligado arrasta-se dentro do que está à vista, mas grava-se a ordem INTEIRA: as
   * contas escondidas ficam no lugar onde estavam em vez de caírem da lista guardada.
   */
  const trocarOrdem = useCallback((id: string, alvoId: string) => {
    const nova = juntarOrdemFiltrada(todas.map((t) => t.id), moverConta(visiveis, id, alvoId))
    setOrdem(nova)
    return nova
  }, [todas, visiveis])
  const gravarOrdem = useCallback((nova: string[]) => { void gravarOrdemContas(nova).catch(() => undefined) }, [])
  // No modo organizar o arrasto é imediato: o segundo de espera só existe para quem está a passar
  // o dedo pela lista à procura de uma conta, e nesse modo ninguém está.
  const arrasto = useArrastoLista(visiveis.map((t) => t.id), trocarOrdem, gravarOrdem, organizar)

  const atual = todas.find((t) => t.id === ativa)

  if (contas == null) return <Girar />

  const semContas = todas.length === 0
  // Sem conta MTM e sem nada aberto neste separador → ecrã de entrada do WebTrader.
  const ecraLogin = !temSessaoMtm && (semContas || mostrarEntrada)
  const emTrader = !(mostrarEntrada || semContas || ligarPlataforma) && Boolean(ativa)
  const aoEntrarConta = async (r: { plataforma: "mtmfunded"; sessao: SessaoConta } | { plataforma: "tradelocker" | "mt5"; ref: string }) => {
    if (r.plataforma === "mtmfunded") { guardarSessao(r.sessao); setSessoes(lerSessoes()); escolher(r.sessao.accountId); return }
    await carregar()
    escolher(r.ref)
  }
  const ativaReal = ehRefReal(ativa)
  const plataformaAtiva = ativa ? plataformaDaRef(ativa) : null
  // A altura do trader. Na app própria (/webtrader) o ecrã é uma coluna com a altura exacta do ecrã
  // (menos as safe areas, que o <main> já reserva): a barra e os avisos ficam com o que precisam e o
  // trader com o RESTO («100%» do espaço que sobra) — antes era 100dvh − 58 px à mão, que sobrava
  // 18 px no tablet/secretária (sem a linha do aviso) e cortava quando aparecia um erro.
  // Embutido na app-mobile há a navegação dela à volta.
  const app = contexto === "app"
  const altura = app ? "100%" : "calc(100dvh - 200px)"

  return (
    <div
      className={`mx-auto text-white ${emTrader && modo === "pro" ? "max-w-none" : "max-w-6xl"} ${app ? "flex flex-col" : ""}`}
      style={app ? { height: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))" } : undefined}
    >
      {/* A barra: marca, conta, modo. O aviso de conta simulada fica SEMPRE à vista (spec §1). */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0d0f15] px-2 py-1.5">
        {contexto === "app" && <img src="/icon-192x192.png" alt="MTM" className="h-6 w-6 shrink-0 rounded" />}
        {todas.length > 0 && (
          <div className="relative min-w-0">
            <button ref={botaoSeletor} onClick={() => { if (seletorAberto) fecharSeletor(); else { setErroEtiqueta(null); setSeletorAberto(true) } }} aria-expanded={seletorAberto} aria-haspopup="listbox"
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-left text-[12px]">
              {atual ? (
                <>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: atual.real ? COR_PLATAFORMA[atual.real.plataforma] : "#D2A63C" }}>{atual.etiqueta}</span>
                  {atual.real && <span className="shrink-0 text-[10px] font-bold text-rose-300">REAL</span>}
                  {atual.mestre && <span className="shrink-0 text-[10px] font-bold text-sky-300">MESTRE</span>}
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: corDoEstado(atual.estadoCurto) }} />
                  {atual.etiquetaDoDono && <span className="max-w-[120px] truncate text-[11.5px] font-semibold text-[#E9C46A]">{atual.etiquetaDoDono}</span>}
                  <span className="truncate font-mono">{atual.login ?? "—"}</span>
                  {atual.segue && <span className="hidden truncate text-[10.5px] text-[#D2A63C] sm:inline">· {nomeCurto(atual.segue)}</span>}
                  {atual.modo === "investor" && <span className="text-[10.5px] text-sky-300">investor</span>}
                </>
              ) : <span className="text-zinc-400">Escolhe uma conta</span>}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </button>
            <PopoverAncorado aberto={seletorAberto} ancora={botaoSeletor} onFechar={fecharSeletor} titulo="Escolher conta">
              <div role="listbox">
                <div data-sem-arrasto className="flex items-start gap-2 border-b border-white/5 px-3 py-1.5">
                  <p className="min-w-0 flex-1 text-[10.5px] text-zinc-500">
                    {organizar
                      ? "Arrasta pela pega (já sem esperar) e usa o olho para esconder ou repor. A conta aberta não se esconde."
                      : "MTM Funded (simuladas) · TradeLocker e MT5 (reais) — «Organizar» arruma e esconde contas, a estrela abre primeiro, o lápis dá um nome"}
                  </p>
                  {/* O modo organizar: uma decisão explícita em vez de um segundo de dedo premido. */}
                  <button type="button" aria-pressed={organizar} onClick={() => setOrganizar((v) => !v)}
                    title={organizar ? "Sair do modo organizar" : "Arrumar e esconder contas"}
                    className={`flex min-h-[28px] shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors [@media(pointer:coarse)]:min-h-[36px] ${
                      organizar ? "bg-[#D2A63C] text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}>
                    {organizar ? <Check className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                    {organizar ? "Concluído" : "Organizar"}
                    {/* Fora do modo, o número diz que há contas escondidas — senão elas desapareciam sem explicação. */}
                    {!organizar && quantasOcultas > 0 && <span className="text-zinc-600">{quantasOcultas} oculta{quantasOcultas === 1 ? "" : "s"}</span>}
                  </button>
                </div>
                {comFiltro && <BarraFiltro filtro={filtro} contagem={contagem} escolher={trocarFiltro} />}
                {erroEtiqueta && <p className="border-b border-white/5 px-3 py-1.5 text-[10.5px] text-rose-300">{erroEtiqueta}</p>}
                {visiveis.map((t) => t.real ? (
                  <div key={t.id} data-conta-id={t.id} className={`flex min-h-[44px] items-center gap-1.5 px-3 py-1 text-[12.5px] ${organizar && estaOculta(ocultas, t.id) ? "opacity-40" : ""} ${arrasto.aArrastar === t.id ? "bg-white/15 opacity-70" : t.id === ativa ? "bg-white/10" : "hover:bg-white/5"}`}>
                    <Pega id={t.id} arrasto={arrasto} />
                    {organizar && <Olho oculta={estaOculta(ocultas, t.id)} aberta={t.id === ativa} alternar={() => alternarOcultaConta(t.id)} />}
                    <button role="option" aria-selected={t.id === ativa} disabled={Boolean(t.real.bloqueada)} title={t.real.bloqueada ?? undefined} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50" onClick={() => escolher(t.id)}>
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: COR_PLATAFORMA[t.real.plataforma] }}>{t.etiqueta}</span>
                      <span className="rounded px-1.5 text-[10.5px] font-bold" style={{ color: corDoEstado(t.estadoCurto) }}>{t.estadoCurto}</span>
                      <span className="font-mono">{t.login ?? "—"}</span>
                      {t.etiquetaDoDono
                        ? <span className="ml-auto max-w-[130px] truncate text-[11px] font-semibold text-[#E9C46A]" title={t.etiquetaDoDono}>{t.etiquetaDoDono}</span>
                        : <span className="ml-auto truncate text-[10.5px] text-zinc-500">{t.real.rotulo ?? t.real.servidor ?? ""}</span>}
                    </button>
                    {t.podeEtiquetar && <Estrela marcada={favorita === t.id} alternar={() => void alternarFavorita(t)} />}
                    <CampoEtiqueta
                      entrada={t}
                      aEditar={etiquetaEmEdicao === t.id}
                      abrir={() => setEtiquetaEmEdicao(t.id)}
                      fechar={() => setEtiquetaEmEdicao(null)}
                      gravar={(texto) => void guardarEtiqueta(t, texto)}
                    />
                    {t.real.origem === "sessao" && (
                      <button type="button" aria-label="Sair desta conta" title="Sair desta conta" onClick={() => { apagarSessaoTL(t.id); void carregar() }} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                ) : (
                  <div key={t.id} data-conta-id={t.id} className={`flex min-h-[44px] items-center gap-1.5 px-3 py-1 text-[12.5px] ${organizar && estaOculta(ocultas, t.id) ? "opacity-40" : ""} ${arrasto.aArrastar === t.id ? "bg-white/15 opacity-70" : t.id === ativa ? "bg-[#D2A63C]/10" : "hover:bg-white/5"}`}>
                    <Pega id={t.id} arrasto={arrasto} />
                    {organizar && <Olho oculta={estaOculta(ocultas, t.id)} aberta={t.id === ativa} alternar={() => alternarOcultaConta(t.id)} />}
                    <button role="option" aria-selected={t.id === ativa} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-left" onClick={() => escolher(t.id)}>
                      <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{t.etiqueta}{t.segue ? ` · ${nomeCurto(t.segue)}` : ""}</span>
                      {/* A mestre diz-se na própria linha: em «As minhas» só aparece a que está aberta, e tem de se perceber porquê. */}
                      {t.mestre && <span className="shrink-0 rounded border border-sky-400/40 px-1 text-[9.5px] font-bold text-sky-300">MESTRE</span>}
                      <span className="rounded px-1.5 text-[10.5px]" style={{ color: corDoEstado(t.estadoCurto) }}>{t.estadoCurto}</span>
                      <span className="font-mono">{t.login}</span>
                      {t.etiquetaDoDono && <span className="max-w-[120px] truncate text-[11px] font-semibold text-[#E9C46A]" title={t.etiquetaDoDono}>{t.etiquetaDoDono}</span>}
                      {t.saldo != null && <span className="ml-auto font-mono text-zinc-400">{usd(t.equity ?? t.saldo)} $</span>}
                      {!t.propria && <span className="ml-auto text-[10.5px] text-sky-300">{t.modo}</span>}
                    </button>
                    {t.propria && <Estrela marcada={favorita === t.id} alternar={() => void alternarFavorita(t)} />}
                    <CampoEtiqueta
                      entrada={t}
                      aEditar={etiquetaEmEdicao === t.id}
                      abrir={() => setEtiquetaEmEdicao(t.id)}
                      fechar={() => setEtiquetaEmEdicao(null)}
                      gravar={(texto) => void guardarEtiqueta(t, texto)}
                    />
                    {!t.propria && (
                      <button type="button" aria-label="Sair desta conta" title="Sair desta conta" onClick={() => { apagarSessao(t.id); void carregar() }} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => { setMostrarEntrada(true); setSeletorAberto(false) }} className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-[12.5px] text-[#D2A63C]">
                  <LogIn className="h-4 w-4" /> {temSessaoMtm ? "Ligar ou entrar noutra conta" : "Entrar com a conta MTM ou credenciais"}
                </button>
                {temSessaoMtm && (
                  <a href="/member-area/contas" className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-[12.5px] text-zinc-400 hover:text-white">
                    <Settings2 className="h-4 w-4" /> Gerir contas ligadas
                  </a>
                )}
              </div>
            </PopoverAncorado>
          </div>
        )}
        {emTrader && ativaReal ? (
          <span className="hidden min-w-0 items-center gap-1 truncate text-[10.5px] font-semibold text-rose-300 md:flex">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Conta REAL · as ordens são executadas na tua corretora
          </span>
        ) : !atual ? null : (
          // O aviso diz o ponto do caminho da conta ACTIVA (avaliação, Funded, análise…) — lib/mtmfunded/aviso-conta.ts.
          // Sem conta aberta (ecrã de entrada) não há nada para avisar.
          <span className={`hidden min-w-0 items-center gap-1 truncate text-[10.5px] md:flex ${avisoReal(atual?.aviso) ? "font-semibold text-emerald-300" : "text-amber-200/90"}`}>
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {t(chaveDoAviso(atual?.aviso))}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* O SIMPLE/PRO já vale para as contas reais: desenham-se com os mesmos layouts. */}
          {emTrader && <InterruptorModo compacto={false} />}
          <InstalarWebtrader contexto={contexto} />
        </div>
      </div>
      {emTrader && ativaReal ? (
        <p className="flex shrink-0 items-center gap-1 bg-rose-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-rose-300 md:hidden">
          <ShieldAlert className="h-3 w-3 shrink-0" /> Conta REAL · ordens executadas na tua corretora
        </p>
      ) : !atual ? null : (
        <p className={`flex shrink-0 items-center gap-1 px-2 py-0.5 text-[10.5px] md:hidden ${avisoReal(atual?.aviso) ? "bg-emerald-500/10 font-semibold text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>
          <ShieldAlert className="h-3 w-3 shrink-0" /> {t(chaveDoAviso(atual?.aviso, true))}
        </p>
      )}

      {erro && <p className="shrink-0 px-2 py-1 text-[12px] text-rose-300">{erro}</p>}

      <div className={app ? "flex min-h-0 flex-1 flex-col overflow-y-auto" : undefined}>
      {ecraLogin ? (
        <EntrarWebtrader
          compraPermitida={compraPermitida}
          onFechar={semContas ? undefined : () => setMostrarEntrada(false)}
          onEntrouMtm={async () => { setMostrarEntrada(false); setContas(null); await carregar() }}
          onEntrouConta={aoEntrarConta}
        />
      ) : ligarPlataforma || (semContas && !mostrarEntrada) ? (
        <SemContas
          plataforma={ligarPlataforma}
          onPlataforma={setLigarPlataforma}
          formulario={ligarPlataforma && (
            <EntrarCredenciais
              key={ligarPlataforma}
              titulo={ligarPlataforma === "mtmfunded" ? "Entrar numa conta MTM Funded" : "Ligar conta"}
              plataformaInicial={ligarPlataforma}
              temSessaoMtm={temSessaoMtm}
              compraPermitida={compraPermitida}
              onFechar={() => setLigarPlataforma(null)}
              onEntrou={aoEntrarConta}
            />
          )}
        />
      ) : mostrarEntrada ? (
        <div className="p-2">
          <Entrada
            contas={contas}
            onEscolher={escolher}
            onFechar={() => setMostrarEntrada(false)}
            formulario={
              <EntrarCredenciais
                titulo="Ligar ou entrar noutra conta"
                temSessaoMtm={temSessaoMtm}
                compraPermitida={compraPermitida}
                onEntrou={aoEntrarConta}
              />
            }
          />
        </div>
      ) : ativa && ativaReal && plataformaAtiva ? (
        <CorretoraTrader key={ativa} contaRef={ativa} plataforma={plataformaAtiva} prefill={prefill} simboloInicial={simboloInicial} altura={altura} compraPermitida={compraPermitida} />
      ) : ativa ? (
        <FundedTrader key={ativa} accountId={ativa} prefill={prefill} simboloInicial={simboloInicial} onSimbolo={onSimbolo} altura={altura} />
      ) : null}
      </div>
    </div>
  )
}

/**
 * A ETIQUETA DE UMA CONTA no seletor (113) — lápis fechado, campo aberto.
 *
 * Fechado: o lápis, e a etiqueta em dourado quando existe. Aberto: um campo de 40 caracteres que
 * grava com Enter ou ao sair, e desiste com Esc. Vazio apaga a etiqueta (é opcional).
 *
 * `podeEtiquetar` falso = conta sem linha na base (sessão TradeLocker do separador) ou de outra
 * pessoa (ligada com a password investor): nem lápis, nem campo.
 */
/**
 * A pega de arrastar. É ela que recebe o gesto (e não a linha inteira): assim tocar na conta
 * continua a ESCOLHER a conta, que é o que 99% dos toques quer fazer.
 *
 * `touch-action: none` é obrigatório — sem isso o telemóvel trata o gesto como scroll da lista e
 * o arrasto nunca chega a começar.
 */
/**
 * OS TRÊS BOTÕES DO FILTRO — «As minhas», «Mestres», «Todas» (pedido do dono, 24/09).
 *
 * Só se desenha a quem tem contas dos DOIS tipos (`temDoisTipos`): a toda a gente menos ao dono e
 * aos educadores, esta barra seria um botão «As minhas» sem alternativa nenhuma.
 *
 * O número ao lado de cada nome é o que lá está — é ele que responde a «e as mestres, sumiram?»
 * sem obrigar ninguém a carregar para ver. `radiogroup` porque é uma escolha de um entre três, e
 * é assim que um leitor de ecrã o anuncia.
 */
function BarraFiltro({ filtro, contagem, escolher }: {
  filtro: FiltroContas
  contagem: { minhas: number; mestres: number; todas: number }
  escolher: (f: FiltroContas) => void
}) {
  const botoes: Array<{ chave: FiltroContas; nome: string; quantas: number }> = [
    { chave: "minhas", nome: "As minhas", quantas: contagem.minhas },
    { chave: "mestres", nome: "Mestres", quantas: contagem.mestres },
    { chave: "todas", nome: "Todas", quantas: contagem.todas },
  ]
  return (
    <div role="radiogroup" aria-label="Que contas mostrar" data-sem-arrasto
      className="flex items-center gap-1 border-b border-white/5 px-3 py-1.5">
      {botoes.map((b) => {
        const premido = filtro === b.chave
        return (
          <button key={b.chave} type="button" role="radio" aria-checked={premido} onClick={() => escolher(b.chave)}
            className={`min-h-[28px] rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              premido ? "bg-[#D2A63C] text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}>
            {b.nome} <span className={premido ? "text-black/60" : "text-zinc-600"}>{b.quantas}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * O OLHO DE ESCONDER, só no modo organizar (pedido do dono, 24/09).
 *
 * Esconder não é apagar: a conta continua ligada, continua a negociar-se, só deixa de ocupar uma
 * linha no seletor de quem não a usa. Por isso o olho fechado fica SEMPRE à vista aqui dentro — é
 * por ele que se repõe a conta, e uma coisa que se esconde sem forma de voltar não se experimenta.
 *
 * Na conta ABERTA o olho está desligado, com o porquê no título: ninguém pode ficar a negociar
 * numa conta que não vê no seletor (é a mesma regra do filtro, lib/webtrader/filtro-contas.ts).
 */
function Olho({ oculta, aberta, alternar }: { oculta: boolean; aberta: boolean; alternar: () => void }) {
  // Oculta e aberta ao mesmo tempo (escondeu-se e depois abriu-se): repor continua a poder fazer-se.
  const travado = aberta && !oculta
  return (
    <button type="button" data-sem-arrasto disabled={travado} aria-pressed={oculta}
      aria-label={oculta ? "Voltar a mostrar esta conta" : "Esconder esta conta do seletor"}
      title={travado ? "A conta aberta não se esconde" : oculta ? "Voltar a mostrar (esconder não apaga nada)" : "Esconder do seletor — volta por aqui"}
      onClick={alternar}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
      {oculta ? <EyeOff className="h-4 w-4 text-zinc-500" /> : <Eye className="h-4 w-4 text-[#D2A63C]" />}
    </button>
  )
}

/** A estrela da conta favorita — a mesma nas MTM Funded e nas reais (o seletor mistura-as). */
function Estrela({ marcada, alternar }: { marcada: boolean; alternar: () => void }) {
  return (
    <button type="button" aria-label={marcada ? "Tirar dos favoritos" : "Marcar como favorita"} aria-pressed={marcada}
      title={marcada ? "Favorita — é esta que abre" : "Marcar como favorita"} onClick={alternar}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-white/5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
      <Star className={`h-4 w-4 ${marcada ? "fill-[#D2A63C] text-[#D2A63C]" : "text-zinc-600"}`} />
    </button>
  )
}

function Pega({ id, arrasto }: { id: string; arrasto: ArrastoLista }) {
  const aEsperar = arrasto.aEsperar === id
  return (
    <span
      role="button"
      aria-label={arrasto.imediato ? "Arrastar para arrumar" : "Manter premido para arrumar"}
      title={arrasto.imediato ? "Arrasta para mudar a conta de lugar" : "Manter premido 1 segundo para arrastar"}
      onPointerDown={(e) => arrasto.aoPegar(e, id)}
      // `pan-y` e não `none`: enquanto se espera pelo segundo, o dedo ainda pode fazer SCROLL da
      // lista (era isso que estava a trocar contas por engano). Depois de a linha levantar, o
      // `preventDefault` no movimento é que segura o gesto.
      // No MODO ORGANIZAR é `none`: não há espera para proteger, e deixar o scroll ligado roubava
      // o gesto ao arrasto a meio (era o que obrigava ao segundo parado).
      style={{ touchAction: arrasto.imediato ? "none" : "pan-y" }}
      className={`grid h-8 w-6 shrink-0 cursor-grab place-items-center transition-colors active:cursor-grabbing [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8 ${
        aEsperar ? "animate-pulse text-[#D2A63C]" : arrasto.imediato ? "text-[#D2A63C]" : "text-zinc-600 hover:text-zinc-300"
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </span>
  )
}

function CampoEtiqueta({ entrada, aEditar, abrir, fechar, gravar }: {
  entrada: EntradaSeletor
  aEditar: boolean
  abrir: () => void
  fechar: () => void
  gravar: (texto: string) => void
}) {
  const [texto, setTexto] = useState(entrada.etiquetaDoDono ?? "")
  // Uma edição grava UMA vez: Enter, ✓, sair do campo ou fechar o seletor — o que vier primeiro.
  // (Enter desmonta o campo e alguns browsers ainda disparam o blur; o ✓ no toque também.)
  const sessao = useRef({ texto: "", terminada: true })
  sessao.current.texto = texto
  const terminar = useCallback((gravarTexto: boolean) => {
    if (sessao.current.terminada) return
    sessao.current.terminada = true
    if (gravarTexto) gravar(sessao.current.texto)
    else fechar()
  }, [gravar, fechar])
  useEffect(() => {
    if (!aEditar) return
    setTexto(entrada.etiquetaDoDono ?? "")
    sessao.current = { texto: entrada.etiquetaDoDono ?? "", terminada: false }
    // O seletor fechou (toque fora, trocar de conta) com o campo aberto: o que se escreveu grava-se,
    // como ao sair do campo — não se perde em silêncio.
    return () => { if (!sessao.current.terminada) { sessao.current.terminada = true; gravar(sessao.current.texto) } }
  }, [aEditar]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!entrada.podeEtiquetar) return null

  // Alvos de 44 px no toque; no rato ficam compactos. O campo tem 16 px no toque — abaixo disso o
  // iPhone faz zoom ao focar, e o zoom fazia scroll da página (ver popover-contas.tsx).
  const alvo = "grid h-8 w-8 shrink-0 place-items-center rounded-md [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
  if (aEditar) {
    return (
      <span className="flex items-center gap-1" data-sem-arrasto>
        <input
          autoFocus
          value={texto}
          maxLength={ETIQUETA_MAX}
          placeholder="etiqueta"
          aria-label="Etiqueta da conta"
          enterKeyHint="done"
          onChange={(e) => setTexto(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => terminar(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); terminar(true) }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); terminar(false) }
          }}
          className="h-8 w-32 rounded border border-[#D2A63C]/40 bg-black/60 px-1.5 text-[16px] text-white placeholder:text-zinc-600 [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:text-[11px]"
        />
        {/* No toque não há blur antes do clique: este botão grava o que está escrito. */}
        <button type="button" aria-label="Guardar etiqueta" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); terminar(true) }} className={`${alvo} text-[#D2A63C]`}>
          <Check className="h-4 w-4" />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-label={entrada.etiquetaDoDono ? `Mudar a etiqueta (${entrada.etiquetaDoDono})` : "Pôr uma etiqueta nesta conta"}
      title={entrada.etiquetaDoDono ? "Mudar a etiqueta" : "Pôr uma etiqueta"}
      onClick={(e) => { e.stopPropagation(); abrir() }}
      className={`${alvo} text-zinc-500 hover:bg-white/5 hover:text-[#D2A63C]`}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

/** «MTM Auto Aurum Flow» → «Aurum Flow»: na ficha só cabe o que distingue. */
function nomeCurto(nome: string) {
  return nome.replace(/^MTM Auto\s+/i, "").trim() || nome
}

/** Ecrã de entrada: as contas MTM Funded da pessoa + «Entrar com credenciais» (três plataformas). */
function Entrada({ contas, onEscolher, onFechar, formulario }: {
  contas: ContaResumo[]
  onEscolher: (id: string) => void
  onFechar?: () => void
  formulario: React.ReactNode
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold">As tuas contas MTM Funded</p>
          {onFechar && <button onClick={onFechar} className="text-zinc-500"><X className="h-4 w-4" /></button>}
        </div>
        {contas.length === 0 && <p className="text-[12px] text-zinc-500">Ainda não tens contas simuladas. Quando comprares um desafio ou entrares num torneio, a conta aparece aqui.</p>}
        <div className="space-y-2">
          {contas.map((c) => (
            <button key={c.id} onClick={() => onEscolher(c.id)} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5 text-left text-[12px] hover:border-[#D2A63C]/40">
              <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{c.etiqueta}{c.segueEstrategia ? ` · segue ${nomeCurto(c.segueEstrategia.nome)}` : ""}</span>
              <span className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ color: corDoEstado(c.estadoCurto), background: `${corDoEstado(c.estadoCurto)}22` }}>{c.estadoCurto}</span>
              <div className="min-w-0">
                <p className="font-mono text-white">{c.mt5_login ?? "—"}</p>
                <p className="text-[10.5px] text-zinc-500">{c.servidor ?? SERVIDOR}{c.programa?.nome ? ` · ${c.programa.nome}` : ""}</p>
              </div>
              <div className="ml-auto text-right font-mono">
                <p className="text-white">{usd(c.sim_saldo)} $</p>
                <p className="text-[10.5px] text-zinc-500">equity {usd(c.sim_equity)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      {formulario}
    </div>
  )
}

/** «Ainda não tens contas ligadas» — ligar TradeLocker / MT5 / MTM Funded aqui mesmo, ou no ligador. */
function SemContas({ plataforma, onPlataforma, formulario }: {
  plataforma: PlataformaWT | null
  onPlataforma: (p: PlataformaWT | null) => void
  formulario: React.ReactNode
}) {
  const opcoes: Array<{ p: PlataformaWT; nome: string; texto: string }> = [
    { p: "tradelocker", nome: "TradeLocker", texto: "A tua conta da corretora, negociada aqui" },
    { p: "mt5", nome: "MT5", texto: "MetaTrader 5 da tua corretora" },
    { p: "mtmfunded", nome: "MTM Funded", texto: "Conta simulada (login 77xxxxxx)" },
  ]
  return (
    <div className="mx-auto w-full max-w-md space-y-3 px-3 py-6 text-white">
      {!plataforma && (
        <div className="text-center">
          <p className="text-[17px] font-bold">Ainda não tens contas ligadas</p>
          <p className="mt-1 text-[12.5px] text-zinc-400">Liga uma conta para negociar no WebTrader. Fica também em «As minhas contas».</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {opcoes.map((o) => (
          <button key={o.p} onClick={() => onPlataforma(plataforma === o.p ? null : o.p)} aria-pressed={plataforma === o.p}
            className={`rounded-xl border p-2.5 text-left ${plataforma === o.p ? "border-white/40 bg-white/10" : "border-white/10 bg-[#0d0f15] hover:border-white/25"}`}>
            <span className="block text-[12.5px] font-bold" style={{ color: COR_PLATAFORMA[o.p] }}>{o.nome}</span>
            <span className="mt-0.5 block text-[10.5px] leading-tight text-zinc-500">{o.texto}</span>
          </button>
        ))}
      </div>
      {formulario}
      <p className="text-center text-[12px]">
        <a href="/member-area/contas" className="font-semibold text-[#D2A63C]">Gerir em «As minhas contas» →</a>
      </p>
    </div>
  )
}
