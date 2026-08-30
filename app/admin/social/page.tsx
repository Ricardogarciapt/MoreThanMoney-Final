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
  Pencil,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Quote,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { MapaFunis } from "@/components/admin/mapa-funis"
import { PainelAutomacoes } from "@/components/admin/painel-automacoes"
import { TokensInstagram } from "@/components/admin/tokens-instagram"
import { RadarLeads } from "@/components/admin/radar-leads"
import { EstudioCartoes } from "@/components/admin/estudio-cartoes"

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
interface MensagemFunil {
  chave: string
  titulo: string
  quando: string
  variaveis: string[]
  padrao: string
  texto: string
  previsao: string
  editado: boolean
}

interface Painel {
  maquina: {
    resumo: string
    novos24h: number
    acessosHoje: number
    conversoes24h: number
    corretoraValidada: number
    sinais24h: number
    rascunhosPorRever: number
    autopilot: { morethanmoney: boolean; ricardo: boolean }
    execucao: { chave: string; ligado: boolean }[]
  } | null
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
  draft: "bg-neutral-200 text-neutral-200",
  approved: "bg-amber-950 text-amber-300",
  publishing: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  published: "bg-emerald-950 text-emerald-300",
  failed: "bg-red-950 text-red-300",
  canceled: "bg-neutral-100 text-neutral-400",
}

export default function AdminSocialPage() {
  const { toast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Separador aberto: a fila, os factos que vão nos cartões, ou o funil. */
  const [aba, setAba] = useState<"fila" | "factos" | "funil" | "mensagens" | "mapa" | "automacoes" | "ligacoes" | "radar" | "cartoes">("fila")
  const [mensagens, setMensagens] = useState<MensagemFunil[] | null>(null)
  /** O post a ser editado. As legendas eram só de leitura: para mudar uma vírgula apagava-se e
   *  criava-se outro, e perdia-se a imagem já gerada. */
  const [editar, setEditar] = useState<Post | null>(null)
  /** O estúdio: escrever e reescrever por conversa. */
  const [estudio, setEstudio] = useState(false)
  const [pedirAlteracao, setPedirAlteracao] = useState<Post | null>(null)
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

  /** Fala com o estúdio. Devolve o que ele escreveu, ou lança com o motivo. */
  const aoEstudio = useCallback(async (corpo: Record<string, unknown>) => {
    const tok = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch("/api/admin/social/estudio", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify(corpo),
    })
    const j = await r.json()
    if (!r.ok || j.error) throw new Error(j.error || "O estúdio não respondeu")
    return j as Record<string, unknown>
  }, [])

  const lerMensagens = useCallback(async () => {
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      if (!tok) return
      const r = await fetch("/api/admin/social/mensagens", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      if (j.ok) setMensagens(j.mensagens)
    } catch {
      /* sem mensagens o resto da página continua a servir */
    }
  }, [])

  const gravarMensagem = async (chave: string, texto: string) => {
    const tok = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch("/api/admin/social/mensagens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ chave, texto }),
    })
    const j = await r.json()
    if (j.ok) {
      setMensagens(j.mensagens)
      toast({ title: texto.trim() ? "Mensagem guardada" : "Voltou ao texto original" })
    } else {
      toast({ title: "Não deu para guardar", description: j.error, variant: "destructive" })
    }
  }

  const guardarPost = async (id: string, campos: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/social-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    })
    if (r.ok) {
      toast({ title: "Post atualizado" })
      setEditar(null)
      load()
    } else {
      const j = await r.json().catch(() => ({}))
      toast({ title: "Erro a guardar", description: j.error, variant: "destructive" })
    }
  }

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
    lerMensagens()
  }, [load, lerPainel, lerMensagens])

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
    <div className="min-h-screen bg-neutral-950 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-neutral-100">
                <Instagram className="h-6 w-6" /> Conteúdo &amp; Agendamento
              </h1>
              <p className="text-sm text-neutral-400">
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
            <Button variant="outline" onClick={() => setEstudio(true)}>
              <Sparkles className="mr-1 h-4 w-4" /> Criar por chat
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
            ["mensagens", "Mensagens do funil"],
            ["mapa", "Mapa dos funis"],
            ["automacoes", "Automações"],
            ["cartoes", "Estúdio de cartões"],
            ["radar", "Radar de leads"],
            ["ligacoes", "Ligações"],
          ] as const).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                aba === id ? "border-neutral-900 text-neutral-100" : "border-transparent text-neutral-400"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "factos" && <PainelFactos painel={painel} aoEstudio={aoEstudio} />}
        {aba === "funil" && <PainelFunil painel={painel} />}
        {aba === "mensagens" && <PainelMensagens mensagens={mensagens} aGravar={gravarMensagem} />}
        {aba === "mapa" && <MapaFunis />}
        {aba === "automacoes" && <PainelAutomacoes />}
        {/* As automações do Instagram dependem TODAS do token. Sem ele nenhuma responde, e o
            painel das automações não tem como saber porquê — por isso o estado do token vive
            aqui ao lado e não escondido nas variáveis da Vercel. */}
        {aba === "cartoes" && <EstudioCartoes />}
        {aba === "radar" && <RadarLeads />}
        {aba === "ligacoes" && <TokensInstagram />}

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
                filter === s ? "bg-neutral-900 text-white" : "bg-white text-neutral-400 border"
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
          <div className="rounded-xl border border-dashed border-neutral-700 bg-white py-20 text-center text-neutral-400">
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
                  <p className="line-clamp-2 text-sm text-neutral-400">{p.caption || "—"}</p>
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
                  {/* Editar em vez de apagar-e-criar: refazer um post por causa de uma vírgula
                      deitava fora a imagem já gerada e a hora já escolhida. */}
                  {p.status !== "published" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditar(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {/* Pedir a mudança por palavras — "mais curto", "tira o emoji" — em vez de
                          reescrever à mão ou apagar e esperar pelo cron do dia seguinte. */}
                      <Button size="sm" variant="ghost" onClick={() => setPedirAlteracao(p)} title="Pedir alteração">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>

      {estudio && (
        <Estudio
          aoEstudio={aoEstudio}
          aoFechar={() => setEstudio(false)}
          aoCriado={() => { setEstudio(false); load() }}
        />
      )}

      {pedirAlteracao && (
        <PedirAlteracao
          post={pedirAlteracao}
          aoEstudio={aoEstudio}
          aoFechar={() => setPedirAlteracao(null)}
          aoGuardar={async (caption) => {
            await guardarPost(pedirAlteracao.id, { caption })
            setPedirAlteracao(null)
          }}
        />
      )}

      <Dialog open={Boolean(editar)} onOpenChange={(v) => !v && setEditar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar post</DialogTitle>
          </DialogHeader>
          {editar && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400">Legenda</label>
                <textarea
                  defaultValue={editar.caption ?? ""}
                  onChange={(e) => setEditar({ ...editar, caption: e.target.value })}
                  rows={8}
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400">Quando sai</label>
                  <Input
                    type="datetime-local"
                    defaultValue={
                      editar.scheduled_at ? new Date(editar.scheduled_at).toISOString().slice(0, 16) : ""
                    }
                    onChange={(e) =>
                      setEditar({ ...editar, scheduled_at: new Date(e.target.value).toISOString() })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Pilar</label>
                  <Select
                    value={editar.pillar ?? "prova"}
                    onValueChange={(v) => setEditar({ ...editar, pillar: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PILLARS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-400">Imagem (URL)</label>
                <Input
                  defaultValue={editar.media_urls?.[0] ?? ""}
                  onChange={(e) => setEditar({ ...editar, media_urls: e.target.value ? [e.target.value] : [] })}
                />
                <p className="mt-1 text-xs text-neutral-400">
                  Sem imagem, o Instagram recusa — o post fica na fila para sempre.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditar(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editar &&
                guardarPost(editar.id, {
                  caption: editar.caption,
                  scheduled_at: editar.scheduled_at,
                  pillar: editar.pillar,
                  media_urls: editar.media_urls,
                })
              }
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo post</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Conta</label>
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
                <label className="mb-1 block text-xs font-medium text-neutral-400">Tipo</label>
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
                <label className="mb-1 block text-xs font-medium text-neutral-400">Pilar</label>
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
                <label className="mb-1 block text-xs font-medium text-neutral-400">
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
              <label className="mb-1 block text-xs font-medium text-neutral-400">
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
              <label className="mb-1 block text-xs font-medium text-neutral-400">Legenda</label>
              <textarea
                className="min-h-[90px] w-full rounded-md border p-2 text-sm"
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-400">
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
function PainelFactos({
  painel,
  aoEstudio,
}: {
  painel: Painel | null
  aoEstudio: (corpo: Record<string, unknown>) => Promise<Record<string, unknown>>
}) {
  const { toast } = useToast()
  const [aGerar, setAGerar] = useState<"factos" | "testemunho" | null>(null)
  const [feitio, setFeitio] = useState("")
  const [gerados, setGerados] = useState<string[]>([])
  const [nota, setNota] = useState<string | null>(null)

  const gerar = async (acao: "factos" | "testemunho") => {
    setAGerar(acao)
    setNota(null)
    try {
      const j = await aoEstudio({ acao, pedido: feitio })
      const lista = (j.factos ?? j.testemunhos ?? []) as string[]
      setGerados(lista)
      setNota((j.nota as string) ?? null)
      if (!lista.length && !j.nota) toast({ title: "Não veio nada" })
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGerar(null)
    }
  }

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
          <p className="mt-1 text-xs text-neutral-400">
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
            <p className="text-xs uppercase tracking-wide text-neutral-400">{r}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      {/* Gerar à medida: dar outra forma aos MESMOS factos, ou escolher testemunhos reais.
          Os números nunca mudam — o modelo recebe-os apurados e só lhes muda o feitio. */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-semibold">Gerar à medida</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          Diz o feitio que queres. Os números não mudam — só a forma como são ditos.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={feitio}
            onChange={(e) => setFeitio(e.target.value)}
            placeholder="ex.: curtos e diretos · para stories · em tom de bastidores"
            className="min-w-[240px] flex-1"
          />
          <Button variant="outline" disabled={aGerar !== null} onClick={() => gerar("factos")}>
            {aGerar === "factos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Factos
          </Button>
          <Button variant="outline" disabled={aGerar !== null} onClick={() => gerar("testemunho")}>
            {aGerar === "testemunho" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="mr-1 h-4 w-4" />}
            Testemunhos
          </Button>
        </div>

        {nota && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">{nota}</p>}

        {gerados.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {gerados.map((g, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <span>{g}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(g); toast({ title: "Copiado" }) }}
                  className="shrink-0 text-xs text-neutral-400 hover:text-neutral-100"
                >
                  copiar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          A ressalva que acompanha sempre qualquer número
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{f.ressalva}</p>
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
  const m = painel.maquina

  return (
    <div className="space-y-4">
      {/* A máquina de vendas vivia noutro ecrã. Quem aprova conteúdo precisa de saber se há
          gente à espera de acesso e se os motores estão ligados — decide-se junto. */}
      {m && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Máquina de vendas · últimas 24h</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Leads novos", m.novos24h],
              ["Acessos dados hoje", m.acessosHoje],
              ["Conversões pagas", m.conversoes24h],
              ["Corretora validada", m.corretoraValidada],
              ["Sinais", m.sinais24h],
              ["Rascunhos por rever", m.rascunhosPorRever],
            ].map(([r, v]) => (
              <div key={String(r)} className="rounded-lg border p-3">
                <p className="text-[11px] uppercase tracking-wide text-neutral-400">{r}</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {m.execucao.length > 0 && (
            <>
              <p className="mt-4 text-xs uppercase tracking-wide text-neutral-400">
                Motores de execução
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.execucao.map((x) => (
                  <span
                    key={x.chave}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      x.ligado ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {x.chave} {x.ligado ? "ligado" : "desligado"}
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <Link href="/admin/sales-machine">
              <Button variant="outline" size="sm">
                Abrir a máquina de vendas <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-semibold">Do primeiro contacto ao pagante</p>
        <div className="mt-3 space-y-2">
          {d.map((x, i) => {
            const anterior = i > 0 ? d[i - 1].total : null
            const passou = anterior && anterior > 0 ? Math.round((x.total / anterior) * 100) : null
            return (
              <div key={x.degrau} className="flex items-center gap-3">
                <span className="w-44 flex-none text-sm text-neutral-200">{x.degrau}</span>
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
          <p className="mt-3 text-xs text-neutral-400">
            Piloto automático: <b>{painel.conteudo.autopilot ? "ligado" : "desligado"}</b>
            {painel.conteudo.autopilot
              ? " — os posts com imagem publicam sem passar por ti."
              : " — nada sai sem a tua aprovação."}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Próximos a sair</p>
          {painel.conteudo.proximos.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-400">Nada aprovado à espera de hora.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {painel.conteudo.proximos.map((x) => (
                <li key={x.quando} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-400">
                    {new Date(x.quando).toLocaleString("pt-PT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {x.conta ?? "—"} · {x.pilar ?? "—"}
                  </span>
                  {!x.temImagem && <span className="font-semibold text-amber-300">sem imagem</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * As mensagens que o funil envia — editáveis aqui.
 *
 * Estavam dentro do código: mudar uma vírgula na de boas-vindas obrigava a um commit e a um
 * deploy, e por isso ninguém as mudava. Uma mensagem de vendas que não se pode afinar é uma
 * mensagem que envelhece.
 *
 * Cada uma mostra QUANDO sai, porque editar sem saber isso é editar às cegas, e uma
 * pré-visualização com as variáveis já trocadas — é o que o lead vai mesmo receber.
 */
function PainelMensagens({
  mensagens,
  aGravar,
}: {
  mensagens: MensagemFunil[] | null
  aGravar: (chave: string, texto: string) => Promise<void>
}) {
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})

  if (!mensagens) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {mensagens.map((m) => {
        const valor = rascunhos[m.chave] ?? m.texto
        const mudou = valor !== m.texto
        return (
          <div key={m.chave} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{m.titulo}</p>
                <p className="mt-0.5 text-xs text-neutral-400">{m.quando}</p>
              </div>
              {m.editado && (
                <span className="rounded-full bg-amber-950 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  editada
                </span>
              )}
            </div>

            <textarea
              value={valor}
              onChange={(e) => setRascunhos({ ...rascunhos, [m.chave]: e.target.value })}
              rows={Math.min(14, Math.max(4, valor.split("\n").length + 1))}
              className="mt-3 w-full rounded-md border p-2 font-mono text-xs"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {m.variaveis.map((v) => (
                <button
                  key={v}
                  onClick={() => setRascunhos({ ...rascunhos, [m.chave]: valor + v })}
                  className="rounded-full border px-2 py-0.5 font-mono text-[11px] text-neutral-400"
                  title="Clica para inserir no fim"
                >
                  {v}
                </button>
              ))}
              <span className="flex-1" />
              {m.editado && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRascunhos({ ...rascunhos, [m.chave]: "" })
                    aGravar(m.chave, "")
                  }}
                  title="Voltar ao texto que está no código"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Original
                </Button>
              )}
              <Button size="sm" disabled={!mudou} onClick={() => aGravar(m.chave, valor)}>
                Guardar
              </Button>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-neutral-400">
                Ver como o lead recebe
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs text-neutral-200">
                {m.previsao}
              </pre>
            </details>
          </div>
        )
      })}
    </div>
  )
}

/**
 * O estúdio: escrever um post por conversa.
 *
 * O "Novo post" pedia a legenda já escrita, o que é o trabalho todo. Aqui diz-se o que se quer —
 * ou cola-se material próprio, um texto, uma ideia, o que se escreveu no telemóvel — e o post
 * vem escrito, para rever antes de entrar na fila.
 *
 * Nada é publicado a partir daqui: sai como RASCUNHO, com hora sugerida. Quem aprova continua a
 * ser uma pessoa.
 */
function Estudio({
  aoEstudio,
  aoFechar,
  aoCriado,
}: {
  aoEstudio: (corpo: Record<string, unknown>) => Promise<Record<string, unknown>>
  aoFechar: () => void
  aoCriado: () => void
}) {
  const { toast } = useToast()
  const [pedido, setPedido] = useState("")
  const [material, setMaterial] = useState("")
  const [aPensar, setAPensar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [saida, setSaida] = useState<{ hook: string; cta: string; caption: string } | null>(null)
  const [conta, setConta] = useState(ACCOUNTS[0].id)
  const [pilar, setPilar] = useState("prova")
  const [quando, setQuando] = useState(() => {
    // Amanhã às 19:00 de Lisboa — a hora a que a fila costuma sair.
    const d = new Date(Date.now() + 86400000)
    d.setHours(19, 0, 0, 0)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })

  const escrever = async () => {
    setAPensar(true)
    try {
      const j = await aoEstudio({ acao: "criar", pedido, material })
      setSaida({ hook: String(j.hook ?? ""), cta: String(j.cta ?? ""), caption: String(j.caption ?? "") })
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAPensar(false)
    }
  }

  const guardar = async () => {
    if (!saida) return
    setAGuardar(true)
    try {
      const r = await fetch("/api/admin/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_account_id: conta,
          pillar: pilar,
          media_type: "IMAGE",
          media_urls: [],
          caption: saida.caption,
          scheduled_at: new Date(quando).toISOString(),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Não deu para guardar")
      toast({ title: "Rascunho criado", description: "Falta a imagem antes de aprovar." })
      aoCriado()
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Criar por chat
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-400">O que queres publicar</label>
            <Input
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="ex.: um post sobre disciplina, a puxar para a app"
              onKeyDown={(e) => e.key === "Enter" && !aPensar && escrever()}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400">
              Material teu (opcional) — um texto, uma ideia, o que escreveste no telemóvel
            </label>
            <textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border p-2 text-sm"
            />
          </div>

          <Button onClick={escrever} disabled={aPensar || (!pedido && !material)} className="w-full">
            {aPensar ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A escrever…</> : "Escrever"}
          </Button>

          {saida && (
            <div className="space-y-3 rounded-xl border bg-neutral-50 p-3">
              <div>
                <label className="text-xs text-neutral-400">Gancho</label>
                <Input value={saida.hook} onChange={(e) => setSaida({ ...saida, hook: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Legenda</label>
                <textarea
                  value={saida.caption}
                  onChange={(e) => setSaida({ ...saida, caption: e.target.value })}
                  rows={10}
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-neutral-400">Conta</label>
                  <Select value={conta} onValueChange={setConta}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNTS.map((a) => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Pilar</label>
                  <Select value={pilar} onValueChange={setPilar}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PILLARS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Quando</label>
                  <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                Entra como rascunho. Falta-lhe a imagem — sem ela o Instagram recusa.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Fechar</Button>
          <Button onClick={guardar} disabled={!saida || aGuardar}>
            {aGuardar ? "A guardar…" : "Guardar rascunho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Pedir uma alteração por palavras.
 *
 * "Mais curto", "tira o emoji", "põe o ângulo da disciplina". O modelo recebe o post e o pedido,
 * e muda SÓ o que foi pedido — reescrever tudo perdia o que já estava bom.
 */
function PedirAlteracao({
  post,
  aoEstudio,
  aoFechar,
  aoGuardar,
}: {
  post: Post
  aoEstudio: (corpo: Record<string, unknown>) => Promise<Record<string, unknown>>
  aoFechar: () => void
  aoGuardar: (caption: string) => Promise<void>
}) {
  const { toast } = useToast()
  const [pedido, setPedido] = useState("")
  const [aPensar, setAPensar] = useState(false)
  const [novo, setNovo] = useState<string | null>(null)

  const pedir = async () => {
    setAPensar(true)
    try {
      const j = await aoEstudio({ acao: "alterar", pedido, atual: post.caption ?? "" })
      setNovo(String(j.caption ?? ""))
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAPensar(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedir alteração</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs">
            {post.caption}
          </pre>
          <Input
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder="ex.: mais curto, sem emojis, acaba com uma pergunta"
            onKeyDown={(e) => e.key === "Enter" && !aPensar && pedir()}
          />
          <Button onClick={pedir} disabled={aPensar || !pedido} className="w-full">
            {aPensar ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A reescrever…</> : "Reescrever"}
          </Button>
          {novo != null && (
            <textarea
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              rows={10}
              className="w-full rounded-md border p-2 text-sm"
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={novo == null} onClick={() => novo != null && aoGuardar(novo)}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
