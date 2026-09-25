'use client'

/**
 * O botão de riscar uma tarefa.
 *
 * É o único pedaço de cliente destas páginas, e tem uma regra: não finge. Enquanto o servidor não
 * confirmar, o botão diz «a marcar…» em vez de riscar já a linha. Um optimismo que desfaz sozinho
 * quando a resposta falha é pior do que esperar meio segundo — a pessoa fecha a página convencida
 * de que ficou feita, e no dia seguinte a tarefa está lá outra vez sem explicação.
 *
 * Quem é o dono da tarefa decide-se no servidor (`/api/backoffice/tarefas`), pela sessão. Este
 * componente só manda o id; se a tarefa não for dela, a resposta é 404 e a linha não muda.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function Marcar({ id, feita }: { id: string; feita: boolean }) {
  const router = useRouter()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  async function alternar() {
    setAGuardar(true)
    setErro(null)
    try {
      const r = await fetch('/api/backoffice/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, feita: !feita }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.detalhe || d?.error || 'Não consegui guardar.')
        return
      }
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={alternar}
        disabled={aGuardar}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          feita
            ? 'border-gray-700 text-gray-400 hover:border-gray-600'
            : 'border-[#D2A63C]/50 text-[#D2A63C] hover:bg-[#D2A63C]/10'
        }`}
      >
        {aGuardar ? 'a marcar…' : feita ? 'Reabrir' : 'Marcar como feita'}
      </button>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  )
}
