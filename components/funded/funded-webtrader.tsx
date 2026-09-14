"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, ChevronDown, ShieldAlert, X } from "lucide-react"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { type ContaResumo, type SessaoConta, pedir, lerSessoes, guardarSessao, apagarSessao, usd, COR_ESTADO } from "./api"
import FundedTrader from "./funded-trader"
import InstalarWebtrader from "./instalar-webtrader"
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
    const out: Array<{ id: string; login: string | null; etiqueta: string; estadoCurto: string; modo: "master" | "investor"; saldo?: number | null; equity?: number | null; propria: boolean }> = []
    for (const c of contas ?? []) out.push({ id: c.id, login: c.mt5_login, etiqueta: c.etiqueta, estadoCurto: c.estadoCurto, modo: "master", saldo: c.sim_saldo, equity: c.sim_equity, propria: true })
    for (const s of Object.values(sessoes)) if (!out.some((o) => o.id === s.accountId)) {
      out.push({ id: s.accountId, login: s.login, etiqueta: s.etiqueta ?? "—", estadoCurto: s.estadoCurto ?? "—", modo: s.modo, propria: false })
    }
    return out
  }, [contas, sessoes])
  const atual = todas.find((t) => t.id === ativa)

  if (contas == null) return <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>

  return (
    <div className="mx-auto max-w-6xl space-y-2 px-2 py-2 text-white">
      {/* Sempre visível — posicionamento obrigatório (spec §1). */}
      <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Conta simulada educativa · MTM Funded · não é negociação real</span>
        <InstalarWebtrader contexto={contexto} />
      </div>

      {todas.length > 0 && (
        <div className="relative">
          <button onClick={() => setSeletorAberto((v) => !v)} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-2 text-left text-[12.5px]">
            {atual ? (
              <>
                <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{atual.etiqueta}</span>
                <span className="font-mono">{atual.login ?? "—"}</span>
                <span className="text-zinc-500">{SERVIDOR}</span>
                {atual.modo === "investor" && <span className="text-[10.5px] text-sky-300">investor</span>}
              </>
            ) : <span className="text-zinc-400">Escolhe uma conta</span>}
            <ChevronDown className="ml-auto h-4 w-4 text-zinc-500" />
          </button>
          {seletorAberto && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
              {todas.map((t) => (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${t.id === ativa ? "bg-[#D2A63C]/10" : "hover:bg-white/5"}`}>
                  <button className="flex flex-1 items-center gap-2 text-left" onClick={() => escolher(t.id)}>
                    <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{t.etiqueta}</span>
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

      {erro && <p className="text-[12px] text-rose-300">{erro}</p>}

      {(mostrarEntrada || todas.length === 0) ? (
        <Entrada
          contas={contas}
          onEntrar={(s) => { guardarSessao(s); setSessoes(lerSessoes()); escolher(s.accountId) }}
          onEscolher={escolher}
          onFechar={todas.length ? () => setMostrarEntrada(false) : undefined}
          linkLoginMtm={contexto === "app" && contas.length === 0 ? "/login?redirect=/webtrader" : undefined}
        />
      ) : ativa ? (
        <FundedTrader
          key={ativa} accountId={ativa} prefill={prefill} simboloInicial={simboloInicial} onSimbolo={onSimbolo}
          alturaGrafico={contexto === "app" ? "h-[52vh] min-h-[320px] md:h-[calc(100dvh-330px)]" : undefined}
        />
      ) : null}
    </div>
  )
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
      const r = await fetch("/api/mtmfunded/simulado/entrar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, servidor: SERVIDOR }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "não foi possível entrar")
      // Lê a conta com o token para mostrar etiqueta/estado no seletor.
      const info = await fetch("/api/mtmfunded/simulado/entrar", { headers: { Authorization: `Bearer ${d.token}` } }).then((x) => x.json()).catch(() => null)
      onEntrar({
        accountId: info?.conta?.id, token: d.token, modo: d.modo, expira: d.expira, login: login.replace(/\D/g, ""),
        etiqueta: info?.conta?.etiqueta, estadoCurto: info?.conta?.estadoCurto,
      })
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
              <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{c.etiqueta}</span>
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
