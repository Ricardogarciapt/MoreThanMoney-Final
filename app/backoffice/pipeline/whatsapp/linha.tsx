'use client'

import { useState } from 'react'
import { FUNIS_MENSAGEM, linkWhatsApp, mensagemDoFunil, type IdFunilMensagem, type NegocioParaMensagem } from '@/lib/whatsapp/primeira-mensagem'
import { MarcarEnviada } from './marcar'

/** Uma linha da fila: escolhe o funil no dropdown, o texto muda, um toque abre o WhatsApp. */
export function LinhaFila({ id, telefone, negocio }: { id: string; telefone: string; negocio: NegocioParaMensagem }) {
  const [funil, setFunil] = useState<IdFunilMensagem>('auto')
  const [tema, setTema] = useState('')
  const [texto, setTexto] = useState(() => mensagemDoFunil('auto', negocio))
  const def = FUNIS_MENSAGEM.find((f) => f.id === funil)

  function escolher(novo: IdFunilMensagem, novoTema = tema) {
    setFunil(novo)
    setTexto(mensagemDoFunil(novo, negocio, novoTema))
  }

  const href = linkWhatsApp(telefone, texto)
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={funil}
          onChange={(e) => escolher(e.target.value as IdFunilMensagem)}
          className="rounded-md border border-gray-700 bg-black px-2 py-1 text-[12.5px] text-gray-200"
        >
          {FUNIS_MENSAGEM.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        {def?.comTema && (
          <input
            value={tema}
            onChange={(e) => { setTema(e.target.value); escolher(funil, e.target.value) }}
            placeholder="Tema (ex.: a mentoria Premium)"
            className="w-56 rounded-md border border-gray-700 bg-black px-2 py-1 text-[12.5px] text-gray-200"
          />
        )}
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-md border border-gray-800 bg-black/40 p-2 text-[13px] text-gray-300"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="rounded-md bg-[#D2A63C] px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#E9C46A]">
            Abrir WhatsApp
          </a>
        ) : (
          <span className="text-xs text-amber-400">Número não utilizável</span>
        )}
        <MarcarEnviada id={id} />
      </div>
    </>
  )
}
