'use client'

import { useState } from 'react'

/**
 * Copiar o rascunho, sem sair da página.
 *
 * Parece um detalhe e não é: o rascunho existe para poupar os quinze minutos que custa escrever
 * cada mensagem. Se para o usar a pessoa tiver de seleccionar texto à mão em cada uma das doze
 * tarefas, metade dessa poupança vai-se — e o hábito não pega.
 *
 * O `clipboard` não existe em contextos não seguros nem em alguns WebViews (a app abre isto lá
 * dentro). Quando falha, diz-se; ficar calado a fingir que copiou era pior, porque a pessoa
 * colava a mensagem anterior sem perceber porquê.
 */
export function Copiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<'pronto' | 'copiado' | 'falhou'>('pronto')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setEstado('copiado')
    } catch {
      setEstado('falhou')
    }
    setTimeout(() => setEstado('pronto'), 2500)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="shrink-0 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 transition hover:border-[#D2A63C] hover:text-[#D2A63C]"
    >
      {estado === 'copiado' ? 'copiado' : estado === 'falhou' ? 'copia à mão' : 'copiar'}
    </button>
  )
}
