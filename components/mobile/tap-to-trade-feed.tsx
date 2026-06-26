"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { TrendingUp, RefreshCw, Loader2, Settings, Zap } from "lucide-react"

const SIGNAL_CHANNELS = ["sensei-scanner", "trade-ideas", "premium-ideas", "trade-ideas-setup"]

const FOLLOWUP_RE = /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i
const DIR_RE = /(\b(buy|sell|long|short|compra|venda)\b|🟢|🔴)/i

function isEntrySignal(content?: string | null): boolean {
  if (!content) return false
  if (FOLLOWUP_RE.test(content)) return false
  if (!DIR_RE.test(content)) return false
  if (!/\d{2,}/.test(content)) return false
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

interface Sig {
  id: string
  channel_slug: string
  content: string
  created_at: string
}

const FILTERS: { id: Category; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "gold", label: "Gold" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "indices", label: "Índices" },
]

export default function TapToTradeFeed() {
  const [items, setItems] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Category>("all")
  const [tap, setTap] = useState<{ sig: Sig; status: "confirm" | "loading" | "done" | "error"; message?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("chat_messages")
      .select("id, channel_slug, content, created_at")
      .in("channel_slug", SIGNAL_CHANNELS)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(80)
    const sigs = ((data ?? []) as Sig[]).filter((m) => isEntrySignal(m.content))
    setItems(sigs)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = items.filter((s) => cat === "all" || categoryOf(s.content) === cat)

  const runTap = async () => {
    if (!tap) return
    const sig = tap.sig
    setTap({ sig, status: "loading" })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setTap({ sig, status: "error", message: "Sessão indisponível. Faz login novamente." })
        return
      }
      const res = await fetch("/api/mtmcopy/tap-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  return (
    <div className="px-3 pt-3 pb-24 text-white">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#D2A63C]" /> Tap to Trade <span className="text-[#D2A63C]">MTM</span>
        </h1>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-zinc-700 text-zinc-400" aria-label="Atualizar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Aceita um sinal e abre-o na <strong className="text-zinc-200">tua conta</strong> com o teu risco.{" "}
        <Link href="/app-mobile?tab=settings" className="text-[#D2A63C] underline inline-flex items-center gap-0.5">
          <Settings className="w-3 h-3" /> configurar conta
        </Link>
      </p>

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
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          Sem sinais de entrada recentes nesta categoria.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((s) => {
            const dir = directionOf(s.content)
            return (
              <div key={s.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#D2A63C]">{CHANNEL_LABEL[s.channel_slug] ?? s.channel_slug}</span>
                  {dir && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${dir === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                      {dir}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-zinc-200 whitespace-pre-wrap break-words leading-snug line-clamp-5">{s.content}</p>
                <button
                  onClick={() => setTap({ sig: s, status: "confirm" })}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 active:scale-[0.98] transition-transform"
                >
                  <Zap className="w-4 h-4" /> Tap to Trade MTM
                </button>
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
              <h3 className="text-base font-bold">Tap to Trade MTM</h3>
            </div>
            {tap.status === "confirm" && (
              <>
                <p className="text-sm text-zinc-300 mb-3">
                  Vais abrir esta trade na <strong className="text-white">tua conta MT5</strong>, com o <strong className="text-white">risco que definiste</strong> nas Definições.
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
