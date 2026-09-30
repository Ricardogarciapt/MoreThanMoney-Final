"use client"

/**
 * A AGENDA NO ADMIN — quem atende, que assuntos existem, e o que está marcado.
 *
 * Três painéis porque são três perguntas diferentes e nenhuma delas se responde com as outras:
 * «quando é que posso ser marcado?», «o que é que se pode marcar comigo?» e «quem vem aí?».
 *
 * As janelas editam-se numa GRELHA de dias, e não num campo de texto com JSON: quem define
 * disponibilidade está a pensar «terças à tarde», não numa lista de objectos. E um JSON escrito à
 * mão com um erro de vírgula é uma agenda vazia sem aviso nenhum.
 */

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Check, ExternalLink, Link2, Loader2, Plus, X } from "lucide-react"

type Janela = { dia: number; inicio: string; fim: string }
type Anfitriao = {
  id: string; nome: string; email: string; telefone: string | null; fuso: string; zoom_url: string | null
  janelas: Janela[]; intervalo_min: number; antecedencia_horas: number; horizonte_dias: number
  max_por_dia: number; ativo: boolean; ordem: number
  google_email: string | null; google_ligado: boolean; google_ligado_em: string | null
}
type Tipo = {
  id: string; slug: string; nome: string; descricao: string | null; para_quem: string | null
  duracao_min: number; local: string; ativo: boolean; ordem: number; anfitrioes: string[]; pipeline_estado: string
}
type Marcacao = {
  id: string; nome: string; email: string; telefone: string | null; inicio: string; estado: string
  local: string; respostas: Record<string, string>; negocio_id: string | null; fuso_convidado: string | null
  agenda_tipos?: { nome?: string } | null
  agenda_anfitrioes?: { nome?: string } | null
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const CAMPO = "rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[12.5px] text-white outline-none focus:border-[#D2A63C]/60"

export default function AgendaAdmin() {
  const [dados, setDados] = useState<{ anfitrioes: Anfitriao[]; tipos: Tipo[]; marcacoes: Marcacao[] } | null>(null)
  const [aGravar, setAGravar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)

  const ler = useCallback(async () => {
    const r = await fetch("/api/admin/agenda").then((x) => x.json()).catch(() => null)
    if (!r || r.error) { setErro(r?.error ?? "Não foi possível ler a agenda."); return }
    setDados(r)
  }, [])

  useEffect(() => { void ler() }, [ler])
  useEffect(() => {
    // A mensagem que o retorno do Google deixa no endereço.
    const g = new URLSearchParams(window.location.search).get("google")
    if (g) setNota(`Google: ${g}`)
  }, [])

  const agir = async (corpo: Record<string, unknown>, chave: string) => {
    setAGravar(chave); setErro(null)
    const r = await fetch("/api/admin/agenda", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => ({ error: "falhou" }))
    setAGravar(null)
    if (r?.error) { setErro(r.error); return }
    await ler()
  }

  if (!dados) return <div className="flex items-center gap-2 p-8 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> a ler…</div>

  const proximas = dados.marcacoes.filter((m) => new Date(m.inicio) >= new Date(Date.now() - 3_600_000))

  return (
    <div className="space-y-6">
      {erro && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{erro}</p>}
      {nota && <p className="rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-2 text-[13px] text-[#E9C46A]">{nota}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/[0.06] px-4 py-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-[#D2A63C]" />
        <p className="flex-1 text-[13px] text-zinc-300">
          O link público é <code className="text-[#E9C46A]">morethanmoney.pt/agendar</code>. Para abrir já num assunto,
          acrescenta <code className="text-[#E9C46A]">?t=onboarding</code> (ou outro slug da lista abaixo).
        </p>
        <a href="/agendar" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-zinc-300 hover:border-[#D2A63C]/50">
          abrir <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* ── Quem atende ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-gray-950/70">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <h3 className="text-[15px] font-semibold text-[#D2A63C]">Quem atende</h3>
          <button type="button" onClick={() => void agir({ accao: "anfitriao" }, "novo")} className="flex items-center gap-1 text-[12.5px] text-zinc-400 hover:text-white">
            <Plus className="h-3.5 w-3.5" /> adicionar
          </button>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {dados.anfitrioes.map((a) => (
            <Anfitri key={a.id} a={a} aGravar={aGravar} agir={agir} />
          ))}
        </div>
      </section>

      {/* ── Os assuntos ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-gray-950/70">
        <div className="border-b border-white/[0.07] px-5 py-3">
          <h3 className="text-[15px] font-semibold text-[#D2A63C]">Assuntos que se podem marcar</h3>
          <p className="mt-0.5 text-[12px] text-zinc-500">O assunto decide a duração, onde acontece e em que estado o negócio nasce no pipeline.</p>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {dados.tipos.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <button
                type="button" onClick={() => void agir({ accao: "tipo", id: t.id, ativo: !t.ativo }, t.id)}
                disabled={aGravar === t.id}
                className={`h-5 w-9 shrink-0 rounded-full transition-colors ${t.ativo ? "bg-[#D2A63C]" : "bg-white/15"}`}
                title={t.ativo ? "Visível em /agendar" : "Escondido"}
              >
                <span className={`block h-4 w-4 rounded-full bg-black transition-transform ${t.ativo ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
              <div className="min-w-[200px] flex-1">
                <p className="text-[13.5px] text-zinc-100">{t.nome}</p>
                <p className="text-[11.5px] text-zinc-500">/agendar?t={t.slug} · nasce em «{t.pipeline_estado}»</p>
              </div>
              <label className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                duração
                <input
                  type="number" min={10} max={180} step={5} defaultValue={t.duracao_min}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== t.duracao_min) void agir({ accao: "tipo", id: t.id, duracao_min: v }, t.id) }}
                  className={`${CAMPO} w-16 tabular-nums`}
                />
                min
              </label>
              <select
                defaultValue={t.local}
                onChange={(e) => void agir({ accao: "tipo", id: t.id, local: e.target.value }, t.id)}
                className={CAMPO}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="zoom">Zoom (sala fixa)</option>
                <option value="meet">Google Meet</option>
                <option value="presencial">Presencial</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* ── O que está marcado ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-gray-950/70">
        <div className="border-b border-white/[0.07] px-5 py-3">
          <h3 className="text-[15px] font-semibold text-[#D2A63C]">Próximas chamadas ({proximas.length})</h3>
        </div>
        {proximas.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">Nada marcado para já.</p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {proximas.map((m) => (
              <div key={m.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="w-[150px] shrink-0">
                  <p className="text-[13px] tabular-nums text-zinc-100">
                    {new Date(m.inicio).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[11px] text-zinc-500">{m.agenda_anfitrioes?.nome ?? "—"}</p>
                </div>
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13.5px] text-zinc-100">{m.nome} <span className="text-zinc-500">· {m.agenda_tipos?.nome}</span></p>
                  <p className="text-[11.5px] text-zinc-500">
                    {m.email}{m.telefone ? ` · ${m.telefone}` : ""}
                    {m.fuso_convidado && m.fuso_convidado !== "Europe/Lisbon" ? ` · ${m.fuso_convidado}` : ""}
                  </p>
                  {Object.entries(m.respostas ?? {}).length > 0 && (
                    <p className="mt-1 text-[11.5px] text-zinc-400">
                      {Object.entries(m.respostas).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {m.negocio_id && <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10.5px] text-emerald-300">no pipeline</span>}
                  {m.estado === "marcada" ? (
                    <>
                      <BotaoMini onClick={() => void agir({ accao: "estado", id: m.id, estado: "compareceu" }, m.id)}>veio</BotaoMini>
                      <BotaoMini onClick={() => void agir({ accao: "estado", id: m.id, estado: "faltou" }, m.id)}>faltou</BotaoMini>
                      <BotaoMini tom="perigo" onClick={() => void agir({ accao: "estado", id: m.id, estado: "cancelada" }, m.id)}>cancelar</BotaoMini>
                    </>
                  ) : (
                    <span className="text-[11.5px] text-zinc-500">{m.estado}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BotaoMini({ children, onClick, tom }: { children: React.ReactNode; onClick: () => void; tom?: "perigo" }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[11.5px] ${tom === "perigo" ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10" : "border-white/12 text-zinc-300 hover:bg-white/5"}`}>
      {children}
    </button>
  )
}

/** A ficha de um anfitrião, com a grelha de janelas. */
function Anfitri({ a, aGravar, agir }: { a: Anfitriao; aGravar: string | null; agir: (c: Record<string, unknown>, k: string) => Promise<void> }) {
  const [janelas, setJanelas] = useState<Janela[]>(a.janelas ?? [])
  const [sujo, setSujo] = useState(false)

  const mudar = (i: number, campo: keyof Janela, valor: string | number) => {
    setJanelas((j) => j.map((x, k) => (k === i ? { ...x, [campo]: valor } : x)))
    setSujo(true)
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" onClick={() => void agir({ accao: "anfitriao", id: a.id, ativo: !a.ativo }, a.id)}
          className={`h-5 w-9 shrink-0 rounded-full transition-colors ${a.ativo ? "bg-[#D2A63C]" : "bg-white/15"}`}
        >
          <span className={`block h-4 w-4 rounded-full bg-black transition-transform ${a.ativo ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
        <input defaultValue={a.nome} onBlur={(e) => e.target.value !== a.nome && void agir({ accao: "anfitriao", id: a.id, nome: e.target.value }, a.id)} className={`${CAMPO} w-40`} />
        <input defaultValue={a.email} onBlur={(e) => e.target.value !== a.email && void agir({ accao: "anfitriao", id: a.id, email: e.target.value }, a.id)} className={`${CAMPO} w-56`} />
        <input defaultValue={a.fuso} onBlur={(e) => e.target.value !== a.fuso && void agir({ accao: "anfitriao", id: a.id, fuso: e.target.value }, a.id)} className={`${CAMPO} w-40`} title="Fuso (ex.: Europe/Lisbon)" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          defaultValue={a.zoom_url ?? ""} placeholder="link fixo da tua sala Zoom (opcional)"
          onBlur={(e) => e.target.value !== (a.zoom_url ?? "") && void agir({ accao: "anfitriao", id: a.id, zoom_url: e.target.value }, a.id)}
          className={`${CAMPO} w-[320px]`}
        />
        {a.google_ligado ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[12px] text-emerald-300">
            <Check className="h-3.5 w-3.5" /> Google ligado{a.google_email ? `: ${a.google_email}` : ""}
          </span>
        ) : (
          <a
            href={`/api/admin/agenda/google/iniciar?anfitriao=${a.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1 text-[12px] text-zinc-300 hover:border-[#D2A63C]/50 hover:text-[#E9C46A]"
          >
            <Link2 className="h-3.5 w-3.5" /> ligar Google Calendar
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[11.5px] text-zinc-500">
        {([["intervalo_min", "respiro (min)"], ["antecedencia_horas", "antecedência (h)"], ["horizonte_dias", "horizonte (dias)"], ["max_por_dia", "máx./dia"]] as const).map(([campo, rotulo]) => (
          <label key={campo} className="flex items-center gap-1.5">
            {rotulo}
            <input
              type="number" defaultValue={a[campo] as number}
              onBlur={(e) => Number(e.target.value) !== a[campo] && void agir({ accao: "anfitriao", id: a.id, [campo]: Number(e.target.value) }, a.id)}
              className={`${CAMPO} w-16 tabular-nums`}
            />
          </label>
        ))}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11.5px] uppercase tracking-wider text-zinc-500">Janelas semanais (hora local de {a.fuso})</p>
        <div className="space-y-1.5">
          {janelas.map((j, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={j.dia} onChange={(e) => mudar(i, "dia", Number(e.target.value))} className={`${CAMPO} w-28`}>
                {DIAS.map((d, k) => <option key={k} value={k}>{d}</option>)}
              </select>
              <input value={j.inicio} onChange={(e) => mudar(i, "inicio", e.target.value)} placeholder="15:00" className={`${CAMPO} w-20 tabular-nums`} />
              <span className="text-zinc-600">→</span>
              <input value={j.fim} onChange={(e) => mudar(i, "fim", e.target.value)} placeholder="18:30" className={`${CAMPO} w-20 tabular-nums`} />
              <button type="button" onClick={() => { setJanelas((x) => x.filter((_, k) => k !== i)); setSujo(true) }} className="text-zinc-600 hover:text-rose-300">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button" onClick={() => { setJanelas((x) => [...x, { dia: 2, inicio: "15:00", fim: "18:00" }]); setSujo(true) }}
              className="flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" /> janela
            </button>
            {sujo && (
              <button
                type="button" disabled={aGravar === a.id}
                onClick={() => { void agir({ accao: "anfitriao", id: a.id, janelas }, a.id).then(() => setSujo(false)) }}
                className="rounded-md bg-[#D2A63C] px-3 py-1 text-[12px] font-medium text-black disabled:opacity-50"
              >
                {aGravar === a.id ? "a gravar…" : "guardar janelas"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
