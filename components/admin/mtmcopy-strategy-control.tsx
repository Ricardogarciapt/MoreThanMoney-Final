"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { INTAKE_CHANNELS } from "@/lib/mtmcopy/intake-channels"

type Switches = {
  sensei: boolean
  sensei_entries: boolean
  forex: boolean
  premium: boolean
  goldkiller: boolean
  premium_price_monitor: boolean
  premium_subscriber_exits: boolean
  perps_position_monitor: boolean
  t2t_auto_close: boolean
  t2t_price_monitor: boolean
  trailing_tempo_real: boolean
  premium_master_exec: boolean
  funded_copier: boolean
}
type PerpsRules = {
  enabled: boolean
  blacklist: string[]
  slMaxPct: number
  cooldownMinutes: number
  funding?: { enabled?: boolean }
}
type ScoreRow = { sym?: string; netR?: number; wr?: number; sample?: number }
type ShadowBucket = {
  n: number
  hit_target: number
  hit_sl: number
  open: number
  expired: number
  winRate: number | null
  avgRunR: number | null
}
type SenseiShadow = {
  config: { enabled: boolean; allowSell: boolean; goldTargetDistance: number }
  summary: { all: ShadowBucket; buy: ShadowBucket; sell: ShadowBucket }
} | null
type Intake = Record<string, boolean>
type Config = {
  switches: Switches
  intake?: Intake
  primeverse: { mode: string }
  forexSwings: { mode: string }
  perpsRules: PerpsRules
  perpsSuggestions: { keep: ScoreRow[]; cut: ScoreRow[] }
  senseiShadow: SenseiShadow
  envFlags: Record<string, boolean>
}

/** Toggles AGRUPADOS por natureza (estratégias · motores · T2T) — a lista corrida já não se lia. */
const STRATEGY_GROUPS: { group: string; items: { key: keyof Switches; label: string; hint: string }[] }[] = [
  // 2026-08-27: a lista passou a ser a das estratégias que EXISTEM. As contas do GoldKiller
  // (SDNb), do Forex/Trade Ideas (5IHE), do Booster (pIrJ) e do Gold Did (e68I) foram apagadas na
  // MetaApi — devolvem 404. Ter aqui um interruptor para uma conta que não existe é pior do que
  // não ter interruptor nenhum: parece que se pode ligar. Os switches continuam no runtime.
  {
    group: "Estratégias",
    items: [
      { key: "premium", label: "MTM Auto Premium · caminho antigo", hint: "Execução do Premium pelo processador de sinais (grupo Telegram → conta MESTRE MT5 Hvmg a21178c2 + CopyFactory). Com o sinal do Premium em LIVE no motor das mestres este caminho cala-se sozinho — ver o topo da tab." },
      { key: "premium_master_exec", label: "Premium · fluxo p/ conta MESTRE (caminho antigo)", hint: "OFF = semi-automático: o sinal vai direto às contas dos subscritores (sem conta mestre nem CopyFactory)" },
      { key: "sensei", label: "MTM Auto Sensei · entrada do sinal", hint: "Deixa o sinal do TradingView do Sensei seguir para execução — hoje para a mestre SIM do motor das mestres (CopyFactory hbKq/Oca7 cortada a 18/09). OFF também corta a entrada na mestre." },
      { key: "goldkiller", label: "MTM Auto GoldKiller · entrada do sinal", hint: "Deixa o sinal do TradingView do GoldKiller seguir para execução (CopyFactory Wl1B enquanto não for cortada; mestre SIM no motor das mestres). OFF corta os dois." },
      { key: "sensei_entries", label: "Sensei · entradas novas", hint: "OFF pausa entradas e MANTÉM a gestão das posições abertas" },
    ],
  },
  {
    group: "Motores de gestão",
    items: [
      { key: "premium_price_monitor", label: "Premium · monitor de preço", hint: "Fecha parciais/BE por PREÇO (não por mensagem)" },
      { key: "trailing_tempo_real", label: "Trailing segue o preço ao vivo", hint: "Lê o tick a cada passagem em vez do instantâneo da posição: o stop cola-se ao preço e devolve menos nos recuos. Custa uma leitura por posição — vale a pena em scalp, não em swing." },
      { key: "premium_subscriber_exits", label: "Premium · exits nos subscritores", hint: "⚠️ dinheiro real de subscritores" },
      { key: "perps_position_monitor", label: "Perps · monitor de posição", hint: "Acompanha a posição Bybit (Entry Hit → parcial → BE → fecho)" },
      { key: "funded_copier", label: "MTM Funded · cópia para a conta do aluno", hint: "OFF = o serviço não ABRE cópias novas; fechos, parciais e SL/TP de cópias abertas passam sempre" },
    ],
  },
  {
    group: "Tap to Trade",
    items: [
      { key: "t2t_price_monitor", label: "T2T · motor de preço (tempo real)", hint: "Gere as posições dos seguidores por PREÇO: entry-hit → parciais → BE → trailing → fecho" },
      { key: "t2t_auto_close", label: "T2T · fecho automático", hint: "Fonte fecha/cancela → apaga/fecha as ordens T2T dos seguidores" },
    ],
  },
]

/**
 * O que saiu, e porquê — para não se procurar o interruptor que já não existe.
 *
 * Quase todas foram apagadas na MetaApi (404) — mas não todas: o Premium (530d2e07) e o Aurum Flow
 * continuam vivos lá. Saíram daqui por deixarem de executar, não por terem desaparecido. Cada linha
 * diz qual é o caso, porque «apagada» e «reformada» pedem acções diferentes de quem lê o painel.
 */
const RETIRADAS = [
  "Premium MxsR (conta 530d2e07) · a conta CONTINUA viva na MetaApi (é a fonte de preços do motor simulado), mas já não executa: o Premium passa pela mestre SIM do motor das mestres",
  "PrimeVerse · execução directa numa conta MT5 (12862cb4, apagada na MetaApi) — Edge/King/Wolf seguem pelas mestres SIM; o modo saiu deste painel",
  "Espelho provider como FONTE de execução (082/084) · substituído pelo motor das mestres nas estratégias que lá estão",
  "GoldKiller (SDNb) · conta apagada na MetaApi (a GoldKiller actual é Wl1B)",
  "MTM Auto Forex / Trade Ideas (5IHE) · conta apagada",
  "20X Booster (pIrJ) · conta apagada",
  "Gold Did (e68I) · conta apagada",
  "Aurum Flow (vT8w · conta a4ea0c45) · vivo, mas gerido na fonte — sem motor nosso",
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

/** Interruptor → estratégia no motor das mestres (116), para mostrar o modo de lá ao lado. */
const MOTOR_POR_SWITCH: Partial<Record<keyof Switches, string>> = {
  premium: "premium-ouro", premium_master_exec: "premium-ouro", sensei: "sensei", sensei_entries: "sensei", goldkiller: "goldkiller",
}

export default function MtmcopyStrategyControl() {
  const [motor, setMotor] = useState<Record<string, string>>({})
  useEffect(() => {
    // Só leitura, e falhar aqui não esconde nada: os interruptores funcionam sem isto.
    fetch("/api/admin/mtmauto-copia/mestres", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { estrategias?: { slug: string; modo: string; sinalModo: string; executor: string }[] } | null) => {
        const m: Record<string, string> = {}
        for (const e of d?.estrategias ?? []) m[e.slug.toLowerCase()] = `propagação ${e.modo} · sinal ${e.sinalModo} · executa ${e.executor}`
        setMotor(m)
      })
      .catch(() => undefined)
  }, [])
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

  const setIntake = (key: string, val: boolean) => {
    setCfg({ ...cfg, intake: { ...(cfg.intake ?? {}), [key]: val } })
    save({ intake: { [key]: val } })
  }

  const setSwitch = (key: keyof Switches, val: boolean) => {
    setCfg({ ...cfg, switches: { ...cfg.switches, [key]: val } })
    save({ switches: { [key]: val } })
  }

  return (
    <div className="space-y-6">
      {/* Cartão do cascade «Copy Trader Ricardo Garcia» retirado da UI (pedido Ricardo 2026-08-19).
          A cópia continua ATIVA — isto era só o atalho de configuração. */}

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
        <CardContent className="space-y-4">
          {STRATEGY_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#D2A63C]/80">{group}</p>
              <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800/70 bg-zinc-950/30 px-3">
                {items.map(({ key, label, hint }) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {label}
                        {motor[MOTOR_POR_SWITCH[key] ?? ""] && (
                          <span className="ml-2 rounded bg-[#D2A63C]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#D2A63C]" title="Estado no motor das mestres (topo da tab Estratégias)">
                            motor: {motor[MOTOR_POR_SWITCH[key]!]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">{hint}</p>
                    </div>
                    <Toggle on={cfg.switches[key]} onClick={() => setSwitch(key, !cfg.switches[key])} disabled={saving} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* O que já não está aqui, e porquê. Sem esta nota, quem procura o interruptor do
              GoldKiller conclui que alguém o escondeu — em vez de saber que a conta desapareceu. */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fora da lista</p>
            <ul className="space-y-1 rounded-lg border border-zinc-800/70 bg-zinc-950/30 px-3 py-2.5">
              {RETIRADAS.map((r) => (
                <li key={r} className="text-xs text-zinc-500">· {r}</li>
              ))}
            </ul>
          </div>

          {/* RECEÇÃO POR CANAL — corta a ENTRADA de sinais a montante (inclui os relays do VPS):
              nada entra no chat, não executa e não notifica. É diferente de desligar a estratégia. */}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-400/90">
                Receção de sinais · por canal
              </p>
              <span className="text-[10px] text-zinc-500">(inclui relays do VPS)</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const allOff = Object.fromEntries(INTAKE_CHANNELS.map((c) => [c.key, false]))
                  if (confirm("Parar a receção de TODOS os canais? Nenhum sinal entra até voltares a ligar.")) {
                    setCfg({ ...cfg, intake: { ...(cfg.intake ?? {}), ...allOff } })
                    save({ intake: allOff })
                  }
                }}
                className="ml-auto rounded-md border border-red-500/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Parar tudo
              </button>
            </div>
            <div className="divide-y divide-zinc-800/70 rounded-lg border border-sky-500/20 bg-sky-500/[0.03] px-3">
              {INTAKE_CHANNELS.map(({ key, label, hint }) => {
                const on = cfg.intake?.[key] !== false
                return (
                  <div key={key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {label}
                        {!on && <span className="ml-2 text-[10px] uppercase text-red-400">receção parada</span>}
                      </p>
                      <p className="text-xs text-zinc-500">{hint}</p>
                    </div>
                    <Toggle on={on} onClick={() => setIntake(key, !on)} disabled={saving} />
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shadow do Sensei (#57/#59) — validação sem executar */}
      {cfg.senseiShadow && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm text-zinc-200 flex items-center gap-2">
                Shadow do Sensei <span className="text-xs font-normal text-zinc-500">#57 entra-no-sinal + 100pips · #59 SELLs</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{cfg.senseiShadow.config.enabled ? "a recolher" : "parado"}</span>
                <Toggle
                  on={cfg.senseiShadow.config.enabled}
                  disabled={saving}
                  onClick={() => save({ sensei_shadow: { enabled: !cfg.senseiShadow!.config.enabled } })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500 mb-3">
              Não executa nem posta — mede o que a nova política faria. Compara com o Sensei live (baseline ~21%).
              Alvo ouro: {cfg.senseiShadow.config.goldTargetDistance} ({Math.round(cfg.senseiShadow.config.goldTargetDistance * 10)} pips).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left">
                    <th className="py-1 pr-3 font-medium">Lado</th>
                    <th className="py-1 px-2 font-medium text-right">Win%</th>
                    <th className="py-1 px-2 font-medium text-right">Alvo</th>
                    <th className="py-1 px-2 font-medium text-right">SL</th>
                    <th className="py-1 px-2 font-medium text-right">Abertas</th>
                    <th className="py-1 px-2 font-medium text-right">Correu ×alvo</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {([
                    { label: "BUY", b: cfg.senseiShadow.summary.buy, color: "text-emerald-400" },
                    { label: "SELL", b: cfg.senseiShadow.summary.sell, color: "text-red-400" },
                    { label: "Total", b: cfg.senseiShadow.summary.all, color: "text-zinc-200" },
                  ] as const).map(({ label, b, color }) => (
                    <tr key={label} className="border-t border-zinc-800/60">
                      <td className={`py-1.5 pr-3 font-medium ${color}`}>{label}</td>
                      <td className="py-1.5 px-2 text-right text-white">
                        {b.winRate != null ? `${b.winRate}%` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-400">{b.hit_target}</td>
                      <td className="py-1.5 px-2 text-right text-red-400/80">{b.hit_sl}</td>
                      <td className="py-1.5 px-2 text-right text-zinc-400">{b.open}</td>
                      <td className="py-1.5 px-2 text-right text-[#D2A63C]">{b.avgRunR != null ? `${b.avgRunR}×` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cfg.senseiShadow.summary.all.n === 0 && (
              <p className="text-xs text-zinc-600 mt-3">Sem trades-sombra ainda — aparecem à medida que chegam sinais do Sensei.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modo de execução Forex Swings. O do PrimeVerse saiu (18/09): executava directamente numa conta
          MT5 (12862cb4) que já não existe na MetaApi — Edge/King/Wolf seguem pelas mestres SIM do motor. */}
      <div className="grid sm:grid-cols-2 gap-4">
        {([
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
