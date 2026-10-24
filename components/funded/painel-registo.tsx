"use client"

import { CheckCircle2, XCircle } from "lucide-react"
import { useUmClique } from "./um-clique"

/** O separador «Registo»: as acções desta conta nesta página, da mais recente para a mais antiga. */
export default function PainelRegisto() {
  const { registo } = useUmClique()
  if (!registo.length) {
    return <p className="p-3 text-[12px] text-zinc-500">Ainda não enviaste nada nesta página. Cada ordem, fecho ou mudança de SL/TP aparece aqui com o resultado da corretora.</p>
  }
  return (
    <ul className="divide-y divide-white/5 text-[12px]">
      {registo.map((e) => (
        <li key={e.id} className="flex items-start gap-2 px-3 py-1.5">
          {e.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="feito" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="erro" />}
          <span className="shrink-0 font-mono text-zinc-500">{new Date(e.em).toLocaleTimeString("pt-PT")}</span>
          <span className="min-w-0 flex-1">
            <span className="text-zinc-200">{e.descricao}</span>
            <span className={`block truncate ${e.ok ? "text-zinc-500" : "text-rose-300"}`} title={e.texto}>{e.texto}</span>
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-zinc-600">{e.ms} ms</span>
        </li>
      ))}
    </ul>
  )
}
