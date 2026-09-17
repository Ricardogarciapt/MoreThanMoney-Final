"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react"
import { authHeaders } from "@/lib/auth-token"
import { entrarComCredenciais, SERVIDOR_FUNDED, type SessaoConta } from "@/components/funded/api"
import type { PlataformaWT } from "@/lib/webtrader/corretoras/tipos"
import { COR_PLATAFORMA, ErroWT, NOME_PLATAFORMA, guardarSessaoTL, pedirWT } from "./api-corretoras"
import { useT } from "@/components/i18n-provider"

/** Textos em lib/i18n/messages/webtrader-entrar.ts (prefixo wt.entrar.). */
function useTextos() {
  const t = useT()
  return (n: string) => t(`wt.entrar.${n}`)
}

/**
 * «ENTRAR COM CREDENCIAIS» — seletor de plataforma (MTM Funded · TradeLocker · MT5).
 *
 *  · MTM Funded: login 77xxxxxx + password (master negoceia, investor só vê) — conta SIMULADA.
 *  · TradeLocker: a conta EXTERNA da pessoa, na corretora dela, negociada através da MTM.
 *    email + password + servidor + Live/Demo → escolher a conta. Liga-se pelo mesmo caminho do
 *    ligador de contas (fica em «As minhas contas»; se já lá está, abre essa) — conta REAL.
 *  · MT5 / MT4: login + password + servidor (pesquisa de servidores) — conta REAL, usa uma conta
 *    MetaApi do plano: reutiliza a que já tens ligada ou ocupa um lugar da quota (402 → caminho do
 *    upgrade; sem botão de compra dentro da app iOS). O MT4 segue EXACTAMENTE o mesmo caminho e as
 *    mesmas regras de custo (a MetaApi cobra igual por conta MT4 e MT5): muda só a `plataforma` pedida.
 */

type Resultado =
  | { plataforma: "mtmfunded"; sessao: SessaoConta }
  | { plataforma: "tradelocker" | "mt5"; ref: string }

export default function EntrarCredenciais({ onEntrou, onFechar, temSessaoMtm, compraPermitida, plataformaInicial = "mtmfunded", titulo, onPedirLoginMtm }: {
  onEntrou: (r: Resultado) => void
  onFechar?: () => void
  temSessaoMtm: boolean
  compraPermitida: boolean
  plataformaInicial?: PlataformaWT
  titulo?: string
  /** Sem sessão MTM: em vez de sair para /login, volta ao ecrã de entrada do WebTrader. */
  onPedirLoginMtm?: () => void
}) {
  const [plataforma, setPlataforma] = useState<PlataformaWT>(plataformaInicial)
  const k = useTextos()
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-[#0d0d0d] p-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">{titulo ?? k("credTitulo")}</p>
        {onFechar && <button onClick={onFechar} aria-label={k("fechar")} className="text-zinc-500"><X className="h-4 w-4" /></button>}
      </div>
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1">
        {(["mtmfunded", "tradelocker", "mt5"] as PlataformaWT[]).map((p) => (
          <button key={p} role="tab" aria-selected={plataforma === p} onClick={() => setPlataforma(p)}
            className={`rounded-md py-1.5 text-[12px] font-semibold ${plataforma === p ? "bg-white/10 text-white" : "text-zinc-500"}`}
            style={plataforma === p ? { boxShadow: `inset 0 -2px 0 ${COR_PLATAFORMA[p]}` } : undefined}>
            {p === "mt5" ? "MT5 / MT4" : NOME_PLATAFORMA[p]}
          </button>
        ))}
      </div>
      {plataforma === "mtmfunded" ? (
        <>
          <p className="flex items-center gap-1 text-[11px] text-amber-200/90"><ShieldAlert className="h-3.5 w-3.5" /> {k("fundedAviso")}</p>
          <FormFunded onEntrou={(s) => onEntrou({ plataforma: "mtmfunded", sessao: s })} />
        </>
      ) : (
        <>
          {plataforma === "tradelocker" && (
            <p className="text-[12px] leading-snug text-zinc-200">{k("tlTexto")}</p>
          )}
          <p className="flex items-start gap-1 rounded-lg bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {plataforma === "tradelocker"
              ? k("tlReal")
              : k("mt5Real")}
          </p>
          {!temSessaoMtm ? (
            <p className="text-[12px] text-zinc-400">
              {plataforma === "tradelocker"
                ? k("tlPrecisaMtm")
                : k("mt5PrecisaMtm")}{" "}
              {onPedirLoginMtm
                ? <button type="button" onClick={onPedirLoginMtm} className="font-semibold text-[#D2A63C]">{k("contaMtm")} →</button>
                : <a href="/login?redirect=/webtrader" className="font-semibold text-[#D2A63C]">{k("contaMtm")} →</a>}
            </p>
          ) : plataforma === "tradelocker" ? (
            <FormTradeLocker onEntrou={(ref) => onEntrou({ plataforma: "tradelocker", ref })} />
          ) : (
            <FormMt5 compraPermitida={compraPermitida} onEntrou={(ref) => onEntrou({ plataforma: "mt5", ref })} />
          )}
        </>
      )}
    </div>
  )
}

const campo = "mt-1 h-10 w-full rounded-lg border border-white/10 bg-black px-2 text-white"

function FormFunded({ onEntrou }: { onEntrou: (s: SessaoConta) => void }) {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [aEntrar, setAEntrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const k = useTextos()
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setAEntrar(true); setErro(null)
      try { onEntrou(await entrarComCredenciais(login, password)); setPassword("") } catch (err) { setErro((err as Error).message) } finally { setAEntrar(false) }
    }}>
      <label className="block"><span className="text-zinc-400">{k("login")}</span><input inputMode="numeric" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className={`${campo} font-mono`} /></label>
      <label className="block"><span className="text-zinc-400">{k("password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={campo} /></label>
      <label className="block"><span className="text-zinc-400">{k("servidor")}</span><input value={SERVIDOR_FUNDED} readOnly className={`${campo} bg-zinc-900 text-zinc-400`} /></label>
      {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
      <button disabled={aEntrar || !login || !password} className="flex h-10 w-full items-center justify-center rounded-lg bg-[#D2A63C] font-bold text-black disabled:opacity-40">
        {aEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : k("entrar")}
      </button>
    </form>
  )
}

function FormTradeLocker({ onEntrou }: { onEntrou: (ref: string) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [servidor, setServidor] = useState("")
  const [env, setEnv] = useState<"live" | "demo">("live")
  const [bilhete, setBilhete] = useState<string | null>(null)
  const [contas, setContas] = useState<Array<{ id: string; accNum: string; nome: string; moeda: string; saldo: number | null }>>([])
  const [aEntrar, setAEntrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const k = useTextos()

  const passo1 = async (e: React.FormEvent) => {
    e.preventDefault(); setAEntrar(true); setErro(null)
    try {
      const d = await pedirWT<{ bilhete: string; contas: typeof contas }>("tradelocker", "entrar", { metodo: "POST", corpo: { email, password, servidor, env } })
      setPassword("")
      setBilhete(d.bilhete); setContas(d.contas)
    } catch (err) { setErro((err as Error).message) } finally { setAEntrar(false) }
  }
  const escolher = async (accountId: string) => {
    if (!bilhete) return
    setAEntrar(true); setErro(null)
    try {
      const d = await pedirWT<{ ref: string; sessao: { token: string; expira: string } | null; conta?: { accNum: string; servidor: string; demo: boolean; nome: string } }>("tradelocker", "entrar", { metodo: "POST", corpo: { bilhete, accountId } })
      if (d.sessao) guardarSessaoTL({ ref: d.ref, token: d.sessao.token, expira: d.sessao.expira, login: d.conta?.accNum ?? accountId, servidor: d.conta?.servidor ?? servidor, demo: Boolean(d.conta?.demo), rotulo: d.conta?.nome ?? null })
      onEntrou(d.ref)
    } catch (err) { setErro((err as Error).message) } finally { setAEntrar(false) }
  }

  if (bilhete) {
    return (
      <div className="space-y-2">
        <p className="text-zinc-400">{k("escolheConta")}</p>
        {contas.map((c) => (
          <button key={c.id} disabled={aEntrar} onClick={() => escolher(c.id)} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5 text-left hover:border-sky-400/40 disabled:opacity-50">
            <span className="font-mono text-white">#{c.accNum}</span>
            <span className="truncate text-zinc-400">{c.nome}</span>
            <span className="ml-auto font-mono text-zinc-300">{c.saldo != null ? `${c.saldo.toLocaleString("pt-PT")} ${c.moeda}` : ""}</span>
          </button>
        ))}
        {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
        <button onClick={() => { setBilhete(null); setContas([]) }} className="text-[11.5px] text-zinc-500">{k("outroLogin")}</button>
      </div>
    )
  }
  return (
    <form className="space-y-2" onSubmit={passo1}>
      <label className="block"><span className="text-zinc-400">{k("email")}</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} /></label>
      <label className="block"><span className="text-zinc-400">{k("password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={campo} /></label>
      <label className="block"><span className="text-zinc-400">{k("tlServidor")}</span><input value={servidor} onChange={(e) => setServidor(e.target.value)} placeholder={k("tlServidorPh")} className={campo} /></label>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
        {(["live", "demo"] as const).map((v) => (
          <button type="button" key={v} onClick={() => setEnv(v)} className={`rounded-md py-1.5 text-[12px] font-semibold ${env === v ? "bg-white/10 text-white" : "text-zinc-500"}`}>{v === "live" ? "Live" : "Demo"}</button>
        ))}
      </div>
      {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
      <button disabled={aEntrar || !email || !password || !servidor} className="flex h-10 w-full items-center justify-center rounded-lg bg-sky-400 font-bold text-black disabled:opacity-40">
        {aEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : k("tlVerContas")}
      </button>
    </form>
  )
}

function FormMt5({ onEntrou, compraPermitida }: { onEntrou: (ref: string) => void; compraPermitida: boolean }) {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [servidor, setServidor] = useState("")
  const [versao, setVersao] = useState<"mt5" | "mt4">("mt5")
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [aEntrar, setAEntrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [quota, setQuota] = useState<string | null>(null)
  const k = useTextos()

  // Pesquisa de servidores (a mesma do ligador de contas), com pausa entre teclas.
  useEffect(() => {
    const q = servidor.trim()
    if (q.length < 3) { setSugestoes([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/mtmcopy/brokers?platform=${versao}&q=${encodeURIComponent(q)}&limit=20`, { headers: await authHeaders() })
        const j = await r.json()
        setSugestoes((j.brokers ?? []).flatMap((g: { servers?: string[] }) => g.servers ?? []).slice(0, 20))
      } catch { setSugestoes([]) }
    }, 400)
    return () => clearTimeout(t)
  }, [servidor, versao])

  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setAEntrar(true); setErro(null); setQuota(null)
      try {
        const d = await pedirWT<{ ref: string; reutilizada: boolean }>("mt5", "entrar", { metodo: "POST", corpo: { login, password, servidor, plataforma: versao } })
        setPassword("")
        onEntrou(d.ref)
      } catch (err) {
        if (err instanceof ErroWT && err.status === 402) setQuota(err.message)
        else setErro((err as Error).message)
      } finally { setAEntrar(false) }
    }}>
      {/* Os servidores MT4 e MT5 de uma corretora têm nomes diferentes — escolher antes de pesquisar. */}
      <div role="radiogroup" aria-label={k("mtVersao")} className="grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
        {(["mt5", "mt4"] as const).map((v) => (
          <button type="button" role="radio" aria-checked={versao === v} key={v} onClick={() => { setVersao(v); setSugestoes([]) }}
            className={`rounded-md py-1.5 text-[12px] font-semibold ${versao === v ? "bg-white/10 text-white" : "text-zinc-500"}`}>{v.toUpperCase()}</button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">{k("mtQuota")}</p>
      <label className="block"><span className="text-zinc-400">{k("login")}</span><input inputMode="numeric" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className={`${campo} font-mono`} /></label>
      <label className="block"><span className="text-zinc-400">{k("passwordMaster")}</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={campo} /></label>
      <label className="block"><span className="text-zinc-400">{k("servidor")}</span>
        <input list="webtrader-mt5-servidores" value={servidor} onChange={(e) => setServidor(e.target.value)} placeholder={k("mtServidorPh")} className={campo} />
        <datalist id="webtrader-mt5-servidores">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
      {quota && (
        <div className="space-y-1.5 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/10 p-2 text-[11.5px] text-zinc-200">
          <p>{quota}</p>
          {compraPermitida && <a href="/upgrade" className="inline-block font-semibold text-[#D2A63C] underline">{k("passarPremium")}</a>}
        </div>
      )}
      <button disabled={aEntrar || !login || !password || !servidor} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-400 font-bold text-black disabled:opacity-40">
        {aEntrar ? <><Loader2 className="h-4 w-4 animate-spin" /> {k("aLigar")}</> : k("entrarNo").replace("{plataforma}", versao.toUpperCase())}
      </button>
    </form>
  )
}
