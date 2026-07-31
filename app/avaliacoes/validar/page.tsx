"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ShieldCheck, Search } from "lucide-react"

export default function ValidarPage() {
  const router = useRouter()
  const [code, setCode] = useState("")

  function go(e: React.FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c) router.push(`/avaliacoes/validar/${encodeURIComponent(c)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-16 text-white">
      <div className="w-full max-w-md text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#D2A63C]" />
        <h1 className="mt-4 text-2xl font-bold">Validar certificado</h1>
        <p className="mt-2 text-sm text-gray-400">
          Introduz o código de validação (ex.: <span className="font-mono">MTM-FS-ABCD2345</span>) que consta no rodapé
          do certificado.
        </p>
        <form onSubmit={go} className="mt-6 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="MTM-XX-XXXXXXXX"
            className="flex-1 rounded-lg border border-gray-700 bg-black/40 px-4 py-3 text-center font-mono uppercase tracking-wider text-white placeholder-gray-600 focus:border-[#D2A63C] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-5 font-semibold text-black"
          >
            <Search className="h-4 w-4" /> Validar
          </button>
        </form>
        <Link href="/avaliacoes" className="mt-8 inline-block text-sm text-gray-400 hover:text-white">
          ← Voltar às avaliações
        </Link>
      </div>
    </main>
  )
}
