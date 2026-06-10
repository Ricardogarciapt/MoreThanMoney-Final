"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Server, Copy, Users } from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"

interface Overview {
  configured: boolean
  accounts: Array<{
    id: string
    name: string
    login: string
    server: string
    platform: string
    state: string
    connectionStatus: string
    copyFactoryRoles: string[]
    region: string
  }>
  provisioningProfiles: Array<{ id: string; name: string; version: number; status: string; type: string }>
  strategies: Array<{ id: string; name: string; accountId: string; description?: string }>
  subscribers: Array<{ id: string; name: string; subscriptions: Array<{ strategyId: string; multiplier?: number }> }>
  regions: string[]
}

export default function MtmcopyMetaApiPanel() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await adminApiCall<Overview>("/api/admin/mtmcopy/metaapi")
    if (res.success && res.data) setData(res.data)
    else setError(res.error ?? "Erro ao carregar MetaAPI")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (error || !data?.configured) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        {error ?? "METAAPI_TOKEN não configurado"}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Contas MT · CopyFactory · Provisioning profiles · Regiões MetaAPI
        </p>
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualizar
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-2 text-center">
        {[
          { label: "Contas MT", value: data.accounts.length, icon: Server },
          { label: "Estratégias", value: data.strategies.length, icon: Copy },
          { label: "Subscribers", value: data.subscribers.length, icon: Users },
          { label: "Profiles", value: data.provisioningProfiles.length, icon: Server },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <Icon className="w-4 h-4 mx-auto text-[#D2A63C] mb-1" />
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      <Section title="Contas MetaTrader">
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {data.accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-medium text-white">{a.name}</span>
                <Badge variant="outline" className="text-[10px] border-zinc-700">{a.platform}</Badge>
                {a.copyFactoryRoles.map((r) => (
                  <Badge key={r} className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30">{r}</Badge>
                ))}
              </div>
              <p className="text-zinc-500 font-mono">#{a.login} · {a.server}</p>
              <p className="text-zinc-600 mt-1 truncate">ID: {a.id}</p>
              <p className="text-zinc-500">{a.connectionStatus} · {a.state} · {a.region}</p>
            </div>
          ))}
          {!data.accounts.length && <p className="text-zinc-600 text-sm">Nenhuma conta</p>}
        </div>
      </Section>

      <Section title="Estratégias CopyFactory (providers)">
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {data.strategies.map((s) => (
            <div key={s.id} className="rounded-lg border border-[#D2A63C]/20 bg-[#D2A63C]/5 p-3 text-xs">
              <p className="font-medium text-[#D2A63C]">{s.name} <span className="text-zinc-500 font-mono">({s.id})</span></p>
              <p className="text-zinc-500 mt-1">Provider account: <span className="font-mono">{s.accountId}</span></p>
              {s.description && <p className="text-zinc-600 mt-1">{s.description}</p>}
            </div>
          ))}
          {!data.strategies.length && <p className="text-zinc-600 text-sm">Sem estratégias — cria no painel MetaAPI</p>}
        </div>
      </Section>

      <Section title="Subscribers (trade copiers)">
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {data.subscribers.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-800 p-3 text-xs">
              <p className="text-white font-medium">{s.name}</p>
              <p className="text-zinc-600 font-mono">{s.id}</p>
              <p className="text-zinc-500 mt-1">
                {s.subscriptions.map((sub) => `${sub.strategyId} ×${sub.multiplier ?? 1}`).join(", ") || "Sem subscrições"}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Provisioning profiles (MT terminal)">
        <div className="flex flex-wrap gap-2">
          {data.provisioningProfiles.map((p) => (
            <Badge key={p.id} variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
              {p.name} v{p.version} · {p.status}
            </Badge>
          ))}
          {!data.provisioningProfiles.length && <span className="text-zinc-600 text-sm">—</span>}
        </div>
      </Section>

      {data.regions.length > 0 && (
        <p className="text-xs text-zinc-600">Regiões: {data.regions.join(", ")}</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">{title}</h3>
      {children}
    </div>
  )
}
