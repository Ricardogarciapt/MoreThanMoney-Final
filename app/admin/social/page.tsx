"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Plus,
  Check,
  X,
  Trash2,
  RefreshCw,
  Loader2,
  CalendarClock,
  ExternalLink,
  Instagram,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Post {
  id: string
  ig_account_id: string
  ig_username: string | null
  pillar: string | null
  media_type: string
  media_urls: string[]
  caption: string | null
  scheduled_at: string
  status: string
  permalink: string | null
  error: string | null
}

const ACCOUNTS = [
  { id: "17841474872672009", username: "morethanmoney.pt" },
  { id: "17841405656956716", username: "ricardogarciapt" },
]
const PILLARS = ["prova", "educacao", "contrarian", "oferta", "pessoal"]
const TYPES = ["IMAGE", "CAROUSEL", "STORIES", "REELS"]

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  approved: "bg-amber-100 text-amber-800",
  publishing: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  published: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  canceled: "bg-neutral-100 text-neutral-500",
}

export default function AdminSocialPage() {
  const { toast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    ig_account_id: ACCOUNTS[0].id,
    pillar: "prova",
    media_type: "IMAGE",
    media_urls: "",
    caption: "",
    scheduled_at: "",
    rehost: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/social-posts", { cache: "no-store" })
      const j = await r.json()
      setPosts(j.data || [])
    } catch {
      toast({ title: "Erro a carregar", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const act = async (id: string, action: string) => {
    const r = await fetch(`/api/admin/social-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (r.ok) {
      toast({ title: `Post ${action === "approve" ? "aprovado" : action}` })
      load()
    } else {
      const j = await r.json().catch(() => ({}))
      toast({ title: "Falhou", description: j.error, variant: "destructive" })
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Apagar este post da fila?")) return
    const r = await fetch(`/api/admin/social-posts/${id}`, { method: "DELETE" })
    if (r.ok) {
      toast({ title: "Apagado" })
      load()
    }
  }

  const create = async () => {
    const urls = form.media_urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean)
    if (!urls.length) {
      toast({ title: "Falta media_url", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/admin/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_account_id: form.ig_account_id,
          pillar: form.pillar,
          media_type: form.media_type,
          media_urls: urls,
          caption: form.caption,
          scheduled_at: form.scheduled_at
            ? new Date(form.scheduled_at).toISOString()
            : new Date().toISOString(),
          rehost: form.rehost,
        }),
      })
      if (r.ok) {
        toast({ title: "Rascunho criado" })
        setOpen(false)
        setForm((f) => ({ ...f, media_urls: "", caption: "", scheduled_at: "" }))
        load()
      } else {
        const j = await r.json().catch(() => ({}))
        toast({ title: "Erro a criar", description: j.error, variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  const shown = posts.filter((p) => filter === "all" || p.status === filter)
  const counts = posts.reduce<Record<string, number>>((a, p) => {
    a[p.status] = (a[p.status] || 0) + 1
    return a
  }, {})

  return (
    <div className="min-h-screen bg-neutral-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <Instagram className="h-6 w-6" /> Conteúdo &amp; Agendamento
              </h1>
              <p className="text-sm text-neutral-500">
                Publicação nativa nas 2 contas. Nada sai sem a tua aprovação.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo post
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {["all", "draft", "approved", "processing", "published", "failed", "canceled"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === s ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 border"
              }`}
            >
              {s === "all" ? "Todos" : s} {s !== "all" && counts[s] ? `(${counts[s]})` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white py-20 text-center text-neutral-400">
            Sem posts {filter !== "all" ? `em "${filter}"` : "na fila"}.
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((p) => (
              <div key={p.id} className="flex gap-4 rounded-xl border bg-white p-4">
                {p.media_urls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.media_urls[0]}
                    alt=""
                    className="h-20 w-20 flex-none rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_STYLE[p.status] || ""}>{p.status}</Badge>
                    <span className="text-sm font-medium">@{p.ig_username}</span>
                    <span className="text-xs text-neutral-400">
                      {p.media_type} · {p.pillar || "—"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <CalendarClock className="h-3 w-3" />
                      {new Date(p.scheduled_at).toLocaleString("pt-PT", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-neutral-600">{p.caption || "—"}</p>
                  {p.error && <p className="mt-1 text-xs text-red-500">⚠ {p.error}</p>}
                  {p.permalink && (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600"
                    >
                      Ver publicação <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="flex flex-none flex-col gap-2">
                  {p.status === "draft" && (
                    <Button size="sm" onClick={() => act(p.id, "approve")}>
                      <Check className="mr-1 h-4 w-4" /> Aprovar
                    </Button>
                  )}
                  {p.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => act(p.id, "draft")}>
                      <X className="mr-1 h-4 w-4" /> Suspender
                    </Button>
                  )}
                  {p.status === "failed" && (
                    <Button size="sm" variant="outline" onClick={() => act(p.id, "retry")}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Tentar de novo
                    </Button>
                  )}
                  {p.status !== "published" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo post</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Conta</label>
                <Select
                  value={form.ig_account_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, ig_account_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        @{a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Tipo</label>
                <Select
                  value={form.media_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, media_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Pilar</label>
                <Select
                  value={form.pillar}
                  onValueChange={(v) => setForm((f) => ({ ...f, pillar: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PILLARS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  Agendar para
                </label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Media URLs (uma por linha — carrossel = várias)
              </label>
              <textarea
                className="min-h-[70px] w-full rounded-md border p-2 text-sm"
                placeholder="https://…/imagem.jpg"
                value={form.media_urls}
                onChange={(e) => setForm((f) => ({ ...f, media_urls: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Legenda</label>
              <textarea
                className="min-h-[90px] w-full rounded-md border p-2 text-sm"
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={form.rehost}
                onChange={(e) => setForm((f) => ({ ...f, rehost: e.target.checked }))}
              />
              Re-hospedar media no bucket (recomendado p/ exports Canva)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Criar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
