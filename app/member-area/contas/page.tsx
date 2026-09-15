"use client"

import Link from "next/link"
import { ArrowLeft, Wallet } from "lucide-react"
import LigadorContas from "@/components/contas/ligador-contas"

/**
 * Área de membro › As minhas contas.
 *
 * Com o fim do MTM Copy, é aqui que quem está no site liga e gere as contas de trading
 * (MT5, MT4, TradeLocker, MTM Funded). O mesmo componente do separador T2T › Conta da app —
 * a lista e a quota vêm de /api/contas. Protegida pelo middleware como o resto de /member-area
 * (membros registados; sem sessão → /login).
 */
export default function ContasPage() {
  return (
    <main className="mtmauto min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/member-area" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Área de membro
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Wallet className="h-6 w-6 text-[#D2A63C]" /> As minhas contas
        </h1>
        <p className="mb-6 mt-1 text-[13px] text-zinc-400">
          Liga as tuas contas de trading uma vez e usa-as no Tap to Trade e no MTM Auto. As passwords
          não ficam guardadas no site.
        </p>
        <LigadorContas />
      </div>
    </main>
  )
}
