"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Download } from "lucide-react"
import { Aviso, BotaoRecarregar, Etiqueta, Tabela, ms, quando, td, th, useDadosAdmin } from "./comum"

interface Evento {
  sistema: "copia_contas" | "funded_copier"; id: string; rotaId: string | null; userId: string | null; origemPosicao: string; tipo: string
  simbolo: string | null; direcao: string | null; volumeOrigem: number | null; resultado: string; acaoPretendida: unknown; acaoReal: unknown
  latenciaMs: number | null; erro: string | null; tentativas: number; criadoEm: string; processadoEm: string | null
}

export default function EventosCopia({ sinais }: { sinais?: ReactNode }) {
  const [f, setF] = useState({ sistema: "todos", tipo: "", resultado: "", desde: "", ate: "", rotaId: "", userId: "" })
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v && v !== "todos") p.set(k, k === "desde" || k === "ate" ? new Date(v).toISOString() : v)
    p.set("limite", "300")
    return p.toString()
  }, [f])
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<{ eventos: Evento[]; avisos: string[] }>(`/api/admin/mtmauto-copia/eventos?${qs}`)
  const [vista, setVista] = useState<"copia" | "sinais">("copia")
  const campo = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 w-fit">
        <button type="button" onClick={() => setVista("copia")} className={`rounded-md px-3 py-1 text-xs ${vista === "copia" ? "bg-[#D2A63C]/15 text-[#D2A63C]" : "text-zinc-400"}`}>Cópia (origem → destino)</button>
        <button type="button" onClick={() => setVista("sinais")} className={`rounded-md px-3 py-1 text-xs ${vista === "sinais" ? "bg-[#D2A63C]/15 text-[#D2A63C]" : "text-zinc-400"}`}>Sinais dos providers</button>
      </div>

      {vista === "sinais" ? sinais : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <select className={campo} value={f.sistema} onChange={(e) => setF({ ...f, sistema: e.target.value })}><option value="todos">Todos os sistemas</option><option value="copia_contas">Cópia entre contas</option><option value="funded_copier">Copiador MTM Funded 068</option></select>
            <select className={campo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">Todos os factos</option><option value="open">abriu</option><option value="modify">modificou</option><option value="partial">parcial</option><option value="close">fechou</option></select>
            <select className={campo} value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })}><option value="">Todos os resultados</option>{["sombra", "ok", "recusado", "erro", "saltado", "pendente"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <label className="text-[11px] text-zinc-500">desde <input type="datetime-local" className={campo} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
            <label className="text-[11px] text-zinc-500">até <input type="datetime-local" className={campo} value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></label>
            <input className={`${campo} w-40`} placeholder="id da rota" value={f.rotaId} onChange={(e) => setF({ ...f, rotaId: e.target.value.trim() })} />
            <input className={`${campo} w-40`} placeholder="id do utilizador" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value.trim() })} />
            <a href={`/api/admin/mtmauto-copia/eventos/csv?${qs}`} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"><Download className="h-3.5 w-3.5" /> CSV</a>
            <div className="ml-auto"><BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} /></div>
          </div>
          {erro && <Aviso tom="grave">{erro}</Aviso>}
          {dados?.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}
          <Tabela>
            <thead><tr><th className={th}>Quando</th><th className={th}>Sistema</th><th className={th}>Facto na origem</th><th className={th}>Resultado</th><th className={th}>Pretendido</th><th className={th}>Real</th><th className={th}>Latência</th><th className={th}>Tent.</th></tr></thead>
            <tbody>
              {(dados?.eventos ?? []).map((e) => (
                <tr key={`${e.sistema}:${e.id}`}>
                  <td className={td}>{quando(e.criadoEm)}</td>
                  <td className={td}><Etiqueta>{e.sistema === "copia_contas" ? "entre contas" : "funded 068"}</Etiqueta>{e.rotaId && <span className="block text-[10px] text-zinc-600">{e.rotaId.slice(0, 8)}</span>}</td>
                  <td className={td}>{e.tipo} · {e.simbolo ?? "—"} {e.direcao ?? ""} {e.volumeOrigem ?? ""}<span className="block text-[10px] text-zinc-600">pos {e.origemPosicao.slice(0, 12)}</span></td>
                  <td className={td}><Etiqueta tom={e.resultado === "ok" ? "ok" : e.resultado === "sombra" ? "info" : e.resultado === "erro" ? "grave" : e.resultado === "recusado" || e.resultado === "pendente" ? "aviso" : "neutro"}>{e.resultado}</Etiqueta>{e.erro && <span className="block max-w-[220px] text-[11px] text-rose-300">{e.erro}</span>}</td>
                  <td className={td}><code className="block max-w-[280px] text-[11px] text-zinc-400 break-all">{e.acaoPretendida == null ? "—" : typeof e.acaoPretendida === "string" ? e.acaoPretendida : JSON.stringify(e.acaoPretendida)}</code></td>
                  <td className={td}><code className="block max-w-[200px] text-[11px] text-zinc-400 break-all">{e.acaoReal ? JSON.stringify(e.acaoReal) : "—"}</code></td>
                  <td className={td}>{ms(e.latenciaMs)}</td>
                  <td className={td}>{e.tentativas}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </>
      )}
    </div>
  )
}
