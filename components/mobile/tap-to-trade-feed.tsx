"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Settings,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Wallet,
  Power,
  Clock,
} from "lucide-react"

const FOLLOWUP_RE = /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i
const DIR_RE = /(\b(buy|sell|long|short|compra|venda)\b|🟢|🔴)/i
/** Sensei: só a "Entry Alert / Ideia Activada" (entrada activada) é um sinal válido. */
const SENSEI_ACTIVE_RE = /(entrada\s+activ|entrada\s+ativ|ideia\s+activ|ideia\s+ativ|entry\s+alert)/i
/** Mensagens de performance/resumo/saída — não são sinais negociáveis. */
const PERF_RE = /(performance|resultado\s+do\s+dia|resumo|recap|relat[óo]rio|estat[íi]stic|balan[çc]o|total\s+de\s+pips|pips\s+(de\s+)?(hoje|esta\s+semana|do\s+dia)|fecho\s+do\s+dia|lucro\s+do\s+dia)/i

/** Só sinais de ENTRADA válidos passam (saídas/performance/incompletos são excluídos). */
function isEntrySignal(channelSlug: string, content?: string | null): boolean {
  if (!content) return false
  if (FOLLOWUP_RE.test(content)) return false // saídas / TP hit / fecho / SL / cancelado
  if (PERF_RE.test(content)) return false // performance / resumo do dia
  if (!DIR_RE.test(content)) return false // precisa de direção
  if (!/\d{2,}/.test(content)) return false // precisa de preço
  // Sensei: exige o alerta de entrada activada COMPLETO (entrada + SL + TP)
  if (channelSlug === "sensei-scanner") {
    const activated = SENSEI_ACTIVE_RE.test(content)
    const hasSL = /stop\s*loss|🛑/i.test(content)
    const hasTP = /take\s*profit|tp\s*\d/i.test(content)
    if (!(activated && hasSL && hasTP)) return false
  }
  return true
}

const CHANNEL_LABEL: Record<string, string> = {
  "sensei-scanner": "Sensei Scanner",
  "premium-ideas": "Premium · Ouro",
  "trade-ideas-setup": "Ideias Forex",
  "trade-ideas": "Trade Ideas",
}

type Category = "all" | "gold" | "forex" | "crypto" | "indices"

function categoryOf(content: string): Exclude<Category, "all"> | "other" {
  const c = content.toUpperCase()
  if (/XAU|GOLD/.test(c)) return "gold"
  if (/BTC|ETH|SOL|XRP|USDT|CRYPTO/.test(c)) return "crypto"
  if (/NAS100|US30|US500|GER40|SPX|DOW|UK100|JP225/.test(c)) return "indices"
  if (/[A-Z]{3}USD|USD[A-Z]{3}|EUR|GBP|JPY|AUD|CAD|CHF|NZD/.test(c)) return "forex"
  return "other"
}

function directionOf(content: string): "BUY" | "SELL" | "" {
  const c = content.toLowerCase()
  if (/🟢|\bbuy\b|\blong\b|\bcompra\b/.test(c)) return "BUY"
  if (/🔴|\bsell\b|\bshort\b|\bvenda\b/.test(c)) return "SELL"
  return ""
}

/** Tempo máximo para um sinal estar ativo (5 minutos). */
const T2T_MAX_AGE_MS = 5 * 60 * 1000

/** Extrai o símbolo do sinal (para emparelhar com follow-ups TP/fecho). */
function symbolOf(content: string): string | null {
  const c = content.toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|NAS100|US30|US500|GER40|UK100|JP225|SPX500|BTCUSD|ETHUSD|SOLUSD|XRPUSD)\b/) ||
    c.match(/\b[A-Z]{3}(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/) ||
    c.match(/\bXAU\b|\bGOLD\b/)
  return m ? m[0] : null
}

interface Sig {
  id: string
  channel_slug: string
  content: string
  created_at: string
  expired?: boolean
  reason?: string
}

interface Conn {
  id: string
  account_label?: string | null
  metaapi_account_id?: string | null
  lot_mode?: string | null
  lot_value?: number | null
  max_risk_percent?: number | null
  copy_sl?: boolean | null
  copy_tp?: boolean | null
  is_active?: boolean | null
  balance?: number | null
  broker_name?: string | null
}

const FILTERS: { id: Category; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "gold", label: "Gold" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "indices", label: "Índices" },
]

export default function TapToTradeFeed() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Category>("all")
  const [limitMode, setLimitMode] = useState<"last5" | "all">("last5")
  const [tap, setTap] = useState<{ sig: Sig; status: "confirm" | "loading" | "done" | "error"; message?: string } | null>(null)
  const [providers, setProviders] = useState<{ label: string; strategy: string }[]>([])
  const [noProviders, setNoProviders] = useState(false)

  // Configuração da conta (estilo PrimeSync, dentro do próprio T2T)
  const [conn, setConn] = useState<Conn | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [savingConn, setSavingConn] = useState(false)
  const [cfg, setCfg] = useState<{
    lot_mode: "risk_percent" | "fixed"
    risk: number
    lot: number
    copy_sl: boolean
    copy_tp: boolean
    is_active: boolean
  } | null>(null)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  const loadConnection = useCallback(async () => {
    const t = await token()
    if (!t) return
    try {
      const r = await fetch("/api/mtmcopy/connection", { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) return
      const d = await r.json()
      const c: Conn | null = d.connection ?? (d.connections?.[0] ?? null)
      setConn(c)
      if (c) {
        setCfg({
          lot_mode: c.lot_mode === "fixed" ? "fixed" : "risk_percent",
          risk: typeof c.max_risk_percent === "number" ? c.max_risk_percent : 1,
          lot: typeof c.lot_value === "number" ? c.lot_value : 0.01,
          copy_sl: c.copy_sl !== false,
          copy_tp: c.copy_tp !== false,
          is_active: c.is_active === true,
        })
      }
    } catch {
      /* ignore */
    }
  }, [token])

  const load = useCallback(async () => {
    setLoading(true)
    const t = await token()
    let channels: string[] = []
    if (t) {
      try {
        const r = await fetch("/api/mtmcopy/tap-to-trade/providers", { headers: { Authorization: `Bearer ${t}` } })
        if (r.ok) {
          const d = await r.json()
          setProviders(d.providers ?? [])
          channels = (d.channels ?? []) as string[]
        }
      } catch {
        /* ignore */
      }
    }
    setNoProviders(channels.length === 0)
    if (channels.length === 0) {
      setItems([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("id, channel_slug, content, created_at")
      .in("channel_slug", channels)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(120)
    const all = (data ?? []) as Sig[]
    // follow-ups (TP atingido / fechado / SL / cancelado) para marcar sinais resolvidos
    const followups = all.filter((m) => FOLLOWUP_RE.test(m.content))
    const now = Date.now()
    const sigs = all
      .filter((m) => isEntrySignal(m.channel_slug, m.content))
      .map((m) => {
        const ageMs = now - new Date(m.created_at).getTime()
        const ageExpired = ageMs > T2T_MAX_AGE_MS
        const sym = symbolOf(m.content)
        const resolved = followups.some(
          (f) =>
            f.channel_slug === m.channel_slug &&
            new Date(f.created_at).getTime() > new Date(m.created_at).getTime() &&
            (!sym || symbolOf(f.content) === sym),
        )
        return {
          ...m,
          expired: ageExpired || resolved,
          reason: resolved ? "Fechado / TP atingido" : ageExpired ? "Passaram +5 min" : "",
        }
      })
    setItems(sigs)
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
    loadConnection()
  }, [load, loadConnection])

  // Deep-link: notificação T2T → abrir directamente a confirmação da trade
  useEffect(() => {
    const sigId = searchParams?.get("signal") || searchParams?.get("msg")
    if (!sigId) return
    const found = items.find((s) => s.id === sigId)
    if (found) {
      setTap({ sig: found, status: "confirm" })
      return
    }
    // não está na lista carregada → vai buscar a mensagem directamente
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_slug, content, created_at")
        .eq("id", sigId)
        .maybeSingle()
      if (!cancelled && data) setTap({ sig: data as Sig, status: "confirm" })
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, items])

  const filtered = items.filter((s) => cat === "all" || categoryOf(s.content) === cat)
  const shown = limitMode === "last5" ? filtered.slice(0, 5) : filtered

  const runTap = async () => {
    if (!tap) return
    const sig = tap.sig
    setTap({ sig, status: "loading" })
    try {
      const t = await token()
      if (!t) {
        setTap({ sig, status: "error", message: "Sessão indisponível. Faz login novamente." })
        return
      }
      const res = await fetch("/api/mtmcopy/tap-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ chat_message_id: sig.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTap({ sig, status: "error", message: data.error || "Falha ao abrir a trade." })
        return
      }
      setTap({ sig, status: "done", message: data.message || "Trade aberta com sucesso!" })
    } catch (e) {
      setTap({ sig, status: "error", message: e instanceof Error ? e.message : "Erro inesperado" })
    }
  }

  const saveConfig = async () => {
    if (!conn || !cfg) return
    setSavingConn(true)
    try {
      const t = await token()
      if (!t) return
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
      // params de risco + SL/TP
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers,
        body: JSON.stringify({
          connection_id: conn.id,
          lot_mode: cfg.lot_mode,
          max_risk_percent: cfg.risk,
          lot_value: cfg.lot,
          copy_sl: cfg.copy_sl,
          copy_tp: cfg.copy_tp,
        }),
      })
      // estado activo
      if (cfg.is_active !== (conn.is_active === true)) {
        await fetch("/api/mtmcopy/connection", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ connection_id: conn.id, is_active: cfg.is_active }),
        })
      }
      await loadConnection()
      setShowConfig(false)
    } finally {
      setSavingConn(false)
    }
  }

  const hasAccount = !!conn?.metaapi_account_id
  const riskLabel = cfg
    ? cfg.lot_mode === "fixed"
      ? `${cfg.lot} lote fixo`
      : `${cfg.risk}% risco / trade`
    : "—"

  return (
    <div className="px-3 pt-3 pb-24 text-white">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#D2A63C]" /> T2T <span className="text-[#D2A63C]">Tap to Trade</span>
        </h1>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-zinc-700 text-zinc-400" aria-label="Atualizar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Aceita um sinal e abre-o na <strong className="text-zinc-200">tua conta</strong> com o teu risco — configurado aqui mesmo.
      </p>

      {/* Configuração da conta (PrimeSync-style, dentro do T2T) */}
      <div className="rounded-2xl border border-[#D2A63C]/25 bg-zinc-900/60 mb-3 overflow-hidden">
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        >
          <Settings className="w-4 h-4 text-[#D2A63C]" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">A minha conta T2T</p>
            <p className="text-[11px] text-zinc-400 truncate">
              {hasAccount ? (
                <>
                  {conn?.account_label || "Conta MT5"} · {riskLabel} ·{" "}
                  <span className={cfg?.is_active ? "text-emerald-400" : "text-zinc-500"}>
                    {cfg?.is_active ? "ativa" : "inativa"}
                  </span>
                </>
              ) : (
                "Sem conta ligada — toca para configurar"
              )}
            </p>
          </div>
          {showConfig ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {showConfig && (
          <div className="px-3 pb-3 border-t border-zinc-800 pt-3 space-y-3">
            {!hasAccount ? (
              <div className="text-center py-2">
                <Wallet className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-xs text-zinc-400 mb-3">
                  Liga a tua conta MT5 uma vez para começar a usar o T2T.
                </p>
                <Link
                  href="/app-mobile/mtmcopier"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] px-4 py-2"
                >
                  <Wallet className="w-4 h-4" /> Ligar conta MT5
                </Link>
              </div>
            ) : cfg ? (
              <>
                {/* saldo */}
                {typeof conn?.balance === "number" && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Wallet className="w-3.5 h-3.5 text-[#D2A63C]" />
                    Saldo: <span className="text-white font-semibold">{conn.balance.toLocaleString("pt-PT", { style: "currency", currency: "USD" })}</span>
                  </div>
                )}

                {/* modo de risco */}
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1.5">Dimensão da posição</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCfg({ ...cfg, lot_mode: "risk_percent" })}
                      className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "risk_percent" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                    >
                      % de risco
                    </button>
                    <button
                      onClick={() => setCfg({ ...cfg, lot_mode: "fixed" })}
                      className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "fixed" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                    >
                      Lote fixo
                    </button>
                  </div>
                </div>

                {cfg.lot_mode === "risk_percent" ? (
                  <label className="block">
                    <span className="text-[11px] text-zinc-500">Risco por trade (% do saldo)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      value={cfg.risk}
                      onChange={(e) => setCfg({ ...cfg, risk: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[11px] text-zinc-500">Lote fixo</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={cfg.lot}
                      onChange={(e) => setCfg({ ...cfg, lot: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                    />
                  </label>
                )}

                {/* SL / TP */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCfg({ ...cfg, copy_sl: !cfg.copy_sl })}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_sl ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                  >
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Copiar SL</span>
                    <span className="font-bold">{cfg.copy_sl ? "On" : "Off"}</span>
                  </button>
                  <button
                    onClick={() => setCfg({ ...cfg, copy_tp: !cfg.copy_tp })}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_tp ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                  >
                    <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Copiar TP</span>
                    <span className="font-bold">{cfg.copy_tp ? "On" : "Off"}</span>
                  </button>
                </div>

                {/* activo */}
                <button
                  onClick={() => setCfg({ ...cfg, is_active: !cfg.is_active })}
                  className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.is_active ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                >
                  <span className="flex items-center gap-1"><Power className="w-3.5 h-3.5" /> Conta ativa para T2T</span>
                  <span className="font-bold">{cfg.is_active ? "Ativa" : "Inativa"}</span>
                </button>

                <button
                  onClick={saveConfig}
                  disabled={savingConn}
                  className="w-full rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 disabled:opacity-60"
                >
                  {savingConn ? "A guardar…" : "Guardar configuração"}
                </button>
                <Link href="/app-mobile/mtmcopier" className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-[#D2A63C]/40 text-[#D2A63C] font-semibold text-[13px] py-2.5">
                  <Wallet className="w-4 h-4" /> Editar / adicionar conta MT5
                </Link>
              </>
            ) : (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" /></div>
            )}
          </div>
        )}
      </div>

      {providers.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-zinc-500 shrink-0">Estratégias ativas:</span>
          {providers.map((p, i) => (
            <span key={i} className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/30 whitespace-nowrap">
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* alcance: últimos 5 (default) vs todos */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          onClick={() => setLimitMode("last5")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
            limitMode === "last5" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
          }`}
        >
          Últimos 5 sinais
        </button>
        <button
          onClick={() => setLimitMode("all")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
            limitMode === "all" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
          }`}
        >
          Todos
        </button>
      </div>

      {/* filtros por categoria */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setCat(f.id)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium ${
              cat === f.id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          {noProviders
            ? "Nenhum provider está ativo no Tap to Trade neste momento."
            : "Sem sinais de entrada recentes nesta categoria."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((s) => {
            const dir = directionOf(s.content)
            return (
              <div key={s.id} className={`rounded-2xl border p-3 ${s.expired ? "border-zinc-800/60 bg-zinc-900/30 opacity-70" : "border-zinc-800 bg-zinc-900/60"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#D2A63C]">{CHANNEL_LABEL[s.channel_slug] ?? s.channel_slug}</span>
                  <div className="flex items-center gap-1.5">
                    {s.expired && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Expirado
                      </span>
                    )}
                    {dir && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${dir === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {dir}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[13px] text-zinc-200 whitespace-pre-wrap break-words leading-snug line-clamp-5">{s.content}</p>
                {s.expired ? (
                  <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/70 text-zinc-500 font-semibold text-[12px] py-2.5 cursor-not-allowed">
                    <Clock className="w-4 h-4" /> Sinal expirado{s.reason ? ` · ${s.reason}` : ""}
                  </div>
                ) : (
                  <button
                    onClick={() => setTap({ sig: s, status: "confirm" })}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 active:scale-[0.98] transition-transform"
                  >
                    <Zap className="w-4 h-4" /> Tap to Trade
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tap && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => tap.status !== "loading" && setTap(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-[#D2A63C]" />
              <h3 className="text-base font-bold">T2T · Tap to Trade</h3>
            </div>
            {tap.status === "confirm" && (
              <>
                {!hasAccount && (
                  <p className="text-xs text-amber-400 mb-2">Liga a tua conta MT5 na secção "A minha conta T2T" antes de aceitar.</p>
                )}
                <p className="text-sm text-zinc-300 mb-3">
                  Vais abrir esta trade na <strong className="text-white">tua conta</strong>, com <strong className="text-white">{riskLabel}</strong>.
                </p>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 max-h-28 overflow-y-auto whitespace-pre-wrap mb-4">{tap.sig.content}</div>
                <div className="flex gap-2">
                  <button onClick={() => setTap(null)} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">Cancelar</button>
                  <button onClick={runTap} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95">Confirmar e abrir</button>
                </div>
              </>
            )}
            {tap.status === "loading" && <p className="text-sm text-zinc-300 py-6 text-center">A abrir a trade na tua conta…</p>}
            {tap.status === "done" && (
              <>
                <p className="text-sm text-emerald-400 py-4 text-center">✅ {tap.message}</p>
                <button onClick={() => setTap(null)} className="w-full rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95">Fechar</button>
              </>
            )}
            {tap.status === "error" && (
              <>
                <p className="text-sm text-rose-400 py-4 text-center">⚠️ {tap.message}</p>
                <button onClick={() => setTap(null)} className="w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">Fechar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
