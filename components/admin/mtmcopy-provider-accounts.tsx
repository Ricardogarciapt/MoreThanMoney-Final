"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { adminApiCall } from "@/lib/admin-helpers"
import { Loader2, Plus, RefreshCw, AlertTriangle, Check, Server, PowerOff } from "lucide-react"

/**
 * Contas PROVIDER (mestre) do MTM Copy.
 *
 * Antes só se podia ESCOLHER uma conta MetaApi já existente ao configurar uma rota — criar a
 * conta era trabalho manual no painel da MetaApi. Aqui cria-se de raiz: provisiona a conta como
 * mestre e cria-lhe a estratégia CopyFactory, que é o que os subscritores passam a copiar.
 */

interface ProviderAccount {
  accountId: string
  name: string
  login: string
  strategies: { id: string; name: string }[]
  usedByRoutes: string[]
}

export default function MtmcopyProviderAccounts() {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string[] | null>(null)
  const [form, setForm] = useState({ label: "", login: "", password: "", server: "", platform: "mt5" })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminApiCall<{ accounts: ProviderAccount[] }>("/api/admin/mtmcopy/provider-account")
    if (res.success && res.data) setAccounts(res.data.accounts ?? [])
    else setErro(res.error ?? "não foi possível carregar as contas")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const criar = async () => {
    setErro(null); setResultado(null); setCriando(true)
    const res = await adminApiCall<{ accountId: string; strategyId: string; passos: string[]; proximo: string }>(
      "/api/admin/mtmcopy/provider-account",
      { method: "POST", body: JSON.stringify({ action: "create", ...form }) },
    )
    setCriando(false)
    if (res.success && res.data) {
      setResultado([...(res.data.passos ?? []), res.data.proximo])
      setForm({ label: "", login: "", password: "", server: "", platform: "mt5" })
      setAberto(false)
      load()
    } else {
      setErro(res.error ?? "falhou")
    }
  }

  const desligar = async (a: ProviderAccount) => {
    setErro(null); setResultado(null)
    const res = await adminApiCall<{ passos: string[] }>("/api/admin/mtmcopy/provider-account", {
      method: "DELETE",
      body: JSON.stringify({ account_id: a.accountId, strategy_id: a.strategies[0]?.id }),
    })
    if (res.success && res.data) { setResultado(res.data.passos); load() }
    else setErro(res.error ?? "falhou")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Contas provider ({accounts.length})
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="border-zinc-700">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAberto((v) => !v)} className="border-emerald-500/40 text-emerald-400">
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar conta
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            Provisiona a conta MT5 como <strong className="text-white">mestre</strong> e cria-lhe a estratégia
            CopyFactory. Se o par login+servidor já existir na MetaApi, a conta é reaproveitada em vez de duplicada.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400">Nome</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="MTM Aurum Flow Cripto" className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Servidor</Label>
              <Input value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })}
                placeholder="PUPrime-Live2" className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Login MT5</Label>
              <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })}
                placeholder="20579908" className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Password (investor ou master)</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="bg-zinc-900 border-zinc-700" />
            </div>
          </div>
          <Button onClick={criar} disabled={criando || !form.label || !form.login || !form.password || !form.server}
            className="bg-emerald-600 hover:bg-emerald-500">
            {criando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Server className="w-4 h-4 mr-2" />}
            Criar conta provider
          </Button>
          <p className="text-[11px] text-zinc-500">
            Pode demorar até dois minutos: a conta tem de ligar ao broker antes de a estratégia poder ser criada.
          </p>
        </div>
      )}

      {erro && (
        <p className="text-sm text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
        </p>
      )}
      {resultado && (
        <div className="rounded-lg border border-emerald-500/25 bg-zinc-950/60 p-3 space-y-1">
          {resultado.map((p, i) => (
            <p key={i} className="text-xs text-zinc-300 flex items-start gap-2">
              <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" /> {p}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.accountId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{a.name || a.accountId.slice(0, 8)}</p>
              <p className="text-xs text-zinc-500 font-mono">
                {a.login || "—"} · {a.accountId.slice(0, 8)}…
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {a.strategies.map((s) => (
                <Badge key={s.id} variant="outline" className="border-violet-500/40 text-violet-300 text-[10px] font-mono">
                  {s.id}
                </Badge>
              ))}
              {!a.strategies.length && (
                <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">sem estratégia</Badge>
              )}
            </div>
            {a.usedByRoutes.length > 0 ? (
              <Badge className="bg-emerald-500/15 text-emerald-300 text-[10px]">
                {a.usedByRoutes.join(" · ")}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">sem rota</Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => desligar(a)}
              className="border-zinc-700 text-zinc-400 hover:text-red-300 h-8">
              <PowerOff className="w-3.5 h-3.5 mr-1" /> Desligar
            </Button>
          </div>
        ))}
        {!loading && !accounts.length && (
          <p className="text-sm text-zinc-500 text-center py-6">Nenhuma conta provider encontrada na MetaApi.</p>
        )}
      </div>
    </div>
  )
}
