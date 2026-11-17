'use client'

/** Escolher o funil de um negócio, no quadro e na ficha. A decisão de quem pode é da rota. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FUNIS, FUNIL_NOME } from '@/lib/backoffice-funis'

export function EscolherFunil({ id, funil }: { id: string; funil: string | null }) {
  const router = useRouter()
  const [valor, setValor] = useState(funil ?? '')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function mudar(novo: string) {
    const antes = valor
    setValor(novo)
    setAGuardar(true)
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}/funil`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funil: novo || null }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(j.error || `Falhou (${r.status})`)
      router.refresh()
    } catch (e) {
      setValor(antes)
      setErro(e instanceof Error ? e.message : 'Falhou')
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Funil"
        value={valor}
        disabled={aGuardar}
        onChange={(e) => mudar(e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-[#D2A63C] focus:outline-none disabled:opacity-60"
      >
        <option value="">Por classificar</option>
        {FUNIS.map((f) => (
          <option key={f} value={f}>
            {FUNIL_NOME[f]}
          </option>
        ))}
      </select>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </span>
  )
}
