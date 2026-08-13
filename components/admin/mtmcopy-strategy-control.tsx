"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"

type Switches = {
  sensei: boolean
  forex: boolean
  premium: boolean
  goldkiller: boolean
  premium_price_monitor: boolean
  premium_subscriber_exits: boolean
}
type PerpsRules = {
  enabled: boolean
  blacklist: string[]
  slMaxPct: number
  cooldownMinutes: number
  funding?: { enabled?: boolean }
}
type ScoreRow = { sym?: string; netR?: number; wr?: number; sample?: number }
type Config = {
  switches: Switches
  primeverse: { mode: string }
  forexSwings: { mode: string }
  perpsRules: PerpsRules
  perpsSuggestions: { keep: ScoreRow[]; cut: ScoreRow[] }
  envFlags: Record<string, boolean>
}

const STRATEGY_LABELS: { key: keyof Switches; label: string; hint: string }[] = [
  { key: "premium", label: "MTM Auto Premium", hint: "London/NY Intelligence · conta mestre USD" },
  { key: "sensei", label: "Sensei (Ouro/BTC)", hint: "Webhook · scanner scored" },
  { key: "goldkiller", label: "GoldKiller", hint: "XAUUSD scanner" },
  { key: "forex", label: "MTM Auto Forex", hint: "Trade Ideas · conta 5IHE" },
  { key: "premium_price_monitor", label: "Premium · monitor de preço", hint: "Fecha parciais/BE por PREÇO (não por mensagem)" },
  { key: "premium_subscriber_exits", label: "Premium · exits nos subscritores", hint: "⚠️ dinheiro real de subscritores" },
]

const ENV_FLAG_LABELS: Record<string, string> = {
  bybit_perps_exec: "Perps Bybit (execução live)",
  sensei_provider_exec: "Sensei (execução no provider)",
  runner_mode: "Modo runner (deixa correr no TP final)",
  premium_fast_exec: "Premium fast-exec",
  quick_win: "Perps quick-win (scalp 0.5R)",
  trend_guard: "Perps trend-guard (BTC 4h)",
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-zinc-700"
      } ${disabled ? "opacity-50" : ""}`}
      aria-pressed={on}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  )
}

export default function MtmcopyStrategyControl() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/mtmcopy/strategy-config", { credentials: "include" })
      const d = await r.json()
      if (d.ok) setCfg(d as Config)
      else setMsg(d.error ?? "Erro ao carregar")
    } catch {
      setMsg("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true)
      setMsg(null)
      try {
        const r = await fetch("/api/admin/mtmcopy/strategy-config", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        const d = await r.json()
        if (d.ok) {
          setMsg("Gravado ✓")
          await load()
        } else {
          setMsg(d.error ?? "Erro ao gravar")
        }
      } catch {
        setMsg("Erro de rede")
      } finally {
        setSaving(false)
      }
    },
    [load],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }
  if (!cfg) {
    return (
      <div className="text-center py-10 text-zinc-400">
        {msg ?? "Sem dados"}
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={load} className="border-zinc-700">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Tentar de novo
          </Button>
        </div>
      </div>
    )
  }

  const setSwitch = (key: keyof Switches, val: boolean) => {
    setCfg({ ...cfg, switches: { ...cfg.switches, [key]: val } })
    save({ switches: { [key]: val } })
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="text-sm px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {msg}
        </div>
      )}

      {/* Interruptores por estratégia (runtime, sem redeploy) */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-200">On/Off por estratégia · runtime (sem redeploy)</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-zinc-800/70">
          {STRATEGY_LABELS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-zinc-500">{hint}</p>
              </div>
              <Toggle on={cfg.switches[key]} onClick={() => setSwitch(key, !cfg.switches[key])} disabled={saving} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Modos de execução PrimeVerse / Forex Swings */}
      <div className="grid sm:grid-cols-2 gap-4">
        {([
          { k: "primeverse", label: "PrimeVerse", cur: cfg.primeverse.mode, field: "primeverse_mode" },
          { k: "forexSwings", label: "Forex Swings (James)", cur: cfg.forexSwings.mode, field: "forex_swings_mode" },
        ] as const).map(({ k, label, cur, field }) => (
          <Card key={k} className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-200">{label} — modo de execução</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {["off", "shadow", "live"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={saving}
                    onClick={() => save({ [field]: m })}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      cur === m
                        ? m === "live"
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                          : m === "shadow"
                            ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                            : "bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-600"
                        : "bg-zinc-800/50 text-zinc-500 hover:text-white"
                    }`}
                  >
                    {m === "off" ? "Off" : m === "shadow" ? "Shadow" : "Live"}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Regras do gate de perps */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Perps · limites de risco (afináveis sem redeploy)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400">
              Cap de SL (% máx)
              <input
                type="number"
                step="0.1"
                defaultValue={cfg.perpsRules.slMaxPct}
                onBlur={(e) => save({ perps_rules: { slMaxPct: Number(e.target.value) } })}
                className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Cooldown por par (min)
              <input
                type="number"
                step="5"
                defaultValue={cfg.perpsRules.cooldownMinutes}
                onBlur={(e) => save({ perps_rules: { cooldownMinutes: Number(e.target.value) } })}
                className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Blacklist de pares:{" "}
            {cfg.perpsRules.blacklist.length
              ? cfg.perpsRules.blacklist.join(", ")
              : "vazia — a watchlist do alerta TradingView é a fonte de verdade dos pares."}
          </p>
        </CardContent>
      </Card>

      {/* Sugestões de watchlist (do scorecard) */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200 flex items-center gap-2">
            Perps · sugestões de watchlist <span className="text-xs font-normal text-zinc-500">(do scorecard, netR)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-400 mb-2">✓ Manter (net-positivos)</p>
            <div className="space-y-1">
              {cfg.perpsSuggestions.keep.length === 0 && <p className="text-xs text-zinc-600">—</p>}
              {cfg.perpsSuggestions.keep.map((r) => (
                <div key={r.sym} className="flex justify-between text-xs">
                  <span className="text-zinc-300">{r.sym}</span>
                  <span className="text-emerald-400 tabular-nums">+{(r.netR ?? 0).toFixed(1)}R · {r.wr ?? 0}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-2">✕ Remover da watchlist (net-negativos)</p>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {cfg.perpsSuggestions.cut.length === 0 && <p className="text-xs text-zinc-600">—</p>}
              {cfg.perpsSuggestions.cut.map((r) => (
                <div key={r.sym} className="flex justify-between text-xs">
                  <span className="text-zinc-400">{r.sym}</span>
                  <span className="text-red-400/80 tabular-nums">{(r.netR ?? 0).toFixed(1)}R · {r.wr ?? 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estado das env-flags (só leitura) */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Flags de env (Vercel) — só leitura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 mb-3">
            Estas são env vars da Vercel — muda-as no painel da Vercel (não aqui). Mostradas para veres o estado real.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(cfg.envFlags).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-3 py-2">
                <span className="text-xs text-zinc-300">{ENV_FLAG_LABELS[k] ?? k}</span>
                {v ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> ON</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><XCircle className="w-3.5 h-3.5" /> OFF</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={saving} className="border-zinc-700">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Recarregar
        </Button>
      </div>
    </div>
  )
}
