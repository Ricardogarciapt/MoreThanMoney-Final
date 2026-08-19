"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Check, AlertTriangle } from "lucide-react"
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

export default function MtmcopySyncAllPanel() {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          onClick={runSync}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-500 text-white shrink-0"
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
          </div>

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
