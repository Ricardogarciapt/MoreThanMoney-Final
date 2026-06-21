"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, RefreshCw, ExternalLink, CheckCircle, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { DEFAULT_CHAT_CHANNELS } from "@/lib/default-chat-channels"
import { CHANNEL_META } from "@/components/mobile/chat-channel-meta"
import { useToast } from "@/hooks/use-toast"

interface ChatChannelRow {
  id?: string
  slug: string
  name: string
  description: string | null
  parent_slug: string | null
  position: number
}

export default function ChatChannelsPanel() {
  const { toast } = useToast()
  const [channels, setChannels] = useState<ChatChannelRow[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/sync-chat-channels")
      const data = await res.json()
      if (data.success) {
        setChannels(data.channels || [])
        setMissing(data.missing || [])
        setSynced(data.synced ?? false)
      }
    } catch {
      toast({ title: "Erro ao carregar canais", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/sync-chat-channels", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast({
          title: "Canais sincronizados",
          description: data.message,
        })
        setChannels(data.channels || [])
        setMissing([])
        setSynced(true)
      } else {
        toast({ title: "Erro", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erro ao sincronizar", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  const leafChannels = DEFAULT_CHAT_CHANNELS.filter((c) => c.parent_slug !== null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {synced ? (
            <Badge className="bg-green-500/20 text-green-400">
              <CheckCircle className="w-3 h-3 mr-1" />
              Sincronizado com app-mobile
            </Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {missing.length > 0 ? `Faltam ${missing.length} canais` : "Verificar sincronização"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/app-mobile?tab=chat" target="_blank">
            <Button size="sm" variant="outline" className="border-[#D2A63C]/40">
              <ExternalLink className="w-3 h-3 mr-1" />
              Ver na app
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
          >
            {syncing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 mr-2" />
            )}
            Sincronizar canais MTM
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-[#D2A63C]" />
        </div>
      ) : (
        <div className="space-y-2">
          {leafChannels.map((expected) => {
            const db = channels.find((c) => c.slug === expected.slug)
            const meta = CHANNEL_META[expected.slug]
            const exists = Boolean(db)

            return (
              <div
                key={expected.slug}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                  exists ? "border-gray-700/50 bg-gray-800/30" : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">{meta?.emoji ?? "#"}</span>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {db?.name ?? expected.name}
                      <span className="text-gray-500 font-mono text-xs ml-2">#{expected.slug}</span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {meta?.tag ? `${meta.tag} · ` : ""}
                      {expected.description}
                    </p>
                  </div>
                </div>
                {exists ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Estes canais correspondem exactamente ao tab <strong>Chat</strong> em{" "}
        <code className="text-gray-400">/app-mobile</code>. A sincronização actualiza a tabela{" "}
        <code className="text-gray-400">chat_channels</code> sem apagar mensagens existentes.
      </p>
    </div>
  )
}
