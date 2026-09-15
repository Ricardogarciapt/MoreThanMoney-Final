"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, ChevronDown, ShieldAlert, X } from "lucide-react"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { type ContaResumo, type SessaoConta, pedir, lerSessoes, guardarSessao, apagarSessao, usd, COR_ESTADO } from "./api"
import FundedTrader from "./funded-trader"
import InstalarWebtrader from "./instalar-webtrader"
import { InterruptorModo, useModoWebtrader } from "./modo-webtrader"
import type { Prefill } from "./funded-ticket"
import CorretoraTrader from "@/components/webtrader/corretora-trader"
import EntrarCredenciais from "@/components/webtrader/entrar-credenciais"
import {
  type ContaReal, COR_PLATAFORMA, NOME_PLATAFORMA, apagarSessaoTL, ehRefReal, listarContasReais, lerSessoesTL, plataformaDaRef,
} from "@/components/webtrader/api-corretoras"

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
 * Contas REAIS (TradeLocker e MT5) entram no mesmo seletor, com o emblema da plataforma: as já
 * ligadas no ligador de contas aparecem sozinhas; «Entrar com credenciais» tem o seletor
 * MTM Funded · TradeLocker · MT5. Uma conta real abre components/webtrader/corretora-trader.tsx,
 * que só fala com /api/webtrader/{plataforma}/… (MT5 respeita a quota MetaApi do plano).
 *
 * Deep-link dos scanners e das ideias:
 *   ?tab=funded&symbol=OANDA:XAUUSD&dir=buy&sl=…&tp=…&origem=scanner|ideia_mtm&ref=<id>
 * pré-preenche o ticket — nunca envia sozinho: o trader escolhe a conta e confirma.
 */

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
  const [erro, setErro] = useState<string | null>(null)
  const [reais, setReais] = useState<ContaReal[]>([])
  const [compraPermitida, setCompraPermitida] = useState(true)
  const [temSessaoMtm, setTemSessaoMtm] = useState(false)
  const { modo } = useModoWebtrader()

  const carregar = useCallback(async () => {
    const ss = lerSessoes()
    setSessoes(ss)
    let lista: ContaResumo[] = []
    let sessaoMtm = true
    try {
      const d = await pedir<{ contas: ContaResumo[] }>("/api/mtmfunded/simulado/contas")
      lista = d.contas ?? []
    } catch (e) {
      if ((e as { status?: number }).status === 401) sessaoMtm = false
      else setErro((e as Error).message)
    }
    // Contas reais: as do ligador + as abertas no WebTrader (MT5) + sessões TradeLocker deste separador.
    let listaReais: ContaReal[] = []
    if (sessaoMtm) {
      try {
        const r = await listarContasReais()
        listaReais = r.contas
        setCompraPermitida(r.compraPermitida)
      } catch { /* sem contas reais não se perde o MTM Funded */ }
    }
    for (const s of Object.values(lerSessoesTL())) {
      if (!listaReais.some((c) => c.ref === s.ref)) listaReais.push({ ref: s.ref, plataforma: "tradelocker", rotulo: s.rotulo ?? null, login: s.login, servidor: s.servidor, demo: s.demo, real: true, bloqueada: null, origem: "sessao" })
    }
    setTemSessaoMtm(sessaoMtm)
    setReais(listaReais)
    setContas(lista)
    let ultima: string | null = null
    try { ultima = localStorage.getItem(CHAVE_ULTIMA) } catch { /* ok */ }
    const ids = [...lista.map((c) => c.id), ...Object.keys(ss), ...listaReais.filter((c) => !c.bloqueada).map((c) => c.ref)]
    setAtiva((a) => a && ids.includes(a) ? a : ultima && ids.includes(ultima) ? ultima : ids[0] ?? null)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const escolher = (id: string) => {
    setAtiva(id)
    setSeletorAberto(false)
    setMostrarEntrada(false)
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

  const todas = useMemo(() => {
    const out: Array<{ id: string; login: string | null; etiqueta: string; estadoCurto: string; modo: "master" | "investor"; saldo?: number | null; equity?: number | null; propria: boolean; segue?: string | null; real?: ContaReal }> = []
    for (const c of contas ?? []) out.push({ id: c.id, login: c.mt5_login, etiqueta: c.etiqueta, estadoCurto: c.estadoCurto, modo: "master", saldo: c.sim_saldo, equity: c.sim_equity, propria: true, segue: c.segueEstrategia?.nome ?? null })
    for (const s of Object.values(sessoes)) if (!out.some((o) => o.id === s.accountId)) {
      out.push({ id: s.accountId, login: s.login, etiqueta: s.etiqueta ?? "—", estadoCurto: s.estadoCurto ?? "—", modo: s.modo, propria: false })
    }
    for (const r of reais) {
      out.push({ id: r.ref, login: r.login, etiqueta: NOME_PLATAFORMA[r.plataforma], estadoCurto: r.bloqueada ? "Bloqueada" : r.demo ? "Demo" : "Real", modo: "master", propria: r.origem !== "sessao", real: r })
    }
    return out
  }, [contas, sessoes, reais])
  const atual = todas.find((t) => t.id === ativa)

  if (contas == null) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>

  const emTrader = !(mostrarEntrada || todas.length === 0) && Boolean(ativa)
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
            <button onClick={() => setSeletorAberto((v) => !v)} aria-expanded={seletorAberto} aria-haspopup="listbox"
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
            {seletorAberto && (
              <div role="listbox" className="absolute left-0 z-[950] mt-1 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
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
                  <LogIn className="h-4 w-4" /> Entrar com credenciais
                </button>
              </div>
            )}
          </div>
        )}
        {emTrader && ativaReal ? (
          <span className="hidden min-w-0 items-center gap-1 truncate text-[10.5px] font-semibold text-rose-300 md:flex">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Conta REAL · as ordens são executadas na tua corretora
          </span>
        ) : (
          <span className="hidden min-w-0 items-center gap-1 truncate text-[10.5px] text-amber-200/90 md:flex">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Conta simulada educativa · MTM Funded · não é negociação real
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
      ) : (
        <p className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-200 md:hidden">
          <ShieldAlert className="h-3 w-3 shrink-0" /> Conta simulada educativa · não é negociação real
        </p>
      )}

      {erro && <p className="px-2 py-1 text-[12px] text-rose-300">{erro}</p>}

      {(mostrarEntrada || todas.length === 0) ? (
        <div className="p-2">
          <Entrada
            contas={contas}
            onEscolher={escolher}
            onFechar={todas.length ? () => setMostrarEntrada(false) : undefined}
            linkLoginMtm={contexto === "app" && !temSessaoMtm ? "/login?redirect=/webtrader" : undefined}
            formulario={
              <EntrarCredenciais
                temSessaoMtm={temSessaoMtm}
                compraPermitida={compraPermitida}
                onEntrou={async (r) => {
                  if (r.plataforma === "mtmfunded") { guardarSessao(r.sessao); setSessoes(lerSessoes()); escolher(r.sessao.accountId); return }
                  await carregar()
                  escolher(r.ref)
                }}
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
function Entrada({ contas, onEscolher, onFechar, linkLoginMtm, formulario }: {
  contas: ContaResumo[]
  linkLoginMtm?: string
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
        {linkLoginMtm && (
          <a href={linkLoginMtm} className="mt-2 inline-block text-[12px] font-semibold text-[#D2A63C]">Entrar com a conta MTM →</a>
        )}
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
