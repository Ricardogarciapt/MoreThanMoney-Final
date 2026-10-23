"use client"

/**
 * AS ORDENS AOS AGENTES — escreves a um agente, ele recebe no próximo ciclo e responde aqui.
 *
 * Não é um segundo chat IA: é o fio de ordens de cada agente. A mesma ordem pode chegar pelo chat
 * IA da Gestão (ferramenta `dar_ordem_agente`) e aparece neste fio com a origem «chat».
 */

import { useMemo, useState } from "react"
import { Send } from "lucide-react"
import { Aviso, Botao, BotaoLer, Chip, Painel, Pilula, Vazio, fmtQuando, pedirCentro, useCentro } from "@/components/admin/centro/ui"

type Agente = { id: string; nome: string; pilar: string; estado: string; pausado: boolean }
type Ordem = {
  id: string; agente_id: string; texto: string; origem: string; estado: string; resposta: string | null
  criado_em: string; entregue_em: string | null; respondida_em: string | null
}
type Dados = { ok: boolean; agentes: Agente[]; ordens: Ordem[] }

const TOM: Record<string, "neutro" | "info" | "aviso" | "ok" | "grave"> = {
  pendente: "neutro", entregue: "info", em_curso: "aviso", feita: "ok", recusada: "grave", cancelada: "neutro",
}
const ROTULO: Record<string, string> = {
  pendente: "à espera do ciclo", entregue: "entregue", em_curso: "em curso", feita: "feita", recusada: "recusada", cancelada: "cancelada",
}
const ABERTAS = new Set(["pendente", "entregue", "em_curso"])

export default function AgentesOrdens() {
  const { dados: d, erro, aCarregar, recarregar, lidoEm } = useCentro<Dados>("/api/admin/agentes/ordens", 20_000)
  const [sel, setSel] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState<{ tom: "info" | "grave"; txt: string } | null>(null)

  const agentes = d?.agentes ?? []
  const actual = sel ?? agentes[0]?.id ?? null
  const fio = useMemo(() => (d?.ordens ?? []).filter((o) => o.agente_id === actual).slice().reverse(), [d, actual])
  const abertasPor = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of d?.ordens ?? []) if (ABERTAS.has(o.estado)) m.set(o.agente_id, (m.get(o.agente_id) ?? 0) + 1)
    return m
  }, [d])

  const pedir = async (corpo: Record<string, unknown>) => {
    setOcupado(true)
    const r = await pedirCentro<{ ok: boolean; porque?: string }>("/api/admin/agentes/ordens", { method: "POST", body: corpo })
    setOcupado(false)
    if (!r.success) { setNota({ tom: "grave", txt: r.error ?? "Não foi possível." }); return false }
    setNota({ tom: "info", txt: r.data?.porque ?? "Feito." })
    void recarregar()
    return true
  }

  const enviar = async () => {
    if (!actual || !texto.trim()) return
    if (await pedir({ acao: "dar", agente: actual, texto })) setTexto("")
  }

  const nome = agentes.find((a) => a.id === actual)?.nome ?? ""

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12px] text-zinc-400">
          Escreve uma ordem a um agente. Chega-lhe no próximo ciclo do motor e a resposta aparece aqui. Também podes dar ordens
          no chat IA da Gestão («diz ao Sensei para…»): ficam neste mesmo fio.
        </p>
        <BotaoLer onClick={() => void recarregar()} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>

      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {nota && <Aviso tom={nota.tom}>{nota.txt}</Aviso>}

      {d && (
        <div className="flex flex-wrap gap-1.5">
          {agentes.map((a) => (
            <Chip key={a.id} activo={a.id === actual} onClick={() => setSel(a.id)}>
              {a.nome}{abertasPor.get(a.id) ? ` · ${abertasPor.get(a.id)}` : ""}
            </Chip>
          ))}
        </div>
      )}

      <Painel titulo={nome ? `Ordens a ${nome}` : "Ordens"}>
        {!d ? <Vazio>A ler…</Vazio> : !actual ? <Vazio>Ainda não há agentes.</Vazio> : (
          <div className="space-y-3">
            {fio.length === 0 && <Vazio>Ainda não deste ordens a {nome}.</Vazio>}
            {fio.map((o) => (
              <div key={o.id} className="space-y-1.5">
                <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm border border-[#D2A63C]/25 bg-[#D2A63C]/[0.07] px-3 py-2">
                  <p className="whitespace-pre-wrap text-[12.5px] text-zinc-100">{o.texto}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[10.5px] text-zinc-500">
                    <span>{fmtQuando(o.criado_em)} · {o.origem}</span>
                    <Pilula tom={TOM[o.estado] ?? "neutro"}>{ROTULO[o.estado] ?? o.estado}</Pilula>
                    {ABERTAS.has(o.estado) && (
                      <button type="button" disabled={ocupado} onClick={() => void pedir({ acao: "cancelar", id: o.id })} className="text-zinc-500 underline-offset-2 hover:text-rose-300 hover:underline">cancelar</button>
                    )}
                  </div>
                </div>
                {o.resposta && (
                  <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-white/[0.08] bg-zinc-900/70 px-3 py-2">
                    <p className="whitespace-pre-wrap text-[12.5px] text-zinc-200">{o.resposta}</p>
                    <p className="mt-1 text-[10.5px] text-zinc-500">{nome} · {fmtQuando(o.respondida_em)}</p>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-end gap-2 border-t border-white/[0.06] pt-3">
              <textarea
                value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar() }}
                placeholder={`Ordem para ${nome}… (⌘/Ctrl + Enter envia)`}
                className="min-h-[44px] flex-1 resize-y rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[12.5px] text-white placeholder:text-zinc-600"
              />
              <Botao tom="ouro" onClick={() => void enviar()} disabled={ocupado || !texto.trim()}>
                <Send className="h-3 w-3" /> {ocupado ? "…" : "Enviar"}
              </Botao>
            </div>
          </div>
        )}
      </Painel>
    </div>
  )
}
