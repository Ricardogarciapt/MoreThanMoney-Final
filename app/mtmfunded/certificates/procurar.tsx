'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'

/**
 * Procurar um certificado pelo código.
 *
 * O código é sempre em maiúsculas e sem espaços, mas ninguém o escreve assim a partir de um
 * papel — normaliza-se aqui em vez de devolver «não encontrado» a quem escreveu certo.
 */
export default function ProcurarCertificado() {
  const [codigo, setCodigo] = useState('')
  const router = useRouter()

  const ir = () => {
    const limpo = codigo.trim().toUpperCase().replace(/\s+/g, '')
    if (limpo) router.push(`/mtmfunded/certificates/${encodeURIComponent(limpo)}`)
  }

  return (
    <div className="flex gap-2">
      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ir()}
        placeholder="Código do certificado"
        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none focus:border-[#D2A63C]"
      />
      <button onClick={ir} className="btn" aria-label="Procurar">
        <Search className="h-4 w-4" /> Verificar
      </button>
    </div>
  )
}
