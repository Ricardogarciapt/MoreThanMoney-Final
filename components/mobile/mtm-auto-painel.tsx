"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Shield } from "lucide-react"

/**
 * O MTM Auto, dentro da app MoreThanMoney.
 *
 * Há clientes com uma conta de corretora ligada e duas apps abertas. Até aqui cada uma fingia que
 * a outra não existia: a conta aparecia numa, o risco configurava-se noutra, e a pessoa tinha de
 * se lembrar de qual era qual — normalmente no dia em que isso importava.
 *
 * Isto mostra a MESMA conta, lida das tabelas do MTM Auto. Configurar o risco aqui muda-o lá,
 * porque é o mesmo número e não uma cópia dele.
 *
 * ── Duas coisas que este painel NÃO faz, de propósito ─────────────────────────────────────────
 * Ligar contas novas e ligar a cópia automática. As duas fazem-se onde se paga por elas — na app
 * MTM Auto ou no MTM Copy. Aqui vê-se a conta, apertam-se os limites de risco (que são proteção
 * de quem opera, e essa não se cobra) e aceitam-se sinais um a um, à mão.
 *
 * `apenas` faz o painel render UMA secção, para o separador T2T a usar como sub-separador.
 */
export type Conta = {
  id: string
  rotulo: string | null
  login: string | null
  servidor: string | null
  corretora: string | null
  estado: string
  demo: boolean
  principal: boolean
  saldo: number | null
  moeda: string | null
  copiaAtiva: boolean
  riscoPct: number
  riscoMaxPct: number
  maxPosicoes: number
  beAtivo: boolean
  beGatilho: number
  trailingAtivo: boolean
  protecaoEquity: boolean
  equityMinima: number | null
  perdaDiariaMax: number | null
  ganhoDiarioMax: number | null
  saidasPct: number[]
}

const APP_MTM_AUTO = "https://www.morethanmoney.pt/mtmautoapp"
const cartao = { borderColor: "#23262F", background: "#12141A" }
const rotuloCls = "text-[11px] uppercase tracking-wider text-zinc-500"
const campoCls = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"

export default function MtmAutoPainel({ apenas }: { apenas?: "ligacao" | "definicoes" } = {}) {
  const [contas, setContas] = useState<Conta[]>([])
  const [semAcesso, setSemAcesso] = useState(false)
  const [aCarregar, setACarregar] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  /**
   * Qual das contas está a ser configurada.
   *
   * As definições editavam sempre `contas[0]`. Quem tem duas contas ligadas — a real e a demo, o
   * caso normal — mexia no risco a olhar para uma e mudava a outra, sem nada no ecrã a dizê-lo.
   */
  const [selecionada, setSelecionada] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [])

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const tok = await token()
      if (!tok) return
      const r = await fetch("/api/mtm-auto/estado", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" })
      if (r.status === 403) { setSemAcesso(true); return }
      const j = await r.json()
      setContas(j.contas ?? [])
      setSemAcesso(false)
    } catch {
      /* sem MTM Auto, o resto do separador continua a funcionar */
    } finally {
      setACarregar(false)
    }
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  const guardar = async (contaId: string, patch: Record<string, unknown>) => {
    setAGuardar(true)
    setAviso(null)
    try {
      const tok = await token()
      const r = await fetch("/api/mtm-auto/definicoes", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contaId, ...patch }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "não guardou")
      setContas((cs) => cs.map((c) => (c.id === contaId ? { ...c, ...(patch as object) } : c)))
      setAviso("Guardado.")
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível guardar.")
    } finally {
      setAGuardar(false)
    }
  }

  const fecharTudo = async () => {
    if (!window.confirm("Fechar TODAS as posições abertas na tua conta MTM Auto, agora?")) return
    setAGuardar(true)
    try {
      const tok = await token()
      const r = await fetch("/api/mtm-auto/emergencia", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      setAviso(j.error ? j.error : "Pedido de fecho enviado.")
    } finally {
      setAGuardar(false)
    }
  }

  if (semAcesso) return null

  if (aCarregar && !contas.length) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A ler a tua conta…
      </p>
    )
  }

  const semConta = (
    <div className="rounded-2xl border p-4" style={cartao}>
      <p className="text-[13px] leading-relaxed text-zinc-300">
        Ainda não tens conta ligada no MTM Auto. A ligação faz-se na app MTM Auto — é lá que a
        conta é criada e verificada com a corretora.
      </p>
      <a
        href={APP_MTM_AUTO}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] py-2.5 text-[13px] font-bold text-black"
      >
        Abrir o MTM Auto <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )

  if (!contas.length) return semConta
  const conta = contas.find((c) => c.id === selecionada) ?? contas[0]

  // ── Ligação ─────────────────────────────────────────────────────────────────────────────────
  const ligacao = (
    <div className="space-y-2">
      {contas.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setSelecionada(c.id)}
          className="w-full rounded-2xl border p-3 text-left"
          style={{
            ...cartao,
            // A conta a ser configurada fica marcada. Com duas contas iguais no ecrã, sem esta
            // marca não havia como saber qual delas as definições em baixo estavam a mudar.
            borderColor: c.id === conta.id && contas.length > 1 ? "#D2A63C" : (cartao as { borderColor?: string }).borderColor,
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-white">{c.rotulo || c.corretora || "Conta"}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-300">{c.login ?? "—"}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10.5px] ${
                c.estado === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              }`}
            >
              {c.estado === "connected" ? "ligada" : "sem ligação"}
            </span>
            {c.demo && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10.5px] text-zinc-400">demo</span>}
          </div>
          <p className="mt-1 text-[12px] text-zinc-400">
            {c.servidor ?? "—"}
            {c.saldo != null && ` · ${c.saldo.toFixed(2)} ${c.moeda ?? ""}`}
          </p>
          {/* Mostra-se o estado da cópia automática, mas não se mexe nele daqui: é a parte paga. */}
          <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
            <Shield className="h-3 w-3" />
            Cópia automática {c.copiaAtiva ? "ligada" : "desligada"} — muda-se na app MTM Auto
          </p>
          {contas.length > 1 && (
            <p className="mt-1 text-[11px] font-semibold" style={{ color: c.id === conta.id ? "#D2A63C" : "#71717a" }}>
              {c.id === conta.id ? "A configurar esta conta" : "Tocar para configurar esta"}
            </p>
          )}
        </button>
      ))}
      <a
        href={APP_MTM_AUTO}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 py-2.5 text-[12.5px] text-zinc-300"
      >
        Ligar outra conta na app MTM Auto <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )

  // ── Definições ──────────────────────────────────────────────────────────────────────────────
  const interruptor = (texto: string, chave: "beAtivo" | "trailingAtivo" | "protecaoEquity", valor: boolean) => (
    <button
      key={chave}
      onClick={() => guardar(conta.id, { [chave]: !valor })}
      disabled={aGuardar}
      className="flex w-full items-center justify-between rounded-xl border border-zinc-800 px-3 py-2.5 text-left"
    >
      <span className="text-[12.5px] text-zinc-200">{texto}</span>
      <span className={`h-5 w-9 rounded-full transition-colors ${valor ? "bg-[#D2A63C]" : "bg-zinc-700"}`}>
        <span className={`mt-0.5 block h-4 w-4 rounded-full bg-white transition-transform ${valor ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  )

  const definicoes = (
    <div className="space-y-3">
      <div className="rounded-2xl border p-3" style={cartao}>
        <p className={rotuloCls}>Risco por trade (%)</p>
        <input
          type="number" step="0.1" min={0.1} max={5} defaultValue={conta.riscoPct}
          onBlur={(e) => guardar(conta.id, { riscoPct: Number(e.target.value) })}
          className={campoCls}
        />
        <p className={`${rotuloCls} mt-3`}>Máximo de posições abertas</p>
        <input
          type="number" min={1} max={50} defaultValue={conta.maxPosicoes}
          onBlur={(e) => guardar(conta.id, { maxPosicoes: Number(e.target.value) })}
          className={campoCls}
        />
      </div>

      <div className="space-y-2 rounded-2xl border p-3" style={cartao}>
        <p className={rotuloCls}>Proteção</p>
        {interruptor("Stop para a entrada no primeiro alvo", "beAtivo", conta.beAtivo)}
        {interruptor("Trailing depois do primeiro alvo", "trailingAtivo", conta.trailingAtivo)}
        {interruptor("Proteção de equity", "protecaoEquity", conta.protecaoEquity)}
      </div>

      <div className="rounded-2xl border p-3" style={cartao}>
        <p className={rotuloCls}>Limites diários (na moeda da conta)</p>
        <input
          type="number" min={0} defaultValue={conta.perdaDiariaMax ?? 0}
          onBlur={(e) => guardar(conta.id, { perdaDiariaMax: Number(e.target.value) })}
          className={campoCls} placeholder="Perda diária máxima"
        />
        <input
          type="number" min={0} defaultValue={conta.ganhoDiarioMax ?? 0}
          onBlur={(e) => guardar(conta.id, { ganhoDiarioMax: Number(e.target.value) })}
          className={`${campoCls} mt-2`} placeholder="Ganho diário máximo"
        />
        <p className="mt-1 text-[11px] text-zinc-500">0 = sem limite.</p>
      </div>

      <button
        onClick={fecharTudo}
        disabled={aGuardar}
        className="w-full rounded-xl border border-rose-900/60 bg-rose-950/30 py-2.5 text-[13px] font-bold text-rose-300 disabled:opacity-50"
      >
        Fechar tudo agora
      </button>

      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-zinc-500">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Estes limites são os mesmos da app MTM Auto — mudar aqui muda lá.
      </p>
    </div>
  )

  if (apenas === "ligacao") return <section className="mb-4">{ligacao}{aviso && <Aviso texto={aviso} />}</section>
  if (apenas === "definicoes") return <section className="mb-4">{definicoes}{aviso && <Aviso texto={aviso} />}</section>

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-black tracking-tight text-white">
          MTM <span className="text-[#D2A63C]">Auto</span>
        </p>
        <button onClick={carregar} disabled={aCarregar} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-400">
          {aCarregar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {ligacao}
      {aviso && <Aviso texto={aviso} />}
    </section>
  )
}

function Aviso({ texto }: { texto: string }) {
  return <p className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-[12.5px] text-zinc-300">{texto}</p>
}
