"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Painel MÁQUINA DE VENDAS (/admin/sales-machine) — consome o hub /api/sales-machine (sessão-admin).
 * Mostra funil, conversões, execução e a fila de conteúdo; botões disparam comandos no hub.
 */

type Draft = { id: string; account: string; pillar: string; status: string; scheduled_at: string; has_image: boolean; preview: string }
type State = {
  day: string
  funnel: { byStage: Record<string, number>; novos24h: number; grantedToday: number; total: number }
  content: { pending: number; drafts: Draft[]; autopilot: { morethanmoney: boolean; ricardo: boolean } }
  conversions_24h: number
  broker_clients: number
  signals_24h: number
  execution: Record<string, boolean>
}

const card = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40"

export default function SalesMachinePage() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sales-machine", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setState(j.state)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro a carregar")
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const cmd = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(action + (extra.id || ""))
      setFlash(null)
      try {
        const r = await fetch("/api/sales-machine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error || "falhou")
        setFlash(`✓ ${action}`)
        await load()
      } catch (e) {
        setErr(e instanceof Error ? e.message : "comando falhou")
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  if (err && !state) return <div className="p-6 text-red-400">Erro: {err}</div>
  if (!state) return <div className="p-6 text-neutral-400">A carregar a máquina de vendas…</div>

  const f = state.funnel
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 text-neutral-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🧭 Máquina de Vendas</h1>
          <p className="text-sm text-neutral-400">Estado ao vivo · {state.day} · atualiza a cada 30s</p>
        </div>
        <div className="flex gap-2">
          <button className={`${btn} bg-amber-500 text-black hover:bg-amber-400`} disabled={busy === "generate_now"} onClick={() => cmd("generate_now")}>
            {busy === "generate_now" ? "…" : "Gerar posts"}
          </button>
          <button className={`${btn} bg-neutral-700 hover:bg-neutral-600`} disabled={busy === "digest_now"} onClick={() => cmd("digest_now")}>
            Digest agora
          </button>
        </div>
      </header>

      {flash && <div className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-300">{flash}</div>}
      {err && <div className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">{err}</div>}

      {/* Canva Connect (visuais reais dos teus templates) */}
      <div className={`${card} flex items-center justify-between`}>
        <div className="text-sm">
          <span className="font-semibold">🎨 Canva</span>{" "}
          <span className="text-neutral-400">liga os teus templates reais (requer plano pago). Sem isto, usa o card gerado.</span>
          {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("canva") === "ligado" && (
            <span className="ml-2 text-emerald-400">✓ ligado</span>
          )}
          {typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("canva") || "").startsWith("erro") && (
            <span className="ml-2 text-red-400">✗ falhou — tenta de novo</span>
          )}
        </div>
        <a href="/api/admin/canva/connect" className={`${btn} bg-violet-600 hover:bg-violet-500`}>Ligar Canva</a>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Novos leads 24h" value={f.novos24h} />
        <Metric label="Acessos hoje" value={f.grantedToday} />
        <Metric label="Conversões pagas 24h" value={state.conversions_24h} />
        <Metric label="Corretora validada" value={state.broker_clients} />
      </div>

      {/* Funil por etapa */}
      <div className={card}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Funil Telegram ({f.total} leads)</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(f.byStage).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <span key={s} className="rounded-full bg-neutral-800 px-3 py-1 text-xs">
              {s}: <b>{n}</b>
            </span>
          ))}
        </div>
      </div>

      {/* Autopilot + Execução */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-300">Autopilot de publicação</h2>
          <Toggle label="@morethanmoney.pt publica sozinha" on={state.content.autopilot.morethanmoney} onToggle={(on) => cmd("set_autopilot", { account: "morethanmoney", on })} />
          <Toggle label="@ricardogarciapt republica sozinho" on={state.content.autopilot.ricardo} onToggle={(on) => cmd("set_autopilot", { account: "ricardo", on })} />
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-300">Execução de sinais</h2>
          {Object.entries(state.execution).map(([k, v]) => (
            <Toggle key={k} label={k} on={!!v} onToggle={(on) => cmd("set_exec", { key: k, on })} />
          ))}
        </div>
      </div>

      {/* Fila de conteúdo */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Fila de conteúdo ({state.content.pending})</h2>
          <button className={`${btn} bg-neutral-700 text-xs hover:bg-neutral-600`} disabled={busy === "repost_now"} onClick={() => cmd("repost_now")}>
            Preparar reposts
          </button>
        </div>
        <div className="space-y-2">
          {state.content.drafts.length === 0 && <p className="text-sm text-neutral-500">Sem rascunhos por rever.</p>}
          {state.content.drafts.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className="rounded bg-neutral-800 px-2 py-0.5">@{d.account}</span>
                  <span>{d.pillar}</span>
                  <span>{d.has_image ? "🖼️" : "⚠️ sem imagem"}</span>
                  <span className={d.status === "approved" ? "text-emerald-400" : "text-amber-400"}>{d.status}</span>
                  <span>{new Date(d.scheduled_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 truncate text-sm text-neutral-200">{d.preview}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {d.status === "draft" && (
                  <button className={`${btn} bg-emerald-600 text-xs hover:bg-emerald-500`} disabled={busy === "approve_post" + d.id || !d.has_image} onClick={() => cmd("approve_post", { id: d.id })}>
                    Aprovar
                  </button>
                )}
                <button className={`${btn} bg-red-900/70 text-xs hover:bg-red-800`} disabled={busy === "reject_post" + d.id} onClick={() => cmd("reject_post", { id: d.id })}>
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-neutral-200">{label}</span>
      <button
        onClick={() => onToggle(!on)}
        className={`h-6 w-11 rounded-full transition ${on ? "bg-emerald-500" : "bg-neutral-700"}`}
        aria-pressed={on}
      >
        <span className={`block h-5 w-5 rounded-full bg-white transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  )
}
