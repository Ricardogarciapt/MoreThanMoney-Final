"use client"

/**
 * Alterna o Studio do educador entre STREAMING EXTERNO (RTMP/OBS — EducatorStudio, fluxo atual
 * intocado) e STREAMING INTERNO (compositor no browser — InternalStudio, F1). Toggle ao lado do
 * título, como pedido. Ver memória `internal-streaming-studio`.
 */

import { useState } from "react"
import EducatorStudio from "@/components/live/educator-studio"
import InternalStudio from "@/components/live/internal-studio"

type Mode = "external" | "internal"

export default function StudioModeSwitch() {
  const [mode, setMode] = useState<Mode>("external")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Modo de transmissão</p>
          <p className="text-xs text-zinc-500">
            {mode === "external"
              ? "Externo — transmites por OBS/RTMP com a tua chave."
              : "Interno — transmites direto do browser (compositor de cenas). WHIP na F2."}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          <button
            onClick={() => setMode("external")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "external" ? "bg-[#D2A63C] text-black" : "text-zinc-300 hover:text-white"
            }`}
          >
            Streaming Externo
          </button>
          <button
            onClick={() => setMode("internal")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "internal" ? "bg-[#D2A63C] text-black" : "text-zinc-300 hover:text-white"
            }`}
          >
            Streaming Interno
          </button>
        </div>
      </div>

      {mode === "external" ? <EducatorStudio /> : <InternalStudio />}
    </div>
  )
}
