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
interface Stats {
  totalLeads: number
  dmsSent: number
  publicFb: number
  windowExp: number
  byIntent: Record<string, number>
  totalReplies: number
  repliesOk: number
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
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"leads" | "engage">("leads")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/social-leads", { cache: "no-store" })
      const j = await r.json()
      setLeads(j.leads || [])
      setEngage(j.engage || [])
      setStats(j.stats || null)
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

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat icon={<Users className="h-4 w-4" />} label="Leads (funil)" value={stats.totalLeads} />
          <Stat icon={<Send className="h-4 w-4" />} label="DMs enviadas" value={stats.dmsSent} accent="text-emerald-600" />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Fallback público" value={stats.publicFb} accent="text-amber-600" />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Fora da janela 7d" value={stats.windowExp} accent="text-neutral-500" />
          <Stat icon={<Heart className="h-4 w-4" />} label="Respostas apreço" value={stats.repliesOk} accent="text-rose-600" />
        </div>
      )}

      {/* By intent */}
      {stats && Object.keys(stats.byIntent || {}).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-neutral-500">Por intenção:</span>
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
      </div>

      <div className="overflow-x-auto rounded-lg border">
        {tab === "leads" ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
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
                  <td className="whitespace-nowrap p-2 text-neutral-500">{fmt(l.created_at)}</td>
                  <td className="whitespace-nowrap p-2">@{l.ig_username}</td>
                  <td className="whitespace-nowrap p-2 font-medium">{l.commenter ? `@${l.commenter}` : "—"}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={INTENT_STYLE[l.intent || ""] || "bg-neutral-100 text-neutral-700"}>{l.intent}</Badge>
                    <span className="ml-1 text-xs text-neutral-500">{l.keyword}</span>
                  </td>
                  <td className="max-w-[280px] p-2 text-neutral-700">{l.comment_text}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={DM_STYLE[l.dm_status] || "bg-neutral-100"}>{l.dm_status}</Badge>
                  </td>
                </tr>
              ))}
              {!leads.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-neutral-400">
                    Ainda sem leads. O funil capta quando alguém comenta uma palavra-chave (MUNDO, EU VOU, PREMIUM, SINAIS…).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
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
                  <td className="whitespace-nowrap p-2 text-neutral-500">{fmt(e.replied_at)}</td>
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
                  <td colSpan={5} className="p-6 text-center text-neutral-400">
                    Ainda sem respostas de engagement registadas.
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
      <div className="flex items-center gap-1 text-xs text-neutral-500">
        {icon} {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent || ""}`}>{value}</div>
    </div>
  )
}
