"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Painel «PrimeVerse · PrimeGate» — a chave, a quota e quem está confirmado no ramo de IB.
 *
 * A chave é SÓ de escrita: depois de gravada, o painel mostra os últimos 4 caracteres e a data,
 * nunca mais a chave. «Por confirmar» não é recusa — por isso o estado vem sempre escrito por
 * extenso, nunca só numa cor.
 */
type Estado = "confirmed" | "undetermined" | "erro"
type Verificacao = {
  id: string
  email: string
  uid_puprime: string
  estado: Estado
  motivo: string | null
  http_status: number | null
  corpo_cru: unknown
  origem: string | null
  tentativas: number
  verificado_em: string | null
  proxima_tentativa_em: string | null
}
type Cliente = {
  id: string
  email: string | null
  full_name: string | null
  broker_uid: string
  broker_verified: boolean | null
  primegate_estado: Estado | null
}
type Lead = {
  chat_id: string
  first_name: string | null
  username: string | null
  email: string | null
  broker_uid: string
  stage: string | null
  primegate: { estado: Estado; email: string } | null
}
type Dados = {
  chave: { configurada: boolean; origem: "env" | "admin" | null; ultimos4: string | null; gravadaEm: string | null; gravadaPor: string | null; cifraDisponivel: boolean; limites: { porMinuto: number; porDia: number } }
  resumo: { ativo: boolean; confirmed: number; undetermined: number; erro: number; pendentes: number; esgotados: number; quotaHoje: { usados: number; limite: number } }
  ultimas: Verificacao[]
  clientes: Cliente[]
  leads: Lead[]
}
type Teste = { estado: Estado | null; motivo: string; aviso: string | null; httpStatus: number | null; corpo: unknown }

const card = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
const ouro = "bg-[#D2A63C] text-neutral-950 hover:bg-[#E9C46A]"
const neutro = "border border-neutral-700 text-neutral-200 hover:bg-neutral-800"

const ROTULO: Record<Estado, string> = { confirmed: "Confirmado", undetermined: "Por confirmar", erro: "Não verificado" }
const COR: Record<Estado, string> = {
  confirmed: "border-emerald-700 text-emerald-300",
  undetermined: "border-amber-700 text-amber-300",
  erro: "border-neutral-600 text-neutral-300",
}

function Selo({ estado }: { estado: Estado | null | undefined }) {
  if (!estado) return <span className="text-xs text-neutral-500">sem verificação</span>
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR[estado]}`}>{ROTULO[estado]}</span>
}

const data = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—")

export function PrimeGatePanel() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [chave, setChave] = useState("")
  const [teste, setTeste] = useState({ email: "", uid: "" })
  const [resultado, setResultado] = useState<Teste | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/primegate", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setD(j)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro a carregar")
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const enviar = async (id: string, corpo: Record<string, unknown>) => {
    setOcupado(id)
    try {
      const r = await fetch("/api/admin/primegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (!r.ok || j.ok === false) throw new Error(j.error || j.motivo || "falhou")
      setErro(null)
      await carregar()
      return j
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou")
      return null
    } finally {
      setOcupado(null)
    }
  }

  const k = d?.chave
  const res = d?.resumo

  return (
    <section className="space-y-4">
      <div className={card}>
        <h3 className="text-base font-semibold text-neutral-100">PrimeVerse · PrimeGate</h3>
        <p className="mt-1 text-sm text-neutral-400">
          Confirma se o par email + UID da PU Prime está no teu ramo de IB. Não confirma KYC, depósitos nem trading.
          «Por confirmar» nunca é recusa: o sistema volta a verificar (1 h → 6 h → 24 h, até 5 vezes) e avisa-te no fim.
          Sem chave, o funil continua como sempre.
        </p>
        {erro && <p role="alert" className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{erro}</p>}
      </div>

      {/* Chave */}
      <div className={card}>
        <h4 className="text-sm font-semibold text-neutral-200">Chave da API</h4>
        {k?.configurada ? (
          <p className="mt-2 text-sm text-neutral-300">
            Ligada · termina em <span className="font-mono text-[#E9C46A]">…{k.ultimos4}</span>
            {k.origem === "env" ? " · vem da variável PRIMEGATE_API_KEY (ganha à do painel)" : ` · gravada a ${data(k.gravadaEm)}${k.gravadaPor ? ` por ${k.gravadaPor}` : ""}`}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-300">Sem chave — o PrimeGate está adormecido.</p>
        )}
        {k && !k.cifraDisponivel && (
          <p className="mt-2 text-sm text-red-300">MTMFUNDED_CRED_KEY não está no servidor: não é possível guardar a chave cifrada.</p>
        )}
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await enviar("chave", { acao: "gravar_chave", chave })) setChave("")
          }}
        >
          <label className="sr-only" htmlFor="pg-chave">Chave PrimeGate</label>
          <input
            id="pg-chave"
            className={input}
            type="password"
            autoComplete="off"
            placeholder={k?.configurada ? "Colar uma chave nova para substituir" : "pg_ib_…"}
            value={chave}
            onChange={(e) => setChave(e.target.value)}
          />
          <button className={`${btn} ${ouro}`} disabled={!chave.trim() || ocupado === "chave"}>
            {ocupado === "chave" ? "A gravar…" : "Gravar chave"}
          </button>
          {k?.configurada && k.origem === "admin" && (
            <button
              type="button"
              className={`${btn} border border-red-800 text-red-300 hover:bg-red-950/40`}
              disabled={ocupado === "apagar"}
              onClick={() => { if (confirm("Apagar a chave PrimeGate do painel?")) void enviar("apagar", { acao: "apagar_chave" }) }}
            >
              Apagar
            </button>
          )}
        </form>
      </div>

      {/* Resumo + quota */}
      {res && (
        <div className={`${card} grid grid-cols-2 gap-3 sm:grid-cols-6`}>
          {[
            ["Confirmados", res.confirmed],
            ["Por confirmar", res.undetermined],
            ["Não verificados", res.erro],
            ["Reverificação agendada", res.pendentes],
            ["Tentativas esgotadas", res.esgotados],
            ["Quota hoje", `${res.quotaHoje.usados} / ${res.quotaHoje.limite}`],
          ].map(([r, v]) => (
            <div key={String(r)}>
              <div className="text-xs text-neutral-500">{r}</div>
              <div className="text-lg font-semibold tabular-nums text-neutral-100">{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Testar */}
      <div className={card}>
        <h4 className="text-sm font-semibold text-neutral-200">Testar</h4>
        <p className="mt-1 text-xs text-neutral-500">Faz uma chamada real (gasta 1 da quota) e mostra a resposta tal e qual. Não altera nenhum cliente.</p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]"
          onSubmit={async (e) => {
            e.preventDefault()
            const j = await enviar("testar", { acao: "testar", ...teste })
            if (j) setResultado(j as Teste)
          }}
        >
          <div>
            <label htmlFor="pg-t-email" className="mb-1 block text-xs text-neutral-400">Email na PU Prime</label>
            <input id="pg-t-email" className={input} type="email" value={teste.email} onChange={(e) => setTeste({ ...teste, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="pg-t-uid" className="mb-1 block text-xs text-neutral-400">UID PU Prime</label>
            <input id="pg-t-uid" className={input} inputMode="numeric" value={teste.uid} onChange={(e) => setTeste({ ...teste, uid: e.target.value })} />
          </div>
          <div className="flex items-end">
            <button className={`${btn} ${ouro} w-full`} disabled={!k?.configurada || !teste.email || !teste.uid || ocupado === "testar"}>
              {ocupado === "testar" ? "A testar…" : "Testar"}
            </button>
          </div>
        </form>
        {resultado && (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Selo estado={resultado.estado} />
              <span className="text-neutral-400">HTTP {resultado.httpStatus ?? "—"} · {resultado.motivo}</span>
            </div>
            {resultado.aviso && <p className="text-amber-300">{resultado.aviso}</p>}
            <pre className="max-h-48 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300 [overflow-wrap:anywhere] whitespace-pre-wrap">
              {JSON.stringify(resultado.corpo, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Clientes */}
      <div className={card}>
        <h4 className="text-sm font-semibold text-neutral-200">Clientes com UID ({d?.clientes.length ?? 0})</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr><th className="py-1.5">Cliente</th><th>UID</th><th>PrimeGate</th><th className="text-right">Acção</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {(d?.clientes ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-2 text-neutral-200">{c.full_name || c.email}<div className="text-xs text-neutral-500">{c.email}</div></td>
                  <td className="font-mono text-neutral-300">{c.broker_uid}</td>
                  <td><Selo estado={c.primegate_estado} /></td>
                  <td className="text-right">
                    <button
                      className={`${btn} ${neutro}`}
                      disabled={!k?.configurada || ocupado === `c:${c.id}`}
                      onClick={() => void enviar(`c:${c.id}`, { acao: "verificar_cliente", userId: c.id })}
                    >
                      {ocupado === `c:${c.id}` ? "A verificar…" : "Verificar agora"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads do Telegram */}
      <div className={card}>
        <h4 className="text-sm font-semibold text-neutral-200">Leads do Telegram com UID ({d?.leads.length ?? 0})</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr><th className="py-1.5">Lead</th><th>UID</th><th>Etapa</th><th>PrimeGate</th><th className="text-right">Acção</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {(d?.leads ?? []).map((l) => (
                <tr key={l.chat_id}>
                  <td className="py-2 pr-2 text-neutral-200">{l.first_name || l.username || l.chat_id}<div className="text-xs text-neutral-500">{l.email || "sem email"}</div></td>
                  <td className="font-mono text-neutral-300">{l.broker_uid}</td>
                  <td className="text-xs text-neutral-400">{l.stage}</td>
                  <td><Selo estado={l.primegate?.estado} /></td>
                  <td className="text-right">
                    <button
                      className={`${btn} ${neutro}`}
                      disabled={!k?.configurada || !l.email || ocupado === `l:${l.chat_id}`}
                      title={l.email ? undefined : "O lead ainda não deu o email da PU Prime"}
                      onClick={() => void enviar(`l:${l.chat_id}`, { acao: "verificar_lead", chatId: l.chat_id })}
                    >
                      {ocupado === `l:${l.chat_id}` ? "A verificar…" : "Verificar agora"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Últimas 20 */}
      <div className={card}>
        <h4 className="text-sm font-semibold text-neutral-200">Últimas 20 verificações</h4>
        {!d?.ultimas.length && <p className="mt-2 text-sm text-neutral-500">Ainda não há verificações.</p>}
        <ul className="mt-2 divide-y divide-neutral-800">
          {(d?.ultimas ?? []).map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Selo estado={v.estado} />
                <span className="text-neutral-200 [overflow-wrap:anywhere]">{v.email}</span>
                <span className="font-mono text-neutral-400">{v.uid_puprime}</span>
                <span className="text-xs text-neutral-500">
                  {v.origem} · {data(v.verificado_em)} · tentativas {v.tentativas}
                  {v.proxima_tentativa_em ? ` · próxima ${data(v.proxima_tentativa_em)}` : ""}
                </span>
                <button
                  className="ml-auto text-xs text-[#E9C46A] underline-offset-2 hover:underline cursor-pointer"
                  aria-expanded={aberto === v.id}
                  onClick={() => setAberto(aberto === v.id ? null : v.id)}
                >
                  {aberto === v.id ? "Esconder resposta" : "Ver resposta"}
                </button>
              </div>
              {v.motivo && <div className="mt-1 text-xs text-neutral-500">{v.motivo}{v.http_status ? ` · HTTP ${v.http_status}` : ""}</div>}
              {aberto === v.id && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {JSON.stringify(v.corpo_cru, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
