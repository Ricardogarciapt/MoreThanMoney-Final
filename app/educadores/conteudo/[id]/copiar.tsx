'use client'
import { useState } from 'react'

export function Copiar({ texto, rotulo = 'Copier' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1600)
        })
      }}
      className="rounded-lg border border-[#D2A63C]/60 px-3 py-1.5 text-xs font-semibold text-[#E9C46A] hover:bg-[#D2A63C]/10"
    >
      {ok ? 'Copié ✓' : rotulo}
    </button>
  )
}
