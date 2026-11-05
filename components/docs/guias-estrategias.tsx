"use client"

/**
 * Guias das estratégias na Biblioteca (/docs): os PDFs PT e EN de cada estratégia dos
 * scanners, lidos de ESTRATEGIAS_MTM (a mesma lista que alimenta a sala do educador e as
 * landings). Uma estratégia nova entra aqui sozinha quando for acrescentada à lista.
 */

import { Download } from "lucide-react"
import { ESTRATEGIAS_MTM, capaEstrategia } from "@/lib/estrategias-mtm"

export default function GuiasEstrategias({ pesquisa = "" }: { pesquisa?: string }) {
  const termo = pesquisa.trim().toLowerCase()
  const lista = termo
    ? ESTRATEGIAS_MTM.filter(
        (e) =>
          e.nome.toLowerCase().includes(termo) ||
          e.resumo.pt.toLowerCase().includes(termo) ||
          "guia estratégia estrategia guide strategy".includes(termo),
      )
    : ESTRATEGIAS_MTM
  if (lista.length === 0) return null

  return (
    <section id="guias-estrategias" className="mb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-[#E9C46A]">Guias das estratégias</h2>
          <p className="text-sm text-gray-400 mt-1">
            O guia de cada estratégia dos scanners MTM, em português e em inglês.
          </p>
        </div>
        <span className="text-xs text-gray-500 shrink-0">{lista.length} guias</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {lista.map((e) => (
          <article
            key={e.slug}
            className="flex flex-col rounded-xl overflow-hidden border border-[#D2A63C]/25 bg-gray-900/70 hover:border-[#D2A63C]/60 transition-colors"
          >
            <a href={e.guia.pt} target="_blank" rel="noopener noreferrer" className="block aspect-[3/4] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capaEstrategia(e.slug, "pt")}
                alt={`Guia ${e.nome}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </a>
            <div className="p-3 flex flex-col gap-2 flex-1">
              <h3 className="text-sm font-bold text-white leading-tight">{e.nome}</h3>
              <p className="text-[11px] text-gray-400 leading-snug line-clamp-3 flex-1">{e.resumo.pt}</p>
              <div className="flex gap-2">
                <a
                  href={e.guia.pt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-[#D2A63C] text-black text-xs font-bold py-1.5 hover:bg-[#E9C46A]"
                >
                  <Download className="h-3 w-3" /> PT
                </a>
                <a
                  href={e.guia.en}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-[#D2A63C]/50 text-[#E9C46A] text-xs font-bold py-1.5 hover:bg-[#D2A63C]/10"
                >
                  <Download className="h-3 w-3" /> EN
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
