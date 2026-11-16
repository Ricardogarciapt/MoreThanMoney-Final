"use client"

import { useState } from "react"
import { BarChart3, CalendarCheck, Check, FileText, Handshake, Megaphone, MessageCircle, Package, Receipt, Users } from "lucide-react"
import { AREAS, SECTORES, type AreaId } from "@/lib/site-solucoes/automacao"
import { EcraArea } from "@/components/solucoes/simulador"

/**
 * «O que te tiramos das mãos»: a lista das dores à esquerda e, à direita, a automação desenhada
 * a funcionar num negócio onde essa dor pesa mais.
 */

const ICONES: Record<AreaId, typeof MessageCircle> = {
  atendimento: MessageCircle,
  agenda: CalendarCheck,
  vendas: Handshake,
  financas: Receipt,
  dados: BarChart3,
  marketing: Megaphone,
  operacoes: Package,
  equipa: Users,
  conhecimento: FileText,
}

/** O negócio que serve de exemplo a cada área. */
const EXEMPLO: Record<AreaId, string> = {
  atendimento: "loja",
  agenda: "clinica",
  vendas: "imobiliaria",
  financas: "servicos",
  dados: "servicos",
  marketing: "restaurante",
  operacoes: "tecnico",
  equipa: "restaurante",
  conhecimento: "educador",
}

export function AreasInterativas() {
  const [id, setId] = useState<AreaId>("atendimento")
  const area = AREAS.find((a) => a.id === id) ?? AREAS[0]
  const sector = SECTORES.find((s) => s.id === EXEMPLO[id]) ?? SECTORES[0]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" role="tablist" aria-label="Áreas">
        {AREAS.map((a) => {
          const Icone = ICONES[a.id]
          const ativo = a.id === id
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setId(a.id)}
              className={[
                "group flex shrink-0 items-start gap-3 rounded-2xl border px-4 py-3 text-left transition lg:w-full",
                ativo ? "border-[#D2A63C]/60 bg-[#D2A63C]/10" : "border-white/10 hover:border-white/20",
              ].join(" ")}
            >
              <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${ativo ? "text-[#E9C46A]" : "text-zinc-500"}`} strokeWidth={1.75} />
              <span>
                <span className="block font-semibold">{a.titulo}</span>
                <span className="hidden text-sm text-zinc-400 lg:block">{a.dor}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div key={id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <p className="text-sm italic text-zinc-400 lg:hidden">«{area.dor}»</p>
          <h3 className="mt-2 text-2xl font-bold lg:mt-0">{area.implementamos}</h3>
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0E1015]">
            <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-3 truncate text-xs text-zinc-500">Exemplo: {sector.nome}</span>
            </div>
            <div className="min-h-[280px] p-5">
              <EcraArea area={id} sector={sector} />
            </div>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-3">
            {area.exemplos.map((x) => (
              <li key={x} className="flex gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {x}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-zinc-500">
            Resolve-se com: <span className="font-semibold text-[#E9C46A]">{area.oferta}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
