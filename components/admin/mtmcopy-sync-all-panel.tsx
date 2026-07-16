"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Zap, Check, AlertTriangle } from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"

interface SyncResult {
  success: boolean
  ok: boolean
  metaapi_configured: boolean
  provider: {
    routes_repaired: boolean
    routes_count: number
    scaling: Array<{ strategy_id: string; account_id: string; ok: boolean; error?: string }>
  }
  connections: Array<{
    connection_id: string
    email: string | null
    copy_method: string
    ok: boolean
    actions: string[]
    error?: string
  }>
  warnings?: Array<{
    connection_id: string
    user_id: string
    kind: string
    detail: string
  }>
  summary: { total: number; ok: number; failed: number }
}

export default function MtmcopySyncAllPanel({ embedded = false }: { embedded?: boolean }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSync = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    const res = await adminApiCall<SyncResult>("/api/admin/mtmcopy/sync-all", {
      method: "POST",
      body: JSON.stringify({ force: true }),
    })
    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setError(res.error ?? "Falha na sincronização")
    }
    setRunning(false)
  }

  return (
    <div
      className={
        embedded
          ? "space-y-4"
          : "rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5 space-y-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-violet-300 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Sincronização total MTMcopier
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Alinha Supabase, rotas provider, estratégias CopyFactory, subscribers, riscos prop firm,
              baselines e erros pendentes — MetaAPI, site e motor de trades/parciais/IA.
            </p>
          </div>
        )}
        <Button
          onClick={runSync}
          disabled={running}
          className={`bg-violet-600 hover:bg-violet-500 text-white shrink-0 ${embedded ? "" : "ml-auto"}`}
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sincronizar tudo
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge className={result.ok ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}>
              {result.ok ? "Sistema sincronizado" : "Concluído com avisos"}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              MetaAPI {result.metaapi_configured ? "OK" : "offline"}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              Provider: {result.provider.routes_count} rotas
              {result.provider.routes_repaired ? " · reparadas" : ""}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              Subscribers: {result.summary.ok}/{result.summary.total} OK
            </Badge>
            {result.warnings && result.warnings.length > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300">
                {result.warnings.length} aviso{result.warnings.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Divergências a rever (não alteram trading)
              </p>
              <div className="space-y-1">
                {result.warnings.map((w) => (
                  <div key={`${w.connection_id}-${w.kind}`} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-amber-400/80 font-mono">{w.kind}</span>
                    <span className="text-zinc-400">{w.detail}</span>
                    <span className="text-zinc-600 font-mono">{w.connection_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.provider.scaling.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs font-semibold text-zinc-400 mb-2">Estratégias provider (CF)</p>
              <div className="space-y-1">
                {result.provider.scaling.map((s) => (
                  <div key={s.strategy_id} className="flex items-center gap-2 text-xs font-mono">
                    {s.ok ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                    )}
                    <span className="text-violet-300">{s.strategy_id}</span>
                    <span className="text-zinc-600 truncate">{s.account_id}</span>
                    {s.error && <span className="text-red-400">{s.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.connections.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold text-zinc-400 mb-2">Contas subscriber</p>
              <div className="space-y-1">
                {result.connections.map((c) => (
                  <div key={c.connection_id} className="flex flex-wrap items-center gap-2 text-xs">
                    {c.ok ? (
                      <Check className="w-3 h-3 text-green-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    )}
                    <span className="text-zinc-300 truncate max-w-[180px]">{c.email ?? c.connection_id.slice(0, 8)}</span>
                    <span className="text-zinc-600">{c.copy_method}</span>
                    {c.actions.length > 0 && (
                      <span className="text-zinc-500">{c.actions.join(", ")}</span>
                    )}
                    {c.error && <span className="text-red-400">{c.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
