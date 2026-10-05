"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, Lock } from "lucide-react"
import { useDadosAdmin } from "@/components/admin/mtmauto-copia/comum"

/**
 * SÓ LEITURA EM /admin/mtmcopy — decisão do dono (05/10): o Centro é o único sítio onde se decide o
 * que uma estratégia faz. Os painéis que decidiam aqui (controlo, trailing, rotas provider, senders,
 * contas provider, motor das mestres) continuam a MOSTRAR o estado, mas dentro de um
 * `<fieldset disabled>`: o browser desliga todos os botões, caixas e listas lá dentro, sem tocar no
 * código de cada painel (que o Centro continua a usar com os controlos vivos).
 *
 * Por cima, «Abrir no Centro» leva à página da estratégia certa (`?s=estrategias&e=<slug>`).
 */
type Lista = { estrategias: Array<{ slug: string; nome: string }> }

export function LinksParaOCentro() {
  const { dados } = useDadosAdmin<Lista>("/api/admin/centro/estrategia?lista=1")
  const lista = dados?.estrategias ?? []
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href="/admin/centro?s=estrategias" className="inline-flex items-center gap-1 rounded-md bg-[#D2A63C] px-2.5 py-1 text-[11.5px] font-semibold text-black transition-colors hover:bg-[#E9C46A]">
        Abrir no Centro <ArrowUpRight className="h-3 w-3" />
      </Link>
      {lista.map((e) => (
        <Link key={e.slug} href={`/admin/centro?s=estrategias&e=${encodeURIComponent(e.slug)}`} className="rounded-md border border-[#D2A63C]/30 px-2 py-1 text-[11px] text-[#E9C46A] transition-colors hover:border-[#D2A63C] hover:bg-[#D2A63C]/10">
          {e.nome} →
        </Link>
      ))}
    </div>
  )
}

export default function DecideNoCentro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/[0.06] px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-zinc-300">
          <Lock className="h-3.5 w-3.5 text-[#D2A63C]" /> <span><b className="text-zinc-100">{titulo}</b> — só leitura aqui. Decide-se no Centro.</span>
        </p>
        <LinksParaOCentro />
      </div>
      {/* `disabled` num fieldset desliga TODOS os controlos de formulário lá dentro (botões incluídos). */}
      <fieldset disabled aria-label={`${titulo} (só leitura)`} className="min-w-0 opacity-90 [&_button]:cursor-not-allowed">
        {children}
      </fieldset>
    </div>
  )
}
