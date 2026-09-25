'use client'

/**
 * CRIAR UMA TAREFA para si própria.
 *
 * Porque é que só para si: dar trabalho a outra pessoa é um acto de quem responde pela equipa, e a
 * regra disso vive no servidor (`validarTarefaNova`, contra a LISTA do âmbito). Enquanto o ecrã de
 * equipa não tiver a lista de nomes para escolher, oferecer aqui um campo «responsável» era oferecer
 * um campo onde se escreve um uuid — e um campo que só funciona com um uuid é um campo que não
 * funciona. O servidor já aceita; falta o ecrã.
 *
 * O prazo é um DIA (a coluna é `date`) e é opcional: uma tarefa sem prazo aparece no fim da lista,
 * que é o sítio certo para «quando der». Inventar um prazo por omissão punha a lista a dizer que
 * havia urgência onde ninguém a combinou.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const CAMPO =
  'rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none'

export function TarefaNova({ negocioId }: { negocioId?: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setAGuardar(true)
    setErro(null)
    try {
      const r = await fetch('/api/backoffice/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: form.get('titulo'),
          descricao: form.get('descricao'),
          prazo: form.get('prazo') || null,
          negocio_id: negocioId,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.error || 'Não consegui criar a tarefa.')
        return
      }
      setAberto(false)
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(false)
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90"
      >
        + Nova tarefa
      </button>
    )
  }

  return (
    <form onSubmit={criar} className="space-y-3 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4">
      <div className="flex flex-wrap gap-3">
        <input name="titulo" required autoFocus placeholder="O que há para fazer" className={`min-w-[240px] flex-1 ${CAMPO}`} />
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          <span className="uppercase tracking-wide">Prazo (opcional)</span>
          <input name="prazo" type="date" className={CAMPO} />
        </label>
      </div>
      <textarea name="descricao" rows={2} placeholder="detalhe, se for preciso" className={`w-full ${CAMPO}`} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={aGuardar}
          className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {aGuardar ? 'a criar…' : 'Criar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-400 underline hover:text-gray-200">
          cancelar
        </button>
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>
    </form>
  )
}
