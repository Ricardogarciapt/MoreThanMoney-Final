'use client'

/**
 * MOVER UM NEGÓCIO — e escrever no histórico quem o moveu.
 *
 * Só os estados a que faz sentido ir aparecem: o actual fica de fora (não é um movimento) e
 * `perdido` pede o motivo antes de deixar guardar. Um pipeline sem motivos de perda não ensina nada
 * a quem vende, e há motivos que voltam a abrir — quem disse «não é agora» não disse «não».
 *
 * A NOTA DO MOVIMENTO é opcional e vai para o EVENTO, não para o negócio: a nota do negócio é o que
 * se sabe da pessoa e reescreve-se; o evento é o que aconteceu e não se reescreve. Misturá-las
 * fazia perder uma das duas.
 *
 * O servidor decide se esta pessoa pode: ele lê o negócio, compara as cinco atribuições com a lista
 * do âmbito e responde 404 se ela não participa. Este componente só manda o pedido — o que aqui se
 * mostra ou esconde é conveniência, nunca a fechadura.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, type EstadoPipeline } from '@/lib/backoffice-vista'

const CAMPO =
  'rounded-lg border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none'

export function Mover({ id, estado, nome }: { id: string; estado: EstadoPipeline; nome: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [destino, setDestino] = useState<EstadoPipeline | ''>('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  const destinos = ESTADOS_PIPELINE.filter((e) => e !== estado)
  const precisaMotivo = destino === 'perdido'

  async function mover() {
    if (!destino) return
    if (precisaMotivo && motivo.trim().length === 0) {
      setErro('Escreve porque é que se perdeu — é a única coisa que sobra deste negócio.')
      return
    }
    setAGuardar(true)
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: destino,
          motivo_perda: precisaMotivo ? motivo : undefined,
          nota_do_evento: nota || undefined,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.detalhe || d?.error || 'Não consegui mover o negócio.')
        return
      }
      const d = await r.json().catch(() => ({}))
      // Se o histórico falhar, a mudança ficou e o rasto não: diz-se, em vez de se calar.
      if (d?.aviso_historico) setErro(d.aviso_historico)
      else {
        setAberto(false)
        setDestino('')
        setNota('')
        setMotivo('')
      }
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
        className="mt-3 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-[#D2A63C]/60 hover:text-[#D2A63C]"
      >
        Mover
      </button>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">{nome} passa a</span>
        <select value={destino} onChange={(e) => setDestino(e.target.value as EstadoPipeline)} className={CAMPO}>
          <option value="">escolhe…</option>
          {destinos.map((e) => (
            <option key={e} value={e}>
              {ESTADO_PIPELINE_NOME[e]}
            </option>
          ))}
        </select>
      </div>

      {precisaMotivo && (
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="porque é que se perdeu (obrigatório)"
          className={`w-full ${CAMPO}`}
        />
      )}

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="nota do movimento (fica no histórico, opcional)"
        className={`w-full ${CAMPO}`}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={mover}
          disabled={aGuardar || !destino}
          className="rounded-lg border border-[#D2A63C]/50 px-3 py-1.5 text-xs font-medium text-[#D2A63C] transition-colors hover:bg-[#D2A63C]/10 disabled:opacity-50"
        >
          {aGuardar ? 'a mover…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-500 underline hover:text-gray-300">
          cancelar
        </button>
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>
    </div>
  )
}
