'use client'

import { useState } from 'react'

/**
 * O quiz de cada aula. Não guarda nada: é para a pessoa confirmar o que ficou, não uma avaliação.
 * A resposta certa e o porquê aparecem logo, porque o objectivo é aprender, não apanhar ninguém.
 */
export function Quiz({
  perguntas,
  textos,
}: {
  perguntas: Array<{ pergunta: string; opcoes: string[]; certa: number; porque: string }>
  textos: { certo: string; errado: string }
}) {
  const [respostas, setRespostas] = useState<Record<number, number>>({})
  return (
    <div className="space-y-3">
      {perguntas.map((q, i) => {
        const r = respostas[i]
        const respondida = r !== undefined
        return (
          <div key={q.pergunta} className="rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4">
            <p className="text-sm font-medium text-white">{q.pergunta}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {q.opcoes.map((o, j) => {
                const escolhida = r === j
                const tom = !respondida
                  ? 'border-white/[0.08] text-zinc-300 hover:border-[#D2A63C]/40'
                  : j === q.certa
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : escolhida
                      ? 'border-red-500/50 bg-red-500/10 text-red-300'
                      : 'border-white/[0.06] text-zinc-500'
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={respondida}
                    onClick={() => setRespostas((x) => ({ ...x, [i]: j }))}
                    className={`rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${tom}`}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
            {respondida && (
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                <span className={r === q.certa ? 'text-emerald-400' : 'text-red-400'}>{r === q.certa ? textos.certo : textos.errado}</span> {q.porque}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
