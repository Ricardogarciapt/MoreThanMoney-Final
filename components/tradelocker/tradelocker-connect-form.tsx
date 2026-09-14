"use client"

import { useState } from "react"
import { Loader2, Check, ArrowRight } from "lucide-react"

/**
 * Ligar uma conta TradeLocker — o mesmo formulário no MTM Copy (web) e no Tap to Trade (mobile).
 *
 * Passo 1: email, password, servidor e ambiente → a API devolve as contas desse login.
 * Passo 2: escolher a conta → a API grava a ligação e devolve o saldo.
 * Contrato: app/api/mtmcopy/tradelocker/route.ts.
 */

export interface ContaTradeLocker {
  id: string
  accNum: string
  name: string
  currency: string
  status: string
  balance: number | null
}

export interface ResultadoLigacaoTL {
  connection: { id: string } & Record<string, unknown>
  balance: number | null
  equity: number | null
}

export function TradeLockerBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300 ${className}`}>
      TradeLocker
    </span>
  )
}

const dinheiro = (v: number | null | undefined, moeda?: string) =>
  v == null ? "—" : `${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${moeda ? ` ${moeda}` : ""}`

export default function TradeLockerConnectForm({
  purpose,
  getToken,
  extraPayload,
  validar,
  onConnected,
  variante = "web",
}: {
  purpose: "tap_to_trade" | "mtmcopy"
  getToken: () => Promise<string | null>
  /** Definições da ligação (grupos, lote, risco…) juntas no passo 2. */
  extraPayload?: () => Record<string, unknown>
  /** Validação do formulário anfitrião antes de ligar (devolve a mensagem de erro ou null). */
  validar?: () => string | null
  onConnected: (r: ResultadoLigacaoTL) => void
  variante?: "web" | "mobile"
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [server, setServer] = useState("")
  const [env, setEnv] = useState<"live" | "demo">("live")
  const [ticket, setTicket] = useState<string | null>(null)
  const [contas, setContas] = useState<ContaTradeLocker[]>([])
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState("")
  const [ligada, setLigada] = useState<ResultadoLigacaoTL | null>(null)

  const campo =
    variante === "mobile"
      ? "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
      : "w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white"
  const rotulo = variante === "mobile" ? "text-[11px] text-zinc-500" : "block text-sm font-medium text-gray-300 mb-1.5"

  const pedir = async (body: Record<string, unknown>) => {
    const tok = await getToken()
    if (!tok) throw new Error("Sessão indisponível. Volta a entrar.")
    const res = await fetch("/api/mtmcopy/tradelocker", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.message || "Não foi possível falar com a TradeLocker.")
    return data
  }

  const entrar = async () => {
    setErro("")
    if (!email.trim() || !password || !server.trim()) {
      setErro("Preenche email, password e servidor.")
      return
    }
    setBusy(true)
    try {
      const data = await pedir({ email: email.trim(), password, server: server.trim(), env })
      setTicket(data.ticket)
      setContas(data.accounts ?? [])
      setEscolhida(data.accounts?.length === 1 ? data.accounts[0].id : null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado")
    } finally {
      setBusy(false)
    }
  }

  const ligar = async () => {
    setErro("")
    const conta = contas.find((c) => c.id === escolhida)
    if (!conta || !ticket) {
      setErro("Escolhe a conta a ligar.")
      return
    }
    const invalido = validar?.()
    if (invalido) {
      setErro(invalido)
      return
    }
    setBusy(true)
    try {
      const data = await pedir({ ...(extraPayload?.() ?? {}), ticket, accountId: conta.id, accNum: conta.accNum, purpose, copy_method: "telegram_group" })
      setPassword("")
      const r = { connection: data.connection, balance: data.balance ?? null, equity: data.equity ?? null }
      setLigada(r)
      onConnected(r)
    } catch (e) {
      const m = e instanceof Error ? e.message : "Erro inesperado"
      // Bilhete de 10 min caducou → volta ao login.
      if (/expirou/i.test(m)) { setTicket(null); setContas([]) }
      setErro(m)
    } finally {
      setBusy(false)
    }
  }

  if (ligada) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300 space-y-1">
        <p className="flex items-center gap-2 font-semibold"><Check className="w-4 h-4" /> Conta TradeLocker ligada <TradeLockerBadge /></p>
        <p className="text-xs text-zinc-300">Saldo {dinheiro(ligada.balance)} · Equity {dinheiro(ligada.equity)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-gray-300 space-y-1`}>
        <p>
          <strong className="text-sky-300">Login TradeLocker:</strong> o email e a password com que entras no TradeLocker da tua corretora.
          O servidor é o nome que aparece no login (ex.: o nome curto da corretora).
        </p>
        <p>
          <strong className="text-sky-300">Segurança:</strong> a password fica guardada cifrada no servidor — a TradeLocker pede-a de novo quando a sessão expira. Apagar a conta apaga-a.
        </p>
      </div>

      {!ticket ? (
        <>
          <div>
            <label className={rotulo}>Email *</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" className={campo} disabled={busy} placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className={rotulo}>Password *</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" className={campo} disabled={busy} placeholder="Password TradeLocker" />
          </div>
          <div>
            <label className={rotulo}>Servidor *</label>
            <input value={server} onChange={(e) => setServer(e.target.value)} autoComplete="off" className={campo} disabled={busy} placeholder="ex.: nome do servidor da corretora" />
          </div>
          <div>
            <label className={rotulo}>Ambiente *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(["live", "demo"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEnv(v)}
                  disabled={busy}
                  className={`rounded-lg border py-2 text-sm font-medium ${env === v ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]" : "border-gray-700 text-gray-400"}`}
                >
                  {v === "live" ? "Live" : "Demo"}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={entrar} disabled={busy} className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-bold text-black disabled:opacity-60 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {busy ? "A entrar na TradeLocker…" : "Ver as minhas contas"}
          </button>
        </>
      ) : (
        <>
          <label className={rotulo}>Escolhe a conta ({env === "demo" ? "Demo" : "Live"} · {server})</label>
          <div className="grid gap-2">
            {contas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEscolhida(c.id)}
                disabled={busy}
                className={`text-left rounded-lg border p-3 transition-colors ${escolhida === c.id ? "border-[#D2A63C]/50 bg-[#D2A63C]/10" : "border-gray-700 hover:border-gray-600"}`}
              >
                <p className="text-white text-sm font-semibold">{c.name || `Conta #${c.id}`} <span className="text-xs text-zinc-500">#{c.id}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">Saldo {dinheiro(c.balance, c.currency)}{c.status ? ` · ${c.status}` : ""}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setTicket(null); setContas([]) }} disabled={busy} className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300">Voltar</button>
            <button type="button" onClick={ligar} disabled={busy || !escolhida} className="flex-1 rounded-lg bg-[#D2A63C] py-2.5 text-sm font-bold text-black disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? "A ligar…" : "Ligar conta"}
            </button>
          </div>
        </>
      )}
      {erro && <p className="text-xs text-rose-400">{erro}</p>}
    </div>
  )
}
