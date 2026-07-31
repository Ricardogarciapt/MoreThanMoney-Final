"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Award,
  ClipboardList,
  Users,
  Download,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react"

type Question = {
  id: string
  assessment_id: string
  order_index: number
  prompt: string
  options: string[]
  correct_index: number
  points: number
  active: boolean
}
type Assessment = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  intro: string | null
  pass_mark: number
  grade_display: "none" | "percent" | "valores20"
  cert_template: string
  active: boolean
  issuedCount: number
  questions: Question[]
}
type Attempt = {
  id: string
  assessment_slug: string
  name: string
  email: string
  score_percent: number | null
  grade_value: number | null
  passed: boolean
  cert_code: string | null
  cert_url: string | null
  emailed_at: string | null
  created_at: string
}

const GRADE_LABEL: Record<string, string> = { none: "Sem nota", percent: "Percentagem", valores20: "Valores /20" }

export default function AvaliacoesManager() {
  const [tab, setTab] = useState<"editor" | "certificados" | "lote">("editor")
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, at] = await Promise.all([
        fetch("/api/admin/avaliacoes", { credentials: "same-origin" }).then((r) => r.json()),
        fetch("/api/admin/avaliacoes/attempts", { credentials: "same-origin" }).then((r) => r.json()),
      ])
      setAssessments(a.assessments || [])
      setAttempts(at.attempts || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function post(url: string, body: any) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
    return r.json()
  }

  // ---------- Config da avaliação ----------
  function patchAssessment(id: string, patch: Partial<Assessment>) {
    setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }
  async function saveAssessment(a: Assessment) {
    setBusy(`asmt:${a.id}`)
    await post("/api/admin/avaliacoes", {
      action: "updateAssessment",
      id: a.id,
      pass_mark: a.pass_mark,
      grade_display: a.grade_display,
      active: a.active,
      intro: a.intro,
      subtitle: a.subtitle,
    })
    setBusy(null)
  }

  // ---------- Perguntas ----------
  function patchQuestion(aid: string, qid: string, patch: Partial<Question>) {
    setAssessments((prev) =>
      prev.map((a) =>
        a.id === aid ? { ...a, questions: a.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) } : a,
      ),
    )
  }
  async function saveQuestion(q: Question) {
    setBusy(`q:${q.id}`)
    await post("/api/admin/avaliacoes", {
      action: "updateQuestion",
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      correct_index: q.correct_index,
      points: q.points,
      active: q.active,
    })
    setBusy(null)
  }
  async function addQuestion(aid: string) {
    setBusy(`add:${aid}`)
    await post("/api/admin/avaliacoes", {
      action: "createQuestion",
      assessment_id: aid,
      prompt: "Nova pergunta",
      options: ["Opção A", "Opção B", "Opção C", "Opção D"],
      correct_index: 0,
      points: 1,
    })
    await load()
    setBusy(null)
  }
  async function deleteQuestion(qid: string) {
    if (!confirm("Apagar esta pergunta?")) return
    setBusy(`q:${qid}`)
    await post("/api/admin/avaliacoes", { action: "deleteQuestion", id: qid })
    await load()
    setBusy(null)
  }

  // ---------- Certificados ----------
  async function resend(code: string) {
    setBusy(`re:${code}`)
    const j = await post("/api/admin/avaliacoes/attempts", { action: "resend", cert_code: code })
    setBusy(null)
    alert(j.success ? "Reenviado ✔" : "Falha ao reenviar")
    if (j.success) load()
  }
  async function deleteAttempt(id: string) {
    if (!confirm("Apagar este registo/certificado?")) return
    setBusy(`del:${id}`)
    await post("/api/admin/avaliacoes/attempts", { action: "delete", id })
    await load()
    setBusy(null)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar avaliações…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TabBtn active={tab === "editor"} onClick={() => setTab("editor")} icon={ClipboardList} label="Perguntas & Config" />
        <TabBtn active={tab === "certificados"} onClick={() => setTab("certificados")} icon={Award} label={`Certificados (${attempts.filter((a) => a.passed).length})`} />
        <TabBtn active={tab === "lote"} onClick={() => setTab("lote")} icon={Users} label="Emitir em lote" />
        <button onClick={() => load()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {tab === "editor" && (
        <div className="space-y-6">
          {assessments.map((a) => (
            <div key={a.id} className="rounded-xl border border-[#D2A63C]/20 bg-gray-950/50 p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{a.title}</h3>
                  <p className="text-xs text-gray-500">/{a.slug} · {a.questions.length} perguntas · {a.issuedCount} certificados</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-300">
                    Aprovação ≥
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={a.pass_mark}
                      onChange={(e) => patchAssessment(a.id, { pass_mark: Number(e.target.value) })}
                      className="w-16 rounded border border-gray-700 bg-black/40 px-2 py-1 text-white"
                    />
                    %
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-300">
                    Nota:
                    <select
                      value={a.grade_display}
                      onChange={(e) => patchAssessment(a.id, { grade_display: e.target.value as any })}
                      className="rounded border border-gray-700 bg-black/40 px-2 py-1 text-white"
                    >
                      <option value="none">Sem nota</option>
                      <option value="percent">Percentagem</option>
                      <option value="valores20">Valores /20</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-300">
                    <input type="checkbox" checked={a.active} onChange={(e) => patchAssessment(a.id, { active: e.target.checked })} />
                    Ativa
                  </label>
                  <button
                    onClick={() => saveAssessment(a)}
                    disabled={busy === `asmt:${a.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black"
                  >
                    {busy === `asmt:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar config
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {a.questions.map((q, qi) => (
                  <div key={q.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-xs font-bold text-[#D2A63C]">{qi + 1}.</span>
                      <textarea
                        value={q.prompt}
                        onChange={(e) => patchQuestion(a.id, q.id, { prompt: e.target.value })}
                        rows={1}
                        className="flex-1 resize-y rounded border border-gray-700 bg-black/40 px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                    <div className="mt-2 grid gap-1.5 pl-6 md:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correct_index === oi}
                            onChange={() => patchQuestion(a.id, q.id, { correct_index: oi })}
                            title="Resposta correta"
                          />
                          <input
                            value={opt}
                            onChange={(e) => {
                              const next = [...q.options]
                              next[oi] = e.target.value
                              patchQuestion(a.id, q.id, { options: next })
                            }}
                            className={`flex-1 rounded border px-2 py-1 text-sm text-white ${q.correct_index === oi ? "border-emerald-600/60 bg-emerald-950/20" : "border-gray-700 bg-black/40"}`}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3 pl-6">
                      <label className="flex items-center gap-1 text-[11px] text-gray-400">
                        Pontos
                        <input
                          type="number"
                          step="0.1"
                          value={q.points}
                          onChange={(e) => patchQuestion(a.id, q.id, { points: Number(e.target.value) })}
                          className="w-16 rounded border border-gray-700 bg-black/40 px-2 py-0.5 text-white"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-gray-400">
                        <input type="checkbox" checked={q.active} onChange={(e) => patchQuestion(a.id, q.id, { active: e.target.checked })} /> Ativa
                      </label>
                      <button
                        onClick={() => saveQuestion(q)}
                        disabled={busy === `q:${q.id}`}
                        className="ml-auto inline-flex items-center gap-1 rounded bg-[#D2A63C]/90 px-2.5 py-1 text-[11px] font-semibold text-black"
                      >
                        {busy === `q:${q.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
                      </button>
                      <button onClick={() => deleteQuestion(q.id)} className="inline-flex items-center rounded border border-red-800/60 px-2 py-1 text-red-300 hover:bg-red-950/30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addQuestion(a.id)}
                disabled={busy === `add:${a.id}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#D2A63C]/40 px-3 py-2 text-xs text-[#D2A63C] hover:bg-[#D2A63C]/10"
              >
                {busy === `add:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar pergunta
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "certificados" && (
        <CertificadosTab attempts={attempts} busy={busy} onResend={resend} onDelete={deleteAttempt} />
      )}

      {tab === "lote" && <LoteTab assessments={assessments} onDone={load} post={post} />}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-[#D2A63C]/15 text-[#D2A63C] ring-1 ring-[#D2A63C]/30" : "text-gray-400 hover:bg-white/5"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}

function CertificadosTab({
  attempts,
  busy,
  onResend,
  onDelete,
}: {
  attempts: Attempt[]
  busy: string | null
  onResend: (c: string) => void
  onDelete: (id: string) => void
}) {
  const [filter, setFilter] = useState("")
  const rows = attempts.filter(
    (a) => !filter || a.name.toLowerCase().includes(filter.toLowerCase()) || a.email.toLowerCase().includes(filter.toLowerCase()) || a.assessment_slug.includes(filter),
  )
  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por nome, email ou curso…"
        className="mb-3 w-full max-w-sm rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-600"
      />
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Aluno</th>
              <th className="px-3 py-2">Curso</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-gray-800/70">
                <td className="px-3 py-2">
                  <div className="text-gray-200">{a.name}</div>
                  <div className="text-[11px] text-gray-500">{a.email}</div>
                </td>
                <td className="px-3 py-2 text-gray-400">{a.assessment_slug}</td>
                <td className="px-3 py-2 text-gray-300">
                  {a.grade_value != null ? Number(a.grade_value).toFixed(1).replace(".", ",") : a.score_percent != null ? `${a.score_percent}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  {a.passed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Emitido</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-400"><XCircle className="h-3.5 w-3.5" /> Reprovado</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-gray-500">{a.emailed_at ? "enviado" : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {a.passed && a.cert_code && (
                      <>
                        <a href={`/api/avaliacoes/certificado/${a.cert_code}?dl=1`} className="rounded border border-gray-700 p-1.5 text-gray-300 hover:bg-white/5" title="Descarregar">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => onResend(a.cert_code!)} disabled={busy === `re:${a.cert_code}`} className="rounded border border-gray-700 p-1.5 text-gray-300 hover:bg-white/5" title="Reenviar email">
                          {busy === `re:${a.cert_code}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                    <button onClick={() => onDelete(a.id)} className="rounded border border-red-800/60 p-1.5 text-red-300 hover:bg-red-950/30" title="Apagar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sem registos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LoteTab({ assessments, onDone, post }: { assessments: Assessment[]; onDone: () => void; post: (u: string, b: any) => Promise<any> }) {
  const [slug, setSlug] = useState(assessments[0]?.slug || "")
  const [text, setText] = useState("")
  const [sendEmail, setSendEmail] = useState(true)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const selected = assessments.find((a) => a.slug === slug)
  const showsGrade = selected?.grade_display === "valores20" || selected?.grade_display === "percent"

  async function run() {
    const entries = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[;,\t]/).map((p) => p.trim())
        const name = parts[0]
        const email = parts[1]
        const gradeValue = parts[2] ? Number(parts[2].replace(",", ".")) : null
        return { name, email, gradeValue }
      })
      .filter((e) => e.name && e.email)
    if (!entries.length) return alert("Cola pelo menos uma linha: Nome, email" + (showsGrade ? ", nota" : ""))
    setRunning(true)
    setResults(null)
    const j = await post("/api/admin/avaliacoes/attempts", { action: "issue", slug, entries, sendEmail })
    setResults(j.results || [])
    setRunning(false)
    onDone()
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-400">
        Emite certificados a quem já concluiu (sem quiz). Cola uma linha por pessoa:{" "}
        <code className="rounded bg-white/10 px-1">Nome, email{showsGrade ? ", nota" : ""}</code> (separador vírgula, ponto-e-vírgula ou tab).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-300">
          Curso:
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded border border-gray-700 bg-black/40 px-2 py-1 text-white">
            {assessments.map((a) => (
              <option key={a.id} value={a.slug}>{a.title}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-300">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Enviar email
        </label>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={showsGrade ? "Ana Silva, ana@email.com, 17.2\nJoão Costa, joao@email.com, 15,5" : "Ana Silva, ana@email.com\nJoão Costa, joao@email.com"}
        className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 font-mono text-sm text-white"
      />
      <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Emitir certificados
      </button>

      {results && (
        <div className="rounded-lg border border-gray-800 bg-black/30 p-3 text-sm">
          <p className="mb-2 text-gray-300">
            {results.filter((r) => r.ok).length} emitidos · {results.filter((r) => !r.ok).length} falharam
          </p>
          <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? "text-emerald-300" : "text-red-300"}>
                {r.ok ? "✔" : "✘"} {r.email} {r.code ? `(${r.code}${r.emailed ? ", email enviado" : ""})` : r.error ? `— ${r.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
