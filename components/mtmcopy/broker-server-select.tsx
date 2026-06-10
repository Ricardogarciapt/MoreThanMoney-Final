"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Check, Loader2, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface BrokerGroup {
  broker: string
  servers: string[]
}

interface Props {
  platform: "mt4" | "mt5"
  server: string
  onServerChange: (server: string) => void
  disabled?: boolean
}

export default function BrokerServerSelect({ platform, server, onServerChange, disabled }: Props) {
  const [query, setQuery] = useState("")
  const [brokers, setBrokers] = useState<BrokerGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [metaapi, setMetaapi] = useState(true)
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const params = new URLSearchParams({ platform, limit: "50" })
      if (q.trim()) params.set("q", q.trim())
      const res = await fetch(`/api/mtmcopy/brokers?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      setBrokers(data.brokers ?? [])
      setMetaapi(data.metaapi !== false)
    } finally {
      setLoading(false)
    }
  }, [platform])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, platform, search])

  const allServers = useMemo(
    () =>
      brokers.flatMap((b) =>
        b.servers.map((s) => ({ broker: b.broker, server: s })),
      ),
    [brokers],
  )

  const filteredBrokers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return brokers
    return brokers
      .map((b) => ({
        ...b,
        servers: b.servers.filter(
          (s) =>
            s.toLowerCase().includes(q) ||
            b.broker.toLowerCase().includes(q),
        ),
      }))
      .filter((b) => b.broker.toLowerCase().includes(q) || b.servers.length > 0)
  }, [brokers, query])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">Corretora / Servidor *</label>
      {!metaapi && (
        <p className="text-xs text-amber-400">Pesquisa indisponível — escreve o servidor manualmente abaixo.</p>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar corretora ou servidor (ex: IC Markets, XM, Pepperstone...)"
          className="pl-9 bg-gray-800 border-gray-700 text-white"
          disabled={disabled}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />}
      </div>

      {allServers.length > 0 && (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/80 divide-y divide-gray-800">
          {filteredBrokers.map((b) => (
            <div key={b.broker}>
              <button
                type="button"
                onClick={() => setExpandedBroker(expandedBroker === b.broker ? null : b.broker)}
                className="w-full text-left px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-800 flex justify-between"
              >
                <span>{b.broker}</span>
                <span className="text-xs text-gray-500">{b.servers.length} servidor{b.servers.length !== 1 ? "es" : ""}</span>
              </button>
              {(expandedBroker === b.broker || query.trim().length >= 2) &&
                b.servers.map((s) => (
                  <button
                    key={`${b.broker}-${s}`}
                    type="button"
                    onClick={() => onServerChange(s)}
                    className={`w-full text-left pl-6 pr-3 py-2 text-xs flex items-center justify-between hover:bg-[#D2A63C]/10 ${
                      server === s ? "bg-[#D2A63C]/15 text-[#D2A63C]" : "text-gray-400"
                    }`}
                  >
                    <span className="truncate">{s}</span>
                    {server === s && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <Input
        value={server}
        onChange={(e) => onServerChange(e.target.value)}
        placeholder="Nome exacto do servidor MT (podes colar da corretora)"
        className="bg-gray-800 border-gray-700 text-white text-sm"
        disabled={disabled}
      />
      <p className="text-xs text-gray-500">
        {allServers.length
          ? `${allServers.length} servidores encontrados · ${platform.toUpperCase()}`
          : `A carregar corretoras populares · ${platform.toUpperCase()}`}
      </p>
    </div>
  )
}
