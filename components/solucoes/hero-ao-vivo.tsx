"use client"

import { useEffect, useState } from "react"
import { Bell, CalendarCheck, FileText, Receipt, Sparkles } from "lucide-react"
import { SECTORES } from "@/lib/site-solucoes/automacao"

/**
 * O herói do /solucoes: um telemóvel com uma conversa real do agente, que muda de negócio de poucos
 * em poucos segundos, e os avisos do que ficou feito sozinho a aparecer por cima.
 * É um componente a sério (os mesmos textos do simulador), não uma imagem.
 */

const SEQ = ["ginasio", "clinica", "tecnico", "imobiliaria", "loja"]
const AVISOS = [
  { Icone: CalendarCheck, t: "Marcação confirmada", d: "Lembrete agendado para amanhã" },
  { Icone: FileText, t: "Orçamento enviado", d: "PDF gerado a partir do pedido" },
  { Icone: Receipt, t: "Fatura paga", d: "Arrumada na pasta do mês" },
]

export function HeroAoVivo() {
  const [i, setI] = useState(0)
  const [passo, setPasso] = useState(3)

  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduz) return
    // 0: vazio · 1: pergunta · 2: a escrever · 3: resposta (e fica 3 s)
    setPasso(0)
    const ts = [
      setTimeout(() => setPasso(1), 300),
      setTimeout(() => setPasso(2), 1200),
      setTimeout(() => setPasso(3), 2300),
      setTimeout(() => setI((x) => (x + 1) % SEQ.length), 6000),
    ]
    return () => ts.forEach(clearTimeout)
  }, [i])

  const s = SECTORES.find((x) => x.id === SEQ[i]) ?? SECTORES[0]
  const aviso = AVISOS[i % AVISOS.length]

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(210,166,60,0.22),transparent)]"
      />
      {/* Telemóvel */}
      <div className="rounded-[2.6rem] border border-white/15 bg-[#0B0D12] p-2.5 shadow-[0_40px_100px_-30px_rgba(210,166,60,0.45)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#0F1218]">
          <div className="flex items-center gap-3 border-b border-white/5 px-4 pb-3 pt-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D2A63C] text-[#08090C]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.nome}</p>
              <p className="text-[11px] text-emerald-300/90">Agente de IA activo</p>
            </div>
          </div>
          <div className="flex h-[300px] flex-col justify-end gap-3 px-4 py-4" aria-live="polite">
            {passo >= 1 && (
              <div className="ml-auto max-w-[82%] animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-right text-[10px] text-zinc-500">{s.ecra.cliente}</p>
                <p className="mt-0.5 rounded-2xl rounded-tr-sm bg-white/[0.08] px-3.5 py-2.5 text-[13px] leading-snug">{s.ecra.pergunta}</p>
              </div>
            )}
            {passo === 2 && (
              <div className="flex w-16 gap-1 rounded-2xl rounded-tl-sm bg-[#D2A63C]/15 px-3.5 py-3">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#E9C46A]" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </div>
            )}
            {passo >= 3 && (
              <p className="max-w-[88%] animate-in fade-in slide-in-from-bottom-2 rounded-2xl rounded-tl-sm bg-[#D2A63C]/15 px-3.5 py-2.5 text-[13px] leading-snug duration-300">
                {s.ecra.resposta}
              </p>
            )}
          </div>
          <div className="mx-4 mb-5 rounded-full border border-white/10 px-4 py-2.5 text-xs text-zinc-600">Escreve uma mensagem</div>
        </div>
      </div>

      {/* Aviso do que ficou feito sozinho */}
      {passo >= 3 && (
        <div
          key={i}
          className="absolute -left-6 top-28 hidden w-60 animate-in fade-in slide-in-from-left-4 rounded-2xl border border-white/10 bg-[#12151C]/95 p-3.5 shadow-2xl backdrop-blur duration-500 sm:block md:-left-24"
        >
          <div className="flex items-start gap-3">
            <aviso.Icone className="mt-0.5 h-4 w-4 shrink-0 text-[#E9C46A]" />
            <div>
              <p className="text-sm font-semibold">{aviso.t}</p>
              <p className="text-xs text-zinc-400">{aviso.d}</p>
            </div>
          </div>
        </div>
      )}
      <div className="absolute -right-4 bottom-16 hidden items-center gap-2 rounded-full border border-white/10 bg-[#12151C]/95 px-3.5 py-2 text-xs shadow-xl sm:flex md:-right-14">
        <Bell className="h-3.5 w-3.5 text-[#E9C46A]" /> Só te chama quando precisa de ti
      </div>
    </div>
  )
}
