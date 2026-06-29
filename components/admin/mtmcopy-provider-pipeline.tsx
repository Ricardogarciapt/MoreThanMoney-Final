"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Save, RefreshCw, ArrowRight, Bot, Cpu, TrendingUp, Users, Plus, Trash2, Settings2,
} from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"
import MtmcopyProviderConfigModal from "@/components/admin/mtmcopy-provider-config-modal"
import { formatExecutionSummary } from "@/lib/mtmcopy/provider-execution"
import type { ProviderExecutionProfile, ProviderRoute } from "@/lib/mtmcopy/signal-sources-config"

type ChannelKey = "premium-signals" | "trade-ideas"

interface SourceRow {
  kind: "channel" | "discovered"
  id: string
  label: string
  chat_id: string | null
  enabled?: boolean
}

interface ConfigPayload {
  enabled_channels: string[]
  provider_routes?: ProviderRoute[]
}

interface ApiPayload {
  config: ConfigPayload
  default_execution: ProviderExecutionProfile
  sources?: SourceRow[]
}

interface MetaOverview {
  strategies: Array<{ id: string; name: string; accountId: string }>
  accounts: Array<{ id: string; name: string; login: string }>
}

function newRouteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `route-${Date.now()}`
}

function emptyRoute(defaults: ProviderExecutionProfile): ProviderRoute {
  return {
    id: newRouteId(),
    label: "Nova rota",
    sender_channel: null,
    account_id: "",
    strategy_id: null,
    ai_strategy_prompt: null,
    enabled: true,
    execution: { ...defaults },
  }
}

export default function MtmcopyProviderPipeline({
  initialRouteId,
}: {
  initialRouteId?: string | null
}) {
  const [routes, setRoutes] = useState<ProviderRoute[]>([])
  const [enabledChannels, setEnabledChannels] = useState<string[]>([])
  const [discoveredSources, setDiscoveredSources] = useState<SourceRow[]>([])
  const [defaults, setDefaults] = useState<ProviderExecutionProfile | null>(null)
  const [meta, setMeta] = useState<MetaOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [configRoute, setConfigRoute] = useState<ProviderRoute | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [src, api] = await Promise.all([
      adminApiCall<ApiPayload>("/api/admin/mtmcopy/telegram-sources"),
      adminApiCall<MetaOverview>("/api/admin/mtmcopy/metaapi"),
    ])
    if (src.success && src.data) {
      setRoutes(src.data.config.provider_routes ?? [])
      setEnabledChannels(src.data.config.enabled_channels ?? [])
      setDiscoveredSources(
        (src.data.sources ?? []).filter((s) => s.kind === "discovered" && s.chat_id),
      )
      setDefaults(src.data.default_execution)
    }
    if (api.success && api.data) setMeta(api.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!initialRouteId || loading || !routes.length) return
    const match = routes.find((r) => r.id === initialRouteId)
    if (match) setConfigRoute(match)
  }, [initialRouteId, loading, routes])

  const persistRoutes = async (nextRoutes: ProviderRoute[]) => {
    setSaving(true)
    const res = await adminApiCall("/api/admin/mtmcopy/telegram-sources", {
      method: "PUT",
      body: JSON.stringify({ provider_routes: nextRoutes }),
    })
    setSaving(false)
    if (res.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    return res.success
  }

  const updateRoute = (id: string, patch: Partial<ProviderRoute>) => {
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRoute = (id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id))
  }

  const addRoute = () => {
    if (!defaults) return
    setRoutes((prev) => [...prev, emptyRoute(defaults)])
  }

  const strategiesForAccount = (accountId: string) => {
    const list = meta?.strategies ?? []
    if (!accountId) return list
    const filtered = list.filter((s) => s.accountId === accountId)
    return filtered.length ? filtered : list
  }

  const handleSave = async () => {
    const ok = await persistRoutes(routes)
    if (ok) load()
  }

  if (loading || !defaults) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  const flow = [
    { icon: Bot, label: "Senders", sub: "Telegram" },
    { icon: Cpu, label: "Parser + IA", sub: "Sinal" },
    { icon: TrendingUp, label: "Mestre(s)", sub: "MetaAPI" },
    { icon: Users, label: "Subscribers", sub: "CopyFactory" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-2 py-2">
        {flow.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center min-w-[72px] text-center">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mb-1">
                <step.icon className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-[11px] font-semibold text-white">{step.label}</span>
              <span className="text-[10px] text-zinc-500">{step.sub}</span>
            </div>
            {i < flow.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 mx-1.5 hidden sm:block" />
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-400 leading-relaxed">
        Define <strong className="text-white">várias rotas</strong> sender → mestre. Cada rota liga um grupo Telegram
        a uma conta MetaAPI + estratégia CopyFactory, com risco próprio na execução do provider.
        Os subscribers copiam com as regras que definirem em <code className="text-[#D2A63C]">/mtmcopy</code>.
      </p>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Rotas CopyFactory ({routes.length})
        </p>
        <Button type="button" size="sm" variant="outline" onClick={addRoute} className="border-emerald-500/40 text-emerald-400">
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar rota
        </Button>
      </div>

      {routes.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          Nenhuma rota configurada. Clica em &quot;Adicionar rota&quot; para mapear sender → conta mestre → estratégia.
        </div>
      )}

      <div className="space-y-4">
        {routes.map((route, index) => {
          const exec = route.execution ?? defaults
          const senderActive =
            (route.sender_channel && enabledChannels.includes(route.sender_channel)) ||
            Boolean(route.sender_chat_id)
          const accountStrategies = strategiesForAccount(route.account_id)

          return (
            <div
              key={route.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                const t = e.target as HTMLElement
                if (t.closest("button, input, select, textarea, [role=switch], label")) return
                setConfigRoute(route)
              }}
              onKeyDown={(e) => {
                // Só ativa o toggle quando o foco é a própria linha — NÃO quando se
                // escreve num input/select/textarea filho (ex.: o label, onde o Espaço
                // abria as configurações em vez de escrever).
                if (e.target !== e.currentTarget) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setConfigRoute(route)
                }
              }}
              className={`rounded-xl border p-4 cursor-pointer transition-colors hover:border-emerald-500/40 ${
                route.enabled !== false
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-900/40 opacity-75"
              } ${configRoute?.id === route.id ? "ring-1 ring-emerald-500/50" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch
                    checked={route.enabled !== false}
                    onCheckedChange={async (v) => {
                      // Persiste IMEDIATAMENTE — pausar/retomar a rota tem efeito já
                      // (o caminho de execução ignora rotas com enabled === false).
                      const next = routes.map((r) => (r.id === route.id ? { ...r, enabled: v } : r))
                      setRoutes(next)
                      await persistRoutes(next)
                    }}
                  />
                  <Input
                    value={route.label ?? ""}
                    onChange={(e) => updateRoute(route.id, { label: e.target.value })}
                    placeholder={`Rota ${index + 1}`}
                    className="max-w-xs bg-zinc-950 border-zinc-700 text-white h-9 font-medium"
                  />
                  {senderActive ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                      sender activo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[10px]">
                      sender inactivo
                    </Badge>
                  )}
                  {route.sender_channel === "premium-signals" ||
                  (route.ai_strategy_prompt ?? "").trim() ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                      Estratégia IA activa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[10px]">
                      IA guideline padrão
                    </Badge>
                  )}
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 ml-1 whitespace-nowrap">
                    <Switch
                      checked={route.tap_to_trade === true}
                      onCheckedChange={async (v) => {
                        // Ativa este provider no Tap to Trade (app-mobile) — persiste já.
                        const next = routes.map((r) => (r.id === route.id ? { ...r, tap_to_trade: v } : r))
                        setRoutes(next)
                        await persistRoutes(next)
                      }}
                      className="scale-75"
                    />
                    <span className={route.tap_to_trade ? "text-[#D2A63C] font-semibold" : ""}>Tap to Trade</span>
                  </label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => removeRoute(route.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Sender Telegram</label>
                  <select
                    value={
                      route.sender_chat_id
                        ? `chat:${route.sender_chat_id}`
                        : route.sender_channel ?? ""
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      if (v.startsWith("chat:")) {
                        updateRoute(route.id, {
                          sender_chat_id: v.slice(5),
                          sender_channel: null,
                        })
                      } else {
                        updateRoute(route.id, {
                          sender_channel: (v || null) as ChannelKey | null,
                          sender_chat_id: null,
                        })
                      }
                    }}
                    className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white px-2"
                  >
                    <option value="">Sem sender (provider manual)</option>
                    <option value="premium-signals">Premium Signals (@MTMgold)</option>
                    <option value="trade-ideas">Trade Ideas (Forex)</option>
                    {discoveredSources.map((s) => (
                      <option key={s.chat_id!} value={`chat:${s.chat_id}`}>
                        Chat: {s.label} ({s.chat_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Conta mestre MetaAPI (provider)</label>
                  <div className="flex gap-2">
                    <select
                      value={route.account_id}
                      onChange={(e) => {
                        const account_id = e.target.value
                        const match = accountStrategies.find((s) => s.accountId === account_id)
                        updateRoute(route.id, {
                          account_id,
                          strategy_id: match?.id ?? route.strategy_id ?? null,
                        })
                      }}
                      className="flex-1 h-9 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white px-2"
                    >
                      <option value="">— Seleccionar —</option>
                      {(meta?.accounts ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} #{a.login}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!route.account_id}
                      onClick={() => setConfigRoute(route)}
                      className="border-emerald-500/40 text-emerald-400 shrink-0 h-9"
                      title="Configurar risco, IA, SL/TP e símbolos"
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    value={route.account_id}
                    onChange={(e) => updateRoute(route.id, { account_id: e.target.value.trim() })}
                    placeholder="...ou inserir Account ID manualmente"
                    className="mt-2 h-8 bg-zinc-950 border-zinc-700 text-xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs text-zinc-500 block mb-1">
                    Estratégia CopyFactory (sender → mestre → subscribers)
                  </label>
                  <select
                    value={route.strategy_id ?? ""}
                    onChange={(e) => updateRoute(route.id, { strategy_id: e.target.value || null })}
                    className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white px-2"
                  >
                    <option value="">— Seleccionar estratégia —</option>
                    {accountStrategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · conta {s.accountId.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Podes ter várias rotas com contas/estratégias diferentes no mesmo ou em senders distintos.
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  Execução: <span className="text-emerald-400">{formatExecutionSummary(exec)}</span>
                  {exec.ai_validation_enabled !== false && (
                    <> · IA ≥ {Math.round((exec.ai_min_confidence ?? 0.35) * 100)}%</>
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 hover:text-emerald-400 h-8 text-xs"
                  onClick={() => setConfigRoute(route)}
                >
                  <Settings2 className="w-3.5 h-3.5 mr-1" />
                  Configurar conta provider
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <MtmcopyProviderConfigModal
        open={Boolean(configRoute)}
        route={configRoute}
        accountLabel={
          configRoute
            ? (meta?.accounts ?? []).find((a) => a.id === configRoute.account_id)?.name
            : undefined
        }
        onClose={() => setConfigRoute(null)}
        onSave={async ({ execution, aiStrategyPrompt }) => {
          if (!configRoute) return
          const nextRoutes = routes.map((r) =>
            r.id === configRoute.id
              ? { ...r, execution, ai_strategy_prompt: aiStrategyPrompt }
              : r,
          )
          setRoutes(nextRoutes)
          updateRoute(configRoute.id, { execution, ai_strategy_prompt: aiStrategyPrompt })
          await persistRoutes(nextRoutes)
        }}
      />

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualizar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            "Guardado"
          ) : (
            <>
              <Save className="w-3.5 h-3.5 mr-1" /> Guardar rotas
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
