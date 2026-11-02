"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { ehErroDeChunk, recarregarUmaVez } from "@/lib/chunks/recuperar"

/**
 * Error boundary de raiz. Um ficheiro do build que não carregou (ChunkLoadError) recarrega a
 * página sozinho uma vez; o resto mostra o ecrã de erro com botão. Ver lib/chunks/recuperar.ts.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const deChunk = ehErroDeChunk(error)
  const [aRecarregar, setARecarregar] = useState(deChunk)

  useEffect(() => {
    console.error("[app] erro:", error?.message)
    if (deChunk && !recarregarUmaVez()) setARecarregar(false)
  }, [error, deChunk])

  const recarregar = () => {
    if (deChunk) { try { window.location.replace(window.location.href); return } catch {} }
    reset()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="max-w-sm text-center">
        <h2 className="mb-3 text-xl font-bold">{aRecarregar ? "A actualizar a página…" : "Algo correu mal ao carregar"}</h2>
        <p className="mb-8 text-sm leading-relaxed text-gray-400">
          {deChunk
            ? "O site foi actualizado enquanto esta página estava aberta. Recarrega para apanhar a versão nova."
            : "Ocorreu um erro inesperado. Clica em recarregar para tentar novamente."}
        </p>
        <button
          onClick={recarregar}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D2A63C] px-6 py-3 font-bold text-black transition-colors hover:bg-[#BB8525]"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </button>
      </div>
    </div>
  )
}
