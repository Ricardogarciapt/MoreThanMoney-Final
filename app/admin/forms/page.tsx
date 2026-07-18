"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import ProtectedPage from "@/components/protected-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Inbox, FileText, Loader2, Trash2, Pencil, ExternalLink, Mail, RefreshCw, Plus, Eye,
} from "lucide-react"
import type { CustomFormField } from "@/lib/custom-forms"

/**
 * /admin/forms — gestão dos formulários públicos de /docs/forms:
 * ler submissões (com email do candidato), editar/criar/apagar formulários.
 * Sincronizado com /docs/forms via tabelas custom_forms + form_submissions.
 */

interface AdminForm {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  badge: string | null
  active: boolean
  fields: CustomFormField[]
  submissions: { total: number; new: number }
}

interface Submission {
  id: string
  form_slug: string
  form_title: string | null
  email: string | null
  data: Record<string, unknown>
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: "Nova", className: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  read: { label: "Lida", className: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  contacted: { label: "Contactada", className: "bg-green-500/15 text-green-400 border-green-500/40" },
  rejected: { label: "Rejeitada", className: "bg-red-500/15 text-red-400 border-red-500/40" },
}

const NEW_FORM_TEMPLATE: CustomFormField[] = [
  { name: "full_name", label: "Full name", type: "text", required: true, half: true, section: "1 - About you" },
  { name: "email", label: "Email", type: "email", required: true, half: true },
  { name: "message", label: "Message", type: "textarea", required: true },
  { name: "consent", label: "I consent to MoreThanMoney processing my personal data (GDPR).", type: "checkbox", required: true },
]

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

function FormsAdmin() {
  const [tab, setTab] = useState<"submissions" | "forms">("submissions")
  const [forms, setForms] = useState<AdminForm[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filterSlug, setFilterSlug] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detalhe de submissão
  const [viewing, setViewing] = useState<Submission | null>(null)

  // Editor de formulário
  const [editing, setEditing] = useState<AdminForm | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [editSlug, setEditSlug] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editSubtitle, setEditSubtitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editBadge, setEditBadge] = useState("")
  const [editFieldsJson, setEditFieldsJson] = useState("")
  const [editorError, setEditorError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [formsRes, subsRes] = await Promise.all([
        fetch("/api/admin/forms"),
        fetch("/api/admin/forms/submissions"),
      ])
      const formsData = await formsRes.json().catch(() => ({}))
      const subsData = await subsRes.json().catch(() => ({}))
      if (!formsRes.ok) throw new Error(formsData?.error || "Erro ao carregar formulários")
      if (!subsRes.ok) throw new Error(subsData?.error || "Erro ao carregar submissões")
      setForms(formsData.forms || [])
      setSubmissions(subsData.submissions || [])
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredSubmissions = useMemo(
    () => (filterSlug ? submissions.filter((s) => s.form_slug === filterSlug) : submissions),
    [submissions, filterSlug]
  )

  const fieldLabel = useCallback(
    (slug: string, name: string) => {
      const form = forms.find((f) => f.slug === slug)
      return form?.fields.find((f) => f.name === name)?.label || name
    },
    [forms]
  )

  const setStatus = async (submission: Submission, status: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/forms/submissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id, status }),
      })
      if (res.ok) {
        setSubmissions((prev) => prev.map((s) => (s.id === submission.id ? { ...s, status } : s)))
        setViewing((v) => (v?.id === submission.id ? { ...v, status } : v))
      }
    } finally {
      setBusy(false)
    }
  }

  const deleteSubmission = async (submission: Submission) => {
    if (!confirm(`Apagar a submissão de ${submission.email || "(sem email)"}? Esta ação é irreversível.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/forms/submissions?id=${submission.id}`, { method: "DELETE" })
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== submission.id))
        setViewing((v) => (v?.id === submission.id ? null : v))
      }
    } finally {
      setBusy(false)
    }
  }

  const openViewer = (submission: Submission) => {
    setViewing(submission)
    if (submission.status === "new") void setStatus(submission, "read")
  }

  const openEditor = (form: AdminForm | null) => {
    setEditorError(null)
    if (form) {
      setIsNew(false)
      setEditing(form)
      setEditSlug(form.slug)
      setEditTitle(form.title)
      setEditSubtitle(form.subtitle || "")
      setEditDescription(form.description || "")
      setEditBadge(form.badge || "")
      setEditFieldsJson(JSON.stringify(form.fields, null, 2))
    } else {
      setIsNew(true)
      setEditing({
        id: "", slug: "", title: "", subtitle: null, description: null, badge: null,
        active: true, fields: NEW_FORM_TEMPLATE, submissions: { total: 0, new: 0 },
      })
      setEditSlug("")
      setEditTitle("")
      setEditSubtitle("")
      setEditDescription("")
      setEditBadge("")
      setEditFieldsJson(JSON.stringify(NEW_FORM_TEMPLATE, null, 2))
    }
  }

  const saveForm = async () => {
    if (!editing) return
    setEditorError(null)
    let fields: unknown
    try {
      fields = JSON.parse(editFieldsJson)
    } catch {
      setEditorError("JSON dos campos inválido — corrige a sintaxe.")
      return
    }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        title: editTitle,
        subtitle: editSubtitle,
        description: editDescription,
        badge: editBadge,
        fields,
      }
      let res: Response
      if (isNew) {
        res = await fetch("/api/admin/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, slug: editSlug }),
        })
      } else {
        res = await fetch("/api/admin/forms", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: editing.id }),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditorError(data?.error || "Erro ao gravar")
        return
      }
      setEditing(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (form: AdminForm) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/forms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, active: !form.active }),
      })
      if (res.ok) {
        setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, active: !form.active } : f)))
      }
    } finally {
      setBusy(false)
    }
  }

  const deleteForm = async (form: AdminForm) => {
    if (!confirm(`Apagar o formulário "${form.title}" e as suas ${form.submissions.total} submissões? Esta ação é irreversível.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/forms?id=${form.id}`, { method: "DELETE" })
      if (res.ok) await load()
    } finally {
      setBusy(false)
    }
  }

  const newCount = submissions.filter((s) => s.status === "new").length

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-[#D2A63C]">Admin • Formulários</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-[#D2A63C]/30 text-[#D2A63C] hover:bg-[#D2A63C]/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        <p className="text-sm text-gray-300 mb-6">
          Submissões dos formulários públicos de <a href="/docs/forms" className="text-[#D2A63C] underline" target="_blank" rel="noreferrer">/docs/forms</a> — cada
          submissão também chega por email a morethanmoneypt@gmail.com.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setTab("submissions")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "submissions" ? "bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/40" : "text-gray-400 border border-gray-800 hover:text-white"
            }`}
          >
            <Inbox className="w-4 h-4" /> Submissões
            {newCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">{newCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("forms")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "forms" ? "bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/40" : "text-gray-400 border border-gray-800 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" /> Formulários ({forms.length})
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-6">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> A carregar…
          </div>
        ) : tab === "submissions" ? (
          <>
            {/* Filtro por formulário */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setFilterSlug("")}
                className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                  !filterSlug ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-gray-700 text-gray-400 hover:border-[#D2A63C]/50"
                }`}
              >
                Todas ({submissions.length})
              </button>
              {forms.map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => setFilterSlug(f.slug)}
                  className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                    filterSlug === f.slug ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-gray-700 text-gray-400 hover:border-[#D2A63C]/50"
                  }`}
                >
                  {f.title} ({f.submissions.total})
                </button>
              ))}
            </div>

            {filteredSubmissions.length === 0 ? (
              <p className="text-center text-gray-500 py-20">Sem submissões{filterSlug ? " neste formulário" : ""} por enquanto.</p>
            ) : (
              <div className="space-y-2">
                {filteredSubmissions.map((s) => {
                  const status = STATUS_LABELS[s.status] || STATUS_LABELS.new
                  const name = typeof s.data?.full_name === "string" ? s.data.full_name : "—"
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 hover:border-[#D2A63C]/40 transition-colors"
                    >
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-semibold text-white">{name}</p>
                        <p className="text-xs text-gray-400">{s.email || "sem email"} · {s.form_title || s.form_slug}</p>
                      </div>
                      <span className="text-xs text-gray-500">{formatDate(s.created_at)}</span>
                      <Badge variant="outline" className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openViewer(s)} title="Ler" className="text-gray-400 hover:text-[#D2A63C]">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {s.email && (
                          <a href={`mailto:${s.email}?subject=MoreThanMoney — ${encodeURIComponent(s.form_title || "Candidatura")}`} title="Responder por email">
                            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-[#D2A63C]">
                              <Mail className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => void deleteSubmission(s)} disabled={busy} title="Apagar" className="text-gray-400 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4">
              <Button size="sm" onClick={() => openEditor(null)} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                <Plus className="w-4 h-4 mr-2" /> Novo formulário
              </Button>
            </div>
            <div className="space-y-3">
              {forms.map((form) => (
                <div key={form.id} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white">{form.title}</p>
                        {form.badge && (
                          <Badge variant="outline" className="text-[10px] border-[#D2A63C]/40 text-[#D2A63C]">{form.badge}</Badge>
                        )}
                        {!form.active && (
                          <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-500">Inativo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        /docs/forms/{form.slug} · {form.fields.length} campos · {form.submissions.total} submissões
                        {form.submissions.new > 0 && <span className="text-amber-400"> ({form.submissions.new} novas)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Ativo</span>
                      <Switch checked={form.active} onCheckedChange={() => void toggleActive(form)} disabled={busy} />
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={`/docs/forms/${form.slug}`} target="_blank" rel="noreferrer" title="Ver página pública">
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-[#D2A63C]">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                      <Button variant="ghost" size="sm" onClick={() => openEditor(form)} title="Editar" className="text-gray-400 hover:text-[#D2A63C]">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void deleteForm(form)} disabled={busy} title="Apagar" className="text-gray-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhe da submissão */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-950 border-[#D2A63C]/25 text-white">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#D2A63C]">
                  {viewing.form_title || viewing.form_slug} · {formatDate(viewing.created_at)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {Object.entries(viewing.data).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-gray-800 bg-black/40 px-4 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{fieldLabel(viewing.form_slug, key)}</p>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                      {Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}
                    </p>
                  </div>
                ))}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                <div className="flex flex-wrap gap-2 mr-auto">
                  {Object.entries(STATUS_LABELS).map(([value, meta]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => void setStatus(viewing, value)}
                      disabled={busy}
                      className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                        viewing.status === value ? meta.className : "border-gray-700 text-gray-500 hover:text-white"
                      }`}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
                {viewing.email && (
                  <a href={`mailto:${viewing.email}?subject=MoreThanMoney — ${encodeURIComponent(viewing.form_title || "Candidatura")}`}>
                    <Button size="sm" className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                      <Mail className="w-4 h-4 mr-2" /> Responder
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={() => void deleteSubmission(viewing)} disabled={busy} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4 mr-2" /> Apagar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor de formulário */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-gray-950 border-[#D2A63C]/25 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C]">{isNew ? "Novo formulário" : `Editar — ${editing?.title}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {isNew && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Slug (URL) *</p>
                  <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} placeholder="ex: mentor-cripto" className="bg-black/40 border-gray-700" />
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-1">Título *</p>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-black/40 border-gray-700" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Badge</p>
                <Input value={editBadge} onChange={(e) => setEditBadge(e.target.value)} placeholder="Trading, UGC, Sales…" className="bg-black/40 border-gray-700" />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400 mb-1">Subtítulo</p>
                <Input value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} className="bg-black/40 border-gray-700" />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400 mb-1">Descrição</p>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="bg-black/40 border-gray-700" />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">
                Campos (JSON) — tipos: text, email, textarea, select, chips, checkbox · opções: required, half, options[], placeholder, hint, section, sectionHint
              </p>
              <Textarea
                value={editFieldsJson}
                onChange={(e) => setEditFieldsJson(e.target.value)}
                rows={16}
                className="bg-black/40 border-gray-700 font-mono text-xs"
                spellCheck={false}
              />
            </div>
            {editorError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{editorError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="border-gray-700 text-gray-300">Cancelar</Button>
            <Button onClick={() => void saveForm()} disabled={busy} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default function AdminFormsPage() {
  return (
    <ProtectedPage requireAdmin redirectPath="/login?redirect=/admin/forms" loadingMessage="A validar acesso de administrador...">
      <FormsAdmin />
    </ProtectedPage>
  )
}
