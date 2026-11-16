"use client"

import SuporteCrm from "@/components/admin/suporte-crm"

/** A ronda de suporte (balão de apoio do site). O portão é o da API: admin ou «Clientes & CRM». */
export default function PaginaSuporte() {
  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-6xl px-2 py-6">
        <h1 className="px-4 text-xl font-semibold text-[#E9C46A]">Ronda de suporte</h1>
        <p className="px-4 text-sm text-zinc-400">As conversas do balão de apoio. Reclamações e reembolsos são sempre do Ricardo.</p>
        <SuporteCrm />
      </div>
    </main>
  )
}
