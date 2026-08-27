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
  /** Escondido nas apps — mantém o histórico, sai da lista. */
  hidden?: boolean
}

export default function ChatChannelsPanel() {
  const { toast } = useToast()
  const [channels, setChannels] = useState<ChatChannelRow[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [aEditar, setAEditar] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<{ name: string; description: string }>({ name: "", description: "" })

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

  /**
   * A lista é a da BASE DE DADOS, não a das constantes.
   *
   * Antes mostrava só o que o código esperava encontrar — e por isso um canal criado depois (ou
   * escondido) simplesmente não aparecia no painel. Um canal que o admin não vê é um canal que
   * ninguém corrige. Aqui juntam-se os dois lados: o que existe, mais o que devia existir e falta.
   */
  const listados: { slug: string; name: string; description: string | null; hidden: boolean; existe: boolean }[] = [
    ...channels
      .filter((c) => c.parent_slug !== null)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        hidden: c.hidden === true,
        existe: true,
      })),
    ...leafChannels
      .filter((e) => !channels.some((c) => c.slug === e.slug))
      .map((e) => ({ slug: e.slug, name: e.name, description: e.description ?? null, hidden: false, existe: false })),
  ]

  /** Guarda uma alteração de um canal. Devolve para a lista o que o servidor aceitou. */
  const guardar = async (slug: string, patch: Record<string, unknown>) => {
    setAGuardar(slug)
    try {
      const res = await fetch("/api/admin/sync-chat-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...patch }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "não guardou")
      await load()
      toast({ title: "Canal atualizado" })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao guardar", variant: "destructive" })
    } finally {
      setAGuardar(null)
    }
  }

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
          {listados.map((c) => {
            const meta = CHANNEL_META[c.slug]
            const emEdicao = aEditar === c.slug

            return (
              <div
                key={c.slug}
                className={`rounded-lg border p-3 ${
                  !c.existe
                    ? "border-amber-500/30 bg-amber-500/5"
                    : c.hidden
                      ? "border-gray-700/50 bg-gray-900/40 opacity-70"
                      : "border-gray-700/50 bg-gray-800/30"
                }`}
              >
                {emEdicao ? (
                  <div className="space-y-2">
                    <input
                      value={rascunho.name}
                      onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })}
                      placeholder="Nome do canal"
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                    />
                    <input
                      value={rascunho.description}
                      onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })}
                      placeholder="Descrição (o que se lê por baixo do nome, na app)"
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        disabled={aGuardar === c.slug || !rascunho.name.trim()}
                        onClick={async () => {
                          await guardar(c.slug, { name: rascunho.name, description: rascunho.description })
                          setAEditar(null)
                        }}
                      >
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-700" onClick={() => setAEditar(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl">{meta?.emoji ?? "#"}</span>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {c.name}
                          <span className="text-gray-500 font-mono text-xs ml-2">#{c.slug}</span>
                          {c.hidden && (
                            <span className="ml-2 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                              escondido
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {meta?.tag ? `${meta.tag} · ` : ""}
                          {c.description ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!c.existe ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-gray-700 text-xs"
                            onClick={() => {
                              setAEditar(c.slug)
                              setRascunho({ name: c.name, description: c.description ?? "" })
                            }}
                          >
                            Editar
                          </Button>
                          {/* Esconder mantém as mensagens: o canal sai da app, o histórico fica.
                              Apagar levava com ele conversas que alguém já leu. */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-gray-700 text-xs"
                            disabled={aGuardar === c.slug}
                            onClick={() => guardar(c.slug, { hidden: !c.hidden })}
                          >
                            {c.hidden ? "Mostrar" : "Esconder"}
                          </Button>
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        </>
                      )}
                    </div>
                  </div>
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
