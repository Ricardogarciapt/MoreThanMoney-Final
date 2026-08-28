"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, RefreshCw, Loader2, MessageCircle, Send, Users, Heart } from "lucide-react"

interface Lead {
  comment_id: string
  ig_username: string | null
  commenter: string | null
  keyword: string
  intent: string | null
  comment_text: string | null
  dm_status: string
  dm_text: string | null
  created_at: string
}
interface Engage {
  comment_id: string
  ig_username: string | null
  commenter: string | null
  reply_text: string | null
  status: string
  replied_at: string
}
interface Tg {
  chat_id: string
  stage: string
  coupon_code?: string | null
  username?: string | null
  first_name?: string | null
  updated_at: string
}
interface Degrau { nome: string; n: number; fonte: string; passou: number | null }
interface Automacao { nome: string; canal: string; ativa: boolean; disparos: number; ultimo_disparo: string | null }
interface Prospeto { id: string; hashtag: string; permalink: string | null; legenda: string; pontuacao: number; porque: string }

interface Stats {
  totalLeads: number
  dmsSent: number
  publicFb: number
  windowExp: number
  byIntent: Record<string, number>
  totalReplies: number
  repliesOk: number
  telegramTotal: number
  tgGranted: number
  tgByStage: Record<string, number>
}

const TG_STYLE: Record<string, string> = {
  granted: "bg-emerald-100 text-emerald-800",
  pending: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
}

const DM_STYLE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  public_fallback: "bg-amber-100 text-amber-800",
  window_expired: "bg-neutral-200 text-neutral-600",
  error: "bg-red-100 text-red-800",
  pending: "bg-blue-100 text-blue-800",
}
const INTENT_STYLE: Record<string, string> = {
  trial: "bg-blue-100 text-blue-800",
  copytrading: "bg-purple-100 text-purple-800",
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

export default function SocialLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [engage, setEngage] = useState<Engage[]>([])
  const [telegram, setTelegram] = useState<Tg[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [escada, setEscada] = useState<Degrau[]>([])
  const [automacoes, setAutomacoes] = useState<Automacao[]>([])
  const [radar, setRadar] = useState<Prospeto[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"leads" | "engage" | "telegram">("leads")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/social-leads", { cache: "no-store" })
      const j = await r.json()
      setLeads(j.leads || [])
      setEngage(j.engage || [])
      setTelegram(j.telegram || [])
      setStats(j.stats || null)
      setEscada(j.escada || [])
      setAutomacoes(j.automacoes || [])
      setRadar(j.radar || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/social">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Social
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Leads &amp; Engagement</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {/* A escada. As grelhas de números dizem quantos há em cada sítio; não dizem onde se
          perdem — e é onde se perdem que decide o que fazer a seguir. */}
      {escada.length > 0 && (
        <div className="mb-6 rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-semibold">Do comentário ao pagante</h2>
          <div className="space-y-2">
            {escada.map((d, i) => {
              const teto = Math.max(1, ...escada.map((x) => x.n))
              // Uma queda abaixo de 10% é uma parede, não um funil.
              const parede = d.passou !== null && d.passou < 10 && escada[i - 1]?.n > 0
              return (
                <div key={d.nome} className="flex items-center gap-3">
                  <div className="w-44 shrink-0 text-[12.5px] text-neutral-700">{d.nome}</div>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-neutral-100">
                    <div
                      className={`h-full ${parede ? "bg-red-400" : "bg-amber-400"}`}
                      style={{ width: `${Math.max(1, (d.n / teto) * 100)}%` }}
                    />
                  </div>
                  <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">{d.n}</div>
                  <div className={`w-20 shrink-0 text-right text-xs ${parede ? "font-semibold text-red-600" : "text-neutral-600"}`}>
                    {d.passou === null ? "—" : `${d.passou}%`}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Um degrau a zero com o de cima a zero também não é um problema deste degrau. */}
          {(() => {
            const primeiroZero = escada.findIndex((d, i) => d.n === 0 && (i === 0 || escada[i - 1].n > 0))
            if (primeiroZero < 0) return null
            return (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                Pára em <b>{escada[primeiroZero].nome}</b>. Tudo o que vem depois está a zero por
                causa deste degrau, não por causa de si próprio — é aqui que vale a pena mexer.
              </p>
            )
          })()}
        </div>
      )}

      {/* O que as automações andam a fazer. Uma regra desligada não se queixa: fica calada,
          que é exactamente o que faria se estivesse a funcionar. */}
      {automacoes.length > 0 && (
        <div className="mb-6 rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Automações</h2>
            <Link href="/admin/social" className="text-xs text-neutral-600 underline">editar</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {automacoes.map((a) => (
              <span
                key={a.nome}
                className={`rounded-full px-2.5 py-1 text-[11.5px] ${
                  a.ativa ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-600"
                }`}
                title={a.ultimo_disparo ? `Último: ${fmt(a.ultimo_disparo)}` : "Nunca disparou"}
              >
                {a.ativa ? "" : "⛔ "}{a.nome} · {a.disparos}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* O radar: o que ainda não é lead nenhum, mas pode vir a ser. */}
      {radar.length > 0 && (
        <div className="mb-6 rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Conversas por tratar ({radar.length})</h2>
            <Link href="/admin/social" className="text-xs text-neutral-600 underline">ver todas</Link>
          </div>
          <div className="space-y-1.5">
            {radar.slice(0, 5).map((p) => (
              <a
                key={p.id}
                href={p.permalink ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border p-2 hover:bg-neutral-50"
              >
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="rounded bg-emerald-100 px-1.5 font-bold text-emerald-800">{p.pontuacao}</span>
                  <span className="text-neutral-600">#{p.hashtag} — {p.porque}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-neutral-700">{p.legenda}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat icon={<Users className="h-4 w-4" />} label="Leads IG (funil)" value={stats.totalLeads} />
          <Stat icon={<Send className="h-4 w-4" />} label="DMs enviadas" value={stats.dmsSent} accent="text-emerald-600" />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Fallback público" value={stats.publicFb} accent="text-amber-600" />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Fora da janela 7d" value={stats.windowExp} accent="text-neutral-600" />
          <Stat icon={<Heart className="h-4 w-4" />} label="Respostas apreço" value={stats.repliesOk} accent="text-rose-600" />
          <Stat icon={<Send className="h-4 w-4" />} label="Telegram (grants)" value={stats.tgGranted} accent="text-sky-600" />
        </div>
      )}

      {/* By intent */}
      {stats && Object.keys(stats.byIntent || {}).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-neutral-600">Por intenção:</span>
          {Object.entries(stats.byIntent).map(([k, v]) => (
            <Badge key={k} className={INTENT_STYLE[k] || "bg-neutral-100 text-neutral-700"}>
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-3 flex gap-2">
        <Button variant={tab === "leads" ? "default" : "outline"} size="sm" onClick={() => setTab("leads")}>
          Funil / Leads ({leads.length})
        </Button>
        <Button variant={tab === "engage" ? "default" : "outline"} size="sm" onClick={() => setTab("engage")}>
          Engagement ({engage.length})
        </Button>
        <Button variant={tab === "telegram" ? "default" : "outline"} size="sm" onClick={() => setTab("telegram")}>
          Telegram ({telegram.length})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        {tab === "leads" ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="p-2">Quando</th>
                <th className="p-2">Conta</th>
                <th className="p-2">Comentador</th>
                <th className="p-2">Intenção / Palavra</th>
                <th className="p-2">Comentário</th>
                <th className="p-2">DM</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.comment_id} className="border-t align-top">
                  <td className="whitespace-nowrap p-2 text-neutral-600">{fmt(l.created_at)}</td>
                  <td className="whitespace-nowrap p-2">@{l.ig_username}</td>
                  <td className="whitespace-nowrap p-2 font-medium">{l.commenter ? `@${l.commenter}` : "—"}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={INTENT_STYLE[l.intent || ""] || "bg-neutral-100 text-neutral-700"}>{l.intent}</Badge>
                    <span className="ml-1 text-xs text-neutral-600">{l.keyword}</span>
                  </td>
                  <td className="max-w-[280px] p-2 text-neutral-700">{l.comment_text}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={DM_STYLE[l.dm_status] || "bg-neutral-100"}>{l.dm_status}</Badge>
                  </td>
                </tr>
              ))}
              {!leads.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-neutral-600">
                    Ainda sem leads. O funil capta quando alguém comenta uma palavra-chave (MUNDO, EU VOU, PREMIUM, SINAIS…).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === "engage" ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="p-2">Quando</th>
                <th className="p-2">Conta</th>
                <th className="p-2">Comentador</th>
                <th className="p-2">Resposta</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {engage.map((e) => (
                <tr key={e.comment_id} className="border-t align-top">
                  <td className="whitespace-nowrap p-2 text-neutral-600">{fmt(e.replied_at)}</td>
                  <td className="whitespace-nowrap p-2">@{e.ig_username}</td>
                  <td className="whitespace-nowrap p-2 font-medium">{e.commenter ? `@${e.commenter}` : "—"}</td>
                  <td className="max-w-[380px] p-2 text-neutral-700">{e.reply_text}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={e.status === "replied" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>{e.status}</Badge>
                  </td>
                </tr>
              ))}
              {!engage.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-neutral-600">
                    Ainda sem respostas de engagement registadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="p-2">Atualizado</th>
                <th className="p-2">Contacto</th>
                <th className="p-2">Etapa</th>
                <th className="p-2">Cupão</th>
                <th className="p-2">Chat ID</th>
              </tr>
            </thead>
            <tbody>
              {telegram.map((t) => (
                <tr key={t.chat_id} className="border-t align-top">
                  <td className="whitespace-nowrap p-2 text-neutral-600">{fmt(t.updated_at)}</td>
                  <td className="whitespace-nowrap p-2 font-medium">
                    {t.username ? `@${t.username}` : t.first_name || "—"}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={TG_STYLE[t.stage] || "bg-neutral-100 text-neutral-700"}>{t.stage}</Badge>
                  </td>
                  <td className="whitespace-nowrap p-2 text-xs text-neutral-600">{t.coupon_code || "—"}</td>
                  <td className="whitespace-nowrap p-2 text-xs text-neutral-600">{t.chat_id}</td>
                </tr>
              ))}
              {!telegram.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-neutral-600">
                    Ainda sem leads de Telegram (funil broker-gate).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-1 text-xs text-neutral-600">
        {icon} {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent || ""}`}>{value}</div>
    </div>
  )
}
