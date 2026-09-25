'use client'

/**
 * O que se faz a uma tarefa: riscar, reabrir, cancelar e mudar o prazo.
 *
 * NÃO FINGE. Enquanto o servidor não confirmar, o botão diz «a marcar…» em vez de riscar já a
 * linha. Um optimismo que desfaz sozinho quando a resposta falha é pior do que esperar meio
 * segundo — a pessoa fecha a página convencida de que ficou feita, e no dia seguinte a tarefa está
 * lá outra vez sem explicação.
 *
 * CANCELAR PEDE CONFIRMAÇÃO, e riscar não: riscar desfaz-se com um clique («Reabrir»), cancelar
 * não se desfaz daqui — uma cancelada que voltou a ser precisa cria-se outra vez, para ficar rasto
 * de que houve uma decisão. Um clique distraído numa lista comprida não pode ter consequências
 * diferentes das que a pessoa esperava.
 *
 * Quem é o dono decide-se no servidor (`/api/backoffice/tarefas`), pela LISTA do âmbito. Este
 * componente só manda o id; se a tarefa não for dela nem da equipa dela, a resposta é 404 e a linha
 * não muda.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function Marcar({
  id,
  feita,
  estado,
  prazo,
}: {
  id: string
  feita: boolean
  estado?: string
  prazo?: string | null
}) {
  const router = useRouter()
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aMudarPrazo, setAMudarPrazo] = useState(false)
  const [, arrancar] = useTransition()

  async function pedir(corpo: Record<string, unknown>, oQue: string) {
    setAGuardar(oQue)
    setErro(null)
    try {
      const r = await fetch('/api/backoffice/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...corpo }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.detalhe || d?.error || 'Não consegui guardar.')
        return
      }
      setAMudarPrazo(false)
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(null)
    }
  }

  // Uma cancelada não tem botões: o que se faz com ela é criar outra.
  if (estado === 'cancelada') return null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => pedir({ feita: !feita }, 'estado')}
          disabled={aGuardar !== null}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            feita
              ? 'border-gray-700 text-gray-400 hover:border-gray-600'
              : 'border-[#D2A63C]/50 text-[#D2A63C] hover:bg-[#D2A63C]/10'
          }`}
        >
          {aGuardar === 'estado' ? 'a marcar…' : feita ? 'Reabrir' : 'Marcar como feita'}
        </button>

        {!feita && (
          <>
            <button
              type="button"
              onClick={() => setAMudarPrazo((v) => !v)}
              disabled={aGuardar !== null}
              className="rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 disabled:opacity-50"
            >
              Prazo
            </button>
            <button
              type="button"
              onClick={() => {
                // Cancelar não se desfaz daqui — por isso pergunta-se antes, e não depois.
                if (!window.confirm('Cancelar esta tarefa? Sai da lista de trabalho e não se reabre — se voltar a ser precisa, cria-se outra.')) return
                void pedir({ estado: 'cancelada' }, 'cancelar')
              }}
              disabled={aGuardar !== null}
              className="rounded-lg border border-gray-800 px-2 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-900/60 hover:text-red-300 disabled:opacity-50"
            >
              {aGuardar === 'cancelar' ? 'a cancelar…' : 'Cancelar'}
            </button>
          </>
        )}
      </div>

      {aMudarPrazo && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={prazo ? String(prazo).slice(0, 10) : ''}
            onChange={(e) => void pedir({ prazo: e.target.value || null }, 'prazo')}
            className="rounded-lg border border-gray-700 bg-gray-950/60 px-2 py-1 text-xs text-gray-100 focus:border-[#D2A63C] focus:outline-none"
          />
          {/* Limpar o prazo é legítimo: a tarefa passa para o fim da lista, que é onde vive o «quando
              der». Escondê-lo obrigava a inventar uma data para deixar de haver urgência. */}
          <button
            type="button"
            onClick={() => void pedir({ prazo: null }, 'prazo')}
            disabled={aGuardar !== null}
            className="text-xs text-gray-500 underline hover:text-gray-300 disabled:opacity-50"
          >
            sem prazo
          </button>
        </div>
      )}

      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  )
}
