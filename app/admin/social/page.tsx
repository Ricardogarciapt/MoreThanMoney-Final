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
  Users,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

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

/** O que o painel devolve — ver `/api/admin/social/painel`. */
interface Painel {
  factos: {
    publicavel: boolean
    lista: string[]
    trades: number
    winRatePct: number | null
    pips: number | null
    atualizadoEm: string | null
    ressalva: string
  }
  conteudo: {
    total: number
    porEstado: { chave: string; total: number }[]
    porPilar: { chave: string; total: number }[]
    proximos: { quando: string; conta: string | null; pilar: string | null; temImagem: boolean }[]
    autopilot: boolean
    aprovadosSemImagem: number
    falhados: number
  }
  funil: {
    degraus: { degrau: string; total: number }[]
    mtmauto: { passo: string; total: number }[]
  }
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
  /** Separador aberto: a fila, os factos que vão nos cartões, ou o funil. */
  const [aba, setAba] = useState<"fila" | "factos" | "funil">("fila")
  const [painel, setPainel] = useState<Painel | null>(null)

  const [form, setForm] = useState({
    ig_account_id: ACCOUNTS[0].id,
    pillar: "prova",
    media_type: "IMAGE",
    media_urls: "",
    caption: "",
    scheduled_at: "",
    rehost: true,
  })

  const lerPainel = useCallback(async () => {
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      if (!tok) return
      const r = await fetch("/api/admin/social/painel", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      if (j.ok) setPainel(j)
    } catch {
      /* o painel é contexto: sem ele a fila continua a funcionar */
    }
  }, [])

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
    lerPainel()
  }, [load, lerPainel])

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
            <Link href="/admin/social/leads">
              <Button variant="outline">
                <Users className="mr-1 h-4 w-4" /> Leads &amp; Engagement
              </Button>
            </Link>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo post
            </Button>
          </div>
        </div>

        {/* Os três separadores: a fila do que sai, os factos que vão dentro dos cartões e o
            funil de onde vêm as pessoas. Aprovar um post sem ver o número que vai na imagem é
            aprovar às cegas — foi assim que uma linha de prova velha ficou meses a sair. */}
        <div className="mb-4 flex gap-2 border-b">
          {([
            ["fila", "Publicações"],
            ["factos", "Factos nos cartões"],
            ["funil", "Funil"],
          ] as const).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                aba === id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "factos" && <PainelFactos painel={painel} />}
        {aba === "funil" && <PainelFunil painel={painel} />}

        {aba === "fila" && (<>
        {painel && (painel.conteudo.aprovadosSemImagem > 0 || painel.conteudo.falhados > 0) && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {painel.conteudo.aprovadosSemImagem > 0 && (
              <p>
                <b>{painel.conteudo.aprovadosSemImagem}</b> post(s) aprovados sem imagem — o
                Instagram exige media, por isso nunca chegam a publicar.
              </p>
            )}
            {painel.conteudo.falhados > 0 && (
              <p>
                <b>{painel.conteudo.falhados}</b> falhado(s). Vê o erro no cartão para saber
                porquê.
              </p>
            )}
          </div>
        )}

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
        </>)}
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

/**
 * Os factos que entram nos cartões.
 *
 * Existem para se ver ANTES de aprovar. A linha de prova era fixa no código — "675 trades · 63%
 * win rate · +7.060€" — e ficou meses a sair em cartões novos depois de os números terem
 * deixado de ser verdade, porque não havia sítio nenhum onde alguém os visse.
 */
function PainelFactos({ painel }: { painel: Painel | null }) {
  if (!painel) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  const f = painel.factos

  return (
    <div className="space-y-4">
      {!f.publicavel ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Sem amostra que chegue para publicar números.</p>
          <p className="mt-1">
            São {f.trades} trades medidas. Abaixo do mínimo os cartões saem <b>sem número
            nenhum</b> — publicar meia dúzia de trades como prova é ruído com ar de prova, e quem
            verifica não volta a confiar.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Estes são os factos que rodam nos cartões</p>
          <p className="mt-1 text-xs text-neutral-500">
            Um por dia, à vez. Publicar sempre a mesma frase treina o leitor a saltá-la.
          </p>
          <ul className="mt-3 space-y-2">
            {f.lista.map((facto) => (
              <li
                key={facto}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              >
                {facto}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Trades medidas", String(f.trades)],
          ["Taxa de acerto", f.winRatePct != null ? `${f.winRatePct}%` : "—"],
          ["Pips", f.pips != null ? `${f.pips >= 0 ? "+" : ""}${Math.round(f.pips)}` : "—"],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{r}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          A ressalva que acompanha sempre qualquer número
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">{f.ressalva}</p>
        {f.atualizadoEm && (
          <p className="mt-2 text-xs text-neutral-400">
            Medido a {new Date(f.atualizadoEm).toLocaleString("pt-PT")}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * O funil, degrau a degrau.
 *
 * Por degraus e não por totais soltos: "132 registados" não diz onde a conversão trava, e é a
 * travagem que interessa. Cada linha mostra também quanto passou do degrau anterior — é aí que
 * se vê qual é o gargalo, sem ter de fazer contas de cabeça.
 */
function PainelFunil({ painel }: { painel: Painel | null }) {
  if (!painel) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  const d = painel.funil.degraus
  const maximo = Math.max(...d.map((x) => x.total), 1)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-semibold">Do primeiro contacto ao pagante</p>
        <div className="mt-3 space-y-2">
          {d.map((x, i) => {
            const anterior = i > 0 ? d[i - 1].total : null
            const passou = anterior && anterior > 0 ? Math.round((x.total / anterior) * 100) : null
            return (
              <div key={x.degrau} className="flex items-center gap-3">
                <span className="w-44 flex-none text-sm text-neutral-700">{x.degrau}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <span
                    className="block h-full rounded-full bg-neutral-900"
                    style={{ width: `${Math.max(2, (x.total / maximo) * 100)}%` }}
                  />
                </span>
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{x.total}</span>
                <span className="w-16 text-right text-xs text-neutral-400">
                  {passou != null ? `${passou}%` : ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {painel.funil.mtmauto.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Funil do MTM Auto, por passo</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {painel.funil.mtmauto.map((x) => (
              <span key={x.passo} className="rounded-full border px-3 py-1 text-xs">
                {x.passo === "—" ? "sem passo" : x.passo} · <b>{x.total}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Conteúdo em fila</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {painel.conteudo.porEstado.map((x) => (
              <span key={x.chave} className="rounded-full border px-3 py-1 text-xs">
                {x.chave} · <b>{x.total}</b>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Piloto automático: <b>{painel.conteudo.autopilot ? "ligado" : "desligado"}</b>
            {painel.conteudo.autopilot
              ? " — os posts com imagem publicam sem passar por ti."
              : " — nada sai sem a tua aprovação."}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Próximos a sair</p>
          {painel.conteudo.proximos.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Nada aprovado à espera de hora.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {painel.conteudo.proximos.map((x) => (
                <li key={x.quando} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-600">
                    {new Date(x.quando).toLocaleString("pt-PT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {x.conta ?? "—"} · {x.pilar ?? "—"}
                  </span>
                  {!x.temImagem && <span className="font-semibold text-amber-700">sem imagem</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
