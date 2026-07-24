"use client"

// Visão GLOBAL do sistema (admin) — performance agregada de todas as contas.
// Reutiliza o componente PerformanceMetrics do terminal do utilizador.

import { useCallback, useEffect, useState } from "react"
import { Globe, Loader2, RefreshCw } from "lucide-react"
import PerformanceMetrics from "@/components/mtmcopy/performance-metrics"
import type { PerformanceData } from "@/lib/mtmcopy/performance"
import { cn } from "@/lib/utils"

type Payload = {
  performance: PerformanceData | null
  totalTrades: number
  accountsTracked: number
}

export default function MtmcopyGlobalPerformance({ className }: { className?: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/mtmcopy/global-performance", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha a obter performance global")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Globe className="w-4 h-4 text-[#D2A63C]" />
          Visão global do sistema · performance agregada
          {data && (
            <span className="text-[11px] font-normal text-zinc-500">
              {data.totalTrades} trades · {data.accountsTracked} contas
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800"
          title="Atualizar"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#D2A63C] animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : data?.performance ? (
        <PerformanceMetrics performance={data.performance} showRiskAlerts={false} />
      ) : (
        <p className="text-sm text-zinc-500 text-center py-8">
          Sem trades fechadas no sistema ainda para agregar.
        </p>
      )}
    </div>
  )
}
