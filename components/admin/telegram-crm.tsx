"use client"

/**
 * O CRM DO TELEGRAM — o par do CRM de WhatsApp (23/11/2026).
 *
 * Uma linha por pessoa que falou com o bot em privado, as mais recentes primeiro. Abrir mostra a
 * conversa (o que o closer IA e a equipa disseram) e os links do site que a pessoa abriu. Dá para
 * responder à mão e para empurrar o lead para um passo do funil (abertura com áudio, uma rota, ou a
 * fila dos setters). No Telegram não há janela de 24 h.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Send } from "lucide-react"

type Conversa = {
  chat_id: string; username: string | null; first_name: string | null; stage: string | null; interest: string | null
  lang: string | null; message_count: number | null; updated_at: string | null; broker_uid: string | null; granted_at: string | null
}
type Msg = { role: string; text: string }

const PASSOS: Array<{ v: string; r: string }> = [
  { v: "abrir", r: "Abertura (áudio + menu)" },
  { v: "educacao", r: "Rota: aprender trading" },
  { v: "corretora", r: "Rota: corretora" },
  { v: "funded", r: "Rota: MTM Funded" },
  { v: "solucoes", r: "Rota: IA para empresas" },
  { v: "curioso", r: "Rota: conhecer a MTM" },
  { v: "humano", r: "Passar à fila dos setters" },
]

const ETAPA: Record<string, string> = {
  tg_menu: "No menu", tg_humano: "Quer uma pessoa", tg_agendou: "Marcou", new: "Novo", qualifying: "A qualificar", routed: "Com interesse", granted: "Validado",
}

function quando(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
function etapa(s: string | null): string {
  if (!s) return "—"
  if (s.startsWith("tg_rota_")) return `Rota ${s.slice(8)}`
  return ETAPA[s] ?? s
}

export default function TelegramCrm() {
  const [resumo, setResumo] = useState<{ total: number; hoje: number; querPessoa: number; noFunil: number } | null>(null)
  const [lista, setLista] = useState<Conversa[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [hist, setHist] = useState<Msg[]>([])
  const [cliques, setCliques] = useState<Array<{ chave: string; enviado_em: string }>>([])
  const [texto, setTexto] = useState("")
  const [passo, setPasso] = useState("abrir")
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<"todos" | "funil" | "pessoa">("todos")

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch("/api/admin/telegram/crm").then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setErro(r?.erro ?? "Não foi possível ler as conversas."); return }
    setResumo(r.resumo); setLista(r.conversas ?? [])
  }, [])
  useEffect(() => { void ler() }, [ler])

  const abrir = async (chat: string) => {
    if (aberta === chat) { setAberta(null); return }
    setAberta(chat); setHist([]); setCliques([]); setTexto(""); setNota(null)
    const r = await fetch(`/api/admin/telegram/crm?chat=${encodeURIComponent(chat)}`).then((x) => x.json()).catch(() => null)
    setHist(r?.historico ?? []); setCliques(r?.cliques ?? [])
  }

  const enviar = async (chat: string, corpo: Record<string, unknown>, ok: string) => {
    setOcupado(true); setErro(null); setNota(null)
    const r = await fetch("/api/admin/telegram/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat, ...corpo }) })
      .then((x) => x.json()).catch(() => null)
    setOcupado(false)
    if (!r?.ok) { setErro(r?.porque ?? "Não saiu."); return }
    setNota(ok); setTexto("")
    const h = await fetch(`/api/admin/telegram/crm?chat=${encodeURIComponent(chat)}`).then((x) => x.json()).catch(() => null)
    setHist(h?.historico ?? [])
    await ler()
  }

  const visiveis = lista.filter((c) => filtro === "todos" || (filtro === "pessoa" ? c.stage === "tg_humano" : String(c.stage ?? "").startsWith("tg_")))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          {resumo && (
            <>
              <span className="rounded-md border border-white/10 px-2 py-1 text-zinc-300">{resumo.total} conversas</span>
              <span className="rounded-md border border-white/10 px-2 py-1 text-zinc-300">{resumo.hoje} nas últimas 24 h</span>
              <span className="rounded-md border border-[#D2A63C]/40 px-2 py-1 text-[#E9C46A]">{resumo.noFunil} no funil</span>
              <span className="rounded-md border border-amber-500/40 px-2 py-1 text-amber-300">{resumo.querPessoa} querem uma pessoa</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["todos", "funil", "pessoa"] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`rounded-md border px-2 py-1 text-[12px] ${filtro === f ? "border-[#D2A63C] text-[#E9C46A]" : "border-white/10 text-zinc-400"}`}>
              {f === "todos" ? "Todos" : f === "funil" ? "No funil" : "Querem pessoa"}
            </button>
          ))}
          <button onClick={() => void ler()} className="rounded-md border border-white/10 p-1.5 text-zinc-400 hover:text-white" aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      {erro && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{erro}</p>}
      {nota && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">{nota}</p>}

      <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
        {visiveis.map((c) => (
          <li key={c.chat_id} className="p-3">
            <button onClick={() => void abrir(c.chat_id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
              <span className="text-[13.5px] text-white">
                {c.first_name || "—"} {c.username ? <span className="text-zinc-500">@{c.username}</span> : null}
                <span className="ml-2 text-[11px] uppercase text-zinc-500">{c.lang ?? ""}</span>
              </span>
              <span className="text-[12px] text-zinc-400">
                {etapa(c.stage)}{c.interest ? ` · ${c.interest}` : ""} · {c.message_count ?? 0} msg · {quando(c.updated_at)}
                {c.granted_at ? <span className="text-emerald-400"> · validado</span> : null}
              </span>
            </button>
            {aberta === c.chat_id && (
              <div className="mt-3 space-y-3">
                <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md bg-black/30 p-2">
                  {hist.length === 0 && <p className="text-[12px] text-zinc-500">Sem mensagens guardadas.</p>}
                  {hist.map((m, i) => (
                    <p key={i} className={`text-[12.5px] ${m.role === "user" ? "text-zinc-200" : "text-[#E9C46A]"}`}>
                      <span className="text-zinc-500">{m.role === "user" ? "Lead: " : "MTM: "}</span>{m.text}
                    </p>
                  ))}
                </div>
                {cliques.length > 0 && (
                  <p className="text-[11.5px] text-zinc-400">Abriu no site: {cliques.map((k) => `${k.chave.split(":")[2]} (${quando(k.enviado_em)})`).join(" · ")}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={passo} onChange={(e) => setPasso(e.target.value)} className="rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[12.5px] text-white">
                    {PASSOS.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
                  </select>
                  <button disabled={ocupado} onClick={() => void enviar(c.chat_id, { acao: "funil", passo }, "Passo do funil enviado.")} className="rounded-md border border-[#D2A63C]/50 px-2.5 py-1 text-[12.5px] text-[#E9C46A] disabled:opacity-50">
                    Enviar passo do funil
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escrever pelo bot…" className="min-w-0 flex-1 rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[13px] text-white outline-none focus:border-[#D2A63C]/60" />
                  <button disabled={ocupado || !texto.trim()} onClick={() => void enviar(c.chat_id, { acao: "responder", texto }, "Enviada.")} className="self-end rounded-md bg-[#D2A63C] px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-50" aria-label="Enviar">
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {visiveis.length === 0 && <li className="p-4 text-[13px] text-zinc-500">Nada aqui por agora.</li>}
      </ul>
    </div>
  )
}
