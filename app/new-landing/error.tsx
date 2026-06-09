'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function NewLandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log silencioso — não mostrar no UI
    console.error('[new-landing] error:', error?.message)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white px-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-6">⚠️</div>
        <h2 className="text-xl font-bold mb-3">Algo correu mal ao carregar</h2>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          Ocorreu um erro inesperado. Clica em recarregar para tentar novamente.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold px-6 py-3 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recarregar
        </button>
      </div>
    </div>
  )
}
