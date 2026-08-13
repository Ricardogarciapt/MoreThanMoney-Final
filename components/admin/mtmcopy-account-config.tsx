"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, X, RefreshCw, Save, Power, PowerOff, Target, Plus } from "lucide-react"

type Acct = {
  id: string
  metaapi_account_id: string
  login: string | null
  server: string | null
  status: string | null
  label: string | null
  is_intermediate: boolean
  strategy_pick: string | null
  strategy_name: string | null
  copy_method: string | null
  lot_mode: string | null
  lot_value: number | null
  max_risk_percent: number | null
  auto_trailing_stop: boolean
  trailing_stop_points: number | null
  is_active: boolean
  baseline_balance: number | null
  balance: number | null
  equity: number | null
  pnl: number | null
  pnl_pct: number | null
}

async function api(path: string, method: string, body: unknown) {
  const r = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return r.json().catch(() => ({ ok: false, error: "resposta inválida" }))
}

function num(v: number | null | undefined, d = 2) {
  return v == null ? "—" : v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function MtmcopyAccountConfig({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<Acct[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [newSlave, setNewSlave] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await (await fetch("/api/admin/mtmcopy/rg-accounts", { credentials: "include" })).json()
      if (d.ok) setAccounts(d.accounts as Acct[])
      else setMsg(d.error ?? "Erro ao carregar")
    } catch {
      setMsg("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = (id: string, p: Partial<Acct>) =>
    setAccounts((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const save = useCallback(
    async (acc: Acct) => {
      setBusy(acc.id)
      setMsg(null)
      const d = await api("/api/admin/mtmcopy/subscriber", "PATCH", {
        connection_id: acc.id,
        lot_mode: acc.lot_mode,
        lot_value: acc.lot_value,
        max_risk_percent: acc.max_risk_percent,
        auto_trailing_stop: acc.auto_trailing_stop,
        trailing_stop_points: acc.trailing_stop_points,
        is_active: acc.is_active,
        resync_copyfactory: true,
      })
      setMsg(d.error ? `Erro: ${d.error}` : `${acc.label ?? acc.login}: gravado ✓`)
      setBusy(null)
    },
    [],
  )

  const toggleDeploy = useCallback(async (acc: Acct) => {
    setBusy(acc.id)
    const action = acc.status === "undeployed" ? "deploy" : "undeploy"
    const d = await api("/api/admin/mtmcopy/deploy-account", "POST", { connection_id: acc.id, action })
    setMsg(d.ok ? `${acc.label ?? acc.login}: ${action} ✓` : `Erro: ${d.error}`)
    if (d.ok) patch(acc.id, { status: action === "undeploy" ? "undeployed" : "connected" })
    setBusy(null)
  }, [])

  const resetBaseline = useCallback(async (acc: Acct) => {
    if (acc.balance == null) {
      setMsg("Sem saldo ao vivo para ancorar")
      return
    }
    setBusy(acc.id)
    const d = await api("/api/admin/mtmcopy/subscriber", "PATCH", {
      connection_id: acc.id,
      baseline_balance: acc.balance,
    })
    setMsg(d.error ? `Erro: ${d.error}` : `${acc.label ?? acc.login}: métricas a zero (baseline = ${num(acc.balance)}) ✓`)
    if (!d.error) patch(acc.id, { baseline_balance: acc.balance, pnl: 0, pnl_pct: 0 })
    setBusy(null)
  }, [])

  const addSlave = useCallback(async () => {
    const id = newSlave.trim()
    if (!id) return
    setBusy("add")
    const d = await api("/api/admin/mtmcopy/add-rg-slave", "POST", { metaapi_account_id: id })
    setMsg(d.ok ? "Slave adicionado ✓" : d.pendingRole ? d.error : `Erro: ${d.error}`)
    setBusy(null)
    if (d.ok) {
      setNewSlave("")
      await load()
    }
  }, [newSlave, load])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#D2A63C]">Configurar contas · Copy Trader Ricardo Garcia</h2>
            <p className="text-xs text-zinc-500">Risco/lote/trailing por conta, undeploy, métricas do zero e adicionar slaves.</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {msg && (
          <div className="mx-5 mt-3 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-300">{msg}</div>
        )}

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
            </div>
          ) : (
            accounts.map((acc) => (
              <div key={acc.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {acc.label ?? acc.login}{" "}
                      {acc.is_intermediate && <span className="text-xs text-[#D2A63C]">· intermédia (copia Premium)</span>}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {acc.login} · {acc.server} · {acc.strategy_name ?? acc.strategy_pick} ·{" "}
                      <span className={acc.status === "undeployed" ? "text-amber-400" : "text-emerald-400"}>{acc.status}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-zinc-300">Saldo {num(acc.balance)} · Eq {num(acc.equity)}</div>
                    <div className={acc.pnl != null && acc.pnl < 0 ? "text-red-400" : "text-emerald-400"}>
                      P&L {acc.pnl != null ? (acc.pnl >= 0 ? "+" : "") + num(acc.pnl) : "—"} ({acc.pnl_pct ?? "—"}%)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-xs text-zinc-400">
                    Modo
                    <select
                      value={acc.lot_mode ?? "fixed"}
                      onChange={(e) => patch(acc.id, { lot_mode: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                    >
                      <option value="fixed">Lote fixo</option>
                      <option value="multiplier">Multiplier (espelha risco)</option>
                      <option value="risk_percent">Risco %</option>
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">
                    {acc.lot_mode === "risk_percent" ? "Risco %" : "Lote / mult"}
                    <input
                      type="number"
                      step="0.01"
                      value={acc.lot_value ?? 0}
                      onChange={(e) => patch(acc.id, { lot_value: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Risco máx %
                    <input
                      type="number"
                      step="0.1"
                      value={acc.max_risk_percent ?? 0}
                      onChange={(e) => patch(acc.id, { max_risk_percent: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Trailing (pts)
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => patch(acc.id, { auto_trailing_stop: !acc.auto_trailing_stop })}
                        className={`h-6 w-11 shrink-0 rounded-full transition-colors ${acc.auto_trailing_stop ? "bg-emerald-500" : "bg-zinc-700"} relative`}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${acc.auto_trailing_stop ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                      <input
                        type="number"
                        step="10"
                        value={acc.trailing_stop_points ?? 0}
                        disabled={!acc.auto_trailing_stop}
                        onChange={(e) => patch(acc.id, { trailing_stop_points: Number(e.target.value) })}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white disabled:opacity-40"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={busy === acc.id} onClick={() => save(acc)} className="h-8 bg-[#D2A63C] text-black hover:bg-[#c0972f]">
                    {busy === acc.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Gravar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === acc.id} onClick={() => resetBaseline(acc)} className="h-8 border-zinc-700 text-xs">
                    <Target className="mr-1 h-3.5 w-3.5" /> Métricas a zero
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === acc.id}
                    onClick={() => toggleDeploy(acc)}
                    className={`h-8 border-zinc-700 text-xs ${acc.status === "undeployed" ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    {acc.status === "undeployed" ? <><Power className="mr-1 h-3.5 w-3.5" /> Deploy</> : <><PowerOff className="mr-1 h-3.5 w-3.5" /> Undeploy</>}
                  </Button>
                  <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
                    Ativa
                    <button
                      type="button"
                      onClick={() => patch(acc.id, { is_active: !acc.is_active })}
                      className={`h-6 w-11 rounded-full transition-colors ${acc.is_active ? "bg-emerald-500" : "bg-zinc-700"} relative`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${acc.is_active ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </label>
                </div>
              </div>
            ))
          )}

          {/* Adicionar slave */}
          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-4">
            <p className="mb-2 text-sm font-medium text-zinc-300">Adicionar slave à estratégia (su0a · 0.01 fixo)</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={newSlave}
                onChange={(e) => setNewSlave(e.target.value)}
                placeholder="metaapi_account_id da nova conta"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <Button size="sm" disabled={busy === "add" || !newSlave.trim()} onClick={addSlave} className="h-9 bg-emerald-600 hover:bg-emerald-500">
                {busy === "add" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Adicionar
              </Button>
            </div>
            <p className="mt-1 text-xs text-zinc-600">A conta é criada na MetaApi por ti (dá o accountId). O role SUBSCRIBER é ativado automaticamente.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="outline" size="sm" onClick={load} className="border-zinc-700">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Recarregar
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
