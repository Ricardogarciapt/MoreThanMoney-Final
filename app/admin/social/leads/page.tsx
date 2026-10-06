"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, RefreshCw, Loader2, MessageCircle, Send, Users, Heart } from "lucide-react"
import { EnviosPorAprovar } from "@/components/admin/envios-por-aprovar"

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

/** Um rascunho do setter: a mensagem escrita e AINDA NÃO enviada. */
interface Rascunho {
  comment_id: string
  commenter: string | null
  comment_text: string | null
  texto_publico: string | null
  texto_dm: string | null
  /** `false` quando a janela dos 7 dias da Meta já fechou — e aí o rascunho só tem a parte pública. */
  dm_possivel: boolean
  dm_motivo: string | null
  estado: string
  erro: string | null
  criado_em: string
}
interface SetterChaves { redigir: boolean; enviar_publica: boolean; enviar_dm: boolean }
interface SetterStats { rascunhos: number; enviados: number; encerrados: number; semDm: number; pessoas: number }

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
  granted: "bg-emerald-950 text-emerald-300",
  pending: "bg-blue-100 text-blue-800",
  rejected: "bg-red-950 text-red-300",
}

const DM_STYLE: Record<string, string> = {
  sent: "bg-emerald-950 text-emerald-300",
  public_fallback: "bg-amber-950 text-amber-300",
  window_expired: "bg-neutral-200 text-neutral-400",
  error: "bg-red-950 text-red-300",
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
  const [setter, setSetter] = useState<Rascunho[]>([])
  const [setterChaves, setSetterChaves] = useState<SetterChaves | null>(null)
  const [setterStats, setSetterStats] = useState<SetterStats | null>(null)
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
      setSetter(j.setter || [])
      setSetterChaves(j.setterChaves || null)
      setSetterStats(j.setterStats || null)
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

      {/* O que a máquina quer mandar por iniciativa própria espera aqui por uma pessoa (06/10). */}
      <EnviosPorAprovar />

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
                  <div className="w-44 shrink-0 text-[12.5px] text-neutral-200">{d.nome}</div>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-neutral-100">
                    <div
                      className={`h-full ${parede ? "bg-red-400" : "bg-amber-400"}`}
                      style={{ width: `${Math.max(1, (d.n / teto) * 100)}%` }}
                    />
                  </div>
                  <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">{d.n}</div>
                  <div className={`w-20 shrink-0 text-right text-xs ${parede ? "font-semibold text-red-400" : "text-neutral-400"}`}>
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
            <Link href="/admin/social" className="text-xs text-neutral-400 underline">editar</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {automacoes.map((a) => (
              <span
                key={a.nome}
                className={`rounded-full px-2.5 py-1 text-[11.5px] ${
                  a.ativa ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                }`}
                title={a.ultimo_disparo ? `Último: ${fmt(a.ultimo_disparo)}` : "Nunca disparou"}
              >
                {a.ativa ? "" : "⛔ "}{a.nome} · {a.disparos}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── A BANCADA DO SETTER ───────────────────────────────────────────────────────────────
          O que SAIRIA se o interruptor estivesse ligado. Existe porque a Meta dá UMA private
          reply por comentário: uma mensagem mal enviada não tem segunda tentativa, o comentário
          fica queimado. Ler antes de ligar custa minutos; o contrário não se desfaz. */}
      {setterChaves && (
        <div className="mb-6 rounded-xl border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Setter da persona · rascunhos</h2>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["redigir", "redige rascunhos"],
                ["enviar_publica", "envia resposta pública"],
                ["enviar_dm", "envia DM"],
              ] as const).map(([k, rotulo]) => (
                <span
                  key={k}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] ${
                    setterChaves[k] ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {setterChaves[k] ? "" : "⛔ "}{rotulo}
                </span>
              ))}
            </div>
          </div>

          {!setterChaves.redigir ? (
            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-[12px] text-neutral-500">
              Desligado. Liga-se em <code>site_settings</code> → <code>ig_setter_persona</code>,
              um andar de cada vez: primeiro <b>redigir</b> (escreve e não envia, para ler o que
              sairia), só depois os envios.
            </p>
          ) : setter.length === 0 ? (
            <p className="text-[12px] text-neutral-400">
              Ligado, sem rascunhos ainda. O setter só pega nos comentários que o funil por
              palavra-chave não reclamou.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-neutral-400">
                <span><b className="text-neutral-100">{setterStats?.pessoas ?? 0}</b> pessoas</span>
                <span><b className="text-neutral-100">{setterStats?.rascunhos ?? 0}</b> por decidir</span>
                <span><b className="text-neutral-100">{setterStats?.enviados ?? 0}</b> enviados</span>
                <span><b className="text-neutral-100">{setterStats?.encerrados ?? 0}</b> encerrados (disseram não)</span>
                {/* Um rascunho sem DM já não tem a única mensagem que a Meta dava. */}
                {(setterStats?.semDm ?? 0) > 0 && (
                  <span className="text-amber-400"><b>{setterStats?.semDm}</b> já sem DM possível</span>
                )}
              </div>
              <div className="space-y-2">
                {setter.slice(0, 15).map((s) => (
                  <div key={s.comment_id} className="rounded-lg border p-2.5">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px]">
                      <span className="font-semibold text-neutral-100">@{s.commenter ?? "?"}</span>
                      <span className="rounded bg-neutral-100 px-1.5 text-neutral-500">{s.estado}</span>
                      {s.dm_possivel ? (
                        <span className="rounded bg-emerald-950 px-1.5 text-emerald-300">DM possível</span>
                      ) : (
                        <span className="rounded bg-amber-950 px-1.5 text-amber-300">sem DM: {s.dm_motivo ?? "?"}</span>
                      )}
                      <span className="text-neutral-500">{s.criado_em ? fmt(s.criado_em) : ""}</span>
                    </div>
                    <p className="text-[12px] italic text-neutral-400">“{s.comment_text}”</p>
                    {s.texto_publico && (
                      <p className="mt-1.5 text-[12.5px] text-neutral-200">
                        <span className="text-neutral-500">público → </span>{s.texto_publico}
                      </p>
                    )}
                    {s.texto_dm && (
                      <p className="mt-1 whitespace-pre-line text-[12.5px] text-neutral-200">
                        <span className="text-neutral-500">DM → </span>{s.texto_dm}
                      </p>
                    )}
                    {s.erro && <p className="mt-1 text-[11.5px] text-red-400">{s.erro}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* O radar: o que ainda não é lead nenhum, mas pode vir a ser. */}
      {radar.length > 0 && (
        <div className="mb-6 rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Conversas por tratar ({radar.length})</h2>
            <Link href="/admin/social" className="text-xs text-neutral-400 underline">ver todas</Link>
          </div>
          <div className="space-y-1.5">
            {radar.slice(0, 5).map((p) => (
              <a
                key={p.id}
                href={p.permalink ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border p-2 hover:bg-neutral-800"
              >
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="rounded bg-emerald-950 px-1.5 font-bold text-emerald-300">{p.pontuacao}</span>
                  <span className="text-neutral-400">#{p.hashtag} — {p.porque}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-neutral-200">{p.legenda}</p>
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
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Fora da janela 7d" value={stats.windowExp} accent="text-neutral-400" />
          <Stat icon={<Heart className="h-4 w-4" />} label="Respostas apreço" value={stats.repliesOk} accent="text-rose-600" />
          <Stat icon={<Send className="h-4 w-4" />} label="Telegram (grants)" value={stats.tgGranted} accent="text-sky-600" />
        </div>
      )}

      {/* By intent */}
      {stats && Object.keys(stats.byIntent || {}).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-neutral-400">Por intenção:</span>
          {Object.entries(stats.byIntent).map(([k, v]) => (
            <Badge key={k} className={INTENT_STYLE[k] || "bg-neutral-100 text-neutral-200"}>
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
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
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
                  <td className="whitespace-nowrap p-2 text-neutral-400">{fmt(l.created_at)}</td>
                  <td className="whitespace-nowrap p-2">@{l.ig_username}</td>
                  <td className="whitespace-nowrap p-2 font-medium">{l.commenter ? `@${l.commenter}` : "—"}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={INTENT_STYLE[l.intent || ""] || "bg-neutral-100 text-neutral-200"}>{l.intent}</Badge>
                    <span className="ml-1 text-xs text-neutral-400">{l.keyword}</span>
                  </td>
                  <td className="max-w-[280px] p-2 text-neutral-200">{l.comment_text}</td>
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
        ) : tab === "engage" ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
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
                  <td className="whitespace-nowrap p-2 text-neutral-400">{fmt(e.replied_at)}</td>
                  <td className="whitespace-nowrap p-2">@{e.ig_username}</td>
                  <td className="whitespace-nowrap p-2 font-medium">{e.commenter ? `@${e.commenter}` : "—"}</td>
                  <td className="max-w-[380px] p-2 text-neutral-200">{e.reply_text}</td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={e.status === "replied" ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}>{e.status}</Badge>
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
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
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
                  <td className="whitespace-nowrap p-2 text-neutral-400">{fmt(t.updated_at)}</td>
                  <td className="whitespace-nowrap p-2 font-medium">
                    {t.username ? `@${t.username}` : t.first_name || "—"}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    <Badge className={TG_STYLE[t.stage] || "bg-neutral-100 text-neutral-200"}>{t.stage}</Badge>
                  </td>
                  <td className="whitespace-nowrap p-2 text-xs text-neutral-400">{t.coupon_code || "—"}</td>
                  <td className="whitespace-nowrap p-2 text-xs text-neutral-400">{t.chat_id}</td>
                </tr>
              ))}
              {!telegram.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-neutral-400">
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
      <div className="flex items-center gap-1 text-xs text-neutral-400">
        {icon} {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent || ""}`}>{value}</div>
    </div>
  )
}
