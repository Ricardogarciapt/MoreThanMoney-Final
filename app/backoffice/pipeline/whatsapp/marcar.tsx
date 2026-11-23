'use client'

import { useState } from 'react'

/** «Marquei enviada»: o negócio passa a «contactado» e sai da fila. */
export function MarcarEnviada({ id }: { id: string }) {
  const [estado, setEstado] = useState<'pronto' | 'a_gravar' | 'feito' | 'erro'>('pronto')
  async function marcar() {
    setEstado('a_gravar')
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}/whatsapp-enviada`, { method: 'POST' })
      setEstado(r.ok ? 'feito' : 'erro')
    } catch {
      setEstado('erro')
    }
  }
  if (estado === 'feito') return <span className="text-xs text-emerald-400">Marcada ✓</span>
  return (
    <button
      type="button"
      onClick={marcar}
      disabled={estado === 'a_gravar'}
      className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-[#D2A63C] hover:text-[#D2A63C] disabled:opacity-50"
    >
      {estado === 'a_gravar' ? 'A gravar…' : estado === 'erro' ? 'Falhou, tenta outra vez' : 'Marquei enviada'}
    </button>
  )
}
