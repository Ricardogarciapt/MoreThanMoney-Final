"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, ChevronDown, ShieldAlert, X, Settings2 } from "lucide-react"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { type ContaResumo, type SessaoConta, pedir, lerSessoes, guardarSessao, apagarSessao, usd, COR_ESTADO } from "./api"
import InstalarWebtrader from "./instalar-webtrader"
import PopoverAncorado from "./popover-contas"
import { preaquecerWebtrader } from "./pre-carga"
import { InterruptorModo, useModoWebtrader } from "./modo-webtrader"
import type { Prefill } from "./funded-ticket"
import {
  type ContaReal, COR_PLATAFORMA, apagarSessaoTL, ehRefReal, listarContasReais, lerSessoesTL, plataformaDaRef,
} from "@/components/webtrader/api-corretoras"
import { contaInicial, montarSeletor } from "@/lib/webtrader/seletor"
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
  const fecharSeletor = useCallback(() => setSeletorAberto(false), [])
  const [erro, setErro] = useState<string | null>(null)
  const [reais, setReais] = useState<ContaReal[]>([])
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
    return {
      direcao: dir === "buy" || dir === "sell" ? dir : undefined,
      sl: n(sp.get("sl")), tp: n(sp.get("tp")),
      origem: sp.get("origem") === "ideia_mtm" ? "ideia_mtm" : sp.get("origem") === "scanner" ? "scanner" : "manual",
      ideiaRef: sp.get("ref"),
    }
  }, [sp])
  const simboloInicial = useMemo(() => {
    const s = sp.get("symbol")
    return s ? candidatosDeTicker(s).join(",") : null
  }, [sp])
  // Deep link (scanner/ideia): a ficha, o primeiro preço e as velas do símbolo do link pedem-se no
  // PRIMEIRO render, antes de se saber quem é a pessoa — são públicos e é o que o ecrã vai mostrar.
  useEffect(() => {
    if (!simboloInicial) return
    preaquecerWebtrader(simboloInicial)
    void carregarFundedTrader()
  }, [simboloInicial])

  const todas = useMemo(() => montarSeletor({ funded: contas, sessoesFunded: sessoes, reais: reais as ContaReal[] }), [contas, sessoes, reais])
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
  // A altura do trader: a app própria usa o ecrã todo menos a barra; embutido na app-mobile há a navegação dela.
  const altura = contexto === "app"
    ? "calc(100dvh - 58px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
    : "calc(100dvh - 200px)"

  return (
    <div className={`mx-auto text-white ${emTrader && modo === "pro" ? "max-w-none" : "max-w-6xl"}`}>
      {/* A barra: marca, conta, modo. O aviso de conta simulada fica SEMPRE à vista (spec §1). */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d0f15] px-2 py-1.5">
        {contexto === "app" && <img src="/icon-192x192.png" alt="MTM" className="h-6 w-6 shrink-0 rounded" />}
        {todas.length > 0 && (
          <div className="relative min-w-0">
            <button ref={botaoSeletor} onClick={() => setSeletorAberto((v) => !v)} aria-expanded={seletorAberto} aria-haspopup="listbox"
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-left text-[12px]">
              {atual ? (
                <>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: atual.real ? COR_PLATAFORMA[atual.real.plataforma] : "#D2A63C" }}>{atual.etiqueta}</span>
                  {atual.real && <span className="shrink-0 text-[10px] font-bold text-rose-300">REAL</span>}
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COR_ESTADO[atual.estadoCurto] ?? "#a1a1aa" }} />
                  <span className="truncate font-mono">{atual.login ?? "—"}</span>
                  {atual.segue && <span className="hidden truncate text-[10.5px] text-[#D2A63C] sm:inline">· {nomeCurto(atual.segue)}</span>}
                  {atual.modo === "investor" && <span className="text-[10.5px] text-sky-300">investor</span>}
                </>
              ) : <span className="text-zinc-400">Escolhe uma conta</span>}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </button>
            <PopoverAncorado aberto={seletorAberto} ancora={botaoSeletor} onFechar={fecharSeletor} titulo="Escolher conta">
              <div role="listbox">
                <p className="border-b border-white/5 px-3 py-1.5 text-[10.5px] text-zinc-500">MTM Funded (simuladas) · TradeLocker e MT5 (reais)</p>
                {todas.map((t) => t.real ? (
                  <div key={t.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${t.id === ativa ? "bg-white/10" : "hover:bg-white/5"}`}>
                    <button role="option" aria-selected={t.id === ativa} disabled={Boolean(t.real.bloqueada)} title={t.real.bloqueada ?? undefined} className="flex flex-1 items-center gap-2 text-left disabled:opacity-50" onClick={() => escolher(t.id)}>
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-black" style={{ background: COR_PLATAFORMA[t.real.plataforma] }}>{t.etiqueta}</span>
                      <span className="rounded px-1.5 text-[10.5px] font-bold" style={{ color: t.real.bloqueada ? "#a1a1aa" : t.real.demo ? "#60a5fa" : "#fb7185" }}>{t.estadoCurto}</span>
                      <span className="font-mono">{t.login ?? "—"}</span>
                      <span className="ml-auto truncate text-[10.5px] text-zinc-500">{t.real.rotulo ?? t.real.servidor ?? ""}</span>
                    </button>
                    {t.real.origem === "sessao" && (
                      <button aria-label="sair" onClick={() => { apagarSessaoTL(t.id); carregar() }} className="text-zinc-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                ) : (
                  <div key={t.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${t.id === ativa ? "bg-[#D2A63C]/10" : "hover:bg-white/5"}`}>
                    <button role="option" aria-selected={t.id === ativa} className="flex flex-1 items-center gap-2 text-left" onClick={() => escolher(t.id)}>
                      <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{t.etiqueta}{t.segue ? ` · ${nomeCurto(t.segue)}` : ""}</span>
                      <span className="rounded px-1.5 text-[10.5px]" style={{ color: COR_ESTADO[t.estadoCurto] ?? "#a1a1aa" }}>{t.estadoCurto}</span>
                      <span className="font-mono">{t.login}</span>
                      {t.saldo != null && <span className="ml-auto font-mono text-zinc-400">{usd(t.equity ?? t.saldo)} $</span>}
                      {!t.propria && <span className="ml-auto text-[10.5px] text-sky-300">{t.modo}</span>}
                    </button>
                    {!t.propria && (
                      <button aria-label="sair" onClick={() => { apagarSessao(t.id); carregar() }} className="text-zinc-500"><X className="h-3.5 w-3.5" /></button>
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
          {emTrader && !ativaReal && <InterruptorModo compacto={false} />}
          <InstalarWebtrader contexto={contexto} />
        </div>
      </div>
      {emTrader && ativaReal ? (
        <p className="flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-rose-300 md:hidden">
          <ShieldAlert className="h-3 w-3 shrink-0" /> Conta REAL · ordens executadas na tua corretora
        </p>
      ) : !atual ? null : (
        <p className={`flex items-center gap-1 px-2 py-0.5 text-[10.5px] md:hidden ${avisoReal(atual?.aviso) ? "bg-emerald-500/10 font-semibold text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>
          <ShieldAlert className="h-3 w-3 shrink-0" /> {t(chaveDoAviso(atual?.aviso, true))}
        </p>
      )}

      {erro && <p className="px-2 py-1 text-[12px] text-rose-300">{erro}</p>}

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
              <span className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ color: COR_ESTADO[c.estadoCurto], background: `${COR_ESTADO[c.estadoCurto]}22` }}>{c.estadoCurto}</span>
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
