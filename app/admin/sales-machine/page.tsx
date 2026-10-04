"use client"

import { useCallback, useEffect, useState } from "react"
import { BrokerDadosPanel } from "@/components/admin/broker-dados-panel"
import { BrokerLinksPanel } from "@/components/admin/broker-links-panel"

/**
 * Painel MÁQUINA DE VENDAS (/admin/sales-machine) — consome o hub /api/sales-machine (sessão-admin).
 * Mostra funil, conversões, execução e a fila de conteúdo; botões disparam comandos no hub.
 */

type Draft = { id: string; account: string; pillar: string; status: string; scheduled_at: string; has_image: boolean; preview: string }
type Andar = { nome: string; n: number; fonte: string; passou: number | null }
type State = {
  day: string
  andares: Andar[]
  automacoes: { total: number; ativas: number; disparos: number; ultimoDisparo: string | null; naFila: number }
  tendencia: Array<{ dia: string; leads: number; corretora: number }>
  funnel: { byStage: Record<string, number>; novos24h: number; grantedToday: number; total: number }
  content: { pending: number; drafts: Draft[]; autopilot: { morethanmoney: boolean; ricardo: boolean } }
  conversions_24h: number
  broker_clients: number
  signals_24h: number
  execution: Record<string, boolean>
  pipeline: { porEstado: Record<string, number>; total: number; tarefasHoje: number; feitasHoje: number; semPapel: number }
  ib: { contas: number; aTransitar: number; lotesForaDeCasa: number; comissaoForaDeCasa: number }
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

      {/*
        O ANDAR QUE FALTAVA: o trabalho da equipa.

        Este painel mostrava leads a entrar e clientes a pagar, e no meio — onde se vende — não
        mostrava nada. Um funil que explica a entrada e a saída e se cala sobre a única parte que
        se pode mudar amanhã de manhã não serve para decidir nada.
      */}
      {state.pipeline && (
        <div className={card}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-neutral-300">O trabalho da equipa</h2>
            <a href="https://backoffice.morethanmoney.pt" className="text-xs text-amber-400 hover:underline">
              abrir backoffice →
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Negócios no pipeline" value={state.pipeline.total} />
            <Metric label="Tarefas para hoje" value={state.pipeline.tarefasHoje} />
            <Metric label="Feitas hoje" value={state.pipeline.feitasHoje} />
            <Metric label="Sem papel atribuído" value={state.pipeline.semPapel} />
          </div>
          {state.pipeline.semPapel > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-amber-400/90">
              {state.pipeline.semPapel} negócios precisam de um papel que ninguém desempenha. Não é
              um problema de sistema — é falta de setters, closers ou prospectores nomeados.
            </p>
          )}
          {state.pipeline.total > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              {Object.entries(state.pipeline.porEstado)
                .sort((a, b) => b[1] - a[1])
                .map(([e, n]) => `${e} ${n}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {/*
        A REDE DE IBs. O número que interessa é o volume que ainda paga comissão a outra casa —
        não é previsão nem objectivo: é volume medido, exportado pelas corretoras.
      */}
      {state.ib && state.ib.contas > 0 && (
        <div className={card}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-neutral-300">Rede de IBs</h2>
            <a href="https://backoffice.morethanmoney.pt/ib" className="text-xs text-amber-400 hover:underline">
              ver contas →
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Contas de corretora" value={state.ib.contas} />
            <Metric label="A transitar" value={state.ib.aTransitar} />
            <Metric label="Lotes fora de casa" value={state.ib.lotesForaDeCasa} />
            <Metric label="Comissão fora (USD)" value={state.ib.comissaoForaDeCasa} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            «Fora de casa» é tudo o que não está na PU Prime. É volume que já existe e cuja comissão
            está a ser paga a outra corretora.
          </p>
        </div>
      )}

      {/* Os dados da corretora — a métrica «Corretora validada» aqui em cima não vale nada se
          ninguém souber que idade têm os números que a produzem. */}
      <BrokerDadosPanel />

      {/* Os andares, por ordem, com a queda entre cada um.
          A contagem por etapa que estava aqui em baixo diz quantos estão em cada estado; não diz
          onde se perdem. É onde se perdem que decide o que fazer a seguir. */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Do primeiro contacto ao pagante</h2>
        <div className="space-y-2">
          {(state.andares ?? []).map((a) => (
            <div key={a.nome} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-neutral-300">{a.nome}</div>
              <div className="h-6 flex-1 overflow-hidden rounded bg-neutral-800">
                <div
                  className="h-full bg-amber-500/70"
                  style={{
                    width: `${Math.min(100, (a.n / Math.max(1, (state.andares ?? [])[0]?.n || 1)) * 100)}%`,
                  }}
                />
              </div>
              <div className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">{a.n}</div>
              <div className="w-20 shrink-0 text-right text-xs text-neutral-500">
                {a.passou === null ? "—" : `${a.passou}%`}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          A percentagem é quanto sobreviveu do andar de cima. Os andares vêm de tabelas diferentes
          ({(state.andares ?? []).map((a) => a.fonte.split(" ")[0]).join(" · ")}) — o mesmo número
          contado de um só sítio só mostrava o que esse sítio sabe.
        </p>
      </div>

      {/* Automações — o motor próprio (o ManyChat saiu a 04/10/2026). Um motor sem regras não avisa que está parado:
          fica calado, que é exactamente o que faria se estivesse a funcionar. */}
      <div className={card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Automações (Telegram · Instagram)</h2>
          <a href="/admin/social" className={`${btn} bg-neutral-700 text-xs hover:bg-neutral-600`}>
            Abrir e criar regras
          </a>
        </div>
        {state.automacoes && state.automacoes.total === 0 ? (
          <p className="text-sm text-amber-300">
            Não há nenhuma regra criada. O motor está montado e ligado ao webhook do Telegram, mas
            sem regras não responde a ninguém — e não se queixa disso.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-neutral-800 px-3 py-1">
              regras: <b>{state.automacoes?.ativas ?? 0}</b> ativas de {state.automacoes?.total ?? 0}
            </span>
            <span className="rounded-full bg-neutral-800 px-3 py-1">
              disparos: <b>{state.automacoes?.disparos ?? 0}</b>
            </span>
            <span className="rounded-full bg-neutral-800 px-3 py-1">
              último: {state.automacoes?.ultimoDisparo
                ? new Date(state.automacoes.ultimoDisparo).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : "nunca"}
            </span>
            {(state.automacoes?.naFila ?? 0) > 0 && (
              <span className="rounded-full bg-amber-900/50 px-3 py-1 text-amber-300">
                {state.automacoes?.naFila} conversas à espera de resposta
              </span>
            )}
          </div>
        )}
      </div>

      {/* 14 dias. Um número de hoje sem o de ontem não diz se subiu. */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Últimos 14 dias</h2>
        <div className="flex items-end gap-1" style={{ height: 80 }}>
          {(state.tendencia ?? []).map((d) => {
            const teto = Math.max(1, ...(state.tendencia ?? []).map((x) => x.leads + x.corretora))
            return (
              <div key={d.dia} className="flex flex-1 flex-col justify-end gap-0.5" title={`${d.dia}: ${d.leads} leads · ${d.corretora} corretora`}>
                <div className="w-full rounded-t bg-sky-500/70" style={{ height: `${(d.corretora / teto) * 70}px` }} />
                <div className="w-full bg-amber-500/70" style={{ height: `${(d.leads / teto) * 70}px` }} />
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-neutral-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500/70" />leads novos</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-500/70" />contas de corretora mexidas</span>
        </div>
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

      {/* Autopilot.
          Os interruptores de EXECUÇÃO DE SINAIS saíram daqui a 2026-08-27. Estavam no ecrã de
          vendas com nomes de código (`sensei_entries`, `t2t_price_monitor`, `premium_master_exec`)
          e um clique errado num deles pára a execução real de trades — que é a última coisa que
          se quer ao lado de um botão de aprovar um post. Administram-se no /admin/mtmcopy, onde
          quem lá entra sabe o que cada um faz. */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Autopilot de publicação</h2>
        <Toggle label="@morethanmoney.pt publica sozinha" on={state.content.autopilot.morethanmoney} onToggle={(on) => cmd("set_autopilot", { account: "morethanmoney", on })} />
        <Toggle label="@ricardogarciapt republica sozinho" on={state.content.autopilot.ricardo} onToggle={(on) => cmd("set_autopilot", { account: "ricardo", on })} />
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

      {/* Os links de corretora vivem aqui, e não numa página à parte: a repartição dos registos
          entre IBs faz parte da máquina de vendas — é o andar onde o lead vira cliente da
          corretora, e é onde se percebe se está a ser distribuída. */}
      <BrokerLinksPanel />
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
