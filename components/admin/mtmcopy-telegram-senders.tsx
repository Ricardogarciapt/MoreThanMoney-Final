"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Send, RefreshCw, AlertTriangle, Bot } from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"

interface SourceRow {
  kind: "channel" | "discovered"
  id: string
  label: string
  description?: string
  env_var?: string
  chat_id: string | null
  username?: string | null
  configured?: boolean
  enabled: boolean
}

interface Payload {
  bot_username: string
  bot_info?: { ok: boolean; username?: string; error?: string }
  webhook?: { url?: string; last_error_message?: string | null }
  config: {
    enabled_chat_ids: string[]
    enabled_channels: string[]
    provider_strategy_id: string | null
    provider_account_id: string | null
  }
  sources: SourceRow[]
}

export default function MtmcopyTelegramSenders() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [registering, setRegistering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const src = await adminApiCall<Payload>("/api/admin/mtmcopy/telegram-sources")
    if (src.success && src.data) setPayload(src.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const channelSources = payload?.sources.filter((s) => s.kind === "channel") ?? []
  const discoveredSources = payload?.sources.filter((s) => s.kind === "discovered") ?? []

  const toggleChannel = (channelId: string, on: boolean) => {
    if (!payload) return
    const set = new Set(payload.config.enabled_channels)
    if (on) set.add(channelId)
    else set.delete(channelId)
    setPayload({
      ...payload,
      config: { ...payload.config, enabled_channels: [...set] },
      sources: payload.sources.map((s) =>
        s.kind === "channel" && s.id === channelId ? { ...s, enabled: on } : s,
      ),
    })
  }

  const toggleDiscovered = (chatId: string, on: boolean) => {
    if (!payload) return
    const set = new Set(payload.config.enabled_chat_ids)
    if (on) set.add(chatId)
    else set.delete(chatId)
    setPayload({
      ...payload,
      config: { ...payload.config, enabled_chat_ids: [...set] },
      sources: payload.sources.map((s) =>
        s.kind === "discovered" && s.chat_id === chatId ? { ...s, enabled: on } : s,
      ),
    })
  }

  const handleRegisterWebhook = async () => {
    setRegistering(true)
    const res = await adminApiCall("/api/admin/mtmcopy/telegram-sources", {
      method: "POST",
      body: JSON.stringify({ action: "register_webhook" }),
    })
    setRegistering(false)
    if (res.success) await load()
  }

  const handleSave = async () => {
    if (!payload) return
    setSaving(true)
    const res = await adminApiCall("/api/admin/mtmcopy/telegram-sources", {
      method: "PUT",
      body: JSON.stringify(payload.config),
    })
    setSaving(false)
    if (res.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (loading || !payload) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
  }

  const noneEnabled = payload.config.enabled_channels.length === 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Escolhe quais canais Telegram alimentam sinais para a cópia MTM. Podes activar um ou ambos.
        Bot admin: <strong className="text-[#D2A63C]">@{payload.bot_username}</strong>
        {payload.bot_info?.ok === false && (
          <span className="ml-2 text-amber-400 text-xs">({payload.bot_info.error ?? "token inválido"})</span>
        )}
        {payload.bot_info?.username && payload.bot_info.username !== payload.bot_username && (
          <span className="ml-2 text-red-400 text-xs">
            (token aponta para @{payload.bot_info.username} — corrige TELEGRAM_AIBOT_TOKEN)
          </span>
        )}
      </p>

      <p className="text-xs text-zinc-600 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
        Para descobrir novos canais, adiciona <strong className="text-[#D2A63C]">@{payload.bot_username}</strong> como
        administrador do grupo/canal. Não uses @MoreThanMoney_Copierbot.
        {payload.webhook?.url ? (
          <> Webhook: <span className="text-zinc-500">{payload.webhook.url}</span></>
        ) : (
          <> Webhook não registado.</>
        )}
      </p>

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Canais oficiais</p>
        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
          {channelSources.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3 text-sm">
              <Switch checked={row.enabled} onCheckedChange={(v) => toggleChannel(row.id, v)} />
              <div className="flex-1 min-w-0">
                <p className="text-white truncate flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[#D2A63C] shrink-0" />
                  {row.label}
                  {!row.configured && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                      env em falta
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-zinc-600 truncate">
                  {row.env_var}
                  {row.chat_id ? ` · ${row.chat_id}` : " · não configurado na Vercel"}
                </p>
              </div>
            </div>
          ))}
        </div>
        {noneEnabled && (
          <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Nenhum canal activo — os sinais não serão copiados até seleccionares pelo menos um.
          </div>
        )}
      </div>

      {discoveredSources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Chats descobertos pelo bot (opcional)</p>
          <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 max-h-40 overflow-y-auto">
            {discoveredSources.map((row) => (
              <div key={row.id} className="flex items-center gap-3 p-3 text-sm">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => row.chat_id && toggleDiscovered(row.chat_id, v)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{row.label}</p>
                  <p className="text-xs text-zinc-600 truncate">
                    {row.chat_id}
                    {row.username ? ` · @${row.username}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegisterWebhook}
          disabled={registering}
          className="border-zinc-700"
        >
          {registering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5 mr-1" />}
          Registar webhook
        </Button>
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualizar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#D2A63C] text-black">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? "Guardado" : <><Save className="w-3.5 h-3.5 mr-1" /> Guardar canais</>}
        </Button>
      </div>
    </div>
  )
}
