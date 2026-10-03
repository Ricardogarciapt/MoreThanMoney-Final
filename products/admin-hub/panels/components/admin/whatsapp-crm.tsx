"use client"

/**
 * O CRM DE WHATSAPP — a lista de trabalho do dia.
 *
 * Uma linha por pessoa, pela ordem em que vale a pena trabalhá-las: primeiro quem está à espera com
 * a janela a fechar, depois quem está à espera, depois quem tem janela aberta. Essa ordem NÃO é
 * calculada aqui — vem já resolvida de `/api/admin/whatsapp/crm`, que a tira de
 * `lib/whatsapp/crm.ts`. Duas cópias da regra das 24 horas discordariam exactamente na conversa que
 * está a fechar, que é a única em que a regra importa.
 *
 * Por isso este ficheiro não sabe o que é uma janela: mostra o que o servidor diz, incluindo o
 * MOTIVO por escrito quando a caixa de texto está fechada. Um botão desligado sem explicação ensina
 * quem o usa a desconfiar da ferramenta — e uma ferramenta de vendas em que não se confia deixa de
 * ser aberta ao fim de dois dias.
 */

import { useCallback, useEffect, useState } from "react"
import { Clock, Loader2, MessageSquare, RefreshCw, Send, User } from "lucide-react"

type Janela = { aberta: boolean; restaMs: number; texto: string; aFechar: boolean }
type Pode = { textoLivre: boolean; template: boolean; porque: string }
type Conversa = {
  id: string; telefone: string; nome: string | null; estado: string; rotulo: string
  negocio_id: string | null; user_id: string | null; responsavel: string | null
  ultima_entrada: string | null; ultima_saida: string | null; por_responder: number
  notas: string | null; etiquetas: string[]
  janela: Janela; pode: Pode
}
type Mensagem = {
  direcao: string; texto: string | null; template: string | null
  estado: string; motivo: string | null; criado_em: string
}

const ESTADOS: Array<{ v: string; r: string }> = [
  { v: "novo", r: "Novo" },
  { v: "a_falar", r: "A falar" },
  { v: "a_aguardar", r: "À espera dela" },
  { v: "ganho", r: "Ganho" },
  { v: "perdido", r: "Perdido" },
  { v: "silenciado", r: "Silenciado" },
]

const CAMPO =
  "rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[12.5px] text-white outline-none focus:border-[#D2A63C]/60"

function horas(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function WhatsappCrm() {
  const [resumo, setResumo] = useState<{ total: number; porResponder: number; aFechar: number; novas: number } | null>(null)
  const [lista, setLista] = useState<Conversa[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch("/api/admin/whatsapp/crm").then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setErro(r?.erro ?? "Não foi possível ler as conversas."); return }
    setResumo(r.resumo); setLista(r.conversas ?? [])
  }, [])

  useEffect(() => { void ler() }, [ler])

  const abrir = async (telefone: string) => {
    if (aberta === telefone) { setAberta(null); return }
    setAberta(telefone); setHistorico([]); setTexto("")
    const r = await fetch(`/api/admin/whatsapp/crm?telefone=${encodeURIComponent(telefone)}`)
      .then((x) => x.json()).catch(() => null)
    setHistorico(r?.historico ?? [])
  }

  const mudar = async (telefone: string, corpo: Record<string, unknown>) => {
    setOcupado(telefone); setErro(null); setNota(null)
    const r = await fetch("/api/admin/whatsapp/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefone, ...corpo }),
    }).then((x) => x.json()).catch(() => null)
    setOcupado(null)
    // A recusa de uma transição não é um erro do sistema: é o clique errado a ser apanhado, e o
    // servidor manda a frase já escrita em português.
    if (!r?.ok) { setErro(r?.porque ?? r?.erro ?? "Não gravou."); return }
    await ler()
  }

  /**
   * Responder passa pelo `POST /api/admin/whatsapp` — o mesmo caminho do resto da casa. Não há aqui
   * um segundo envio: é sempre a primeira porta que trava o que não devia sair, e a segunda porta
   * que o deixa passar.
   */
  const responder = async (c: Conversa) => {
    const corpo = texto.trim()
    if (!corpo) return
    setOcupado(c.telefone); setErro(null); setNota(null)
    const r = await fetch("/api/admin/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para: c.telefone, texto: corpo, finalidade: "resposta" }),
    }).then((x) => x.json()).catch(() => null)
    setOcupado(null)
    if (!r?.ok) { setErro(r?.porque ?? "A mensagem não saiu."); return }
    setNota("Enviada.")
    setTexto("")
    await abrir(c.telefone === aberta ? c.telefone : c.telefone)
    await ler()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <MessageSquare className="h-4 w-4 text-[#D2A63C]" /> Conversas de WhatsApp
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Por ordem de urgência: quem espera e está a fechar a janela vem primeiro.
          </p>
        </div>
        <button
          onClick={() => void ler()}
          className="flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-zinc-300 hover:border-[#D2A63C]/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { r: "Conversas", v: resumo.total },
            { r: "Por responder", v: resumo.porResponder },
            { r: "A fechar a janela", v: resumo.aFechar },
            { r: "Novas", v: resumo.novas },
          ].map((k) => (
            <div key={k.r} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{k.r}</div>
              <div className="text-[19px] font-semibold tabular-nums text-white">{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">{erro}</div>}
      {nota && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">{nota}</div>}

      {lista.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-6 text-center text-[12.5px] text-zinc-400">
          Ainda não entrou nenhuma mensagem. A primeira conversa nasce quando alguém escrever ao número.
        </div>
      )}

      <div className="space-y-2">
        {lista.map((c) => {
          const espera = Number(c.por_responder ?? 0) > 0
          return (
            <div
              key={c.id}
              className={`rounded-lg border bg-black/30 ${
                espera && c.janela.aFechar ? "border-amber-500/40" : espera ? "border-[#D2A63C]/30" : "border-white/10"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button onClick={() => void abrir(c.telefone)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate text-[13px] text-white">{c.nome || c.telefone}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-zinc-500">{c.telefone}</span>
                </button>

                {espera && (
                  <span className="rounded border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-1.5 py-0.5 text-[11px] tabular-nums text-[#D2A63C]">
                    {c.por_responder} por responder
                  </span>
                )}

                <span
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                    c.janela.aFechar
                      ? "border-amber-500/40 text-amber-300"
                      : c.janela.aberta
                        ? "border-emerald-500/30 text-emerald-300"
                        : "border-white/12 text-zinc-500"
                  }`}
                  title={c.pode.porque}
                >
                  <Clock className="h-3 w-3" /> {c.janela.texto}
                </span>

                <select
                  value={c.estado}
                  onChange={(e) => void mudar(c.telefone, { estado: e.target.value })}
                  disabled={ocupado === c.telefone}
                  className={CAMPO}
                >
                  {ESTADOS.map((e) => <option key={e.v} value={e.v}>{e.r}</option>)}
                </select>

                <span className="w-[86px] shrink-0 text-right text-[11px] text-zinc-500">{horas(c.ultima_entrada)}</span>
              </div>

              {aberta === c.telefone && (
                <div className="border-t border-white/10 px-3 py-3">
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {historico.length === 0 && <div className="text-[12px] text-zinc-500">Sem mensagens registadas.</div>}
                    {historico.map((m, i) => (
                      <div key={i} className={`flex ${m.direcao === "saida" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-[12.5px] ${
                            m.direcao === "saida"
                              ? "bg-[#D2A63C]/12 text-amber-100"
                              : "bg-white/6 text-zinc-200"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">{m.texto || m.template || "—"}</div>
                          <div className="mt-0.5 text-[10.5px] text-zinc-500">
                            {horas(m.criado_em)}
                            {m.estado !== "enviada" && m.estado !== "recebida" ? ` · ${m.estado}` : ""}
                            {m.motivo ? ` · ${m.motivo}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 space-y-2">
                    {/* O motivo vem do servidor e aparece SEMPRE, aberta ou fechada a janela. */}
                    <p className={`text-[11.5px] ${c.pode.textoLivre ? "text-zinc-400" : "text-amber-300"}`}>{c.pode.porque}</p>
                    <div className="flex items-start gap-2">
                      <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        disabled={!c.pode.textoLivre || ocupado === c.telefone}
                        rows={2}
                        placeholder={c.pode.textoLivre ? "Escreve a resposta…" : "Fora da janela — só passa um template aprovado."}
                        className={`${CAMPO} flex-1 resize-y disabled:opacity-50`}
                      />
                      <button
                        onClick={() => void responder(c)}
                        disabled={!c.pode.textoLivre || !texto.trim() || ocupado === c.telefone}
                        className="flex items-center gap-1.5 rounded-md border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2.5 py-2 text-[12px] text-[#D2A63C] disabled:opacity-40"
                      >
                        {ocupado === c.telefone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Enviar
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        defaultValue={c.nome ?? ""}
                        onBlur={(e) => { if (e.target.value !== (c.nome ?? "")) void mudar(c.telefone, { nome: e.target.value || null }) }}
                        placeholder="Nome"
                        className={`${CAMPO} w-40`}
                      />
                      <input
                        defaultValue={c.notas ?? ""}
                        onBlur={(e) => { if (e.target.value !== (c.notas ?? "")) void mudar(c.telefone, { notas: e.target.value || null }) }}
                        placeholder="Notas internas"
                        className={`${CAMPO} flex-1 min-w-[180px]`}
                      />
                      {c.negocio_id && (
                        <a
                          href={`/backoffice?negocio=${c.negocio_id}`}
                          className="rounded-md border border-white/12 px-2 py-1 text-[11.5px] text-zinc-300 hover:border-[#D2A63C]/50"
                        >
                          Ver negócio
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
