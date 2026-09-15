"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, ChevronDown, ShieldAlert, X } from "lucide-react"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { type ContaResumo, type SessaoConta, pedir, lerSessoes, guardarSessao, apagarSessao, entrarComCredenciais, usd, COR_ESTADO } from "./api"
import FundedTrader from "./funded-trader"
import InstalarWebtrader from "./instalar-webtrader"
import { InterruptorModo, useModoWebtrader } from "./modo-webtrader"
import type { Prefill } from "./funded-ticket"

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
  const { modo } = useModoWebtrader()

  const carregar = useCallback(async () => {
    const ss = lerSessoes()
    setSessoes(ss)
    let lista: ContaResumo[] = []
    try {
      const d = await pedir<{ contas: ContaResumo[] }>("/api/mtmfunded/simulado/contas")
      lista = d.contas ?? []
    } catch (e) {
      if ((e as { status?: number }).status !== 401) setErro((e as Error).message)
    }
    setContas(lista)
    let ultima: string | null = null
    try { ultima = localStorage.getItem(CHAVE_ULTIMA) } catch { /* ok */ }
    const ids = [...lista.map((c) => c.id), ...Object.keys(ss)]
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
    const out: Array<{ id: string; login: string | null; etiqueta: string; estadoCurto: string; modo: "master" | "investor"; saldo?: number | null; equity?: number | null; propria: boolean; segue?: string | null }> = []
    for (const c of contas ?? []) out.push({ id: c.id, login: c.mt5_login, etiqueta: c.etiqueta, estadoCurto: c.estadoCurto, modo: "master", saldo: c.sim_saldo, equity: c.sim_equity, propria: true, segue: c.segueEstrategia?.nome ?? null })
    for (const s of Object.values(sessoes)) if (!out.some((o) => o.id === s.accountId)) {
      out.push({ id: s.accountId, login: s.login, etiqueta: s.etiqueta ?? "—", estadoCurto: s.estadoCurto ?? "—", modo: s.modo, propria: false })
    }
    return out
  }, [contas, sessoes])
  const atual = todas.find((t) => t.id === ativa)

  if (contas == null) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>

  const emTrader = !(mostrarEntrada || todas.length === 0) && Boolean(ativa)
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
                  <span className="shrink-0 rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{atual.etiqueta}</span>
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
                <p className="border-b border-white/5 px-3 py-1.5 text-[10.5px] text-zinc-500">Servidor {SERVIDOR}</p>
                {todas.map((t) => (
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
        <span className="hidden min-w-0 items-center gap-1 truncate text-[10.5px] text-amber-200/90 md:flex">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Conta simulada educativa · MTM Funded · não é negociação real
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {emTrader && <InterruptorModo compacto={false} />}
          <InstalarWebtrader contexto={contexto} />
        </div>
      </div>
      <p className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-200 md:hidden">
        <ShieldAlert className="h-3 w-3 shrink-0" /> Conta simulada educativa · não é negociação real
      </p>

      {erro && <p className="px-2 py-1 text-[12px] text-rose-300">{erro}</p>}

      {(mostrarEntrada || todas.length === 0) ? (
        <div className="p-2">
          <Entrada
            contas={contas}
            onEntrar={(s) => { guardarSessao(s); setSessoes(lerSessoes()); escolher(s.accountId) }}
            onEscolher={escolher}
            onFechar={todas.length ? () => setMostrarEntrada(false) : undefined}
            linkLoginMtm={contexto === "app" && contas.length === 0 ? "/login?redirect=/webtrader" : undefined}
          />
        </div>
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

/** Ecrã de entrada: as contas da pessoa + login MT5-like. */
function Entrada({ contas, onEntrar, onEscolher, onFechar, linkLoginMtm }: {
  contas: ContaResumo[]
  linkLoginMtm?: string
  onEntrar: (s: SessaoConta) => void
  onEscolher: (id: string) => void
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

      <form onSubmit={entrar} className="space-y-2 rounded-xl border border-white/10 bg-[#0d0d0d] p-3 text-[12.5px]">
        <p className="text-[13px] font-semibold">Entrar com credenciais</p>
        <p className="text-[11px] text-zinc-500">Password master negoceia; password investor só vê.</p>
        <label className="block">
          <span className="text-zinc-400">Login</span>
          <input inputMode="numeric" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black px-2 font-mono text-white" />
        </label>
        <label className="block">
          <span className="text-zinc-400">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black px-2 text-white" />
        </label>
        <label className="block">
          <span className="text-zinc-400">Servidor</span>
          <input value={SERVIDOR} readOnly className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 text-zinc-400" />
        </label>
        {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
        <button disabled={aEntrar || !login || !password} className="flex h-10 w-full items-center justify-center rounded-lg bg-[#D2A63C] font-bold text-black disabled:opacity-40">
          {aEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
        </button>
      </form>
    </div>
  )
}
