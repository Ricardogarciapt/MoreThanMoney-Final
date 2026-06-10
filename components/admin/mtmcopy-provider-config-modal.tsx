"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Bot, Plus, Trash2, Settings2 } from "lucide-react"
import type { ProviderExecutionProfile, ProviderRoute } from "@/lib/mtmcopy/signal-sources-config"
import { DEFAULT_PROVIDER_EXECUTION } from "@/lib/mtmcopy/provider-execution"
import { formatExecutionSummary } from "@/lib/mtmcopy/provider-execution"

type Props = {
  open: boolean
  route: ProviderRoute | null
  accountLabel?: string
  onClose: () => void
  onSave: (execution: ProviderExecutionProfile) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  )
}

export default function MtmcopyProviderConfigModal({
  open,
  route,
  accountLabel,
  onClose,
  onSave,
}: Props) {
  const [profile, setProfile] = useState<ProviderExecutionProfile>(
    route?.execution ?? { ...DEFAULT_PROVIDER_EXECUTION },
  )

  useEffect(() => {
    if (route) {
      setProfile(route.execution ?? { ...DEFAULT_PROVIDER_EXECUTION })
    }
  }, [route?.id, open])

  const set = (patch: Partial<ProviderExecutionProfile>) =>
    setProfile((p) => ({ ...p, ...patch }))

  if (!route) return null

  const routeTitle =
    route.label ||
    (route.sender_channel === "premium-signals"
      ? "MTM Auto — Premium"
      : route.sender_channel === "trade-ideas"
        ? "MTM Auto — Trade Ideas"
        : "Provider")

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D2A63C]">
            <Settings2 className="w-5 h-5" />
            {routeTitle}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Conta provider: <span className="font-mono text-zinc-300">{accountLabel || route.account_id}</span>
            {route.strategy_id && (
              <> · Estratégia <span className="font-mono">{route.strategy_id.slice(0, 12)}…</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <Section title="Validação IA em tempo real">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-zinc-300">AI Trade Validation</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Filtra sinais com score de confiança abaixo do mínimo (parser + IA).
                </p>
              </div>
              <Switch
                checked={profile.ai_validation_enabled !== false}
                onCheckedChange={(v) => set({ ai_validation_enabled: v })}
              />
            </div>
            {profile.ai_validation_enabled !== false && (
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Confiança mínima ({Math.round((profile.ai_min_confidence ?? 0.35) * 100)}%)
                </label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="1"
                  value={profile.ai_min_confidence ?? 0.35}
                  onChange={(e) => set({ ai_min_confidence: Number(e.target.value) })}
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
              </div>
            )}
          </Section>

          <Section title="Money Management">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Modo</label>
                <select
                  value={profile.lot_mode}
                  onChange={(e) =>
                    set({ lot_mode: e.target.value as ProviderExecutionProfile["lot_mode"] })
                  }
                  className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-2"
                >
                  <option value="risk_percent">Percentagem de risco</option>
                  <option value="fixed">Lote fixo</option>
                  <option value="multiplier">Multiplicador</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Valor</label>
                <Input
                  type="number"
                  step="0.01"
                  value={profile.lot_value}
                  onChange={(e) => set({ lot_value: Number(e.target.value) })}
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-500 block mb-1">Risco máx. diário (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={profile.max_risk_percent ?? ""}
                  onChange={(e) =>
                    set({
                      max_risk_percent: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="opcional"
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
              </div>
            </div>
            <p className="text-xs text-emerald-400/80">{formatExecutionSummary(profile)}</p>
          </Section>

          <Section title="Stop Loss & Take Profit">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Stop Loss</label>
                <select
                  value={profile.sl_option ?? "from_room"}
                  onChange={(e) =>
                    set({ sl_option: e.target.value as "from_room" | "none", copy_sl: e.target.value !== "none" })
                  }
                  className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-2"
                >
                  <option value="from_room">SL da sala (Telegram)</option>
                  <option value="none">Sem SL</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Take Profit</label>
                <select
                  value={profile.tp_option ?? "from_room"}
                  onChange={(e) =>
                    set({ tp_option: e.target.value as "from_room" | "none", copy_tp: e.target.value !== "none" })
                  }
                  className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-2"
                >
                  <option value="from_room">TP da sala (Telegram)</option>
                  <option value="none">Sem TP</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.execute_if_no_sl !== false}
                  onCheckedChange={(v) => set({ execute_if_no_sl: v })}
                />
                Executar se não houver SL
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.execute_if_no_tp !== false}
                  onCheckedChange={(v) => set({ execute_if_no_tp: v })}
                />
                Executar se não houver TP
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.auto_trailing_stop}
                  onCheckedChange={(v) => set({ auto_trailing_stop: v })}
                />
                Trailing stop
              </label>
            </div>
          </Section>

          <Section title="Prefixos & Sufixos de símbolos">
            <select
              value={profile.symbol_prefix_suffix_mode ?? "auto"}
              onChange={(e) =>
                set({ symbol_prefix_suffix_mode: e.target.value as "auto" | "manual" })
              }
              className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-2 mb-2"
            >
              <option value="auto">Auto-Detect (recomendado)</option>
              <option value="manual">Manual (prefixo/sufixo)</option>
            </select>
            {profile.symbol_prefix_suffix_mode === "manual" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Prefixo"
                  value={profile.symbol_prefix ?? ""}
                  onChange={(e) => set({ symbol_prefix: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
                <Input
                  placeholder="Sufixo"
                  value={profile.symbol_suffix ?? ""}
                  onChange={(e) => set({ symbol_suffix: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
              </div>
            )}
          </Section>

          <Section title="Symbol Matching">
            <p className="text-xs text-zinc-500">
              Mapeia símbolos do sinal para o nome na plataforma MT5.
            </p>
            {(profile.symbol_mappings ?? []).map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="No sinal (ex: GOLD)"
                  value={m.signal_symbol}
                  onChange={(e) => {
                    const next = [...(profile.symbol_mappings ?? [])]
                    next[i] = { ...next[i], signal_symbol: e.target.value }
                    set({ symbol_mappings: next })
                  }}
                  className="bg-zinc-900 border-zinc-700 h-8 text-xs"
                />
                <Input
                  placeholder="Na plataforma (ex: XAUUSD)"
                  value={m.platform_symbol}
                  onChange={(e) => {
                    const next = [...(profile.symbol_mappings ?? [])]
                    next[i] = { ...next[i], platform_symbol: e.target.value }
                    set({ symbol_mappings: next })
                  }}
                  className="bg-zinc-900 border-zinc-700 h-8 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    set({
                      symbol_mappings: (profile.symbol_mappings ?? []).filter((_, j) => j !== i),
                    })
                  }
                  className="text-red-400 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-zinc-700 h-8 text-xs"
              onClick={() =>
                set({
                  symbol_mappings: [
                    ...(profile.symbol_mappings ?? []),
                    { signal_symbol: "", platform_symbol: "" },
                  ],
                })
              }
            >
              <Plus className="w-3 h-3 mr-1" /> Adicionar match
            </Button>
          </Section>

          <Section title="Comentário MetaTrader">
            <Input
              placeholder="Comentário opcional nas ordens MT5"
              value={profile.mt_comment ?? ""}
              onChange={(e) => set({ mt_comment: e.target.value || null })}
              className="bg-zinc-900 border-zinc-700 h-9"
            />
          </Section>

          <Section title="Horário de trading">
            <select
              value={profile.trading_schedule?.mode ?? "always"}
              onChange={(e) =>
                set({
                  trading_schedule: {
                    ...(profile.trading_schedule ?? { mode: "always" }),
                    mode: e.target.value as "always" | "custom",
                  },
                })
              }
              className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-2"
            >
              <option value="always">24/7</option>
              <option value="custom">Horário personalizado (UTC)</option>
            </select>
            {profile.trading_schedule?.mode === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="Hora início UTC"
                  value={profile.trading_schedule?.start_hour ?? 8}
                  onChange={(e) =>
                    set({
                      trading_schedule: {
                        ...profile.trading_schedule!,
                        start_hour: Number(e.target.value),
                      },
                    })
                  }
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
                <Input
                  type="number"
                  min={0}
                  max={24}
                  placeholder="Hora fim UTC"
                  value={profile.trading_schedule?.end_hour ?? 20}
                  onChange={(e) =>
                    set({
                      trading_schedule: {
                        ...profile.trading_schedule!,
                        end_hour: Number(e.target.value),
                      },
                    })
                  }
                  className="bg-zinc-900 border-zinc-700 h-9"
                />
              </div>
            )}
          </Section>

          <Section title="Close & Modification orders">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.copy_close_orders !== false}
                  onCheckedChange={(v) => set({ copy_close_orders: v })}
                />
                Copiar fechos
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.copy_modify_orders !== false}
                  onCheckedChange={(v) => set({ copy_modify_orders: v })}
                />
                Copiar modificações
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={Boolean(profile.close_opposite_positions)}
                  onCheckedChange={(v) => set({ close_opposite_positions: v })}
                />
                Fechar posições opostas
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={profile.reverse_signals}
                  onCheckedChange={(v) => set({ reverse_signals: v })}
                />
                Inverter sinais
              </label>
            </div>
          </Section>

          <Section title="Símbolos — executar / evitar">
            <div className="space-y-2">
              <Input
                placeholder="Executar apenas (separados por vírgula)"
                value={(profile.symbols_execute_only ?? []).join(", ")}
                onChange={(e) =>
                  set({
                    symbols_execute_only: e.target.value
                      ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      : null,
                  })
                }
                className="bg-zinc-900 border-zinc-700 h-9 text-xs"
              />
              <Input
                placeholder="Evitar símbolos (separados por vírgula)"
                value={(profile.symbols_avoid ?? []).join(", ")}
                onChange={(e) =>
                  set({
                    symbols_avoid: e.target.value
                      ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      : null,
                  })
                }
                className="bg-zinc-900 border-zinc-700 h-9 text-xs"
              />
            </div>
          </Section>

          <Section title="Excepções de lote por símbolo">
            {(profile.symbol_lot_exceptions ?? []).map((ex, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Símbolo"
                  value={ex.symbol}
                  onChange={(e) => {
                    const next = [...(profile.symbol_lot_exceptions ?? [])]
                    next[i] = { ...next[i], symbol: e.target.value }
                    set({ symbol_lot_exceptions: next })
                  }}
                  className="bg-zinc-900 border-zinc-700 h-8 text-xs"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Lote"
                  value={ex.lot}
                  onChange={(e) => {
                    const next = [...(profile.symbol_lot_exceptions ?? [])]
                    next[i] = { ...next[i], lot: Number(e.target.value) }
                    set({ symbol_lot_exceptions: next })
                  }}
                  className="bg-zinc-900 border-zinc-700 h-8 text-xs w-24"
                />
                <button
                  type="button"
                  onClick={() =>
                    set({
                      symbol_lot_exceptions: (profile.symbol_lot_exceptions ?? []).filter(
                        (_, j) => j !== i,
                      ),
                    })
                  }
                  className="text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-zinc-700 h-8 text-xs"
              onClick={() =>
                set({
                  symbol_lot_exceptions: [
                    ...(profile.symbol_lot_exceptions ?? []),
                    { symbol: "", lot: 0.01 },
                  ],
                })
              }
            >
              <Plus className="w-3 h-3 mr-1" /> Excepção
            </Button>
          </Section>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(profile)
              onClose()
            }}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <Bot className="w-4 h-4 mr-1.5" />
            Guardar configuração
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
