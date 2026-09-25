'use client'

/**
 * O QUE SE FAZ A UM NEGÓCIO sem ser movê-lo: escrever a nota e ocupar (ou largar) um papel.
 *
 * A NOTA É O QUE SE SABE DA PESSOA, e reescreve-se. Não é histórico: o histórico são os eventos, e
 * esses não se reescrevem. Ter as duas coisas no mesmo campo fazia perder uma das duas — ou a nota
 * ficava a crescer como um diário que ninguém lê, ou o histórico desaparecia a cada correcção.
 *
 * OS PAPÉIS: aqui só se mostra o que qualquer participante pode fazer sozinho — pôr-se num lugar
 * VAGO e largar o seu. Pôr outra pessoa (ou trocar quem já lá está) é de quem responde pela equipa,
 * e o servidor já o aceita; o que falta é a lista de nomes da equipa para escolher, que vem do
 * modelo de equipas. Um campo onde se escreve um uuid não é um campo.
 *
 * E a fechadura é sempre do servidor: ele lê o negócio, compara as cinco atribuições com a LISTA do
 * âmbito e responde 404 a quem não participa. O que este componente mostra ou esconde é só para a
 * pessoa não clicar no que vai ser recusado.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PAPEL_NOME, type Papel } from '@/lib/backoffice-papeis'

const CAMPO =
  'w-full rounded-lg border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none'

export function Trabalhar({
  id,
  nota,
  vagos,
  meus,
}: {
  id: string
  nota: string | null
  /** Os papéis sem ninguém neste negócio E que esta pessoa tem — os únicos que ela pode ocupar. */
  vagos: Papel[]
  /** Os papéis que ela ocupa neste negócio, para os poder largar. */
  meus: Papel[]
}) {
  const router = useRouter()
  const [aEditarNota, setAEditarNota] = useState(false)
  const [texto, setTexto] = useState(nota ?? '')
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  async function pedir(corpo: Record<string, unknown>, oQue: string) {
    setAGuardar(oQue)
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.detalhe || d?.error || 'Não consegui guardar.')
        return
      }
      setAEditarNota(false)
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(null)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!aEditarNota && (
          <button
            type="button"
            onClick={() => setAEditarNota(true)}
            className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-400 transition-colors hover:border-gray-600"
          >
            {nota ? 'Editar nota' : 'Escrever nota'}
          </button>
        )}

        {/* Ocupar um lugar vago não tira nada a ninguém — é o caso normal: o setter marcou a reunião
            e põe-se como setter. */}
        {vagos.map((p) => (
          <button
            key={p}
            type="button"
            // `'eu'` em vez do id: quem decide quem é «eu» é a sessão, no servidor. O browser
            // nunca precisa de conhecer (nem de mandar) um id de pessoa.
            onClick={() => void pedir({ atribuicoes: { [p]: 'eu' } }, p)}
            disabled={aGuardar !== null}
            className="rounded-lg border border-[#D2A63C]/40 px-2 py-1 text-xs text-[#D2A63C] transition-colors hover:bg-[#D2A63C]/10 disabled:opacity-50"
          >
            {aGuardar === p ? 'a guardar…' : `Sou o ${PAPEL_NOME[p]}`}
          </button>
        ))}

        {meus.map((p) => (
          <button
            key={`largar-${p}`}
            type="button"
            onClick={() => {
              // Largar o próprio papel pode tirar o negócio da lista de quem o larga — se era a
              // única atribuição dele, deixa de o ver. Avisar antes é o mínimo.
              if (!window.confirm(`Largar o papel de ${PAPEL_NOME[p]} neste negócio? Se for a tua única atribuição, ele deixa de te aparecer.`)) return
              void pedir({ atribuicoes: { [p]: null } }, `largar-${p}`)
            }}
            disabled={aGuardar !== null}
            className="rounded-lg border border-gray-800 px-2 py-1 text-xs text-gray-500 transition-colors hover:border-red-900/60 hover:text-red-300 disabled:opacity-50"
          >
            {aGuardar === `largar-${p}` ? 'a largar…' : `Largar ${PAPEL_NOME[p]}`}
          </button>
        ))}
      </div>

      {aEditarNota && (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="o que se sabe desta pessoa"
            className={CAMPO}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void pedir({ nota: texto }, 'nota')}
              disabled={aGuardar !== null}
              className="rounded-lg border border-[#D2A63C]/50 px-3 py-1 text-xs font-medium text-[#D2A63C] transition-colors hover:bg-[#D2A63C]/10 disabled:opacity-50"
            >
              {aGuardar === 'nota' ? 'a guardar…' : 'Guardar nota'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTexto(nota ?? '')
                setAEditarNota(false)
              }}
              className="text-xs text-gray-500 underline hover:text-gray-300"
            >
              cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  )
}
