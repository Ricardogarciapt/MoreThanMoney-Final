"use client"

import { useState } from "react"
import { Loader2, Check, Eye } from "lucide-react"

/**
 * Ligar uma conta MTM Funded (as nossas, simuladas) — Tap to Trade (web e mobile).
 *
 * Login (77xxxxxx) + password + servidor «MTM Funded». Password master = a conta negoceia as
 * ideias aceites (pelo motor simulado); password investor = só leitura.
 * Contrato: app/api/mtmfunded/ligar-conta/route.ts. A password nunca fica guardada no browser.
 */

export interface ResultadoLigacaoFunded {
  connection: { id: string } & Record<string, unknown>
  somente_leitura: boolean
  conta: { login: string | null; tipo: string; estado: string; saldo: number | null; equity: number | null }
}

export function MtmFundedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 ${className}`}>
      MTM Funded
    </span>
  )
}

export function SoLeituraBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300 ${className}`}>
      <Eye className="w-3 h-3" /> Só leitura
    </span>
  )
}

const dinheiro = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-PT", { style: "currency", currency: "USD" })

export default function MtmFundedConnectForm({
  getToken,
  onConnected,
  variante = "web",
  riscoPct,
}: {
  getToken: () => Promise<string | null>
  onConnected: (r: ResultadoLigacaoFunded) => void
  variante?: "web" | "mobile"
  /** Risco por ideia (%) aplicado à equity simulada. */
  riscoPct?: number
}) {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState("")
  const [ligada, setLigada] = useState<ResultadoLigacaoFunded | null>(null)

  const campo =
    variante === "mobile"
      ? "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
      : "w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white"
  const rotulo = variante === "mobile" ? "text-[11px] text-zinc-500" : "block text-sm font-medium text-gray-300 mb-1.5"

  const ligar = async () => {
    setErro("")
    const limpo = login.replace(/\D/g, "")
    if (!/^77\d{6}$/.test(limpo) || !password) {
      setErro("Preenche o login (8 dígitos, começa por 77) e a password.")
      return
    }
    setBusy(true)
    try {
      const tok = await getToken()
      if (!tok) throw new Error("Sessão indisponível. Volta a entrar.")
      const res = await fetch("/api/mtmfunded/ligar-conta", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          login: limpo, password, servidor: "MTM Funded", produto: "tap_to_trade",
          ...(riscoPct ? { t2t_lot_value: riscoPct } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível ligar a conta MTM Funded.")
      const r: ResultadoLigacaoFunded = { connection: data.connection, somente_leitura: Boolean(data.somente_leitura), conta: data.conta }
      setLigada(r)
      onConnected(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado")
    } finally {
      // Nunca fica no ecrã depois do pedido, correu bem ou mal.
      setPassword("")
      setBusy(false)
    }
  }

  if (ligada) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300 space-y-1">
        <p className="flex items-center gap-2 font-semibold flex-wrap">
          <Check className="w-4 h-4" /> Conta ligada <MtmFundedBadge /> {ligada.somente_leitura && <SoLeituraBadge />}
        </p>
        <p className="text-xs text-zinc-300">
          {ligada.conta.login} · {ligada.conta.tipo} · {ligada.conta.estado} · Saldo {dinheiro(ligada.conta.saldo)} · Equity {dinheiro(ligada.conta.equity)}
        </p>
        {ligada.somente_leitura && <p className="text-[11px] text-zinc-400">Ligada com a password investor: vês as métricas, mas as ideias não abrem nesta conta.</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-gray-300 space-y-1">
        <p>
          <strong className="text-amber-300">Conta MTM Funded:</strong> usa o login e a password que vês no painel MTM Funded.
          Password <strong>master</strong> para as ideias aceites abrirem nela; password <strong>investor</strong> só para acompanhar.
        </p>
        <p className="text-gray-400">As regras do programa (drawdown, perda diária) continuam a valer nesta conta.</p>
      </div>
      <div>
        <label className={rotulo}>Login</label>
        <input className={campo} inputMode="numeric" autoComplete="off" placeholder="77xxxxxx" value={login} onChange={(e) => setLogin(e.target.value)} disabled={busy} />
      </div>
      <div>
        <label className={rotulo}>Password (master ou investor)</label>
        <input className={campo} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </div>
      <div>
        <label className={rotulo}>Servidor</label>
        <input className={`${campo} opacity-70`} value="MTM Funded" readOnly />
      </div>
      {erro && <p className="text-xs text-rose-400">{erro}</p>}
      <button
        onClick={ligar}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D2A63C] text-black text-sm font-semibold py-2.5 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ligar conta MTM Funded
      </button>
    </div>
  )
}
