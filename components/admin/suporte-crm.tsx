"use client"

/**
 * A RONDA DE SUPORTE — o CRM das conversas do balão de apoio.
 *
 * Uma lista pela ordem de trabalho (escaladas ao Ricardo, depois à espera da equipa com prazo,
 * depois o que o agente está a tratar sozinho) e, ao lado, a conversa com caixa de resposta.
 * A ordem e as contagens vêm do servidor (/api/admin/suporte); este ecrã só mostra.
 *
 * Fechar uma conversa não reembolsa nada: os reembolsos são sempre do Ricardo, fora daqui.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Send, User } from "lucide-react"
import { NOME_ASSUNTO, NOME_ESTADO, type Assunto, type Estado } from "@/lib/suporte/regras"

type Linha = {
  id: string; nome: string | null; email: string | null; user_id: string | null
  assunto: Assunto; estado: Estado; escalada: boolean; prazo_em: string | null; nivel_aviso: number
  ultima_mensagem_em: string; ultima_resposta_equipa_em: string | null; site: string | null; pagina_origem: string | null; criado_em: string
}
type Msg = { id: number; autor: string; texto: string; criado_em: string }
type Detalhe = { conversa: Linha & { notas: string | null }; perfil: { full_name?: string; email?: string; user_type?: string; subscription_plan?: string } | null; mensagens: Msg[] }

const COR_ESTADO: Record<Estado, string> = {
  escalada: "border-red-500/40 bg-red-500/10 text-red-300",
  a_aguardar_equipa: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  com_agente: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  resolvida: "border-zinc-600 bg-zinc-800/60 text-zinc-400",
}

function quando(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
}

export default function SuporteCrm() {
  const [lista, setLista] = useState<Linha[]>([])
  const [contagens, setContagens] = useState<Record<string, number>>({})
  const [atrasadas, setAtrasadas] = useState(0)
  const [filtro, setFiltro] = useState<string>("abertas")
  const [sel, setSel] = useState<string | null>(null)
  const [det, setDet] = useState<Detalhe | null>(null)
  const [resposta, setResposta] = useState("")
  const [aCarregar, setACarregar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const q = filtro === "abertas" ? "" : `?estado=${filtro}`
      const r = await fetch(`/api/admin/suporte${q}`)
      const j = await r.json()
      if (!r.ok) { setAviso(j?.error || j?.message || "Sem acesso."); return }
      setLista(j.conversas ?? []); setContagens(j.contagens ?? {}); setAtrasadas(j.atrasadas ?? 0); setAviso(null)
    } catch { setAviso("Não consegui falar com o servidor.") }
    finally { setACarregar(false) }
  }, [filtro])

  const abrir = useCallback(async (id: string) => {
    setSel(id)
    const r = await fetch(`/api/admin/suporte?id=${id}`)
    if (r.ok) setDet(await r.json())
  }, [])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c")
    if (c) void abrir(c)
  }, [abrir])
  // A ronda refresca sozinha de minuto a minuto enquanto o ecrã está aberto.
  useEffect(() => { const t = setInterval(() => void carregar(), 60_000); return () => clearInterval(t) }, [carregar])

  async function responder(fechar: boolean) {
    if (!sel || !resposta.trim()) return
    setACarregar(true)
    const r = await fetch("/api/admin/suporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversaId: sel, texto: resposta, fechar }) })
    setACarregar(false)
    if (!r.ok) { setAviso("A resposta não foi gravada."); return }
    setResposta(""); await abrir(sel); await carregar()
  }

  async function mudarEstado(estado: Estado) {
    if (!sel) return
    await fetch("/api/admin/suporte", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversaId: sel, estado }) })
    await abrir(sel); await carregar()
  }

  const FILTROS: Array<{ v: string; r: string }> = [
    { v: "abertas", r: "Em aberto" },
    { v: "escalada", r: `Escaladas (${contagens.escalada ?? 0})` },
    { v: "a_aguardar_equipa", r: `À espera (${contagens.a_aguardar_equipa ?? 0})` },
    { v: "com_agente", r: `Com o agente (${contagens.com_agente ?? 0})` },
    { v: "resolvida", r: "Resolvidas" },
  ]

  return (
    <div className="space-y-4 p-4 text-zinc-100">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao rotulo="Escaladas ao Ricardo" valor={contagens.escalada ?? 0} icone={<AlertTriangle className="h-4 w-4 text-red-300" />} />
        <Cartao rotulo="À espera da equipa" valor={contagens.a_aguardar_equipa ?? 0} icone={<Clock className="h-4 w-4 text-amber-200" />} />
        <Cartao rotulo="Fora de prazo" valor={atrasadas} icone={<Clock className="h-4 w-4 text-red-300" />} />
        <Cartao rotulo="Com o agente" valor={contagens.com_agente ?? 0} icone={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button key={f.v} type="button" onClick={() => setFiltro(f.v)}
            className={`rounded-full border px-3 py-1.5 text-xs ${filtro === f.v ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-zinc-400 hover:text-zinc-200"}`}>
            {f.r}
          </button>
        ))}
        <button type="button" onClick={() => void carregar()} className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200" aria-label="Atualizar">
          {aCarregar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
        </button>
      </div>
      {aviso && <p className="text-sm text-red-300">{aviso}</p>}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {lista.length === 0 && <li className="rounded-lg border border-white/10 p-4 text-sm text-zinc-400">Nada nesta ronda.</li>}
          {lista.map((c) => {
            const atrasada = c.prazo_em && new Date(c.prazo_em).getTime() < Date.now()
            return (
              <li key={c.id}>
                <button type="button" onClick={() => void abrir(c.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${sel === c.id ? "border-[#D2A63C] bg-[#D2A63C]/10" : "border-white/10 hover:border-white/20"}`}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.nome || c.email || "Visitante"}</span>
                    {c.user_id && <span className="rounded bg-[#D2A63C]/15 px-1.5 text-[10px] text-[#E9C46A]">membro</span>}
                    <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{quando(c.ultima_mensagem_em)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 ${COR_ESTADO[c.estado]}`}>{NOME_ESTADO[c.estado]}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-300">{NOME_ASSUNTO[c.assunto]}</span>
                    {atrasada && <span className="rounded-full border border-red-500/40 px-2 py-0.5 text-red-300">fora de prazo</span>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="min-h-[50vh] rounded-xl border border-white/10 p-4">
          {!det ? (
            <p className="text-sm text-zinc-400">Escolhe uma conversa.</p>
          ) : (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-start gap-3 border-b border-white/10 pb-3">
                <User className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{det.perfil?.full_name || det.conversa.nome || "Visitante"}</p>
                  <p className="text-xs text-zinc-400">
                    {det.conversa.email || det.perfil?.email || "sem email"}
                    {det.perfil?.subscription_plan ? ` · ${det.perfil.subscription_plan}` : ""}
                    {det.conversa.pagina_origem ? ` · ${det.conversa.pagina_origem}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 text-xs">
                  {det.conversa.estado !== "com_agente" && <button type="button" onClick={() => void mudarEstado("com_agente")} className="rounded border border-white/10 px-2 py-1 hover:border-white/30">Devolver ao agente</button>}
                  {det.conversa.estado !== "resolvida" && <button type="button" onClick={() => void mudarEstado("resolvida")} className="rounded border border-white/10 px-2 py-1 hover:border-white/30">Marcar resolvida</button>}
                </div>
              </div>
              {(det.conversa.assunto === "reembolso" || det.conversa.assunto === "reclamacao") && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {NOME_ASSUNTO[det.conversa.assunto]}: decisão do Ricardo. Não prometas valores nem devoluções nesta caixa.
                </p>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {det.mensagens.map((m) => (
                  <div key={m.id} className={`flex ${m.autor === "cliente" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${m.autor === "cliente" ? "bg-white/[0.06]" : m.autor === "equipa" ? "bg-[#D2A63C]/20" : "bg-zinc-800"}`}>
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">{m.autor} · {quando(m.criado_em)}</span>
                      {m.texto}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-white/10 pt-3">
                <label htmlFor="suporte-resposta" className="text-xs text-zinc-400">Responder como equipa (aparece no balão do cliente)</label>
                <textarea id="suporte-resposta" value={resposta} onChange={(e) => setResposta(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[#D2A63C]" />
                <div className="flex gap-2">
                  <button type="button" disabled={aCarregar || !resposta.trim()} onClick={() => void responder(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-2 text-sm font-medium text-black disabled:opacity-40">
                    <Send className="h-4 w-4" /> Enviar
                  </button>
                  <button type="button" disabled={aCarregar || !resposta.trim()} onClick={() => void responder(true)}
                    className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40">
                    Enviar e fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cartao({ rotulo, valor, icone }: { rotulo: string; valor: number; icone: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">{icone}{rotulo}</div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
    </div>
  )
}
